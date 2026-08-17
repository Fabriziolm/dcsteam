"use client";

import { CalendarCheck, Car, CheckCircle, MapPin, Plus, SpinnerGap, Users, WarningCircle } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Option = { id: string; name: string };
type Staff = { id: string; full_name: string | null; email: string | null };
type ServiceRow = {
  id: string; service_date: string; merchandise: string | null; origin: string | null; destination: string | null;
  scheduled_start: string | null; status: string; clients: { name: string } | null; vehicles: { name: string; plate: string } | null;
};

const statuses = ["Programado", "Confirmado", "En ruta", "Completado", "Cancelado"];

export function ServicesManagement() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [vehicles, setVehicles] = useState<Array<Option & { plate: string }>>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ service_date: new Date().toISOString().slice(0, 10), client_id: "", vehicle_id: "", merchandise: "", origin: "", destination: "", scheduled_start: "", driver_id: "", assistant_id: "" });

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    const [serviceResult, clientResult, vehicleResult, staffResult] = await Promise.all([
      supabase.from("services").select("id,service_date,merchandise,origin,destination,scheduled_start,status,clients(name),vehicles(name,plate)").order("service_date", { ascending: false }).limit(50),
      supabase.from("clients").select("id,name").eq("active", true).order("name"),
      supabase.from("vehicles").select("id,name,plate").eq("active", true).order("name"),
      supabase.from("profiles").select("id,full_name,email").eq("active", true).order("full_name"),
    ]);
    const firstError = serviceResult.error || clientResult.error || vehicleResult.error || staffResult.error;
    if (firstError) setError(`No se pudieron cargar las operaciones: ${firstError.message}`);
    else {
      setServices((serviceResult.data ?? []) as unknown as ServiceRow[]);
      setClients((clientResult.data ?? []) as Option[]);
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
    if (form.driver_id && form.driver_id === form.assistant_id) {
      setError("El chofer y el auxiliar deben ser personas diferentes.");
      setSaving(false);
      return;
    }
    const duplicate = await supabase
      .from("services")
      .select("id")
      .eq("service_date", form.service_date)
      .eq("client_id", form.client_id)
      .eq("scheduled_start", form.scheduled_start || "00:00:00")
      .neq("status", "Cancelado")
      .limit(1);
    if (form.scheduled_start && duplicate.data?.length) {
      setError("Ya existe un servicio activo para ese cliente en la misma fecha y hora.");
      setSaving(false);
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    const { data, error: serviceError } = await supabase.from("services").insert({
      service_date: form.service_date, client_id: form.client_id, vehicle_id: form.vehicle_id || null,
      merchandise: form.merchandise || null, origin: form.origin || null, destination: form.destination || null,
      scheduled_start: form.scheduled_start || null, status: "Programado", created_by: authData.user?.id,
    }).select("id").single();
    if (serviceError || !data) {
      setError(`No se pudo crear el servicio: ${serviceError?.message ?? "sin identificador"}`);
    } else {
      const assignments: Array<{ service_id: string; user_id: string; assignment_role: string }> = [];
      if (form.driver_id) assignments.push({ service_id: data.id, user_id: form.driver_id, assignment_role: "Chofer" });
      if (form.assistant_id) assignments.push({ service_id: data.id, user_id: form.assistant_id, assignment_role: "Auxiliar" });
      if (assignments.length) {
        const { error: assignmentError } = await supabase.from("service_assignments").insert(assignments);
        if (assignmentError) setError(`Servicio creado, pero falló una asignación: ${assignmentError.message}`);
      }
      setShowForm(false);
      setMessage("Servicio creado y asignaciones guardadas correctamente.");
      setForm({ ...form, merchandise: "", origin: "", destination: "", scheduled_start: "", driver_id: "", assistant_id: "" });
      await loadData();
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: string) {
    if (!supabase) return;
    const current = services.find((service) => service.id === id);
    if (!current || current.status === status) return;
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

  return (
    <main className="content">
      <section className="welcome"><div><span className="live-dot">OPERACIÓN EN TIEMPO REAL</span><h2>Servicios y asignaciones</h2><p>Programa rutas, asigna personal y controla el avance de cada servicio.</p></div><button className="primary" onClick={() => setShowForm(!showForm)}><Plus size={19} />{showForm ? "Cerrar formulario" : "Nuevo servicio"}</button></section>
      {error && <div className="module-error"><WarningCircle size={20} />{error}</div>}
      {message && <div className="module-success"><CheckCircle size={20} />{message}</div>}
      {showForm && <form className="service-form panel" onSubmit={createService}><div className="panel-title"><div><span>NUEVA OPERACIÓN</span><h3>Programar servicio</h3></div></div><div className="form-grid"><label>Fecha<input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} required /></label><label>Cliente<select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required><option value="">Seleccionar</option>{clients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Unidad<select value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}><option value="">Sin asignar</option>{vehicles.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.plate}</option>)}</select></label><label>Hora<input type="time" value={form.scheduled_start} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })} /></label><label>Chofer<select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}><option value="">Sin asignar</option>{staff.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label><label>Auxiliar<select value={form.assistant_id} onChange={(e) => setForm({ ...form, assistant_id: e.target.value })}><option value="">Sin asignar</option>{staff.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label><label className="wide">Mercadería<input value={form.merchandise} onChange={(e) => setForm({ ...form, merchandise: e.target.value })} placeholder="Descripción de la carga" /></label><label>Origen<input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Punto de recojo" /></label><label>Destino<input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Punto de entrega" /></label></div><div className="form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Guardando…" : "Crear servicio"}</button></div></form>}
      <section className="panel operations-list"><div className="panel-title"><div><span>AGENDA OPERATIVA</span><h3>Últimos servicios</h3></div><button disabled={loading} onClick={() => void loadData()}>{loading ? "Actualizando…" : "Actualizar"}</button></div>{loading ? <div className="empty-state"><SpinnerGap className="spin" size={28} /> Cargando servicios…</div> : services.length === 0 ? <div className="empty-state"><CalendarCheck size={32} /> Aún no existen servicios. Crea el primero.</div> : services.map((service) => <article className="operation-row" key={service.id}><div className="operation-date"><strong>{new Date(`${service.service_date}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</strong><span>{service.scheduled_start?.slice(0,5) || "—"}</span></div><div className="operation-main"><strong>{service.clients?.name ?? "Cliente sin asignar"}</strong><span><MapPin size={14} />{service.origin || "Origen pendiente"} → {service.destination || "Destino pendiente"}</span><span><Car size={14} />{service.vehicles ? `${service.vehicles.name} · ${service.vehicles.plate}` : "Unidad pendiente"}</span></div><div className="operation-cargo"><span>{service.merchandise || "Sin detalle de mercadería"}</span></div><select className="status-select" disabled={updatingId === service.id} value={service.status} onChange={(e) => void updateStatus(service.id, e.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></article>)}</section>
    </main>
  );
}
