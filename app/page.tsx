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
  MagnifyingGlass,
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
import {
  BillingManagement,
  ClientsManagement,
  ExpensesManagement,
  FleetManagement,
} from "./admin-modules";
import { LiveOwnerDashboard } from "./owner-dashboard";
import {
  AttendanceManagement,
  FindingsManagement,
  HoursManagement,
  TeamDirectory,
} from "./workforce-modules";
import { GpsLive } from "./gps-live";
import { PwaInstall } from "./pwa-install";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type Role = "Administrador" | "Chofer" | "Auxiliar";

const roles: Role[] = ["Administrador", "Chofer", "Auxiliar"];

const weekly = [34, 52, 44, 66, 58, 75, 69, 84, 72, 91, 86, 96];
const clients = [
  { name: "Indurama", amount: 29470, color: "#2563eb" },
  { name: "Quiminap", amount: 16367, color: "#06b6d4" },
  { name: "DAR", amount: 12576, color: "#14b8a6" },
  { name: "M K & F", amount: 7990, color: "#f59e0b" },
  { name: "Mondelez", amount: 5151, color: "#8b5cf6" },
];

const services = [
  {
    time: "06:45",
    client: "DAR + Thaniyay",
    route: "Villa El Salvador → Surquillo",
    vehicle: "DFSK · BYG-761",
    status: "En ruta",
  },
  {
    time: "08:30",
    client: "Indurama",
    route: "San Isidro → Ate",
    vehicle: "Peugeot · AWX-880",
    status: "Pendiente",
  },
  {
    time: "10:15",
    client: "Quiminap",
    route: "Los Olivos → Chorrillos",
    vehicle: "DFSK · BYG-761",
    status: "Confirmado",
  },
];

function Brand() {
  return (
    <div className="brand">
      <img
        className="brand-logo"
        src="./dcs-logo-white.png"
        alt="Express by DCS Company"
      />
      <div>
        <strong>Express</strong>
        <span>Gestión de transporte</span>
      </div>
    </div>
  );
}

function Sidebar({
  role,
  view,
  setView,
  onSignOut,
}: {
  role: Role;
  view: string;
  setView: (v: string) => void;
  onSignOut: () => void;
}) {
  const owner = role === "Administrador";
  const items = owner
    ? [
        ["Resumen", House],
        ["Operaciones", SteeringWheel],
        ["GPS en vivo", MapPin],
        ["Clientes", Buildings],
        ["Facturación", Receipt],
        ["Caja y gastos", CurrencyDollar],
        ["Flota", Car],
        ["Marcaciones", Clock],
        ["Equipo", Users],
      ]
    : [
        ["Mi ruta", House],
        ["Gastos", Receipt],
        ["Mis horas", Clock],
        ["Incidencias", WarningCircle],
      ];
  const visibleItems = items;
  return (
    <aside className="sidebar">
      <Brand />
      <nav>
        <span className="nav-label">MENÚ PRINCIPAL</span>
        {visibleItems.map(([label, Icon]) => (
          <button
            key={label as string}
            className={view === label ? "active" : ""}
            onClick={() => setView(label as string)}
          >
            <Icon size={20} weight={view === label ? "fill" : "regular"} />
            {label as string}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="support">
          <ShieldCheck size={22} />
          <div>
            <strong>Operación protegida</strong>
            <span>Última sincronización: ahora</span>
          </div>
        </div>
        <div className="social-links">
          <a
            href="https://www.instagram.com/dcs_xpress/"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
          >
            <InstagramLogo size={18} />
          </a>
          <a
            href="https://www.linkedin.com/in/express-by-dcs-company-33abbb2b1/"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
          >
            <LinkedinLogo size={18} />
          </a>
          <span>@dcs_xpress</span>
        </div>
        <button className="logout" onClick={onSignOut}>
          <SignOut size={19} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

const searchEntries = [
  {
    label: "Resumen",
    keywords: "dashboard indicadores reporte gerencial",
    roles: ["Administrador"],
  },
  {
    label: "Operaciones",
    keywords: "servicios rutas transportes agenda",
    roles: ["Administrador"],
  },
  {
    label: "GPS en vivo",
    keywords: "mapa unidades ubicación vehículos inkacel",
    roles: ["Administrador"],
  },
  {
    label: "Clientes",
    keywords: "empresas ruc contactos",
    roles: ["Administrador"],
  },
  {
    label: "Facturación",
    keywords: "facturas importes cobros ingresos cliente",
    roles: ["Administrador"],
  },
  {
    label: "Caja y gastos",
    keywords: "egresos gasolina combustible peaje estacionamiento",
    roles: ["Administrador"],
  },
  {
    label: "Flota",
    keywords: "van unidades kilometraje vehículos mantenimiento",
    roles: ["Administrador"],
  },
  {
    label: "Equipo",
    keywords: "trabajadores usuarios chofer auxiliar horas",
    roles: ["Administrador"],
  },
  {
    label: "Marcaciones",
    keywords: "asistencia entrada salida ubicación fotos evidencia",
    roles: ["Administrador"],
  },
  {
    label: "Mi ruta",
    keywords: "turno asistencia inicio trabajo servicios asignados agenda rutas clientes",
    roles: ["Chofer", "Auxiliar"],
  },
  {
    label: "Gastos",
    keywords: "gasolina combustible peaje estacionamiento comprobante",
    roles: ["Chofer", "Auxiliar"],
  },
  {
    label: "Mis horas",
    keywords: "horario asistencia semana trabajador",
    roles: ["Chofer", "Auxiliar"],
  },
  {
    label: "Incidencias",
    keywords: "hallazgos alertas problemas observaciones",
    roles: ["Chofer", "Auxiliar"],
  },
] as const;

function GlobalSearch({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate: (view: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("es-PE");
  const results = searchEntries.filter(
    (entry) =>
      entry.roles.some((item) => item === role) &&
      `${entry.label} ${entry.keywords}`
        .toLocaleLowerCase("es-PE")
        .includes(normalized),
  );
  const choose = (label: string) => {
    onNavigate(label);
    setQuery("");
  };
  return (
    <div className="global-search">
      <MagnifyingGlass size={18} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar módulos y herramientas..."
        aria-label="Buscar en DCS"
      />
      {normalized && (
        <div className="search-results">
          {results.length ? (
            results.map((entry) => (
              <button key={entry.label} onClick={() => choose(entry.label)}>
                <MagnifyingGlass size={15} />
                <span>
                  <strong>{entry.label}</strong>
                  <small>{entry.keywords}</small>
                </span>
              </button>
            ))
          ) : (
            <p>No encontramos una herramienta con ese nombre.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Header({
  role,
  email,
  onNavigate,
}: {
  role: Role;
  email: string;
  onNavigate: (view: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState({
    findings: 0,
    expenses: 0,
    voucherCount: 0,
    voucherTotal: 0,
    weeklyTotal: 0,
  });
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekDate = weekStart.toISOString().slice(0, 10);
    const loadNotices = async () => {
      const [findingResult, expenseResult, dailyResult, weeklyResult] =
        await Promise.all([
          client
            .from("findings")
            .select("id", { count: "exact", head: true })
            .in("status", ["Abierto", "En revisión"]),
          client
            .from("expenses")
            .select("id,amount,receipt_url")
            .eq("source_system", "dcs_app")
            .eq("status", "Pendiente"),
          client
            .from("expenses")
            .select("amount")
            .eq("source_system", "dcs_app")
            .not("receipt_url", "is", null)
            .neq("status", "Rechazado")
            .eq("expense_date", new Date().toISOString().slice(0, 10)),
          client
            .from("expenses")
            .select("amount")
            .eq("source_system", "dcs_app")
            .not("receipt_url", "is", null)
            .neq("status", "Rechazado")
            .gte("expense_date", weekDate),
        ]);
      setNotices({
        findings: findingResult.count ?? 0,
        expenses: expenseResult.data?.length ?? 0,
        voucherCount: dailyResult.data?.length ?? 0,
        voucherTotal:
          dailyResult.data?.reduce(
            (sum, expense) => sum + Number(expense.amount),
            0,
          ) ?? 0,
        weeklyTotal:
          weeklyResult.data?.reduce(
            (sum, expense) => sum + Number(expense.amount),
            0,
          ) ?? 0,
      });
    };
    void loadNotices();
    if (role !== "Administrador") return;
    const channel = client
      .channel("admin-expense-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        () => void loadNotices(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [role]);
  const total = notices.findings + notices.expenses;
  const todayLabel = new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .toLocaleUpperCase("es-PE");
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{todayLabel}</span>
        <h1>
          {role === "Administrador"
            ? "Panel administrativo"
            : `Portal de ${role.toLowerCase()}`}
        </h1>
      </div>
      <div className="header-actions">
        <GlobalSearch role={role} onNavigate={onNavigate} />
        <PwaInstall />
        <div className="notification-wrap">
          <button
            className="icon-button"
            onClick={() => setOpen(!open)}
            aria-label="Notificaciones"
          >
            <Bell size={21} />
            {total > 0 && <i>{total}</i>}
          </button>
          {open && (
            <div className="notification-menu">
              <strong>Notificaciones</strong>
              {role === "Administrador" && (
                <div className="voucher-alert">
                  <Receipt size={18} />
                  <span>
                    <b>
                      Resumen 5:00 p. m.: {notices.voucherCount} vouchers · S/{" "}
                      {notices.voucherTotal.toFixed(2)}
                    </b>
                    <small>
                      Acumulado semanal: S/ {notices.weeklyTotal.toFixed(2)}
                    </small>
                    <button
                      onClick={() => {
                        onNavigate("Caja y gastos");
                        setOpen(false);
                      }}
                    >
                      Revisar comprobantes
                    </button>
                  </span>
                </div>
              )}
              <div>
                <WarningCircle size={18} />
                <span>
                  <b>{notices.findings} incidencias</b> abiertas o en revisión
                </span>
              </div>
              <div>
                <Receipt size={18} />
                <span>
                  <b>{notices.expenses} gastos</b> pendientes de revisión
                </span>
              </div>
              {total === 0 && <small>Todo está al día.</small>}
            </div>
          )}
        </div>
        <div className="role-picker">
          <UserCircle size={26} weight="duotone" />
          <div>
            <span>{email}</span>
            <strong>{role}</strong>
          </div>
        </div>
      </div>
    </header>
  );
}

function Metric({
  title,
  value,
  note,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  icon: any;
  tone: string;
}) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-head">
        <span>{title}</span>
        <i>
          <Icon size={22} weight="duotone" />
        </i>
      </div>
      <strong>{value}</strong>
      <small>
        {note.includes("+") ? (
          <TrendUp size={14} />
        ) : note.includes("-") ? (
          <TrendDown size={14} />
        ) : (
          <CheckCircle size={14} />
        )}
        {note}
      </small>
    </article>
  );
}

function OwnerDashboard() {
  const max = Math.max(...weekly);
  const total = clients.reduce((a, b) => a + b.amount, 0);
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">EN VIVO</span>
          <h2>Buenos días, equipo DCS</h2>
          <p>Esta es la situación general de la operación al día de hoy.</p>
        </div>
        <button className="primary">
          <ChartLineUp size={19} /> Generar reporte
        </button>
      </section>
      <section className="metrics-grid">
        <Metric
          title="Facturación 2026"
          value="S/ 78,222.81"
          note="+12.4% frente al mes anterior"
          icon={CurrencyDollar}
          tone="blue"
        />
        <Metric
          title="Cobrado"
          value="S/ 67,150.52"
          note="85.8% de la facturación"
          icon={CheckCircle}
          tone="green"
        />
        <Metric
          title="Pendiente"
          value="S/ 9,618.77"
          note="13 facturas por cobrar"
          icon={Clock}
          tone="amber"
        />
        <Metric
          title="Servicios"
          value="144"
          note="+18 servicios este mes"
          icon={SteeringWheel}
          tone="purple"
        />
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel span-2">
          <div className="panel-title">
            <div>
              <span>RENDIMIENTO OPERATIVO</span>
              <h3>Servicios de las últimas 12 semanas</h3>
            </div>
            <button>
              Últimas 12 semanas <CaretDown size={14} />
            </button>
          </div>
          <div className="bar-chart">
            {weekly.map((v, i) => (
              <div className="bar-col" key={i}>
                <span style={{ height: `${(v / max) * 100}%` }}>
                  <b>{v}</b>
                </span>
                <small>S{i + 1}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <div>
              <span>FACTURACIÓN</span>
              <h3>Principales clientes</h3>
            </div>
          </div>
          <div className="client-list">
            {clients.map((c) => (
              <div key={c.name}>
                <div>
                  <span>{c.name}</span>
                  <strong>S/ {c.amount.toLocaleString("es-PE")}</strong>
                </div>
                <i>
                  <b
                    style={{
                      width: `${(c.amount / total) * 260}%`,
                      background: c.color,
                    }}
                  />
                </i>
              </div>
            ))}
          </div>
        </article>
        <article className="panel vehicle-card">
          <div className="panel-title">
            <div>
              <span>FLOTA</span>
              <h3>Estado de unidades</h3>
            </div>
            <Gauge size={26} />
          </div>
          <div className="vehicle">
            <i className="vehicle-icon">
              <Car size={26} />
            </i>
            <div>
              <strong>DFSK · BYG-761</strong>
              <span>Operativa · 69,360 km</span>
            </div>
            <b className="status green-status">En ruta</b>
          </div>
          <div className="vehicle">
            <i className="vehicle-icon">
              <Car size={26} />
            </i>
            <div>
              <strong>Peugeot · AWX-880</strong>
              <span>Operativa · 114,834 km</span>
            </div>
            <b className="status blue-status">Disponible</b>
          </div>
          <div className="fuel-row">
            <GasPump size={22} />
            <div>
              <span>Combustible registrado</span>
              <strong>S/ 4,344.11</strong>
            </div>
          </div>
        </article>
        <article className="panel span-2">
          <div className="panel-title">
            <div>
              <span>CONTROL</span>
              <h3>Alertas que necesitan atención</h3>
            </div>
            <button>Ver todas</button>
          </div>
          <div className="alerts">
            <div className="alert red">
              <WarningCircle size={22} />
              <div>
                <strong>24 registros incompletos</strong>
                <span>Faltan horas, kilometraje o unidad.</span>
              </div>
              <b>Alta</b>
            </div>
            <div className="alert amber">
              <Receipt size={22} />
              <div>
                <strong>13 facturas pendientes</strong>
                <span>Revisar vencimientos y seguimiento de cobro.</span>
              </div>
              <b>Media</b>
            </div>
            <div className="alert teal">
              <Gauge size={22} />
              <div>
                <strong>12 fechas históricas ambiguas</strong>
                <span>Requieren validación día/mes.</span>
              </div>
              <b>Control</b>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function OperativePortalPreview({ role }: { role: Role }) {
  const [started, setStarted] = useState(false);
  return (
    <main className="content">
      <section className="welcome operative">
        <div>
          <span className="live-dot">JORNADA DE HOY</span>
          <h2>
            Hola,{" "}
            {role === "Chofer"
              ? "Lolo"
              : role === "Auxiliar"
                ? "Nico"
                : "Coordinación"}
          </h2>
          <p>Tienes 3 servicios programados para hoy.</p>
        </div>
        <button
          className={started ? "primary completed" : "primary"}
          onClick={() => setStarted(!started)}
        >
          {started ? <CheckCircle size={19} /> : <Clock size={19} />}
          {started ? "Jornada iniciada · 06:42" : "Iniciar jornada"}
        </button>
      </section>
      <section className="operative-grid">
        <div className="schedule">
          <div className="section-heading">
            <div>
              <span>AGENDA</span>
              <h3>Servicios asignados</h3>
            </div>
            <b>Hoy · 3 servicios</b>
          </div>
          {services.map((s, i) => (
            <article className="service" key={s.client}>
              <div className="timeline">
                <strong>{s.time}</strong>
                <i className={i === 0 ? "current" : ""} />
              </div>
              <div className="service-main">
                <div className="service-top">
                  <div>
                    <span>Servicio #{428 + i}</span>
                    <h3>{s.client}</h3>
                  </div>
                  <b
                    className={`status ${s.status === "En ruta" ? "green-status" : s.status === "Confirmado" ? "blue-status" : "amber-status"}`}
                  >
                    {s.status}
                  </b>
                </div>
                <p>
                  <MapPin size={17} />
                  {s.route}
                </p>
                <p>
                  <Car size={17} />
                  {s.vehicle}
                </p>
                <div className="service-actions">
                  <button>Ver detalle</button>
                  {i === 0 && (
                    <button className="primary small">Registrar avance</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        <aside className="quick-panel">
          <article className="panel shift">
            <span>MI JORNADA</span>
            <div className="shift-time">
              <Clock size={30} weight="duotone" />
              <strong>{started ? "03:18:42" : "00:00:00"}</strong>
            </div>
            <div>
              <span>Ingreso</span>
              <b>{started ? "06:42" : ""}</b>
            </div>
            <div>
              <span>Servicios completados</span>
              <b>0 de 3</b>
            </div>
          </article>
          <article className="panel">
            <div className="panel-title">
              <div>
                <span>ACCESOS RÁPIDOS</span>
                <h3>Registrar información</h3>
              </div>
            </div>
            <div className="quick-actions">
              <button>
                <Gauge size={24} />
                <span>Kilometraje</span>
              </button>
              <button>
                <GasPump size={24} />
                <span>Combustible</span>
              </button>
              <button>
                <Receipt size={24} />
                <span>Gasto</span>
              </button>
              <button>
                <WarningCircle size={24} />
                <span>Incidencia</span>
              </button>
            </div>
          </article>
          <article className="panel weekly">
            <span>RESUMEN SEMANAL</span>
            <div>
              <strong>42h 35m</strong>
              <small>Horas trabajadas</small>
            </div>
            <div>
              <strong>684 km</strong>
              <small>Recorridos</small>
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}

function roleFromSession(session: Session): Role {
  const requested = session.user.app_metadata?.role as string | undefined;
  return roles.includes(requested as Role) ? (requested as Role) : "Chofer";
}

function Dashboard({ session }: { session: Session }) {
  const role = roleFromSession(session);
  const owner = role === "Administrador";
  const operationsManager = owner;
  const [view, setView] = useState(owner ? "Resumen" : "Mi ruta");
  const signOut = () => {
    void supabase?.auth.signOut();
  };
  const content =
    owner && view === "Equipo" ? (
      <TeamManagement />
    ) : owner && view === "Marcaciones" ? (
      <AttendanceManagement />
    ) : operationsManager && view === "Operaciones" ? (
      <ServicesManagement />
    ) : operationsManager && view === "GPS en vivo" ? (
      <GpsLive />
    ) : view === "Incidencias" ? (
      <FindingsManagement canManage={operationsManager} />
    ) : !operationsManager && view === "Mis horas" ? (
      <HoursManagement />
    ) : !operationsManager && view === "Gastos" ? (
      <OperativePortal
        role={role as "Chofer" | "Auxiliar"}
        session={session}
        initialAction="expense"
      />
    ) : owner && view === "Facturación" ? (
      <BillingManagement />
    ) : owner && view === "Clientes" ? (
      <ClientsManagement />
    ) : owner && view === "Caja y gastos" ? (
      <ExpensesManagement />
    ) : owner && view === "Flota" ? (
      <FleetManagement />
    ) : owner ? (
      <LiveOwnerDashboard />
    ) : (
      <OperativePortal role={role as "Chofer" | "Auxiliar"} session={session} />
    );
  return (
    <div className="app-shell">
      <Sidebar role={role} view={view} setView={setView} onSignOut={signOut} />
      <div className="main-area">
        <Header
          role={role}
          email={session.user.email ?? "Usuario DCS"}
          onNavigate={setView}
        />
        {content}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void (async () => {
      const temporary =
        localStorage.getItem("dcs_remember_session") === "false";
      const tabIsActive =
        sessionStorage.getItem("dcs_temporary_session") === "active";
      if (temporary && !tabIsActive) await client.auth.signOut();
      const { data } = await client.auth.getSession();
      setSession(data.session);
      setLoading(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setActive(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void supabase
      .from("profiles")
      .select("active")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) =>
        setActive(error ? true : Boolean(data?.active)),
      );
  }, [session]);

  if (loading)
    return (
      <div className="auth-loading">
        <img src="./dcs-logo.png" alt="Express" />
        <span>Validando sesión…</span>
      </div>
    );
  if (!session) return <LoginScreen />;
  if (active === null)
    return (
      <div className="auth-loading">
        <img src="./dcs-logo.png" alt="Express" />
        <span>Validando permisos…</span>
      </div>
    );
  if (!active)
    return (
      <PendingApproval
        email={session.user.email ?? "Usuario DCS"}
        onSignOut={() => {
          void supabase?.auth.signOut();
        }}
      />
    );
  return <Dashboard session={session} />;
}
