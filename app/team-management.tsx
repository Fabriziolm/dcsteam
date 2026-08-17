"use client";

import { CheckCircle, SpinnerGap, UserCircle, Users, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type StaffProfile = { id: string; email: string | null; full_name: string | null; active: boolean; role: string; created_at: string };
const assignableRoles = ["Administrador", "Chofer", "Auxiliar"];

export function TeamManagement() {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");

  const loadProfiles = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: queryError } = await supabase.rpc("admin_list_users");
    if (queryError) setError(`No se pudo cargar el equipo: ${queryError.message}`);
    else { const users=(data ?? []) as StaffProfile[]; setProfiles(users); setRoles(Object.fromEntries(users.map(user=>[user.id,user.role==="Sin cargo"?"Chofer":user.role]))); }
    setLoading(false);
  }, []);

  useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  async function approve(profile: StaffProfile) {
    if (!supabase) return;
    setWorkingId(profile.id);
    setError("");
    const { error: approveError } = await supabase.rpc("approve_user", { target_user_id: profile.id, new_role: roles[profile.id] ?? "Chofer" });
    if (approveError) setError(`No se pudo aprobar a ${profile.email ?? "este usuario"}: ${approveError.message}`);
    else await loadProfiles();
    setWorkingId("");
  }

  async function manage(profile: StaffProfile, nextActive: boolean) {
    if (!supabase) return;
    setWorkingId(profile.id); setError("");
    const { error: manageError } = await supabase.rpc("manage_user_access", { target_user_id: profile.id, new_role: roles[profile.id] ?? profile.role, new_active: nextActive });
    if (manageError) setError(`No se pudo actualizar a ${profile.email ?? "este usuario"}: ${manageError.message}`);
    else await loadProfiles();
    setWorkingId("");
  }

  const pending = profiles.filter((profile) => !profile.active);
  const active = profiles.filter((profile) => profile.active);

  return (
    <main className="content">
      <section className="welcome"><div><span className="live-dot">CONTROL DE ACCESO</span><h2>Equipo y usuarios</h2><p>Aprueba cuentas nuevas y asigna el nivel de acceso correspondiente.</p></div><button className="primary" onClick={() => void loadProfiles()}><Users size={19} /> Actualizar</button></section>
      {error && <div className="module-error"><WarningCircle size={20} />{error}</div>}
      <section className="team-grid">
        <article className="panel team-panel">
          <div className="panel-title"><div><span>SOLICITUDES</span><h3>Pendientes de aprobación</h3></div><b className="count-badge">{pending.length}</b></div>
          {loading ? <div className="empty-state"><SpinnerGap className="spin" size={28} /> Cargando usuarios…</div> : pending.length === 0 ? <div className="empty-state"><CheckCircle size={30} /> No hay cuentas pendientes.</div> : pending.map((profile) => <div className="staff-row" key={profile.id}><UserCircle size={34} weight="duotone" /><div className="staff-identity"><strong>{profile.full_name || "Usuario sin nombre"}</strong><span>{profile.email}</span></div><select value={roles[profile.id] ?? "Chofer"} onChange={(event) => setRoles({ ...roles, [profile.id]: event.target.value })}>{assignableRoles.map((role) => <option key={role}>{role}</option>)}</select><button className="approve-button" disabled={workingId === profile.id} onClick={() => void approve(profile)}>{workingId === profile.id ? "Aprobando…" : "Aprobar"}</button></div>)}
        </article>
        <article className="panel team-panel">
          <div className="panel-title"><div><span>PERSONAL</span><h3>Usuarios activos</h3></div><b className="count-badge active-count">{active.length}</b></div>
          {active.map((profile) => <div className="staff-row active-staff" key={profile.id}><UserCircle size={34} weight="duotone" /><div className="staff-identity"><strong>{profile.full_name || "Usuario DCS"}</strong><span>{profile.email}</span></div><select value={roles[profile.id] ?? profile.role} onChange={(event) => setRoles({ ...roles, [profile.id]: event.target.value })}>{assignableRoles.map((role) => <option key={role}>{role}</option>)}</select><button className="approve-button" disabled={workingId===profile.id} onClick={()=>void manage(profile,true)}>{workingId===profile.id?"Guardando…":"Guardar"}</button><button className="deactivate-button" disabled={workingId===profile.id} onClick={()=>void manage(profile,false)}>Desactivar</button></div>)}
        </article>
      </section>
    </main>
  );
}

export function PendingApproval({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return <main className="pending-page"><div className="pending-card"><img src="./dcs-logo.png" alt="Express" /><i><WarningCircle size={30} /></i><h1>Cuenta pendiente de aprobación</h1><p>La cuenta <strong>{email}</strong> fue creada correctamente. Un administrador debe asignarte un cargo antes de ingresar.</p><button onClick={onSignOut}>Cerrar sesión</button></div></main>;
}
