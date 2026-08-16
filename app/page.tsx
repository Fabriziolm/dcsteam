"use client";

import {
  Bell,
  Buildings,
  CalendarCheck,
  Car,
  CaretDown,
  ChartLineUp,
  CheckCircle,
  Clock,
  CurrencyDollar,
  Gauge,
  GasPump,
  House,
  InstagramLogo,
  LinkedinLogo,
  ListChecks,
  MapPin,
  Receipt,
  ShieldCheck,
  SignOut,
  SteeringWheel,
  TrendDown,
  TrendUp,
  UserCircle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { LoginScreen } from "./login-screen";
import { PendingApproval, TeamManagement } from "./team-management";
import { ServicesManagement } from "./services-management";
import { OperativePortal } from "./operative-portal";
import { BillingManagement, ExpensesManagement, FleetManagement } from "./admin-modules";
import { LiveOwnerDashboard } from "./owner-dashboard";
import { FindingsManagement, HoursManagement, TeamDirectory } from "./workforce-modules";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type Role = "Propietario" | "Administrador" | "Coordinador" | "Chofer" | "Auxiliar";

const roles: Role[] = ["Propietario", "Administrador", "Coordinador", "Chofer", "Auxiliar"];

const weekly = [34, 52, 44, 66, 58, 75, 69, 84, 72, 91, 86, 96];
const clients = [
  { name: "Indurama", amount: 29470, color: "#2563eb" },
  { name: "Quiminap", amount: 16367, color: "#06b6d4" },
  { name: "DAR", amount: 12576, color: "#14b8a6" },
  { name: "M K & F", amount: 7990, color: "#f59e0b" },
  { name: "Mondelez", amount: 5151, color: "#8b5cf6" },
];

const services = [
  { time: "06:45", client: "DAR + Thaniyay", route: "Villa El Salvador → Surquillo", vehicle: "DFSK · BYG-761", status: "En ruta" },
  { time: "08:30", client: "Indurama", route: "San Isidro → Ate", vehicle: "Peugeot · AWX-880", status: "Pendiente" },
  { time: "10:15", client: "Quiminap", route: "Los Olivos → Chorrillos", vehicle: "DFSK · BYG-761", status: "Confirmado" },
];

function Brand() {
  return (
    <div className="brand">
      <img className="brand-logo" src="./dcs-logo-white.png" alt="Express by DCS Company" />
      <div><strong>Express</strong><span>Gestión de transporte</span></div>
    </div>
  );
}

function Sidebar({ role, view, setView, onSignOut }: { role: Role; view: string; setView: (v: string) => void; onSignOut: () => void }) {
  const owner = role === "Propietario" || role === "Administrador";
  const items = owner
    ? [["Resumen", House], ["Operaciones", SteeringWheel], ["Facturación", Receipt], ["Caja y gastos", CurrencyDollar], ["Flota", Car], ["Equipo", Users]]
    : [["Mi jornada", House], ["Servicios", CalendarCheck], ["Registrar gasto", Receipt], ["Mis horas", Clock], ["Incidencias", WarningCircle]];
  const visibleItems = role === "Coordinador"
    ? [["Operaciones", SteeringWheel], ["Servicios", CalendarCheck], ["Equipo", Users], ["Incidencias", WarningCircle]]
    : items;
  return (
    <aside className="sidebar">
      <Brand />
      <nav>
        <span className="nav-label">MENÚ PRINCIPAL</span>
        {visibleItems.map(([label, Icon]) => (
          <button key={label as string} className={view === label ? "active" : ""} onClick={() => setView(label as string)}>
            <Icon size={20} weight={view === label ? "fill" : "regular"} />{label as string}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="support"><ShieldCheck size={22} /><div><strong>Operación protegida</strong><span>Última sincronización: ahora</span></div></div>
        <div className="social-links"><a href="https://www.instagram.com/dcs_xpress/" target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramLogo size={18} /></a><a href="https://www.linkedin.com/in/express-by-dcs-company-33abbb2b1/" target="_blank" rel="noreferrer" aria-label="LinkedIn"><LinkedinLogo size={18} /></a><span>@dcs_xpress</span></div>
        <button className="logout" onClick={onSignOut}><SignOut size={19} /> Cerrar sesión</button>
      </div>
    </aside>
  );
}

function Header({ role, email }: { role: Role; email: string }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState({ findings: 0, expenses: 0 });
  useEffect(() => {
    if (!supabase) return;
    void Promise.all([
      supabase.from("findings").select("id", { count: "exact", head: true }).in("status", ["Abierto", "En revisión"]),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "Pendiente"),
    ]).then(([a, b]) => setNotices({ findings: a.count ?? 0, expenses: b.count ?? 0 }));
  }, []);
  const total = notices.findings + notices.expenses;
  return (
    <header className="topbar">
      <div><span className="eyebrow">SÁBADO, 15 DE AGOSTO</span><h1>{role === "Propietario" ? "Resumen ejecutivo" : role === "Administrador" ? "Panel administrativo" : `Portal de ${role.toLowerCase()}`}</h1></div>
      <div className="header-actions">
        <div className="notification-wrap"><button className="icon-button" onClick={() => setOpen(!open)} aria-label="Notificaciones"><Bell size={21} />{total > 0 && <i>{total}</i>}</button>{open && <div className="notification-menu"><strong>Notificaciones</strong><div><WarningCircle size={18}/><span><b>{notices.findings} incidencias</b> abiertas o en revisión</span></div><div><Receipt size={18}/><span><b>{notices.expenses} gastos</b> pendientes de revisión</span></div>{total === 0 && <small>Todo está al día.</small>}</div>}</div>
        <div className="role-picker"><UserCircle size={26} weight="duotone" /><div><span>{email}</span><strong>{role}</strong></div></div>
      </div>
    </header>
  );
}

function Metric({ title, value, note, icon: Icon, tone }: { title: string; value: string; note: string; icon: any; tone: string }) {
  return <article className={`metric ${tone}`}><div className="metric-head"><span>{title}</span><i><Icon size={22} weight="duotone" /></i></div><strong>{value}</strong><small>{note.includes("+") ? <TrendUp size={14} /> : note.includes("-") ? <TrendDown size={14} /> : <CheckCircle size={14} />}{note}</small></article>;
}

function OwnerDashboard() {
  const max = Math.max(...weekly);
  const total = clients.reduce((a, b) => a + b.amount, 0);
  return (
    <main className="content">
      <section className="welcome"><div><span className="live-dot">EN VIVO</span><h2>Buenos días, equipo DCS</h2><p>Esta es la situación general de la operación al día de hoy.</p></div><button className="primary"><ChartLineUp size={19} /> Generar reporte</button></section>
      <section className="metrics-grid">
        <Metric title="Facturación 2026" value="S/ 78,222.81" note="+12.4% frente al mes anterior" icon={CurrencyDollar} tone="blue" />
        <Metric title="Cobrado" value="S/ 67,150.52" note="85.8% de la facturación" icon={CheckCircle} tone="green" />
        <Metric title="Pendiente" value="S/ 9,618.77" note="13 facturas por cobrar" icon={Clock} tone="amber" />
        <Metric title="Servicios" value="144" note="+18 servicios este mes" icon={SteeringWheel} tone="purple" />
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel span-2">
          <div className="panel-title"><div><span>RENDIMIENTO OPERATIVO</span><h3>Servicios de las últimas 12 semanas</h3></div><button>Últimas 12 semanas <CaretDown size={14} /></button></div>
          <div className="bar-chart">{weekly.map((v, i) => <div className="bar-col" key={i}><span style={{ height: `${(v / max) * 100}%` }}><b>{v}</b></span><small>S{i + 1}</small></div>)}</div>
        </article>
        <article className="panel">
          <div className="panel-title"><div><span>FACTURACIÓN</span><h3>Principales clientes</h3></div></div>
          <div className="client-list">{clients.map(c => <div key={c.name}><div><span>{c.name}</span><strong>S/ {c.amount.toLocaleString("es-PE")}</strong></div><i><b style={{ width: `${(c.amount / total) * 260}%`, background: c.color }} /></i></div>)}</div>
        </article>
        <article className="panel vehicle-card">
          <div className="panel-title"><div><span>FLOTA</span><h3>Estado de unidades</h3></div><Gauge size={26} /></div>
          <div className="vehicle"><i className="vehicle-icon"><Car size={26} /></i><div><strong>DFSK · BYG-761</strong><span>Operativa · 69,360 km</span></div><b className="status green-status">En ruta</b></div>
          <div className="vehicle"><i className="vehicle-icon"><Car size={26} /></i><div><strong>Peugeot · AWX-880</strong><span>Operativa · 114,834 km</span></div><b className="status blue-status">Disponible</b></div>
          <div className="fuel-row"><GasPump size={22} /><div><span>Combustible registrado</span><strong>S/ 4,344.11</strong></div></div>
        </article>
        <article className="panel span-2">
          <div className="panel-title"><div><span>CONTROL</span><h3>Alertas que necesitan atención</h3></div><button>Ver todas</button></div>
          <div className="alerts"><div className="alert red"><WarningCircle size={22} /><div><strong>24 registros incompletos</strong><span>Faltan horas, kilometraje o unidad.</span></div><b>Alta</b></div><div className="alert amber"><Receipt size={22} /><div><strong>13 facturas pendientes</strong><span>Revisar vencimientos y seguimiento de cobro.</span></div><b>Media</b></div><div className="alert teal"><Gauge size={22} /><div><strong>12 fechas históricas ambiguas</strong><span>Requieren validación día/mes.</span></div><b>Control</b></div></div>
        </article>
      </section>
    </main>
  );
}

function OperativePortalPreview({ role }: { role: Role }) {
  const [started, setStarted] = useState(false);
  return (
    <main className="content">
      <section className="welcome operative"><div><span className="live-dot">JORNADA DE HOY</span><h2>Hola, {role === "Chofer" ? "Lolo" : role === "Auxiliar" ? "Nico" : "Coordinación"}</h2><p>Tienes 3 servicios programados para hoy.</p></div><button className={started ? "primary completed" : "primary"} onClick={() => setStarted(!started)}>{started ? <CheckCircle size={19} /> : <Clock size={19} />}{started ? "Jornada iniciada · 06:42" : "Iniciar jornada"}</button></section>
      <section className="operative-grid">
        <div className="schedule">
          <div className="section-heading"><div><span>AGENDA</span><h3>Servicios asignados</h3></div><b>Hoy · 3 servicios</b></div>
          {services.map((s, i) => <article className="service" key={s.client}><div className="timeline"><strong>{s.time}</strong><i className={i === 0 ? "current" : ""} /></div><div className="service-main"><div className="service-top"><div><span>Servicio #{428 + i}</span><h3>{s.client}</h3></div><b className={`status ${s.status === "En ruta" ? "green-status" : s.status === "Confirmado" ? "blue-status" : "amber-status"}`}>{s.status}</b></div><p><MapPin size={17} />{s.route}</p><p><Car size={17} />{s.vehicle}</p><div className="service-actions"><button>Ver detalle</button>{i === 0 && <button className="primary small">Registrar avance</button>}</div></div></article>)}
        </div>
        <aside className="quick-panel">
          <article className="panel shift"><span>MI JORNADA</span><div className="shift-time"><Clock size={30} weight="duotone" /><strong>{started ? "03:18:42" : "00:00:00"}</strong></div><div><span>Ingreso</span><b>{started ? "06:42" : ""}</b></div><div><span>Servicios completados</span><b>0 de 3</b></div></article>
          <article className="panel"><div className="panel-title"><div><span>ACCESOS RÁPIDOS</span><h3>Registrar información</h3></div></div><div className="quick-actions"><button><Gauge size={24} /><span>Kilometraje</span></button><button><GasPump size={24} /><span>Combustible</span></button><button><Receipt size={24} /><span>Gasto</span></button><button><WarningCircle size={24} /><span>Incidencia</span></button></div></article>
          <article className="panel weekly"><span>RESUMEN SEMANAL</span><div><strong>42h 35m</strong><small>Horas trabajadas</small></div><div><strong>684 km</strong><small>Recorridos</small></div></article>
        </aside>
      </section>
    </main>
  );
}

function roleFromSession(session: Session): Role {
  const requested = session.user.app_metadata?.role as string | undefined;
  return roles.includes(requested as Role) ? requested as Role : "Chofer";
}

function Dashboard({ session }: { session: Session }) {
  const role = roleFromSession(session);
  const owner = role === "Propietario" || role === "Administrador";
  const operationsManager = owner || role === "Coordinador";
  const [view, setView] = useState(owner ? "Resumen" : role === "Coordinador" ? "Operaciones" : "Mi jornada");
  const signOut = () => { void supabase?.auth.signOut(); };
  const content = owner && view === "Equipo" ? <TeamManagement />
    : operationsManager && view === "Operaciones" ? <ServicesManagement />
    : role === "Coordinador" && view === "Servicios" ? <ServicesManagement />
    : role === "Coordinador" && view === "Equipo" ? <TeamDirectory />
    : view === "Incidencias" ? <FindingsManagement canManage={operationsManager} />
    : !operationsManager && view === "Mis horas" ? <HoursManagement />
    : !operationsManager && view === "Registrar gasto" ? <OperativePortal role={role as "Chofer" | "Auxiliar"} session={session} initialAction="expense" />
    : owner && view === "Facturación" ? <BillingManagement />
    : owner && view === "Caja y gastos" ? <ExpensesManagement />
    : owner && view === "Flota" ? <FleetManagement />
    : owner ? <LiveOwnerDashboard />
    : <OperativePortal role={role as "Coordinador" | "Chofer" | "Auxiliar"} session={session} />;
  return <div className="app-shell"><Sidebar role={role} view={view} setView={setView} onSignOut={signOut} /><div className="main-area"><Header role={role} email={session.user.email ?? "Usuario DCS"} />{content}</div></div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setActive(null); });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void supabase.from("profiles").select("active").eq("id", session.user.id).single().then(({ data, error }) => setActive(error ? true : Boolean(data?.active)));
  }, [session]);

  if (loading) return <div className="auth-loading"><img src="./dcs-logo.png" alt="Express" /><span>Validando sesión…</span></div>;
  if (!session) return <LoginScreen />;
  if (active === null) return <div className="auth-loading"><img src="./dcs-logo.png" alt="Express" /><span>Validando permisos…</span></div>;
  if (!active) return <PendingApproval email={session.user.email ?? "Usuario DCS"} onSignOut={() => { void supabase?.auth.signOut(); }} />;
  return <Dashboard session={session} />;
}
