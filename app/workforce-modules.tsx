"use client";

import {
  ArrowsClockwise,
  CheckCircle,
  Camera,
  Clock,
  MapPin,
  Plus,
  SpinnerGap,
  UserCircle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useReportingYear, yearRange } from "./reporting-year";

type Finding = {
  id: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  created_at: string;
  vehicles: { name: string; plate: string } | null;
};
type Entry = {
  id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  notes: string | null;
};
type Holiday = { holiday_date:string; name:string; credited_hours:number };
type ImportedWorkHour = { id:string; user_id:string|null; worker_label:string; week_start:string; worked_minutes:number; source_value:string|null };
type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export function FindingsManagement({
  canManage = false,
}: {
  canManage?: boolean;
}) {
  const {year}=useReportingYear(),range=yearRange(year);
  const [rows, setRows] = useState<Finding[]>([]),
    [loading, setLoading] = useState(true),
    [show, setShow] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState({
    category: "Operación",
    severity: "Media",
    description: "",
  });
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const r = await supabase
      .from("findings")
      .select(
        "id,category,severity,description,status,created_at,vehicles(name,plate)",
      )
      .gte("created_at",`${range.start}T00:00:00`)
      .lte("created_at",`${range.end}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (r.error) setError(r.error.message);
    else setRows((r.data || []) as unknown as Finding[]);
    setLoading(false);
  }, [range.start,range.end]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    const { data } = await supabase.auth.getUser();
    const r = await supabase
      .from("findings")
      .insert({ ...form, reported_by: data.user?.id, status: "Abierto" });
    if (r.error) setError(r.error.message);
    else {
      setMessage("Incidencia registrada.");
      setShow(false);
      setForm({ ...form, description: "" });
      await load();
    }
    setSaving(false);
  }
  async function resolve(id: string, status: string) {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    const r = await supabase
      .from("findings")
      .update({
        status,
        resolved_by: status === "Resuelto" ? data.user?.id : null,
        resolved_at: status === "Resuelto" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (r.error) setError(r.error.message);
    else await load();
  }
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">SEGURIDAD Y CONTROL</span>
          <h2>Incidencias</h2>
          <p>Registra y da seguimiento a hallazgos de la operación.</p>
        </div>
        <button className="primary" onClick={() => setShow(!show)}>
          <Plus size={19} />
          Nueva incidencia
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
      {show && (
        <form className="service-form panel" onSubmit={save}>
          <div className="form-grid">
            <label>
              Categoría
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {[
                  "Operación",
                  "Vehículo",
                  "Seguridad",
                  "Documentación",
                  "Cliente",
                  "Otro",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Severidad
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                <option>Baja</option>
                <option>Media</option>
                <option>Alta</option>
                <option>Crítica</option>
              </select>
            </label>
            <label className="wide">
              Descripción
              <input
                required
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setShow(false)}>
              Cancelar
            </button>
            <button className="primary" disabled={saving}>
              Registrar
            </button>
          </div>
        </form>
      )}
      <section className="panel data-panel">
        {loading ? (
          <div className="empty-state">
            <SpinnerGap className="spin" size={28} />
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={30} />
            No hay incidencias registradas.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Severidad</th>
                  <th>Descripción</th>
                  <th>Unidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {new Date(r.created_at).toLocaleDateString("es-PE")}
                    </td>
                    <td>{r.category}</td>
                    <td>{r.severity}</td>
                    <td className="wrap-cell">{r.description}</td>
                    <td>
                      {r.vehicles
                        ? `${r.vehicles.name} · ${r.vehicles.plate}`
                        : "—"}
                    </td>
                    <td>
                      {canManage ? (
                        <select
                          className="status-select"
                          value={r.status}
                          onChange={(e) => void resolve(r.id, e.target.value)}
                        >
                          <option>Abierto</option>
                          <option>En revisión</option>
                          <option>Resuelto</option>
                          <option>Descartado</option>
                        </select>
                      ) : (
                        <b className="table-status">{r.status}</b>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export function HoursManagement({role}:{role:"Chofer"|"Auxiliar"}) {
  const [rows, setRows] = useState<Entry[]>([]),
    [holidays,setHolidays]=useState<Holiday[]>([]),
    [importedHours,setImportedHours]=useState<ImportedWorkHour[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    void Promise.all([
      supabase.from("time_entries").select("id,work_date,clock_in,clock_out,break_minutes,status,notes").order("work_date", { ascending: false }).limit(100),
      supabase.from("holidays").select("holiday_date,name,credited_hours").eq("active",true),
      supabase.from("imported_work_hours").select("id,user_id,worker_label,week_start,worked_minutes,source_value").order("week_start",{ascending:false}),
    ]).then(([r,h,imported]) => {
        if (r.error||h.error||imported.error) setError(r.error?.message||h.error?.message||imported.error?.message||"No se pudo calcular la semana.");
        else {setRows((r.data || []) as Entry[]);setHolidays((h.data||[]) as Holiday[]);setImportedHours((imported.data||[]) as ImportedWorkHour[]);}
        setLoading(false);
      });
  }, []);
  const minutes = useMemo(
    () =>
      rows.reduce(
        (sum, r) =>
          r.clock_in && r.clock_out
            ? sum +
              Math.max(
                0,
                (new Date(r.clock_out).getTime() -
                  new Date(r.clock_in).getTime()) /
                  60000 -
                  r.break_minutes,
              )
            : sum,
        0,
      ),
    [rows],
  );
  const weekly=useMemo(()=>{
    const today=new Date(),monday=new Date(today);monday.setHours(0,0,0,0);monday.setDate(today.getDate()-((today.getDay()+6)%7));
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const start=monday.toISOString().slice(0,10),end=sunday.toISOString().slice(0,10),rate=role==="Chofer"?10.41:6.77;
    const current=rows.filter(row=>row.work_date>=start&&row.work_date<=end&&row.clock_in&&row.clock_out);
    let ordinaryMinutes=0,extraMinutes=0,lunchDays=0;
    current.forEach(row=>{const worked=Math.max(0,(new Date(row.clock_out!).getTime()-new Date(row.clock_in!).getTime())/60000-row.break_minutes);ordinaryMinutes+=Math.min(480,worked);extraMinutes+=Math.max(0,worked-480);if(worked>600)lunchDays++});
    const workedDates=new Set(current.map(row=>row.work_date));
    const credited=holidays.filter(day=>day.holiday_date>=start&&day.holiday_date<=end&&!workedDates.has(day.holiday_date));
    const holidayMinutes=credited.reduce((sum,day)=>sum+Number(day.credited_hours)*60,0);
    const ordinaryPay=((ordinaryMinutes+holidayMinutes)/60)*rate,extraPay=(extraMinutes/60)*rate,lunchPay=lunchDays*20;
    return {start,end,rate,ordinaryMinutes,extraMinutes,holidayMinutes,credited,ordinaryPay,extraPay,lunchDays,lunchPay,totalPay:ordinaryPay+extraPay+lunchPay};
  },[rows,holidays,role]);
  const importedTotal=useMemo(()=>importedHours.reduce((sum,row)=>sum+row.worked_minutes,0),[importedHours]);
  const importedMonths=useMemo(()=>{
    const months=new Map<string,{minutes:number;weeks:number}>();
    importedHours.forEach(row=>{const key=row.week_start.slice(0,7),current=months.get(key)||{minutes:0,weeks:0};current.minutes+=row.worked_minutes;current.weeks+=1;months.set(key,current)});
    return [...months.entries()].sort(([a],[b])=>b.localeCompare(a));
  },[importedHours]);
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">CONTROL DE JORNADA</span>
          <h2>Mis horas</h2>
          <p>Historial de ingresos, salidas y horas acumuladas.</p>
        </div>
      </section>
      {error && (
        <div className="module-error">
          <WarningCircle size={20} />
          {error}
        </div>
      )}
      <section className="metrics-grid compact">
        <article className="metric purple">
          <span>Histórico desde marzo</span>
          <strong>{Math.floor(importedTotal/60)}h {importedTotal%60}m</strong>
          <small>{importedHours.length} semanas importadas de Google Sheets</small>
        </article>
        <article className="metric blue">
          <span>Horas registradas</span>
          <strong>
            {Math.floor(minutes / 60)}h {Math.round(minutes % 60)}m
          </strong>
        </article>
        <article className="metric green">
          <span>Jornadas cerradas</span>
          <strong>
            {
              rows.filter(
                (r) => r.status === "Cerrada" || r.status === "Aprobada",
              ).length
            }
          </strong>
        </article>
        <article className="metric amber">
          <span>Horas extra esta semana</span>
          <strong>{(weekly.extraMinutes/60).toFixed(1)} h</strong>
          <small>Estimado: S/ {weekly.extraPay.toFixed(2)}</small>
        </article>
        <article className="metric purple">
          <span>Generado esta semana</span>
          <strong>S/ {weekly.totalPay.toFixed(2)}</strong>
          <small>Tarifa referencial: S/ {weekly.rate.toFixed(2)} por hora</small>
        </article>
      </section>
      <section className="panel data-panel">
        <div className="panel-title"><div><span>HISTÓRICO IMPORTADO</span><h3>Horas semanales desde marzo</h3></div><b className="status green-status">Google Sheets</b></div>
        {importedHours.length===0?<div className="empty-state">Aún no hay horas históricas sincronizadas.</div>:<><div className="report-summary">{importedMonths.map(([month,value])=><div key={month}><span>{new Date(`${month}-02T12:00:00`).toLocaleDateString("es-PE",{month:"long",year:"numeric"})}</span><strong>{Math.floor(value.minutes/60)}h {value.minutes%60}m</strong><small>{value.weeks} semanas</small></div>)}</div><div className="table-scroll"><table className="data-table"><thead><tr><th>Semana</th><th>Horas</th><th>Fuente</th></tr></thead><tbody>{importedHours.map(row=><tr key={row.id}><td>{row.week_start}</td><td><strong>{Math.floor(row.worked_minutes/60)}h {row.worked_minutes%60}m</strong></td><td>{row.source_value||"Google Sheets"}</td></tr>)}</tbody></table></div></>}
      </section>
      <section className="panel weekly-pay-detail">
        <div className="panel-title"><div><span>ESTIMACIÓN SEMANAL</span><h3>{weekly.start} al {weekly.end}</h3></div><b className="status blue-status">Referencial</b></div>
        <div className="report-summary"><div><span>Horas ordinarias</span><strong>{(weekly.ordinaryMinutes/60).toFixed(1)} h</strong></div><div><span>Feriados reconocidos</span><strong>{(weekly.holidayMinutes/60).toFixed(1)} h</strong></div><div><span>Almuerzos reconocidos</span><strong>{weekly.lunchDays} · S/ {weekly.lunchPay.toFixed(2)}</strong></div></div>
        {weekly.credited.length>0&&<p className="report-description">Feriado considerado: {weekly.credited.map(day=>`${day.name} (${Number(day.credited_hours)} h)`).join(", ")}.</p>}
        <p className="report-description">Después de 8 horas, las horas extra conservan la tarifa normal del rol. Si una jornada supera las 10 horas, se reconocen S/ 20 de almuerzo por ese día. El resultado es informativo y queda sujeto a aprobación administrativa.</p>
      </section>
      <section className="panel data-panel">
        {loading ? (
          <div className="empty-state">
            <SpinnerGap className="spin" size={28} />
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Ingreso</th>
                  <th>Salida</th>
                  <th>Descanso</th>
                  <th>Duración</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const duration =
                    r.clock_in && r.clock_out
                      ? Math.max(
                          0,
                          (new Date(r.clock_out).getTime() -
                            new Date(r.clock_in).getTime()) /
                            60000 -
                            r.break_minutes,
                        )
                      : 0;
                  return (
                    <tr key={r.id}>
                      <td>{r.work_date}</td>
                      <td>
                        {r.clock_in
                          ? new Date(r.clock_in).toLocaleTimeString("es-PE", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td>
                        {r.clock_out
                          ? new Date(r.clock_out).toLocaleTimeString("es-PE", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td>{r.break_minutes} min</td>
                      <td>
                        {Math.floor(duration / 60)}h {Math.round(duration % 60)}
                        m
                      </td>
                      <td>
                        <b className="table-status">{r.status}</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export function TeamDirectory() {
  const [rows, setRows] = useState<Profile[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("profiles")
      .select("id,full_name,email,phone")
      .eq("active", true)
      .order("full_name")
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setRows((r.data || []) as Profile[]);
        setLoading(false);
      });
  }, []);
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">PERSONAL ACTIVO</span>
          <h2>Directorio del equipo</h2>
          <p>Consulta al personal disponible para las operaciones.</p>
        </div>
      </section>
      {error && (
        <div className="module-error">
          <WarningCircle size={20} />
          {error}
        </div>
      )}
      <section className="team-directory">
        {loading ? (
          <div className="empty-state">
            <SpinnerGap className="spin" size={28} />
          </div>
        ) : (
          rows.map((p) => (
            <article className="panel directory-card" key={p.id}>
              <UserCircle size={38} />
              <div>
                <strong>{p.full_name || "Usuario DCS"}</strong>
                <span>{p.email || "Sin correo"}</span>
                <small>{p.phone || "Sin teléfono"}</small>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

type AttendanceEntry = {
  id: string; user_id: string; work_date: string; clock_in: string | null; clock_out: string | null; status: string;
  clock_in_lat: number | null; clock_in_lng: number | null; clock_in_accuracy: number | null; clock_in_photo: string | null;
  clock_out_lat: number | null; clock_out_lng: number | null; clock_out_accuracy: number | null; clock_out_photo: string | null;
};
type AttendanceCorrection={id:string;user_id:string;time_entry_id:string;correction_type:string;proposed_time:string|null;reason:string;original_clock_in:string|null;original_clock_out:string|null;status:string;created_at:string};

export function AttendanceManagement() {
  const {year}=useReportingYear(),range=yearRange(year);
  const [rows, setRows] = useState<AttendanceEntry[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [corrections,setCorrections]=useState<AttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingPhoto, setOpeningPhoto] = useState("");
  const [reviewingCorrection,setReviewingCorrection]=useState("");
  const [error, setError] = useState("");
  const load=useCallback(async()=>{
    if (!supabase) return;
    setLoading(true);setError("");
    const [entries,profiles,requests]=await Promise.all([
      supabase.from("time_entries").select("id,user_id,work_date,clock_in,clock_out,status,clock_in_lat,clock_in_lng,clock_in_accuracy,clock_in_photo,clock_out_lat,clock_out_lng,clock_out_accuracy,clock_out_photo").gte("work_date",range.start).lte("work_date",range.end).order("work_date", { ascending: false }).limit(500),
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("attendance_correction_requests").select("id,user_id,time_entry_id,correction_type,proposed_time,reason,original_clock_in,original_clock_out,status,created_at").eq("status","Pendiente").order("created_at",{ascending:false}),
    ]);
    if (entries.error || profiles.error || requests.error) setError(entries.error?.message || profiles.error?.message || requests.error?.message || "No se pudieron cargar las marcaciones.");
    else {
      setRows((entries.data || []) as AttendanceEntry[]);
      setPeople(Object.fromEntries((profiles.data || []).map(profile => [profile.id, profile.full_name || profile.email || "Usuario DCS"])));
      setCorrections((requests.data||[]) as AttendanceCorrection[]);
    }
    setLoading(false);
  },[range.start,range.end]);
  useEffect(() => {
    void load();
    if(!supabase)return;
    const client=supabase;
    const channel=client.channel("attendance-management-live").on("postgres_changes",{event:"*",schema:"public",table:"time_entries"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"attendance_correction_requests"},()=>void load()).subscribe();
    return()=>{void client.removeChannel(channel)};
  }, [load]);
  async function openPhoto(path: string) {
    if (!supabase) return;
    const photoWindow=window.open("","_blank");
    if(!photoWindow){setError("El navegador bloqueó la evidencia. Habilita las ventanas emergentes para DCS.");return}
    setOpeningPhoto(path);setError("");photoWindow.document.title="Cargando evidencia…";
    const { data, error: photoError } = await supabase.storage.from("attendance-evidence").createSignedUrl(path, 60);
    if (photoError){photoWindow.close();setError(`No se pudo abrir la evidencia: ${photoError.message}`)}else{photoWindow.opener=null;photoWindow.location.href=data.signedUrl}
    setOpeningPhoto("");
  }
  async function reviewCorrection(request:AttendanceCorrection,approve:boolean){
    if(!supabase)return;
    let note:string|null=null;
    if(approve){if(!window.confirm(`¿Aplicar la corrección de ${request.correction_type.toLowerCase()} solicitada por ${people[request.user_id]||"el trabajador"}?`))return}
    else{note=window.prompt("Motivo del rechazo:")?.trim()||null;if(!note)return}
    setReviewingCorrection(request.id);setError("");
    const result=await supabase.rpc("review_attendance_correction",{request_id:request.id,approve,admin_note:note});
    if(result.error)setError(result.error.message);else await load();
    setReviewingCorrection("");
  }
  const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
  return <main className="content"><section className="welcome"><div><span className="live-dot">AUDITORÍA DE ASISTENCIA</span><h2>Marcaciones del personal</h2><p>Ubicación, precisión GPS y evidencia de entrada y salida.</p></div><button className="primary" disabled={loading} onClick={()=>void load()}><ArrowsClockwise className={loading?"spin":""} size={19}/>{loading?"Actualizando…":"Actualizar"}</button></section>{error&&<div className="module-error"><WarningCircle size={20}/>{error}</div>}{corrections.length>0&&<section className="panel correction-panel"><div className="panel-title"><div><span>CORRECCIONES SOLICITADAS</span><h3>{corrections.length} pendientes de revisión</h3></div></div>{corrections.map(request=><article className="correction-row" key={request.id}><div><strong>{people[request.user_id]||"Usuario DCS"} · {request.correction_type}</strong><span>Original: {request.correction_type==="Entrada"&&request.original_clock_in?new Date(request.original_clock_in).toLocaleString("es-PE"):request.original_clock_out?new Date(request.original_clock_out).toLocaleString("es-PE"):"Sin registro"}</span><span>Solicita: {request.proposed_time?new Date(request.proposed_time).toLocaleString("es-PE"):"Reabrir jornada"}</span><p>{request.reason}</p></div><div className="row-actions"><button disabled={reviewingCorrection===request.id} onClick={()=>void reviewCorrection(request,true)}>Aprobar</button><button disabled={reviewingCorrection===request.id} className="reject" onClick={()=>void reviewCorrection(request,false)}>Rechazar</button></div></article>)}</section>}<section className="panel data-panel">{loading?<div className="empty-state"><SpinnerGap className="spin" size={28}/>Cargando marcaciones…</div>:<div className="table-scroll"><table className="data-table attendance-table"><thead><tr><th>Fecha</th><th>Trabajador</th><th>Entrada</th><th>Evidencia entrada</th><th>Salida</th><th>Evidencia salida</th><th>Estado</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.work_date}</td><td><strong>{people[row.user_id]||"Usuario DCS"}</strong></td><td>{row.clock_in?new Date(row.clock_in).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}):"—"}{row.clock_in_lat!=null&&row.clock_in_lng!=null&&<a className="map-link" href={mapLink(row.clock_in_lat,row.clock_in_lng)} target="_blank" rel="noopener noreferrer"><MapPin size={14}/>Mapa · ±{Math.round(row.clock_in_accuracy||0)} m</a>}</td><td>{row.clock_in_photo?<button className="receipt-link" disabled={openingPhoto===row.clock_in_photo} onClick={()=>void openPhoto(row.clock_in_photo!)}><Camera size={14}/> {openingPhoto===row.clock_in_photo?"Abriendo…":"Ver foto"}</button>:"—"}</td><td>{row.clock_out?new Date(row.clock_out).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}):"—"}{row.clock_out_lat!=null&&row.clock_out_lng!=null&&<a className="map-link" href={mapLink(row.clock_out_lat,row.clock_out_lng)} target="_blank" rel="noopener noreferrer"><MapPin size={14}/>Mapa · ±{Math.round(row.clock_out_accuracy||0)} m</a>}</td><td>{row.clock_out_photo?<button className="receipt-link" disabled={openingPhoto===row.clock_out_photo} onClick={()=>void openPhoto(row.clock_out_photo!)}><Camera size={14}/> {openingPhoto===row.clock_out_photo?"Abriendo…":"Ver foto"}</button>:"—"}</td><td><b className="table-status">{row.status}</b></td></tr>)}</tbody></table></div>}</section></main>;
}
