"use client";

import {
  CheckCircle,
  SpinnerGap,
  UserCircle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type StaffProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  active: boolean;
  role: string;
  created_at: string;
};
type Vehicle = { id: string; name: string; plate: string };
const assignableRoles = ["Administrador", "Chofer", "Auxiliar"];

export function TeamManagement() {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignedVehicles, setAssignedVehicles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProfiles = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [usersResult, vehiclesResult, assignmentsResult] = await Promise.all([
      supabase.rpc("admin_list_users"),
      supabase.from("vehicles").select("id,name,plate").eq("active",true).order("plate"),
      supabase.from("user_vehicle_assignments").select("user_id,vehicle_id").eq("active",true),
    ]);
    if (usersResult.error || vehiclesResult.error || assignmentsResult.error)
      setError(`No se pudo cargar el equipo: ${usersResult.error?.message || vehiclesResult.error?.message || assignmentsResult.error?.message}`);
    else {
      const users = (usersResult.data ?? []) as StaffProfile[];
      setProfiles(users);
      setVehicles((vehiclesResult.data || []) as Vehicle[]);
      setAssignedVehicles(Object.fromEntries((assignmentsResult.data || []).map(item=>[item.user_id,item.vehicle_id])));
      setRoles(
        Object.fromEntries(
          users.map((user) => [
            user.id,
            user.role === "Sin cargo" ? "Chofer" : user.role,
          ]),
        ),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfiles();
    if(!supabase)return;
    const client=supabase;
    const channel=client.channel("team-management-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"profiles"},()=>void loadProfiles())
      .on("postgres_changes",{event:"*",schema:"public",table:"user_vehicle_assignments"},()=>void loadProfiles())
      .on("postgres_changes",{event:"*",schema:"public",table:"vehicles"},()=>void loadProfiles())
      .subscribe();
    return()=>{void client.removeChannel(channel)};
  }, [loadProfiles]);

  async function approve(profile: StaffProfile) {
    if (!supabase) return;
    const selectedRole = roles[profile.id] ?? "Chofer";
    if (selectedRole !== "Administrador" && !assignedVehicles[profile.id]) { setError("Selecciona una unidad antes de aprobar al trabajador."); return; }
    if(selectedRole!=="Administrador"&&!vehicles.some(vehicle=>vehicle.id===assignedVehicles[profile.id])){setError("La unidad seleccionada ya no está disponible. Elige otra unidad activa.");return}
    if(!window.confirm(`¿Aprobar a ${profile.full_name||profile.email||"este usuario"} como ${selectedRole}?`))return;
    setWorkingId(profile.id);
    setError("");setMessage("");
    const { error: approveError } = await supabase.rpc("approve_user", {
      target_user_id: profile.id,
      new_role: selectedRole,
    });
    const assignmentResult = !approveError && selectedRole !== "Administrador"
      ? await supabase.from("user_vehicle_assignments").upsert({user_id:profile.id,vehicle_id:assignedVehicles[profile.id],active:true,assigned_by:(await supabase.auth.getUser()).data.user?.id},{onConflict:"user_id"})
      : {error:null};
    if (approveError || assignmentResult.error)
      setError(
        `No se pudo aprobar a ${profile.email ?? "este usuario"}: ${approveError?.message || assignmentResult.error?.message}`,
      );
    else {setMessage("Usuario aprobado y acceso configurado.");await loadProfiles();}
    setWorkingId("");
  }

  async function manage(profile: StaffProfile, nextActive: boolean) {
    if (!supabase) return;
    const selectedRole=roles[profile.id]??profile.role;
    if(nextActive&&selectedRole!=="Administrador"&&!assignedVehicles[profile.id]){setError("Selecciona una unidad para el chofer o auxiliar antes de guardar.");return}
    if(nextActive&&selectedRole!=="Administrador"&&!vehicles.some(vehicle=>vehicle.id===assignedVehicles[profile.id])){setError("La unidad asignada está inactiva o en mantenimiento. Selecciona otra unidad.");return}
    if(!nextActive&&!window.confirm(`¿Desactivar a ${profile.full_name||profile.email||"este usuario"}? Perderá el acceso a la aplicación.`))return;
    if(nextActive&&!profile.active&&!window.confirm(`¿Reactivar el acceso de ${profile.full_name||profile.email||"este usuario"}?`))return;
    setWorkingId(profile.id);
    setError("");setMessage("");
    const { error: manageError } = await supabase.rpc("manage_user_access", {
      target_user_id: profile.id,
      new_role: selectedRole,
      new_active: nextActive,
    });
    let assignmentError: {message:string}|null = null;
    if (!manageError && nextActive && selectedRole !== "Administrador") {
      const vehicleId = assignedVehicles[profile.id];
      const assignmentResult = vehicleId
        ? await supabase.from("user_vehicle_assignments").upsert({user_id:profile.id,vehicle_id:vehicleId,active:true,assigned_by:(await supabase.auth.getUser()).data.user?.id,assigned_at:new Date().toISOString()},{onConflict:"user_id"})
        : await supabase.from("user_vehicle_assignments").delete().eq("user_id",profile.id);
      assignmentError = assignmentResult.error;
    }
    if(!manageError&&nextActive&&selectedRole==="Administrador"){
      const assignmentResult=await supabase.from("user_vehicle_assignments").delete().eq("user_id",profile.id);
      assignmentError=assignmentResult.error;
    }
    if (manageError || assignmentError)
      setError(
        `No se pudo actualizar a ${profile.email ?? "este usuario"}: ${manageError?.message || assignmentError?.message}`,
      );
    else {setMessage(nextActive?(profile.active?"Datos del usuario actualizados.":"Usuario reactivado correctamente."):"Usuario desactivado.");await loadProfiles();}
    setWorkingId("");
  }

  const pending = profiles.filter((profile) => !profile.active&&profile.role==="Sin cargo");
  const inactive = profiles.filter((profile) => !profile.active&&profile.role!=="Sin cargo");
  const active = profiles.filter((profile) => profile.active);

  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">CONTROL DE ACCESO</span>
          <h2>Equipo y usuarios</h2>
          <p>
            Aprueba cuentas nuevas y asigna el nivel de acceso correspondiente.
          </p>
        </div>
        <button className="primary" disabled={loading} onClick={() => void loadProfiles()}>
          {loading?<SpinnerGap className="spin" size={19}/>:<Users size={19} />} {loading?"Actualizando…":"Actualizar"}
        </button>
      </section>
      {error && (
        <div className="module-error">
          <WarningCircle size={20} />
          {error}
        </div>
      )}
      {message&&<div className="module-success"><CheckCircle size={20}/>{message}</div>}
      <section className="team-grid">
        <article className="panel team-panel">
          <div className="panel-title">
            <div>
              <span>SOLICITUDES</span>
              <h3>Pendientes de aprobación</h3>
            </div>
            <b className="count-badge">{pending.length}</b>
          </div>
          {loading ? (
            <div className="empty-state">
              <SpinnerGap className="spin" size={28} /> Cargando usuarios…
            </div>
          ) : pending.length === 0 ? (
            <div className="empty-state">
              <CheckCircle size={30} /> No hay cuentas pendientes.
            </div>
          ) : (
            pending.map((profile) => (
              <div className="staff-row" key={profile.id}>
                <UserCircle size={34} weight="duotone" />
                <div className="staff-identity">
                  <strong>{profile.full_name || "Usuario sin nombre"}</strong>
                  <span>{profile.email}</span>
                </div>
                <select
                  value={roles[profile.id] ?? "Chofer"}
                  onChange={(event) =>
                    setRoles({ ...roles, [profile.id]: event.target.value })
                  }
                >
                  {assignableRoles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
              </select>
                {(roles[profile.id]??"Chofer") !== "Administrador" && <select className="vehicle-assignment" value={assignedVehicles[profile.id]||""} onChange={event=>setAssignedVehicles({...assignedVehicles,[profile.id]:event.target.value})}><option value="">Asignar unidad</option>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.plate}</option>)}</select>}
                <button
                  className="approve-button"
                  disabled={workingId === profile.id}
                  onClick={() => void approve(profile)}
                >
                  {workingId === profile.id ? "Aprobando…" : "Aprobar"}
                </button>
              </div>
            ))
          )}
        </article>
        <article className="panel team-panel">
          <div className="panel-title">
            <div>
              <span>PERSONAL</span>
              <h3>Usuarios activos</h3>
            </div>
            <b className="count-badge active-count">{active.length}</b>
          </div>
          {active.map((profile) => (
            <div className="staff-row active-staff" key={profile.id}>
              <UserCircle size={34} weight="duotone" />
              <div className="staff-identity">
                <strong>{profile.full_name || "Usuario DCS"}</strong>
                <span>{profile.email}</span>
              </div>
              <select
                value={roles[profile.id] ?? profile.role}
                onChange={(event) =>
                  setRoles({ ...roles, [profile.id]: event.target.value })
                }
              >
                {assignableRoles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
              {(roles[profile.id]??profile.role) !== "Administrador" && <select className="vehicle-assignment" value={assignedVehicles[profile.id]||""} onChange={event=>setAssignedVehicles({...assignedVehicles,[profile.id]:event.target.value})}><option value="">Seleccionar unidad</option>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.plate}</option>)}</select>}
              <button
                className="approve-button"
                disabled={workingId === profile.id}
                onClick={() => void manage(profile, true)}
              >
                {workingId === profile.id ? "Guardando…" : "Guardar"}
              </button>
              <button
                className="deactivate-button"
                disabled={workingId === profile.id}
                onClick={() => void manage(profile, false)}
              >
                Desactivar
              </button>
            </div>
          ))}
        </article>
        <article className="panel team-panel inactive-team">
          <div className="panel-title"><div><span>SIN ACCESO</span><h3>Usuarios desactivados</h3></div><b className="count-badge">{inactive.length}</b></div>
          {inactive.length===0?<div className="empty-state"><CheckCircle size={30}/>No hay usuarios desactivados.</div>:inactive.map(profile=><div className="staff-row" key={profile.id}><UserCircle size={34} weight="duotone"/><div className="staff-identity"><strong>{profile.full_name||"Usuario DCS"}</strong><span>{profile.email} · {profile.role}</span></div><select value={roles[profile.id]??profile.role} onChange={event=>setRoles({...roles,[profile.id]:event.target.value})}>{assignableRoles.map(role=><option key={role}>{role}</option>)}</select>{(roles[profile.id]??profile.role)!=="Administrador"&&<select className="vehicle-assignment" value={assignedVehicles[profile.id]||""} onChange={event=>setAssignedVehicles({...assignedVehicles,[profile.id]:event.target.value})}><option value="">Seleccionar unidad</option>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.plate}</option>)}</select>}<button className="approve-button" disabled={workingId===profile.id} onClick={()=>void manage(profile,true)}>{workingId===profile.id?"Reactivando…":"Reactivar"}</button></div>)}
        </article>
      </section>
    </main>
  );
}

export function PendingApproval({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <main className="pending-page">
      <div className="pending-card">
        <img src="./dcs-logo.png" alt="Express" />
        <i>
          <WarningCircle size={30} />
        </i>
        <h1>Cuenta pendiente de aprobación</h1>
        <p>
          La cuenta <strong>{email}</strong> fue creada correctamente. Un
          administrador debe asignarte un cargo antes de ingresar.
        </p>
        <button onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </main>
  );
}
