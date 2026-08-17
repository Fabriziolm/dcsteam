"use client";

import {
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
      .order("created_at", { ascending: false })
      .limit(100);
    if (r.error) setError(r.error.message);
    else setRows((r.data || []) as unknown as Finding[]);
    setLoading(false);
  }, []);
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

export function HoursManagement() {
  const [rows, setRows] = useState<Entry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("time_entries")
      .select("id,work_date,clock_in,clock_out,break_minutes,status,notes")
      .order("work_date", { ascending: false })
      .limit(100)
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setRows((r.data || []) as Entry[]);
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

export function AttendanceManagement() {
  const [rows, setRows] = useState<AttendanceEntry[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) return;
    void Promise.all([
      supabase.from("time_entries").select("id,user_id,work_date,clock_in,clock_out,status,clock_in_lat,clock_in_lng,clock_in_accuracy,clock_in_photo,clock_out_lat,clock_out_lng,clock_out_accuracy,clock_out_photo").order("work_date", { ascending: false }).limit(150),
      supabase.from("profiles").select("id,full_name,email"),
    ]).then(([entries, profiles]) => {
      if (entries.error || profiles.error) setError(entries.error?.message || profiles.error?.message || "No se pudieron cargar las marcaciones.");
      else {
        setRows((entries.data || []) as AttendanceEntry[]);
        setPeople(Object.fromEntries((profiles.data || []).map(profile => [profile.id, profile.full_name || profile.email || "Usuario DCS"])));
      }
      setLoading(false);
    });
  }, []);
  async function openPhoto(path: string) {
    if (!supabase) return;
    const { data, error: photoError } = await supabase.storage.from("attendance-evidence").createSignedUrl(path, 60);
    if (photoError) setError(photoError.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
  return <main className="content"><section className="welcome"><div><span className="live-dot">AUDITORÍA DE ASISTENCIA</span><h2>Marcaciones del personal</h2><p>Ubicación, precisión GPS y evidencia de entrada y salida.</p></div></section>{error&&<div className="module-error"><WarningCircle size={20}/>{error}</div>}<section className="panel data-panel">{loading?<div className="empty-state"><SpinnerGap className="spin" size={28}/>Cargando marcaciones…</div>:<div className="table-scroll"><table className="data-table attendance-table"><thead><tr><th>Fecha</th><th>Trabajador</th><th>Entrada</th><th>Evidencia entrada</th><th>Salida</th><th>Evidencia salida</th><th>Estado</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.work_date}</td><td><strong>{people[row.user_id]||"Usuario DCS"}</strong></td><td>{row.clock_in?new Date(row.clock_in).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}):"—"}{row.clock_in_lat!=null&&row.clock_in_lng!=null&&<a className="map-link" href={mapLink(row.clock_in_lat,row.clock_in_lng)} target="_blank" rel="noreferrer"><MapPin size={14}/>Mapa · ±{Math.round(row.clock_in_accuracy||0)} m</a>}</td><td>{row.clock_in_photo?<button className="receipt-link" onClick={()=>void openPhoto(row.clock_in_photo!)}><Camera size={14}/> Ver foto</button>:"—"}</td><td>{row.clock_out?new Date(row.clock_out).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}):"—"}{row.clock_out_lat!=null&&row.clock_out_lng!=null&&<a className="map-link" href={mapLink(row.clock_out_lat,row.clock_out_lng)} target="_blank" rel="noreferrer"><MapPin size={14}/>Mapa · ±{Math.round(row.clock_out_accuracy||0)} m</a>}</td><td>{row.clock_out_photo?<button className="receipt-link" onClick={()=>void openPhoto(row.clock_out_photo!)}><Camera size={14}/> Ver foto</button>:"—"}</td><td><b className="table-status">{row.status}</b></td></tr>)}</tbody></table></div>}</section></main>;
}
