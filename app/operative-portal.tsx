"use client";

import {
  CalendarCheck,
  Camera,
  Car,
  CheckCircle,
  Clock,
  Gauge,
  GasPump,
  ImageSquare,
  MapPin,
  Receipt,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Role = "Chofer" | "Auxiliar";
type Client = { id: string; name: string };
type Vehicle = { id: string; name: string; plate: string };
const expenseClientNames = [
  "Indurama",
  "Quiminap",
  "Thaniyay",
  "DAR",
  "Healing",
  "ROE",
  "Calderon",
  "Mondelez",
  "INVERSIONES M K & F SAC",
];
const normalizeName = (value: string) =>
  value.trim().toLocaleLowerCase("es-PE");
type Service = {
  id: string;
  service_date: string;
  scheduled_start: string | null;
  status: string;
  origin: string | null;
  destination: string | null;
  merchandise: string | null;
  km_start: number | null;
  km_end: number | null;
  vehicle_id: string | null;
  clients: { name: string } | null;
  vehicles: { name: string; plate: string } | null;
};
type Action =
  "attendance" | "km" | "fuel" | "expense" | "finding" | "detail" | "progress" | null;

export function OperativePortal({
  role,
  session,
  initialAction = null,
}: {
  role: Role;
  session: Session;
  initialAction?: Action;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [shift, setShift] = useState<{
    id: string;
    clock_in: string;
    clock_out: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [selected, setSelected] = useState<Service | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [form, setForm] = useState({
    service_id: "",
    client_id: "",
    vehicle_id: "",
    amount: "",
    concept: "",
    category: "Peaje",
    km: "",
    severity: "Media",
    description: "",
    status: "En ruta",
  });
  const today = new Date().toISOString().slice(0, 10);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [serviceResult, shiftResult, clientResult, vehicleResult] =
      await Promise.all([
        supabase
          .from("services")
          .select(
            "id,service_date,scheduled_start,status,origin,destination,merchandise,km_start,km_end,vehicle_id,clients(name),vehicles(name,plate)",
          )
          .gte("service_date", today)
          .order("service_date")
          .order("scheduled_start")
          .limit(30),
        supabase
          .from("time_entries")
          .select("id,clock_in,clock_out")
          .eq("user_id", session.user.id)
          .eq("work_date", today)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("clients")
          .select("id,name")
          .eq("active", true)
          .order("name"),
        supabase
          .from("user_vehicle_assignments")
          .select("vehicle_id,vehicles(id,name,plate)")
          .eq("user_id", session.user.id)
          .eq("active", true)
          .maybeSingle(),
      ]);
    if (
      serviceResult.error ||
      shiftResult.error ||
      clientResult.error ||
      vehicleResult.error
    )
      setError(
        serviceResult.error?.message ||
          shiftResult.error?.message ||
          clientResult.error?.message ||
          vehicleResult.error?.message ||
          "No se pudo cargar la jornada.",
      );
    else {
      setServices((serviceResult.data || []) as unknown as Service[]);
      setShift(shiftResult.data);
      const allowedClients = (clientResult.data || []).filter((client) =>
        expenseClientNames.some(
          (name) => normalizeName(name) === normalizeName(client.name),
        ),
      );
      setClients(
        allowedClients.sort(
          (a, b) =>
            expenseClientNames.findIndex(
              (name) => normalizeName(name) === normalizeName(a.name),
            ) -
            expenseClientNames.findIndex(
              (name) => normalizeName(name) === normalizeName(b.name),
            ),
        ) as Client[],
      );
      const assignedVehicle = vehicleResult.data?.vehicles as unknown as Vehicle | null;
      setVehicles(assignedVehicle ? [assignedVehicle] : []);
    }
    setLoading(false);
  }, [session.user.id, today]);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  useEffect(() => {
    if (initialAction) open(initialAction);
  }, [initialAction]);
  const activeShift = Boolean(shift?.clock_in && !shift.clock_out);
  const completed = services.filter((s) => s.status === "Completado").length;
  const elapsed = useMemo(
    () =>
      shift?.clock_in
        ? Math.max(0, Date.now() - new Date(shift.clock_in).getTime())
        : 0,
    [shift],
  );
  const hours = `${String(Math.floor(elapsed / 3600000)).padStart(2, "0")}:${String(Math.floor(elapsed / 60000) % 60).padStart(2, "0")}`;

  function currentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  }

  function open(next: Action, service?: Service) {
    setSelected(service || null);
    setAction(next);
    setError("");
    setMessage("");
    setReceipt(null);
    setForm((f) => ({
      ...f,
      service_id: service?.id || "",
      client_id: "",
      vehicle_id: service?.vehicle_id || vehicles[0]?.id || "",
      km: "",
      amount: "",
      concept: "",
      category: next === "fuel" ? "Gasolina" : "Peaje",
      description: "",
      status:
        service?.status === "Programado"
          ? "Confirmado"
          : service?.status === "Confirmado"
            ? "En ruta"
            : "Completado",
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError("");
    let result: { error: { message: string } | null };
    if (action === "attendance") {
      if (!receipt) { setError("Debes tomar una foto para registrar la marcación."); setSaving(false); return; }
      let position: GeolocationPosition;
      try { position = await currentPosition(); } catch { setError("Activa el permiso de ubicación del navegador e inténtalo nuevamente."); setSaving(false); return; }
      const mark = activeShift ? "salida" : "entrada";
      const extension = receipt.name.split(".").pop()?.toLowerCase() || "jpg";
      const evidencePath = `${session.user.id}/${today}/${mark}_${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from("attendance-evidence").upload(evidencePath, receipt, { contentType: receipt.type, upsert: false });
      if (upload.error) { setError(`No se pudo subir la evidencia: ${upload.error.message}`); setSaving(false); return; }
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
      result = activeShift && shift
        ? await supabase.from("time_entries").update({ clock_out:new Date().toISOString(), clock_out_lat:location.latitude, clock_out_lng:location.longitude, clock_out_accuracy:location.accuracy, clock_out_photo:evidencePath, status:"Cerrada", updated_at:new Date().toISOString() }).eq("id",shift.id)
        : await supabase.from("time_entries").insert({ user_id:session.user.id, work_date:today, clock_in:new Date().toISOString(), clock_in_lat:location.latitude, clock_in_lng:location.longitude, clock_in_accuracy:location.accuracy, clock_in_photo:evidencePath, status:"Abierta" });
    } else if (action === "fuel" || action === "expense") {
      if (!form.vehicle_id) { setError("Administración debe asignarte una unidad antes de registrar gastos."); setSaving(false); return; }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) { setError("El importe debe ser mayor a S/ 0 y menor o igual a S/ 10,000."); setSaving(false); return; }
      if (form.concept.trim().length < 4) { setError("Describe mejor el concepto del gasto."); setSaving(false); return; }
      if (!receipt) {
        setError("Toma o selecciona una foto del comprobante.");
        setSaving(false);
        return;
      }
      if (!receipt.type.startsWith("image/")) { setError("El comprobante debe ser una imagen."); setSaving(false); return; }
      if (receipt.size > 8 * 1024 * 1024) { setError("La imagen supera el máximo de 8 MB."); setSaving(false); return; }
      const duplicate = await supabase.from("expenses").select("id").eq("user_id",session.user.id).eq("expense_date",today).eq("vehicle_id",form.vehicle_id).eq("category",form.category).eq("amount",amount).eq("source_system","dcs_app").neq("status","Rechazado").limit(1);
      if (duplicate.error) { setError(duplicate.error.message); setSaving(false); return; }
      if (duplicate.data?.length) { setError("Posible comprobante duplicado: ya registraste hoy el mismo importe, tipo y unidad."); setSaving(false); return; }
      const extension = receipt.name.split(".").pop()?.toLowerCase() || "jpg";
      const receiptPath = `${session.user.id}/${today}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage
        .from("expense-receipts")
        .upload(receiptPath, receipt, {
          contentType: receipt.type,
          upsert: false,
        });
      if (upload.error) {
        setError(`No se pudo subir la foto: ${upload.error.message}`);
        setSaving(false);
        return;
      }
      result = await supabase.from("expenses").insert({
        user_id: session.user.id,
        service_id: null,
        client_id: form.client_id,
        vehicle_id: form.vehicle_id,
        category: form.category,
        concept: form.concept,
          amount,
        receipt_url: receiptPath,
        source_system: "dcs_app",
        status: "Pendiente",
      });
    } else if (action === "finding") {
      const service = services.find((s) => s.id === form.service_id);
      result = await supabase.from("findings").insert({
        reported_by: session.user.id,
        service_id: form.service_id || null,
        vehicle_id: service?.vehicle_id || null,
        category: "Operación",
        severity: form.severity,
        description: form.description,
        status: "Abierto",
      });
    } else {
      result = await supabase.rpc("record_service_progress", {
        target_service_id: form.service_id,
        new_status: action === "progress" ? form.status : null,
        odometer: Number(form.km),
      });
    }
    if (result.error) setError(result.error.message);
    else {
      setAction(null);
      setMessage(action === "attendance" ? activeShift ? "Salida registrada con ubicación y evidencia." : "Entrada registrada con ubicación y evidencia." : "Registro guardado correctamente.");
      await loadData();
    }
    setSaving(false);
  }

  if (loading)
    return (
      <main className="content">
        <div className="empty-state">
          <SpinnerGap className="spin" size={30} />
          Cargando jornada…
        </div>
      </main>
    );
  return (
    <main className="content">
      <section className="welcome operative">
        <div>
          <span className="live-dot">JORNADA DE HOY</span>
          <h2>Hola, {session.user.user_metadata?.full_name || role}</h2>
          <p>{services.length} servicios asignados desde hoy.</p>
        </div>
        <button
          disabled={saving || Boolean(shift?.clock_out)}
          className={activeShift ? "primary completed" : "primary"}
          onClick={() => open("attendance")}
        >
          {activeShift ? <CheckCircle size={19} /> : <Clock size={19} />}{" "}
          {activeShift
            ? "Cerrar jornada"
            : shift?.clock_out
              ? "Jornada finalizada"
              : "Iniciar jornada"}
        </button>
      </section>
      {error && (
        <div className="module-error">
          <WarningCircle size={20} />
          {error}
        </div>
      )}
      {message && (
        <div className="module-success">
          <CheckCircle size={20} />
          {message}
        </div>
      )}
      <section className="operative-grid">
        <div className="schedule">
          <div className="section-heading">
            <div>
              <span>AGENDA</span>
              <h3>Servicios asignados</h3>
            </div>
            <b>{services.length} servicios</b>
          </div>
          {services.length === 0 ? (
            <div className="empty-state">
              <CalendarCheck size={32} />
              No tienes servicios asignados.
            </div>
          ) : (
            services.map((s, i) => (
              <article className="service" key={s.id}>
                <div className="timeline">
                  <strong>{s.scheduled_start?.slice(0, 5) || "—"}</strong>
                  <i className={i === 0 ? "current" : ""} />
                </div>
                <div className="service-main">
                  <div className="service-top">
                    <div>
                      <span>
                        {new Date(
                          `${s.service_date}T12:00:00`,
                        ).toLocaleDateString("es-PE")}
                      </span>
                      <h3>{s.clients?.name || "Cliente pendiente"}</h3>
                    </div>
                    <b
                      className={`status ${s.status === "En ruta" ? "green-status" : s.status === "Confirmado" ? "blue-status" : "amber-status"}`}
                    >
                      {s.status}
                    </b>
                  </div>
                  <p>
                    <MapPin size={17} />
                    {s.origin || "Origen pendiente"} →{" "}
                    {s.destination || "Destino pendiente"}
                  </p>
                  <p>
                    <Car size={17} />
                    {s.vehicles
                      ? `${s.vehicles.name} · ${s.vehicles.plate}`
                      : "Unidad pendiente"}
                  </p>
                  <div className="service-actions">
                    <button onClick={() => open("detail", s)}>
                      Ver detalle
                    </button>
                    {s.status !== "Completado" && s.status !== "Cancelado" && (
                      <button
                        className="primary small"
                        onClick={() => open("progress", s)}
                      >
                        Registrar avance
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        <aside className="quick-panel">
          <article className="panel shift">
            <span>MI JORNADA</span>
            <div className="shift-time">
              <Clock size={30} />
              <strong>{activeShift ? hours : "00:00"}</strong>
            </div>
            <div>
              <span>Ingreso</span>
              <b>
                {shift?.clock_in
                  ? new Date(shift.clock_in).toLocaleTimeString("es-PE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </b>
            </div>
            <div>
              <span>Servicios completados</span>
              <b>
                {completed} de {services.length}
              </b>
            </div>
          </article>
          <article className="panel">
            <div className="panel-title">
              <div>
                <span>ACCESOS RÁPIDOS</span>
                <h3>Registrar información</h3>
              </div>
            </div>
            <div className="quick-actions">
              <button onClick={() => open("km")}>
                <Gauge size={24} />
                <span>Kilometraje</span>
              </button>
              <button onClick={() => open("fuel")}>
                <GasPump size={24} />
                <span>Combustible</span>
              </button>
              <button onClick={() => open("expense")}>
                <Receipt size={24} />
                <span>Gasto</span>
              </button>
              <button onClick={() => open("finding")}>
                <WarningCircle size={24} />
                <span>Incidencia</span>
              </button>
            </div>
          </article>
        </aside>
      </section>
      {action && (
        <div className="modal-backdrop" onMouseDown={() => setAction(null)}>
          <section
            className="action-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setAction(null)}>
              <X size={20} />
            </button>
            {action === "detail" && selected ? (
              <>
                <span>DETALLE DEL SERVICIO</span>
                <h3>{selected.clients?.name || "Servicio"}</h3>
                <dl>
                  <dt>Ruta</dt>
                  <dd>
                    {selected.origin || "—"} → {selected.destination || "—"}
                  </dd>
                  <dt>Mercadería</dt>
                  <dd>{selected.merchandise || "Sin detalle"}</dd>
                  <dt>Unidad</dt>
                  <dd>
                    {selected.vehicles
                      ? `${selected.vehicles.name} · ${selected.vehicles.plate}`
                      : "Sin asignar"}
                  </dd>
                  <dt>Kilometraje</dt>
                  <dd>
                    {selected.km_start ?? "—"} / {selected.km_end ?? "—"}
                  </dd>
                </dl>
              </>
            ) : (
              <form onSubmit={submit}>
                <span>REGISTRO OPERATIVO</span>
                <h3>
                  {action === "km"
                    ? "Registrar kilometraje"
                    : action === "attendance"
                      ? activeShift ? "Registrar salida" : "Registrar entrada"
                    : action === "fuel"
                      ? "Registrar combustible"
                      : action === "expense"
                        ? "Registrar gasto"
                        : action === "finding"
                          ? "Reportar incidencia"
                          : "Actualizar servicio"}
                </h3>
                {action !== "attendance" && action !== "fuel" && action !== "expense" && (
                  <label>
                    Servicio
                    <select
                      required
                      value={form.service_id}
                      onChange={(e) =>
                        setForm({ ...form, service_id: e.target.value })
                      }
                    >
                      <option value="">Seleccionar</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.clients?.name || "Servicio"} · {s.service_date}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {action === "attendance" && <div className="attendance-proof"><MapPin size={25}/><div><strong>Ubicación obligatoria</strong><p>Al guardar solicitaremos tu ubicación GPS exacta.</p></div><div className="receipt-picker"><strong>Foto tomada ahora</strong><div><label className="receipt-option"><Camera size={22}/> Abrir cámara<input type="file" accept="image/*" capture="environment" onChange={(e)=>setReceipt(e.target.files?.[0]||null)}/></label></div>{receipt&&<b className="receipt-selected">✓ Evidencia lista</b>}<small>La galería no está habilitada para esta marcación.</small></div></div>}
                {(action === "km" || action === "progress") && (
                  <label>
                    Kilometraje actual
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      required
                      value={form.km}
                      onChange={(e) => setForm({ ...form, km: e.target.value })}
                    />
                  </label>
                )}
                {action === "progress" && (
                  <label>
                    Nuevo estado
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value })
                      }
                    >
                      <option>Confirmado</option>
                      <option>En ruta</option>
                      <option>Completado</option>
                    </select>
                  </label>
                )}
                {(action === "fuel" || action === "expense") && (
                  <>
                    <label>
                      Cliente
                      <select
                        required
                        value={form.client_id}
                        onChange={(e) =>
                          setForm({ ...form, client_id: e.target.value })
                        }
                      >
                        <option value="">Seleccionar cliente</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Unidad
                      {vehicles.length ? <div className="assigned-unit"><Car size={18}/><strong>{vehicles[0].name} · {vehicles[0].plate}</strong><small>Unidad asignada por administración</small></div> : <div className="module-error">No tienes una unidad asignada. Comunícate con administración.</div>}
                    </label>
                    <label>
                      Tipo
                      <select
                        value={form.category}
                        onChange={(e) =>
                          setForm({ ...form, category: e.target.value })
                        }
                      >
                        {[
                          "Gasolina",
                          "Petróleo",
                          "GLP",
                          "Peaje",
                          "Estacionamiento",
                          "Mantenimiento",
                          "Otro",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Concepto
                      <input
                        required
                        placeholder={
                          form.category === "Peaje"
                            ? "Ej.: Peaje Lurín"
                            : form.category === "Estacionamiento"
                              ? "Ej.: Estacionamiento Centro Cívico"
                              : form.category === "Mantenimiento"
                                ? "Ej.: Lavada de van"
                                : "Ej.: lugar o motivo del gasto"
                        }
                        value={form.concept}
                        onChange={(e) =>
                          setForm({ ...form, concept: e.target.value })
                        }
                      />
                      <small>
                        Describe brevemente el gasto: “Peaje Lurín”, “Lavada de
                        van” o “Estacionamiento Centro Cívico”.
                      </small>
                    </label>
                    <label>
                      Importe S/
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={form.amount}
                        onChange={(e) =>
                          setForm({ ...form, amount: e.target.value })
                        }
                      />
                    </label>
                    <div className="receipt-picker">
                      <strong>Foto del comprobante</strong>
                      <div>
                        <label className="receipt-option">
                          <Camera size={21} /> Tomar foto
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) =>
                              setReceipt(e.target.files?.[0] || null)
                            }
                          />
                        </label>
                        <label className="receipt-option">
                          <ImageSquare size={21} /> Galería o archivos
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              setReceipt(e.target.files?.[0] || null)
                            }
                          />
                        </label>
                      </div>
                      {receipt && (
                        <b className="receipt-selected">✓ {receipt.name}</b>
                      )}
                      <small>
                        Toma una foto clara donde se vean fecha, importe y
                        proveedor.
                      </small>
                    </div>
                  </>
                )}
                {action === "finding" && (
                  <>
                    <label>
                      Severidad
                      <select
                        value={form.severity}
                        onChange={(e) =>
                          setForm({ ...form, severity: e.target.value })
                        }
                      >
                        <option>Baja</option>
                        <option>Media</option>
                        <option>Alta</option>
                        <option>Crítica</option>
                      </select>
                    </label>
                    <label>
                      Descripción
                      <textarea
                        required
                        value={form.description}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                <div className="form-actions">
                  <button type="button" onClick={() => setAction(null)}>
                    Cancelar
                  </button>
                  <button className="primary" disabled={saving}>
                    {saving ? "Guardando…" : action === "attendance" ? activeShift ? "Marcar salida" : "Marcar entrada" : action === "fuel" || action === "expense" ? "Guardar gasto" : "Guardar"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
