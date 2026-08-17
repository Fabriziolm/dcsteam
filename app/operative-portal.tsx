"use client";

import { CalendarCheck, Car, CheckCircle, Clock, Gauge, GasPump, MapPin, Receipt, SpinnerGap, WarningCircle, X } from "@phosphor-icons/react";
import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Role = "Chofer" | "Auxiliar";
type Service = { id:string; service_date:string; scheduled_start:string|null; status:string; origin:string|null; destination:string|null; merchandise:string|null; km_start:number|null; km_end:number|null; vehicle_id:string|null; clients:{name:string}|null; vehicles:{name:string;plate:string}|null };
type Action = "km" | "fuel" | "expense" | "finding" | "detail" | "progress" | null;

export function OperativePortal({ role, session, initialAction=null }: { role: Role; session: Session; initialAction?: Action }) {
  const [services, setServices] = useState<Service[]>([]);
  const [shift, setShift] = useState<{id:string;clock_in:string;clock_out:string|null}|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [selected, setSelected] = useState<Service|null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<File|null>(null);
  const [form, setForm] = useState({ service_id:"", amount:"", concept:"", category:"Peaje", km:"", severity:"Media", description:"", status:"En ruta" });
  const today = new Date().toISOString().slice(0,10);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError("");
    const [serviceResult, shiftResult] = await Promise.all([
      supabase.from("services").select("id,service_date,scheduled_start,status,origin,destination,merchandise,km_start,km_end,vehicle_id,clients(name),vehicles(name,plate)").gte("service_date", today).order("service_date").order("scheduled_start").limit(30),
      supabase.from("time_entries").select("id,clock_in,clock_out").eq("user_id", session.user.id).eq("work_date", today).order("created_at", {ascending:false}).limit(1).maybeSingle(),
    ]);
    if (serviceResult.error || shiftResult.error) setError(serviceResult.error?.message || shiftResult.error?.message || "No se pudo cargar la jornada.");
    else { setServices((serviceResult.data || []) as unknown as Service[]); setShift(shiftResult.data); }
    setLoading(false);
  }, [session.user.id, today]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { if (initialAction) open(initialAction); }, [initialAction]);
  const activeShift = Boolean(shift?.clock_in && !shift.clock_out);
  const completed = services.filter(s => s.status === "Completado").length;
  const elapsed = useMemo(() => shift?.clock_in ? Math.max(0, Date.now() - new Date(shift.clock_in).getTime()) : 0, [shift]);
  const hours = `${String(Math.floor(elapsed/3600000)).padStart(2,"0")}:${String(Math.floor(elapsed/60000)%60).padStart(2,"0")}`;

  async function toggleShift() {
    if (!supabase) return;
    setSaving(true); setError(""); setMessage("");
    const result = activeShift && shift
      ? await supabase.from("time_entries").update({clock_out:new Date().toISOString(),status:"Cerrada",updated_at:new Date().toISOString()}).eq("id",shift.id)
      : await supabase.from("time_entries").insert({user_id:session.user.id,work_date:today,clock_in:new Date().toISOString(),status:"Abierta"});
    if (result.error) setError(result.error.message); else { setMessage(activeShift ? "Jornada cerrada correctamente." : "Jornada iniciada correctamente."); await loadData(); }
    setSaving(false);
  }

  function open(next:Action, service?:Service) {
    setSelected(service || null); setAction(next); setError(""); setMessage("");
    setReceipt(null);
    setForm(f => ({...f, service_id:service?.id || "", km:"", amount:"", concept:"", description:"", status:service?.status === "Programado" ? "Confirmado" : service?.status === "Confirmado" ? "En ruta" : "Completado"}));
  }

  async function submit(event:FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setSaving(true); setError("");
    let result:{error:{message:string}|null};
    if (action === "fuel" || action === "expense") {
      const service = services.find(s => s.id === form.service_id);
      if (!receipt) { setError("Toma o selecciona una foto del comprobante."); setSaving(false); return; }
      const extension = receipt.name.split(".").pop()?.toLowerCase() || "jpg";
      const receiptPath = `${session.user.id}/${today}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from("expense-receipts").upload(receiptPath, receipt, { contentType:receipt.type, upsert:false });
      if (upload.error) { setError(`No se pudo subir la foto: ${upload.error.message}`); setSaving(false); return; }
      result = await supabase.from("expenses").insert({ user_id:session.user.id, service_id:form.service_id||null, vehicle_id:service?.vehicle_id||null, category:action === "fuel" ? "Gasolina" : form.category, concept:form.concept, amount:Number(form.amount), receipt_url:receiptPath, source_system:"dcs_app", status:"Pendiente" });
    } else if (action === "finding") {
      const service = services.find(s => s.id === form.service_id);
      result = await supabase.from("findings").insert({ reported_by:session.user.id, service_id:form.service_id||null, vehicle_id:service?.vehicle_id||null, category:"Operación", severity:form.severity, description:form.description, status:"Abierto" });
    } else {
      result = await supabase.rpc("record_service_progress", { target_service_id:form.service_id, new_status:action === "progress" ? form.status : null, odometer:Number(form.km) });
    }
    if (result.error) setError(result.error.message); else { setAction(null); setMessage("Registro guardado correctamente."); await loadData(); }
    setSaving(false);
  }

  if (loading) return <main className="content"><div className="empty-state"><SpinnerGap className="spin" size={30}/>Cargando jornada…</div></main>;
  return <main className="content">
    <section className="welcome operative"><div><span className="live-dot">JORNADA DE HOY</span><h2>Hola, {session.user.user_metadata?.full_name || role}</h2><p>{services.length} servicios asignados desde hoy.</p></div><button disabled={saving || Boolean(shift?.clock_out)} className={activeShift ? "primary completed" : "primary"} onClick={() => void toggleShift()}>{activeShift?<CheckCircle size={19}/>:<Clock size={19}/>} {activeShift?"Cerrar jornada":shift?.clock_out?"Jornada finalizada":"Iniciar jornada"}</button></section>
    {error&&<div className="module-error"><WarningCircle size={20}/>{error}</div>}{message&&<div className="module-success"><CheckCircle size={20}/>{message}</div>}
    <section className="operative-grid"><div className="schedule"><div className="section-heading"><div><span>AGENDA</span><h3>Servicios asignados</h3></div><b>{services.length} servicios</b></div>
      {services.length===0?<div className="empty-state"><CalendarCheck size={32}/>No tienes servicios asignados.</div>:services.map((s,i)=><article className="service" key={s.id}><div className="timeline"><strong>{s.scheduled_start?.slice(0,5)||"—"}</strong><i className={i===0?"current":""}/></div><div className="service-main"><div className="service-top"><div><span>{new Date(`${s.service_date}T12:00:00`).toLocaleDateString("es-PE")}</span><h3>{s.clients?.name||"Cliente pendiente"}</h3></div><b className={`status ${s.status==="En ruta"?"green-status":s.status==="Confirmado"?"blue-status":"amber-status"}`}>{s.status}</b></div><p><MapPin size={17}/>{s.origin||"Origen pendiente"} → {s.destination||"Destino pendiente"}</p><p><Car size={17}/>{s.vehicles?`${s.vehicles.name} · ${s.vehicles.plate}`:"Unidad pendiente"}</p><div className="service-actions"><button onClick={()=>open("detail",s)}>Ver detalle</button>{s.status!=="Completado"&&s.status!=="Cancelado"&&<button className="primary small" onClick={()=>open("progress",s)}>Registrar avance</button>}</div></div></article>)}
    </div><aside className="quick-panel"><article className="panel shift"><span>MI JORNADA</span><div className="shift-time"><Clock size={30}/><strong>{activeShift?hours:"00:00"}</strong></div><div><span>Ingreso</span><b>{shift?.clock_in?new Date(shift.clock_in).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}):"—"}</b></div><div><span>Servicios completados</span><b>{completed} de {services.length}</b></div></article>
      <article className="panel"><div className="panel-title"><div><span>ACCESOS RÁPIDOS</span><h3>Registrar información</h3></div></div><div className="quick-actions"><button onClick={()=>open("km")}><Gauge size={24}/><span>Kilometraje</span></button><button onClick={()=>open("fuel")}><GasPump size={24}/><span>Combustible</span></button><button onClick={()=>open("expense")}><Receipt size={24}/><span>Gasto</span></button><button onClick={()=>open("finding")}><WarningCircle size={24}/><span>Incidencia</span></button></div></article>
    </aside></section>
    {action&&<div className="modal-backdrop" onMouseDown={()=>setAction(null)}><section className="action-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setAction(null)}><X size={20}/></button>{action==="detail"&&selected?<><span>DETALLE DEL SERVICIO</span><h3>{selected.clients?.name||"Servicio"}</h3><dl><dt>Ruta</dt><dd>{selected.origin||"—"} → {selected.destination||"—"}</dd><dt>Mercadería</dt><dd>{selected.merchandise||"Sin detalle"}</dd><dt>Unidad</dt><dd>{selected.vehicles?`${selected.vehicles.name} · ${selected.vehicles.plate}`:"Sin asignar"}</dd><dt>Kilometraje</dt><dd>{selected.km_start??"—"} / {selected.km_end??"—"}</dd></dl></>:<form onSubmit={submit}><span>REGISTRO OPERATIVO</span><h3>{action==="km"?"Registrar kilometraje":action==="fuel"?"Registrar combustible":action==="expense"?"Registrar gasto":action==="finding"?"Reportar incidencia":"Actualizar servicio"}</h3><label>Servicio<select required value={form.service_id} onChange={e=>setForm({...form,service_id:e.target.value})}><option value="">Seleccionar</option>{services.map(s=><option key={s.id} value={s.id}>{s.clients?.name||"Servicio"} · {s.service_date}</option>)}</select></label>{(action==="km"||action==="progress")&&<label>Kilometraje actual<input type="number" min="0" step="0.1" required value={form.km} onChange={e=>setForm({...form,km:e.target.value})}/></label>}{action==="progress"&&<label>Nuevo estado<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Confirmado</option><option>En ruta</option><option>Completado</option></select></label>}{(action==="fuel"||action==="expense")&&<><label>Tipo<select disabled={action==="fuel"} value={action==="fuel"?"Gasolina":form.category} onChange={e=>setForm({...form,category:e.target.value})}>{["Gasolina","GLP","Peaje","Estacionamiento","Mantenimiento","Otro"].map(v=><option key={v}>{v}</option>)}</select></label><label>Concepto<input required value={form.concept} onChange={e=>setForm({...form,concept:e.target.value})}/></label><label>Importe S/<input type="number" min="0.01" step="0.01" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Foto del comprobante<input className="receipt-input" type="file" accept="image/*" capture="environment" required onChange={e=>setReceipt(e.target.files?.[0]||null)}/><small>Toma una foto clara donde se vean fecha, importe y proveedor.</small></label></>}{action==="finding"&&<><label>Severidad<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></label><label>Descripción<textarea required value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></>}<div className="form-actions"><button type="button" onClick={()=>setAction(null)}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Guardando…":"Guardar gasto"}</button></div></form>}</section></div>}
  </main>;
}
