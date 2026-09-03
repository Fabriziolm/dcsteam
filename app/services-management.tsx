"use client";

import { CalendarCheck, Car, CheckCircle, MapPin, PencilSimple, Plus, SpinnerGap, Users, WarningCircle } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Option = { id: string; name: string };
type Staff = { id: string; full_name: string | null; email: string | null };
type ServiceRow = {
  id: string; client_id: string; service_date: string; created_at?: string; merchandise: string | null; origin: string | null; destination: string | null;
  scheduled_start: string | null; status: string; clients: { name: string } | null; vehicles: { name: string; plate: string } | null;
};

const splitClientOptions=(items:Option[])=>{
  const exact=new Map(items.map(item=>[item.name.trim().toLocaleLowerCase("es-PE"),item]));
  const result=new Map<string,Option>();
  for(const item of items){
    const parts=item.name.split(/\s+(?:\+|\/|\-|y)\s+|\s*,\s*/i).map(value=>value.trim()).filter(Boolean);
    for(const part of parts){const match=exact.get(part.toLocaleLowerCase("es-PE"));if(match)result.set(match.id,match)}
  }
  return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,"es"));
};

const statuses = ["Programado", "Editar datos", "En ruta", "Completado", "Cancelado"];

export function ServicesManagement() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [vehicles, setVehicles] = useState<Array<Option & { plate: string }>>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const draftRestored = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [form, setForm] = useState({ service_date: new Date().toISOString().slice(0, 10), client_id: "", vehicle_id: "", merchandise: "", origin: "", destination: "", destination_lat: "", destination_lng: "", delivery_points: "1", scheduled_start: "", driver_id: "", assistant_id: "" });
  useEffect(() => {
    try {
      const draft = localStorage.getItem("dcs_service_form_draft");
      if (draft) { const saved = JSON.parse(draft) as { form?: Partial<typeof form>; editingId?: string | null; showForm?: boolean } & Partial<typeof form>; setForm((current) => ({ ...current, ...(saved.form || saved) })); if (saved.editingId) setEditingId(saved.editingId); if (saved.showForm || saved.editingId) setShowForm(true); }
    } catch { /* borrador inválido: continuar con formulario vacío */ }
    window.setTimeout(() => { draftRestored.current = true; }, 0);
  }, []);
  useEffect(() => {
    if (draftRestored.current) localStorage.setItem("dcs_service_form_draft", JSON.stringify({ form, editingId, showForm }));
  }, [form, editingId, showForm]);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    const [serviceResult, clientResult, vehicleResult, staffResult] = await Promise.all([
      supabase.from("services").select("id,client_id,service_date,created_at,merchandise,origin,destination,scheduled_start,status,clients(name),vehicles(name,plate)").order("service_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("clients").select("id,name").eq("active", true).order("name"),
      supabase.from("vehicles").select("id,name,plate").eq("active", true).order("name"),
      supabase.from("profiles").select("id,full_name,email").eq("active", true).order("full_name"),
    ]);
    const firstError = serviceResult.error || clientResult.error || vehicleResult.error || staffResult.error;
    if (firstError) setError(`No se pudieron cargar las operaciones: ${firstError.message}`);
    else {
      setServices(([...(serviceResult.data ?? [])] as unknown as ServiceRow[]).sort((a,b)=>{const todayMs=new Date(`${new Date().toISOString().slice(0,10)}T00:00:00`).getTime(),aMs=new Date(`${a.service_date}T00:00:00`).getTime(),bMs=new Date(`${b.service_date}T00:00:00`).getTime(),aFuture=aMs>=todayMs,bFuture=bMs>=todayMs;return aFuture!==bFuture?(aFuture?-1:1):(aFuture?aMs-bMs:bMs-aMs)}));
      setClients(splitClientOptions((clientResult.data ?? []) as Option[]));
      setVehicles((vehicleResult.data ?? []) as Array<Option & { plate: string }>);
      setStaff((staffResult.data ?? []) as Staff[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel("services-live").on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => void loadData()).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [loadData]);

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true); setError(""); setMessage("");
    const firstPoint = form.destination.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)[0] || "";
    if (editingId) {
      const [destination, lat, lng] = firstPoint.split("|").map((part) => part.trim());
      const parsedLat = lat ? Number(lat) : null; const parsedLng = lng ? Number(lng) : null;
      const { error: updateError } = await supabase.from("services").update({ service_date: form.service_date, client_id: form.client_id, vehicle_id: form.vehicle_id || null, merchandise: form.merchandise || null, origin: form.origin || null, destination, destination_lat: Number.isFinite(parsedLat) ? parsedLat : null, destination_lng: Number.isFinite(parsedLng) ? parsedLng : null, scheduled_start: form.scheduled_start || null, updated_at: new Date().toISOString() }).eq("id", editingId);
      if (updateError) setError(`No se pudo actualizar: ${updateError.message}`); else { setMessage("Servicio actualizado correctamente."); setShowForm(false); setEditingId(null); localStorage.removeItem("dcs_service_form_draft"); await loadData(); }
      setSaving(false); return;
    }
    if (form.driver_id && form.driver_id === form.assistant_id) {
      setError("El chofer y el auxiliar deben ser personas diferentes.");
      setSaving(false);
      return;
    }
    const normalized = (value: string) => value.trim().toLocaleLowerCase("es-PE").replace(/\s+/g, " ");
    const destinations = [...new Map(form.destination.split(/\r?\n/).map((value) => { const [destination, latText, lngText] = value.split("|").map((part) => part.trim()); const lat = latText ? Number(latText) : null; const lng = lngText ? Number(lngText) : null; return { destination, lat, lng }; }).filter((value) => value.destination).map((point) => [normalized(point.destination), point] as const)).values()];
    if (!destinations.length) { setError("Ingresa al menos un establecimiento, uno por línea."); setSaving(false); return; }
    const duplicate = await supabase
      .from("services")
      .select("id,destination")
      .eq("service_date", form.service_date)
      .eq("client_id", form.client_id)
      .neq("status", "Cancelado")
      .limit(500);
    if (duplicate.error) { setError(`No se pudo validar duplicados: ${duplicate.error.message}`); setSaving(false); return; }
    const existing = new Set((duplicate.data ?? []).map((row) => normalized(String(row.destination || ""))));
    const pending = destinations.filter((point) => !existing.has(normalized(point.destination)));
    if (!pending.length) { setError("Todos esos puntos ya están registrados para ese cliente y fecha."); setSaving(false); return; }
    const { data: authData } = await supabase.auth.getUser();
    const rows = pending.map((point) => ({ service_date: form.service_date, client_id: form.client_id, vehicle_id: form.vehicle_id || null, merchandise: form.merchandise || null, origin: form.origin || null, destination: point.destination, destination_lat: Number.isFinite(point.lat) ? point.lat : null, destination_lng: Number.isFinite(point.lng) ? point.lng : null, delivery_points: 1, scheduled_start: form.scheduled_start || null, status: "Programado", created_by: authData.user?.id }));
    const { data, error: serviceError } = await supabase.from("services").insert(rows).select("id");
    if (serviceError || !data?.length) {
      setError(`No se pudo crear el servicio: ${serviceError?.message ?? "sin identificador"}`);
    } else {
      const assignments: Array<{ service_id: string; user_id: string; assignment_role: string }> = [];
      data.forEach((service) => { if (form.driver_id) assignments.push({ service_id: service.id, user_id: form.driver_id, assignment_role: "Chofer" }); if (form.assistant_id) assignments.push({ service_id: service.id, user_id: form.assistant_id, assignment_role: "Auxiliar" }); });
      if (assignments.length) {
        const { error: assignmentError } = await supabase.from("service_assignments").insert(assignments);
        if (assignmentError) setError(`Servicio creado, pero falló una asignación: ${assignmentError.message}`);
      }
      setShowForm(false);
      setMessage(`${pending.length} servicio${pending.length === 1 ? "" : "s"} creado${pending.length === 1 ? "" : "s"}. ${destinations.length - pending.length ? `${destinations.length - pending.length} repetido${destinations.length - pending.length === 1 ? "" : "s"} omitido${destinations.length - pending.length === 1 ? "" : "s"}.` : ""}`);
      localStorage.removeItem("dcs_service_form_draft");
      setForm({ ...form, merchandise: "", origin: "", destination: "", destination_lat: "", destination_lng: "", delivery_points: "1", scheduled_start: "", driver_id: "", assistant_id: "" });
      await loadData();
    }
    setSaving(false);
  }

  function editService(service: ServiceRow) {
    setEditingId(service.id); setShowForm(true); setError(""); setMessage("");
    setForm((current) => ({ ...current, service_date: service.service_date, client_id: service.client_id, merchandise: service.merchandise || "", origin: service.origin || "", destination: service.destination || "", scheduled_start: service.scheduled_start || "" }));
  }

  async function updateStatus(id: string, status: string) {
    if (!supabase) return;
    const current = services.find((service) => service.id === id);
    if (!current || current.status === status) return;
    if (status === "Editar datos") { editService(current); return; }
    if (status === "Completado" && !window.confirm("¿Confirmas el cierre de este servicio? Se enviará una alerta de facturación al administrador.")) return;
    if (status === "Cancelado" && !window.confirm("¿Confirmas la cancelación de este servicio?")) return;
    setUpdatingId(id); setError(""); setMessage("");
    const { error: updateError } = await supabase.from("services").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (updateError) setError(`No se pudo actualizar el servicio: ${updateError.message}`);
    else {
      setMessage(status === "Completado" ? "Servicio cerrado. Se generó la alerta de facturación." : `Servicio actualizado a ${status}.`);
      await loadData();
    }
    setUpdatingId("");
  }

  const visibleServices = services.filter((service) => (!filterMonth || service.service_date.startsWith(filterMonth)) && (!filterClient || service.client_id === filterClient));
  const destinationLines = form.destination.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const destinationNames = destinationLines.map((line) => line.split("|")[0].trim().toLocaleLowerCase("es-PE").replace(/\s+/g, " "));
  const uniqueDestinationCount = new Set(destinationNames).size;
  const repeatedDestinationCount = Math.max(0, destinationLines.length - uniqueDestinationCount);
  const coordinateCount = destinationLines.filter((line) => { const parts = line.split("|").map((part) => part.trim()); return parts.length >= 3 && Number.isFinite(Number(parts[1])) && Number.isFinite(Number(parts[2])); }).length;

  return (
    <>
    <main className="content">
      <section className="welcome"><div><span className="live-dot">OPERACIÓN EN TIEMPO REAL</span><h2>Servicios y asignaciones</h2><p>Programa rutas, asigna personal y controla el avance de cada servicio.</p></div><button className="primary" onClick={() => setShowForm(!showForm)}><Plus size={19} />{showForm ? "Cerrar formulario" : "Nuevo servicio"}</button></section>
      {error && <div className="module-error"><WarningCircle size={20} />{error}</div>}
      {message && <div className="module-success"><CheckCircle size={20} />{message}</div>}
      {showForm && <form className="service-form panel" onSubmit={createService}><div className="panel-title"><div><span>NUEVA OPERACIÓN</span><h3>{editingId ? "Editar servicio" : "Programar servicio"}</h3></div></div><div className="form-grid"><label>Fecha<input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} required /></label><label>Cliente<select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required><option value="">Seleccionar</option>{clients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Unidad<select value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}><option value="">Sin asignar</option>{vehicles.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.plate}</option>)}</select></label><label>Hora<input type="time" value={form.scheduled_start} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })} /></label><label>Chofer<select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}><option value="">Sin asignar</option>{staff.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label><label>Auxiliar<select value={form.assistant_id} onChange={(e) => setForm({ ...form, assistant_id: e.target.value })}><option value="">Sin asignar</option>{staff.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label><label className="wide">Mercadería<input value={form.merchandise} onChange={(e) => setForm({ ...form, merchandise: e.target.value })} placeholder="Descripción de la carga" /></label><label>Origen<input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Punto de recojo" /></label><label className="wide">Establecimientos / puntos<textarea value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Pega aquí la lista: un establecimiento por línea" rows={7} required /><button type="button" className="add-destination" onClick={() => setForm((current) => ({ ...current, destination: current.destination ? `${current.destination}\n` : "" }))}><Plus size={15} /> Agregar otra línea</button></label><div className="destination-preview wide"><strong>Validación antes de guardar</strong><span>{uniqueDestinationCount} punto{uniqueDestinationCount === 1 ? "" : "s"} únicos · {coordinateCount} con coordenadas · {repeatedDestinationCount} repetidos omitibles</span>{repeatedDestinationCount > 0 && <small>Revisa las líneas repetidas; la app guardará solo una por establecimiento y fecha.</small>}</div><p className="form-help wide">Las coordenadas son opcionales. Si las tienes, escríbelas en la misma línea: Establecimiento | latitud | longitud. Sin coordenadas, el chofer verá el nombre/dirección y el administrador verá el estado de validación.</p></div><div className="form-actions"><button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear servicios"}</button></div></form>}
      <section className="panel operations-list"><div className="panel-title"><div><span>AGENDA OPERATIVA</span><h3>Servicios asignados</h3></div><button disabled={loading} onClick={() => void loadData()}>{loading ? "Actualizando…" : "Actualizar"}</button></div><div className="table-filters"><label>Mes<input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} /></label><label>Cliente<select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}><option value="">Todos los clientes</option>{clients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{(filterMonth || filterClient) && <button type="button" onClick={() => { setFilterMonth(""); setFilterClient(""); }}>Limpiar filtros</button>}</div>{loading ? <div className="empty-state"><SpinnerGap className="spin" size={28} /> Cargando servicios…</div> : visibleServices.length === 0 ? <div className="empty-state"><CalendarCheck size={32} /> No hay servicios para los filtros seleccionados.</div> : visibleServices.map((service) => <article className="operation-row" key={service.id}><div className="operation-date"><strong>{new Date(`${service.service_date}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</strong><span>{service.scheduled_start?.slice(0,5) || "—"}</span></div><div className="operation-main"><strong>{service.clients?.name ?? "Cliente sin asignar"}</strong><span><MapPin size={14} />{service.origin || "Origen pendiente"} → {service.destination || "Destino pendiente"}</span><span><Car size={14} />{service.vehicles ? `${service.vehicles.name} · ${service.vehicles.plate}` : "Unidad pendiente"}</span></div><div className="operation-cargo"><span>{service.merchandise || "Sin detalle de mercadería"}</span></div><select className={`status-select ${service.status === "Completado" ? "status-completed" : service.status === "Programado" ? "status-programmed" : ""}`} disabled={updatingId === service.id} value={service.status} onChange={(e) => void updateStatus(service.id, e.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></article>)}</section>
      <div className="service-edit-list">{visibleServices.map((service) => <button type="button" key={`edit-${service.id}`} onClick={() => editService(service)}><PencilSimple size={14} /> Editar {service.destination || "servicio"}</button>)}</div>
    </main>
    </>
  );
}
