"use client";

import {
  ArrowsClockwise,
  Camera,
  CheckCircle,
  Clock,
  MapPin,
  Plus,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useReportingYear, yearRange } from "./reporting-year";

type AttendanceEntry = {
  id: string;
  user_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy: number | null;
  clock_in_photo: string | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_accuracy: number | null;
  clock_out_photo: string | null;
};

type AttendanceCorrection = {
  id: string;
  user_id: string;
  time_entry_id: string;
  correction_type: string;
  proposed_time: string | null;
  reason: string;
  original_clock_in: string | null;
  original_clock_out: string | null;
  status: string;
  created_at: string;
};

type AttendanceStatus = {
  userId: string;
  closedDays: number;
  projectedDays: number;
  pendingDays: number;
  actualMinutes: number;
  totalMinutes: number;
  lunches: number;
  projectedLunches: number;
};

const formatMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export function AttendanceManagement() {
  const { year } = useReportingYear();
  const range = yearRange(year);
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<AttendanceEntry[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [profileRows, setProfileRows] = useState<Array<{ id: string; name: string }>>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingPhoto, setOpeningPhoto] = useState("");
  const [reviewingCorrection, setReviewingCorrection] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [manualWorkerIds, setManualWorkerIds] = useState<string[]>([]);
  const [manual, setManual] = useState({
    date: today,
    clockIn: "07:15",
    clockOut: "15:42",
  });
  const [report, setReport] = useState({
    start: `${year}-09-28`,
    end: today,
    assumedOut: "18:00",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [entries, profiles, requests] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id,user_id,work_date,clock_in,clock_out,break_minutes,status,clock_in_lat,clock_in_lng,clock_in_accuracy,clock_in_photo,clock_out_lat,clock_out_lng,clock_out_accuracy,clock_out_photo")
        .gte("work_date", range.start)
        .lte("work_date", range.end)
        .order("work_date", { ascending: false })
        .limit(2000),
      supabase.from("profiles").select("id,full_name,email"),
      supabase
        .from("attendance_correction_requests")
        .select("id,user_id,time_entry_id,correction_type,proposed_time,reason,original_clock_in,original_clock_out,status,created_at")
        .eq("status", "Pendiente")
        .order("created_at", { ascending: false }),
    ]);
    if (entries.error || profiles.error || requests.error) {
      setError(
        entries.error?.message ||
          profiles.error?.message ||
          requests.error?.message ||
          "No se pudieron cargar las marcaciones.",
      );
    } else {
      const normalizedProfiles = (profiles.data || [])
        .map((profile) => ({
          id: profile.id,
          name: profile.full_name || profile.email || "Usuario DCS",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      setRows((entries.data || []) as AttendanceEntry[]);
      setPeople(
        Object.fromEntries(
          normalizedProfiles.map((profile) => [profile.id, profile.name]),
        ),
      );
      setProfileRows(normalizedProfiles);
      setCorrections((requests.data || []) as AttendanceCorrection[]);
    }
    setLoading(false);
  }, [range.end, range.start]);

  useEffect(() => {
    void load();
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel("attendance-management-live-v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_correction_requests" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [load]);

  async function openPhoto(path: string) {
    if (!supabase) return;
    const photoWindow = window.open("", "_blank");
    if (!photoWindow) {
      setError("El navegador bloqueó la evidencia. Habilita las ventanas emergentes para DCS.");
      return;
    }
    setOpeningPhoto(path);
    setError("");
    photoWindow.document.title = "Cargando evidencia…";
    const { data, error: photoError } = await supabase.storage
      .from("attendance-evidence")
      .createSignedUrl(path, 60);
    if (photoError) {
      photoWindow.close();
      setError(`No se pudo abrir la evidencia: ${photoError.message}`);
    } else {
      photoWindow.opener = null;
      photoWindow.location.href = data.signedUrl;
    }
    setOpeningPhoto("");
  }

  async function reviewCorrection(
    request: AttendanceCorrection,
    approve: boolean,
  ) {
    if (!supabase) return;
    let note: string | null = null;
    if (approve) {
      if (
        !window.confirm(
          `¿Aplicar la corrección de ${request.correction_type.toLowerCase()} solicitada por ${people[request.user_id] || "el trabajador"}?`,
        )
      )
        return;
    } else {
      note = window.prompt("Motivo del rechazo:")?.trim() || null;
      if (!note) return;
    }
    setReviewingCorrection(request.id);
    setError("");
    const result = await supabase.rpc("review_attendance_correction", {
      request_id: request.id,
      approve,
      admin_note: note,
    });
    if (result.error) setError(result.error.message);
    else await load();
    setReviewingCorrection("");
  }

  function toggleManualWorker(userId: string) {
    setManualWorkerIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function saveManualAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || manualWorkerIds.length === 0) {
      setError("Selecciona al menos un trabajador.");
      return;
    }
    const clockIn = new Date(`${manual.date}T${manual.clockIn}:00`);
    const clockOut = new Date(`${manual.date}T${manual.clockOut}:00`);
    if (
      !manual.date ||
      Number.isNaN(clockIn.getTime()) ||
      Number.isNaN(clockOut.getTime()) ||
      clockOut <= clockIn
    ) {
      setError("Revisa la fecha y los horarios. La salida debe ser posterior a la entrada.");
      return;
    }
    setSavingManual(true);
    setError("");
    setMessage("");
    const existing = await supabase
      .from("time_entries")
      .select("user_id")
      .eq("work_date", manual.date)
      .in("user_id", manualWorkerIds);
    if (existing.error) {
      setError(existing.error.message);
      setSavingManual(false);
      return;
    }
    const existingIds = new Set((existing.data || []).map((row) => row.user_id));
    const newIds = manualWorkerIds.filter((id) => !existingIds.has(id));
    if (newIds.length === 0) {
      setError("Los trabajadores seleccionados ya tienen una marcación en esa fecha. No se modificó ningún registro.");
      setSavingManual(false);
      return;
    }
    const result = await supabase.from("time_entries").insert(
      newIds.map((userId) => ({
        user_id: userId,
        work_date: manual.date,
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        break_minutes: 0,
        status: "Cerrada",
        notes: "Marcación manual registrada por administración.",
      })),
    );
    if (result.error) {
      setError(result.error.message);
    } else {
      const skipped = manualWorkerIds.length - newIds.length;
      setMessage(
        `${newIds.length} marcación${newIds.length === 1 ? "" : "es"} registrada${newIds.length === 1 ? "" : "s"}${skipped ? ` · ${skipped} ya existía${skipped === 1 ? "" : "n"}` : ""}.`,
      );
      setManualWorkerIds([]);
      await load();
    }
    setSavingManual(false);
  }

  const attendanceStatus = useMemo(() => {
    const relevant = rows.filter(
      (row) => row.work_date >= report.start && row.work_date <= report.end,
    );
    const grouped = new Map<string, AttendanceStatus>();
    relevant.forEach((row) => {
      const current = grouped.get(row.user_id) || {
        userId: row.user_id,
        closedDays: 0,
        projectedDays: 0,
        pendingDays: 0,
        actualMinutes: 0,
        totalMinutes: 0,
        lunches: 0,
        projectedLunches: 0,
      };
      if (!row.clock_in) {
        current.pendingDays += 1;
        grouped.set(row.user_id, current);
        return;
      }
      const start = new Date(row.clock_in);
      const projected = !row.clock_out;
      const end = row.clock_out
        ? new Date(row.clock_out)
        : new Date(`${row.work_date}T${report.assumedOut}:00`);
      const minutes = Math.max(
        0,
        Math.round((end.getTime() - start.getTime()) / 60000) -
          Number(row.break_minutes || 0),
      );
      if (projected) {
        current.projectedDays += 1;
        current.projectedLunches += minutes > 600 ? 1 : 0;
      } else {
        current.closedDays += 1;
        current.actualMinutes += minutes;
      }
      current.totalMinutes += minutes;
      current.lunches += minutes > 600 ? 1 : 0;
      grouped.set(row.user_id, current);
    });
    return [...grouped.values()].sort((a, b) =>
      (people[a.userId] || "").localeCompare(people[b.userId] || "", "es"),
    );
  }, [people, report.assumedOut, report.end, report.start, rows]);

  const mapLink = (lat: number, lng: number) =>
    `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">AUDITORÍA DE ASISTENCIA</span>
          <h2>Marcaciones del personal</h2>
          <p>Registra faltantes, revisa evidencias y consolida horas desde un solo lugar.</p>
        </div>
        <button className="primary" disabled={loading} onClick={() => void load()}>
          <ArrowsClockwise className={loading ? "spin" : ""} size={19} />
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </section>

      {error && <div className="module-error"><WarningCircle size={20} />{error}</div>}
      {message && <div className="module-success"><CheckCircle size={20} />{message}</div>}

      <section className="panel manual-attendance-panel">
        <div className="manual-attendance-heading">
          <div>
            <span>Registro administrativo</span>
            <h3>Agregar una jornada faltante</h3>
            <p>Selecciona uno o varios trabajadores. Los registros existentes no se sobrescriben.</p>
          </div>
          <Clock size={30} />
        </div>
        <form onSubmit={saveManualAttendance}>
          <fieldset>
            <legend>Trabajadores</legend>
            <div className="manual-worker-grid">
              {profileRows.map((person) => (
                <label className={manualWorkerIds.includes(person.id) ? "selected" : ""} key={person.id}>
                  <input type="checkbox" checked={manualWorkerIds.includes(person.id)} onChange={() => toggleManualWorker(person.id)} />
                  <span>{person.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="manual-time-grid">
            <label>Fecha<input type="date" required max={today} value={manual.date} onChange={(event) => setManual((current) => ({ ...current, date: event.target.value }))} /></label>
            <label>Entrada<input type="time" required value={manual.clockIn} onChange={(event) => setManual((current) => ({ ...current, clockIn: event.target.value }))} /></label>
            <label>Salida<input type="time" required value={manual.clockOut} onChange={(event) => setManual((current) => ({ ...current, clockOut: event.target.value }))} /></label>
            <button className="primary" disabled={savingManual || manualWorkerIds.length === 0} type="submit">
              {savingManual ? <SpinnerGap className="spin" size={18} /> : <Plus size={18} />}
              Registrar {manualWorkerIds.length || ""} jornada{manualWorkerIds.length === 1 ? "" : "s"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel attendance-status-panel">
        <div className="panel-title">
          <div><span>ESTADO DEL PERÍODO</span><h3>Horas y almuerzos</h3></div>
          <b className="status blue-status">Salida estimada {report.assumedOut}</b>
        </div>
        <div className="attendance-report-controls">
          <label>Desde<input type="date" value={report.start} max={report.end} onChange={(event) => setReport((current) => ({ ...current, start: event.target.value }))} /></label>
          <label>Hasta<input type="date" value={report.end} min={report.start} max={today} onChange={(event) => setReport((current) => ({ ...current, end: event.target.value }))} /></label>
          <label>Salida para jornadas abiertas<input type="time" value={report.assumedOut} onChange={(event) => setReport((current) => ({ ...current, assumedOut: event.target.value }))} /></label>
        </div>
        <div className="table-scroll">
          <table className="data-table attendance-status-table">
            <thead><tr><th>Trabajador</th><th>Jornadas cerradas</th><th>Horas registradas</th><th>Horas con estimación</th><th>Almuerzos</th><th>Estado</th></tr></thead>
            <tbody>
              {attendanceStatus.map((row) => (
                <tr key={row.userId}>
                  <td><strong>{people[row.userId] || "Usuario DCS"}</strong></td>
                  <td>{row.closedDays}{row.projectedDays > 0 && <small> + {row.projectedDays} a {report.assumedOut}</small>}</td>
                  <td>{formatMinutes(row.actualMinutes)}</td>
                  <td><strong>{formatMinutes(row.totalMinutes)}</strong></td>
                  <td>{row.lunches}{row.projectedLunches > 0 && <small> · {row.projectedLunches} estimado{row.projectedLunches === 1 ? "" : "s"}</small>}</td>
                  <td><b className={`table-status ${row.projectedDays || row.pendingDays ? "attendance-status-pending" : ""}`}>{row.pendingDays ? `${row.pendingDays} sin entrada` : row.projectedDays ? `${row.projectedDays} salida estimada` : "Completo"}</b></td>
                </tr>
              ))}
              {attendanceStatus.length === 0 && <tr><td colSpan={6}>No hay marcaciones en el período seleccionado.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="attendance-report-note">Se reconoce un almuerzo cuando la jornada supera 10 horas. La hora estimada solo completa el reporte; no modifica la marcación original.</p>
      </section>

      {corrections.length > 0 && (
        <section className="panel correction-panel">
          <div className="panel-title"><div><span>CORRECCIONES SOLICITADAS</span><h3>{corrections.length} pendientes de revisión</h3></div></div>
          {corrections.map((request) => (
            <article className="correction-row" key={request.id}>
              <div>
                <strong>{people[request.user_id] || "Usuario DCS"} · {request.correction_type}</strong>
                <span>Original: {request.correction_type === "Entrada" && request.original_clock_in ? new Date(request.original_clock_in).toLocaleString("es-PE") : request.original_clock_out ? new Date(request.original_clock_out).toLocaleString("es-PE") : "Sin registro"}</span>
                <span>Solicita: {request.proposed_time ? new Date(request.proposed_time).toLocaleString("es-PE") : "Reabrir jornada"}</span>
                <p>{request.reason}</p>
              </div>
              <div className="row-actions"><button disabled={reviewingCorrection === request.id} onClick={() => void reviewCorrection(request, true)}>Aprobar</button><button disabled={reviewingCorrection === request.id} className="reject" onClick={() => void reviewCorrection(request, false)}>Rechazar</button></div>
            </article>
          ))}
        </section>
      )}

      <section className="panel data-panel">
        {loading ? <div className="empty-state"><SpinnerGap className="spin" size={28} />Cargando marcaciones…</div> : (
          <div className="table-scroll">
            <table className="data-table attendance-table">
              <thead><tr><th>Fecha</th><th>Trabajador</th><th>Entrada</th><th>Evidencia entrada</th><th>Salida</th><th>Evidencia salida</th><th>Estado</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.work_date}</td>
                    <td><strong>{people[row.user_id] || "Usuario DCS"}</strong></td>
                    <td>{row.clock_in ? new Date(row.clock_in).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}{row.clock_in_lat != null && row.clock_in_lng != null && <a className="map-link" href={mapLink(row.clock_in_lat, row.clock_in_lng)} target="_blank" rel="noopener noreferrer"><MapPin size={14} />Mapa · ±{Math.round(row.clock_in_accuracy || 0)} m</a>}</td>
                    <td>{row.clock_in_photo ? <button className="receipt-link" disabled={openingPhoto === row.clock_in_photo} onClick={() => void openPhoto(row.clock_in_photo!)}><Camera size={14} /> {openingPhoto === row.clock_in_photo ? "Abriendo…" : "Ver foto"}</button> : "—"}</td>
                    <td>{row.clock_out ? new Date(row.clock_out).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—"}{row.clock_out_lat != null && row.clock_out_lng != null && <a className="map-link" href={mapLink(row.clock_out_lat, row.clock_out_lng)} target="_blank" rel="noopener noreferrer"><MapPin size={14} />Mapa · ±{Math.round(row.clock_out_accuracy || 0)} m</a>}</td>
                    <td>{row.clock_out_photo ? <button className="receipt-link" disabled={openingPhoto === row.clock_out_photo} onClick={() => void openPhoto(row.clock_out_photo!)}><Camera size={14} /> {openingPhoto === row.clock_out_photo ? "Abriendo…" : "Ver foto"}</button> : "—"}</td>
                    <td><b className="table-status">{row.status}</b></td>
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
