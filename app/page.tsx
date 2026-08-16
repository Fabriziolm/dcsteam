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
import { useState } from "react";

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
      <img className="brand-logo" src="/dcs-logo-white.png" alt="Express by DCS Company" />
      <div><strong>Express</strong><span>Gestión de transporte</span></div>
    </div>
  );
}

function Sidebar({ role, view, setView }: { role: Role; view: string; setView: (v: string) => void }) {
  const owner = role === "Propietario" || role === "Administrador";
  const items = owner
    ? [["Resumen", House], ["Operaciones", SteeringWheel], ["Facturación", Receipt], ["Caja y gastos", CurrencyDollar], ["Flota", Car], ["Equipo", Users]]
    : [["Mi jornada", House], ["Servicios", CalendarCheck], ["Registrar gasto", Receipt], ["Mis horas", Clock], ["Incidencias", WarningCircle]];
  return (
    <aside className="sidebar">
      <Brand />
      <nav>
        <span className="nav-label">MENÚ PRINCIPAL</span>
        {items.map(([label, Icon]) => (
          <button key={label as string} className={view === label ? "active" : ""} onClick={() => setView(label as string)}>
            <Icon size={20} weight={view === label ? "fill" : "regular"} />{label as string}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="support"><ShieldCheck size={22} /><div><strong>Operación protegida</strong><span>Última sincronización: ahora</span></div></div>
        <div className="social-links"><a href="https://www.instagram.com/dcs_xpress/" target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramLogo size={18} /></a><a href="https://www.linkedin.com/in/express-by-dcs-company-33abbb2b1/" target="_blank" rel="noreferrer" aria-label="LinkedIn"><LinkedinLogo size={18} /></a><span>@dcs_xpress</span></div>
        <button className="logout"><SignOut size={19} /> Cerrar sesión</button>
      </div>
    </aside>
  );
}

function Header({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  return (
    <header className="topbar">
      <div><span className="eyebrow">SÁBADO, 15 DE AGOSTO</span><h1>{role === "Propietario" ? "Resumen ejecutivo" : role === "Administrador" ? "Panel administrativo" : `Portal de ${role.toLowerCase()}`}</h1></div>
      <div className="header-actions">
        <button className="icon-button"><Bell size={21} /><i>3</i></button>
        <label className="role-picker"><UserCircle size={26} weight="duotone" /><div><span>Vista actual</span><select value={role} onChange={(e) => setRole(e.target.value as Role)}>{roles.map(r => <option key={r}>{r}</option>)}</select></div><CaretDown size={14} /></label>
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

function OperativePortal({ role }: { role: Role }) {
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

export default function App() {
  const [role, setRole] = useState<Role>("Propietario");
  const owner = role === "Propietario" || role === "Administrador";
  const [view, setView] = useState("Resumen");
  const changeRole = (r: Role) => { setRole(r); setView(r === "Propietario" || r === "Administrador" ? "Resumen" : "Mi jornada"); };
  return <div className="app-shell"><Sidebar role={role} view={view} setView={setView} /><div className="main-area"><Header role={role} setRole={changeRole} />{owner ? <OwnerDashboard /> : <OperativePortal role={role} />}</div></div>;
}
