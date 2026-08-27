"use client";

import { CalendarCheck, Car, CheckCircle, MapPin, PencilSimple, Plus, SpinnerGap, Users, WarningCircle } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Option = { id: string; name: string };
type Staff = { id: string; full_name: string | null; email: string | null };
type ServiceRow = {
  id: string; service_date: string; created_at?: string; merchandise: string | null; origin: string | null; destination: string | null;
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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ service_date: new Date().toISOString().slice(0, 10), client_id: "", vehicle_id: "", merchandise: "", origin: "", destination: "", destination_lat: "", destination_lng: "", delivery_points: "1", scheduled_start: "", driver_id: "", assistant_id: "" });

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    const [serviceResult, clientResult, vehicleResult, staffResult] = await Promise.all([
      supabase.from("services").select("id,service_date,created_at,merchandise,origin,destination,scheduled_start,status,clients(name),vehicles(name,plate)").order("service_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
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

  useEffect(() => {
    const addDestinationPrompt = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".add-destination")) return;
      const value = window.prompt("Nombre o dirección del siguiente establecimiento", "");
      if (value?.trim()) setForm((current) => ({ ...current, destination: current.destination ? `${current.destination}\n${value.trim()}` : value.trim() }));
    };
    document.addEventListener("click", addDestinationPrompt, true);
    return () => document.removeEventListener("click", addDestinationPrompt, true);
  }, []);

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true); setError(""); setMessage("");
    const firstPoint = form.destination.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)[0] || "";
    if (editingId) {
      const [destination, lat, lng] = firstPoint.split("|").map((part) => part.trim());
      const { error: updateError } = await supabase.from("services").update({ service_date: form.service_date, client_id: form.client_id, vehicle_id: form.vehicle_id || null, merchandise: form.merchandise || null, origin: form.origin || null, destination, destination_lat: lat ? Number(lat) : (form.destination_lat ? Number(form.destination_lat) : null), destination_lng: lng ? Number(lng) : (form.destination_lng ? Number(form.destination_lng) : null), scheduled_start: form.scheduled_start || null, updated_at: new Date().toISOString() }).eq("id", editingId);
      if (updateError) setError(`No se pudo actualizar: ${updateError.message}`); else { setMessage("Servicio actualizado correctamente."); setShowForm(false); setEditingId(null); await loadData(); }
      setSaving(false); return;
    }
    if (form.driver_id && form.driver_id === form.assistant_id) {
      setError("El chofer y el auxiliar deben ser personas diferentes.");
      setSaving(false);
      return;
    }
    const destinations = form.destination.split(/\r?\n/).map((value) => { const [destination, lat, lng] = value.split("|").map((part) => part.trim()); return { destination, lat: lat ? Number(lat) : (form.destination_lat ? Number(form.destination_lat) : null), lng: lng ? Number(lng) : (form.destination_lng ? Number(form.destination_lng) : null) }; }).filter((value) => value.destination);
    if (!destinations.length) { setError("Ingresa al menos un establecimiento, uno por línea."); setSaving(false); return; }
    const duplicate = await supabase
      .from("services")
      .select("id")
      .eq("service_date", form.service_date)
      .eq("client_id", form.client_id)
      .eq("scheduled_start", form.scheduled_start || "00:00:00")
      .neq("status", "Cancelado")
      .limit(1);
    if (destinations.length === 1 && form.scheduled_start && duplicate.data?.length) {
      setError("Ya existe un servicio activo para ese cliente en la misma fecha y hora.");
      setSaving(false);
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    const rows = destinations.map((point) => ({ service_date: form.service_date, client_id: form.client_id, vehicle_id: form.vehicle_id || null, merchandise: form.merchandise || null, origin: form.origin || null, destination: point.destination, destination_lat: Number.isFinite(point.lat) ? point.lat : null, destination_lng: Number.isFinite(point.lng) ? point.lng : null, delivery_points: 1, scheduled_start: form.scheduled_start || null, status: "Programado", created_by: authData.user?.id }));
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
      setMessage(`${destinations.length} servicio${destinations.length === 1 ? "" : "s"} creado${destinations.length === 1 ? "" : "s"} y asignado${destinations.length === 1 ? "" : "s"} correctamente.`);
      setForm({ ...form, merchandise: "", origin: "", destination: "", destination_lat: "", destination_lng: "", delivery_points: "1", scheduled_start: "", driver_id: "", assistant_id: "" });
      await loadData();
    }
    setSaving(false);
  }

  function editService(service: ServiceRow) {
    setEditingId(service.id); setShowForm(true); setError(""); setMessage("");
    setForm((current) => ({ ...current, service_date: service.service_date, merchandise: service.merchandise || "", origin: service.origin || "", destination: service.destination || "", scheduled_start: service.scheduled_start || "" }));
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

  return (
    <>
    <main className="content">
      <section className="welcome"><div><span className="live-dot">OPERACIÓN EN TIEMPO REAL</span><h2>Servicios y asignaciones</h2><p>Programa rutas, asigna personal y controla el avance de cada servicio.</p></div><button className="primary" onClick={() => setShowForm(!showForm)}><Plus size={19} />{showForm ? "Cerrar formulario" : "Nuevo servicio"}</button></section>
      {error && <div className="module-error"><WarningCircle size={20} />{error}</div>}
      {message && <div className="module-success"><CheckCircle size={20} />{message}</div>}
      {showForm && <form className="service-form panel" onSubmit={createService}><div className="panel-title"><div><span>NUEVA OPERACIÓN</span><h3>Programar servicio</h3></div></div><div className="form-grid"><label>Fecha<input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} required /></label><label>Cliente<select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required><option value="">Seleccionar</option>{clients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Unidad<select value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}><option value="">Sin asignar</option>{vehicles.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.plate}</option>)}</select></label><label>Hora<input type="time" value={form.scheduled_start} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })} /></label><label>Chofer<select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}><option value="">Sin asignar</option>{staff.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label><label>Auxiliar<select value={form.assistant_id} onChange={(e) => setForm({ ...form, assistant_id: e.target.value })}><option value="">Sin asignar</option>{staff.map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label><label className="wide">Mercadería<input value={form.merchandise} onChange={(e) => setForm({ ...form, merchandise: e.target.value })} placeholder="Descripción de la carga" /></label><label>Origen<input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Punto de recojo" /></label><label className="wide">Establecimientos / puntos<textarea value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Un establecimiento por línea" rows={4} required /><button type="button" className="add-destination" onClick={() => setForm((current) => ({ ...current, destination: current.destination ? `${current.destination}\n` : "" }))}><Plus size={15} /> Agregar destino</button></label><label>Latitud del local<input type="number" step="any" min="-90" max="90" value={form.destination_lat} onChange={(e) => setForm({ ...form, destination_lat: e.target.value })} placeholder="Ej. -12.0464" /></label><label>Longitud del local<input type="number" step="any" min="-180" max="180" value={form.destination_lng} onChange={(e) => setForm({ ...form, destination_lng: e.target.value })} placeholder="Ej. -77.0428" /></label><p className="form-help wide">Un establecimiento por línea. Para coordenadas individuales usa: Local | latitud | longitud. Al guardar se crea un servicio por punto.</p></div><div className="form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Guardando…" : "Crear servicio"}</button></div></form>}
      <section className="panel operations-list"><div className="panel-title"><div><span>AGENDA OPERATIVA</span><h3>Últimos servicios</h3></div><button disabled={loading} onClick={() => void loadData()}>{loading ? "Actualizando…" : "Actualizar"}</button></div>{loading ? <div className="empty-state"><SpinnerGap className="spin" size={28} /> Cargando servicios…</div> : services.length === 0 ? <div className="empty-state"><CalendarCheck size={32} /> Aún no existen servicios. Crea el primero.</div> : services.map((service) => <article className="operation-row" key={service.id}><div className="operation-date"><strong>{new Date(`${service.service_date}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</strong><span>{service.scheduled_start?.slice(0,5) || "—"}</span></div><div className="operation-main"><strong>{service.clients?.name ?? "Cliente sin asignar"}</strong><span><MapPin size={14} />{service.origin || "Origen pendiente"} → {service.destination || "Destino pendiente"}</span><span><Car size={14} />{service.vehicles ? `${service.vehicles.name} · ${service.vehicles.plate}` : "Unidad pendiente"}</span></div><div className="operation-cargo"><span>{service.merchandise || "Sin detalle de mercadería"}</span></div><select className="status-select" disabled={updatingId === service.id} value={service.status} onChange={(e) => void updateStatus(service.id, e.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></article>)}</section>
      <div className="service-edit-list">{services.map((service) => <button type="button" key={`edit-${service.id}`} onClick={() => editService(service)}><PencilSimple size={14} /> Editar {service.destination || "servicio"}</button>)}</div>
    </main>
    </>
  );
}
