"use client";

import {
  Car,
  CheckCircle,
  CurrencyDollar,
  DownloadSimple,
  Plus,
  Receipt,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useReportingYear, yearRange } from "./reporting-year";

const monthOptions=["01","02","03","04","05","06","07","08","09","10","11","12"];
const periodForMonth=(year:number,month:string,yearPeriod:{start:string;end:string})=>month==="all"?yearPeriod:{start:`${year}-${month}-01`,end:new Date(year,Number(month),0).toISOString().slice(0,10)};

type Client = { id: string; name: string };
type BillableService = {
  id: string;
  service_date: string;
  merchandise: string | null;
  origin: string | null;
  destination: string | null;
  client_id: string | null;
  clients: { name: string } | null;
  vehicles: { plate: string } | null;
};
type Vehicle = {
  id: string;
  name: string;
  plate: string;
  fuel_type: string;
  current_km: number;
  status: string;
  active: boolean;
};
type Invoice = {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  amount_with_tax: number;
  paid_amount: number;
  status: string;
  concept: string | null;
  clients: { name: string } | null;
};
type Expense = {
  id: string;
  expense_date: string;
  category: string;
  concept: string;
  amount: number;
  status: string;
  receipt_url: string | null;
  vehicles: { name: string; plate: string } | null;
  clients: { name: string } | null;
};
type CashMovement = {
  id: string;
  movement_date: string;
  movement_type: "Ingreso" | "Egreso";
  concept: string;
  amount: number;
  updated_at: string;
};

function Notice({ error, message }: { error: string; message: string }) {
  return (
    <>
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
    </>
  );
}

export function BillingManagement() {
  const {year}=useReportingYear(),range=yearRange(year);
  const [month,setMonth]=useState(()=>new Date().getFullYear()===year?String(new Date().getMonth()+1).padStart(2,"0"):"all");
  const period=periodForMonth(year,month,range);
  const [rows, setRows] = useState<Invoice[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [billableServices, setBillableServices] = useState<BillableService[]>([]);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [show, setShow] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState({
    service_id: "",
    invoice_number: "",
    issue_date: new Date().toISOString().slice(0, 10),
    client_id: "",
    amount_with_tax: "",
    concept: "",
    status: "Pendiente",
  });
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [a, b, c] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id,invoice_number,issue_date,amount_with_tax,paid_amount,status,concept,clients(name)",
        )
        .gte("issue_date",period.start)
        .lte("issue_date",period.end)
        .order("issue_date", { ascending: false })
        .limit(100),
      supabase
        .from("clients")
        .select("id,name")
        .eq("active", true)
        .order("name"),
      supabase
        .from("services")
        .select("id,service_date,merchandise,origin,destination,client_id,clients(name),vehicles(plate)")
        .eq("status", "Completado")
        .eq("invoiced", false)
        .gte("service_date",period.start)
        .lte("service_date",period.end)
        .order("service_date", { ascending: false }),
    ]);
    if (a.error || b.error || c.error)
      setError(a.error?.message || b.error?.message || c.error?.message || "");
    else {
      setRows((a.data || []) as unknown as Invoice[]);
      setClients((b.data || []) as Client[]);
      setBillableServices((c.data || []) as unknown as BillableService[]);
    }
    setLoading(false);
  }, [period.start,period.end]);
  useEffect(() => {
    void load();
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel("billing-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError("");
    setMessage("");
    const { data } = await supabase.auth.getUser();
    const amount = Number(form.amount_with_tax);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("El importe de la factura debe ser mayor que cero.");
      setSaving(false);
      return;
    }
    const r = await supabase
      .from("invoices")
      .insert({
        ...form,
        service_id: form.service_id || null,
        invoice_number: form.invoice_number.trim().toUpperCase() || null,
        amount_with_tax: amount,
        amount_without_tax: Number((amount / 1.18).toFixed(2)),
        paid_amount: form.status === "Pagado" ? amount : 0,
        concept: form.concept.trim() || null,
        created_by: data.user?.id,
      });
    if (r.error) setError(r.error.code === "23505" ? "Ese número de factura o servicio ya fue registrado." : r.error.message);
    else {
      setMessage(form.service_id ? "Factura registrada y alerta del servicio cerrada." : "Factura registrada.");
      setShow(false);
      setForm({service_id:"",invoice_number:"",issue_date:new Date().toISOString().slice(0,10),client_id:"",amount_with_tax:"",concept:"",status:"Pendiente"});
      await load();
    }
    setSaving(false);
  }
  const total = rows.reduce((n, r) => n + Number(r.amount_with_tax), 0),
    pending = rows
      .filter((r) => r.status === "Pendiente" || r.status === "Parcial")
      .reduce(
        (n, r) => n + Number(r.amount_with_tax) - Number(r.paid_amount),
        0,
      );
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">CONTROL FINANCIERO</span>
          <h2>Facturación</h2>
          <p>Registro y seguimiento de comprobantes por cliente.</p>
        </div>
        <button className="primary" onClick={() => { setShow(!show); setError(""); setMessage(""); }}>
          <Plus size={19} />
          {show ? "Cerrar formulario" : "Nueva factura"}
        </button>
      </section>
      <Notice error={error} message={message} />
      <section className="panel billing-period-filter"><label>Periodo de facturación<select value={month} onChange={event=>setMonth(event.target.value)}><option value="all">Todo el año {year}</option>{monthOptions.map(value=><option value={value} key={value}>{new Date(2000,Number(value)-1,1).toLocaleDateString("es-PE",{month:"long"})} {year}</option>)}</select></label></section>
      <section className="metrics-grid compact">
        <article className="metric blue">
          <span>Total registrado</span>
          <strong>
            S/ {total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
          </strong>
        </article>
        <article className="metric amber">
          <span>Saldo pendiente</span>
          <strong>
            S/ {pending.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
          </strong>
        </article>
        <article className="metric purple">
          <span>Servicios por facturar</span>
          <strong>{billableServices.length}</strong>
        </article>
      </section>
      {show && (
        <form className="service-form panel" onSubmit={save}>
          <div className="panel-title">
            <div>
              <span>NUEVO REGISTRO</span>
              <h3>Agregar factura</h3>
            </div>
          </div>
          <div className="form-grid">
            <label className="wide">
              Servicio cerrado
              <select
                value={form.service_id}
                onChange={(e) => {
                  const service = billableServices.find((item) => item.id === e.target.value);
                  setForm({
                    ...form,
                    service_id: e.target.value,
                    client_id: service?.client_id || form.client_id,
                    concept: service
                      ? `${service.merchandise || "Servicio de transporte"} · ${service.origin || "Origen pendiente"} → ${service.destination || "Destino pendiente"}`
                      : form.concept,
                  });
                }}
              >
                <option value="">Factura sin servicio asociado</option>
                {billableServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.service_date} · {service.clients?.name || "Sin cliente"} · {service.vehicles?.plate || "Sin unidad"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Número
              <input
                required
                placeholder="Ej. F001-000123"
                value={form.invoice_number}
                onChange={(e) =>
                  setForm({ ...form, invoice_number: e.target.value })
                }
              />
            </label>
            <label>
              Fecha
              <input
                type="date"
                required
                value={form.issue_date}
                onChange={(e) =>
                  setForm({ ...form, issue_date: e.target.value })
                }
              />
            </label>
            <label>
              Cliente
              <select
                required
                value={form.client_id}
                onChange={(e) =>
                  setForm({ ...form, client_id: e.target.value })
                }
              >
                <option value="">Seleccionar</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Importe con IGV
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.amount_with_tax}
                onChange={(e) =>
                  setForm({ ...form, amount_with_tax: e.target.value })
                }
              />
            </label>
            <label className="wide">
              Concepto
              <input
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
              />
            </label>
            <label>
              Estado
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>Pendiente</option>
                <option>Parcial</option>
                <option>Pagado</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setShow(false)}>
              Cancelar
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar factura"}
            </button>
          </div>
        </form>
      )}
      <DataTable loading={loading} empty="No hay facturas registradas.">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Número</th>
            <th>Cliente</th>
            <th>Concepto</th>
            <th>Importe</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.issue_date || "—"}</td>
              <td>{r.invoice_number || "—"}</td>
              <td>{r.clients?.name || "—"}</td>
              <td>{r.concept || "—"}</td>
              <td>S/ {Number(r.amount_with_tax).toFixed(2)}</td>
              <td>
                <b className="table-status">{r.status}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </main>
  );
}

function DataTable({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel data-panel">
      {loading ? (
        <div className="empty-state">
          <SpinnerGap className="spin" size={28} />
          Cargando…
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">{children}</table>
        </div>
      )}
    </section>
  );
}

export function ExpensesManagement() {
  const {year}=useReportingYear(),range=yearRange(year);
  const [month,setMonth]=useState(()=>new Date().getFullYear()===year?String(new Date().getMonth()+1).padStart(2,"0"):"all");
  const period=periodForMonth(year,month,range);
  const [rows, setRows] = useState<Expense[]>([]),
    [cashRows, setCashRows] = useState<CashMovement[]>([]),
    [cashOpening, setCashOpening] = useState<{balance_date:string;balance:number}|null>(null),
    [loading, setLoading] = useState(true),
    [downloading, setDownloading] = useState(false),
    [reviewingId, setReviewingId] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [r,cash,balance] = await Promise.all([
      supabase.from("expenses").select("id,expense_date,category,concept,amount,status,receipt_url,vehicles(name,plate),clients(name)").eq("source_system", "dcs_app").gte("expense_date",period.start).lte("expense_date",period.end).order("expense_date", { ascending: false }).limit(500),
      supabase.from("cash_movements").select("id,movement_date,movement_type,concept,amount,updated_at").gte("movement_date",period.start).lte("movement_date",period.end).order("movement_date", { ascending: false }).limit(1500),
      supabase.from("cash_balance_snapshots").select("balance_date,balance").lte("balance_date",period.end).order("balance_date",{ascending:false}).limit(1).maybeSingle(),
    ]);
    if (r.error || cash.error || balance.error) setError(r.error?.message || cash.error?.message || balance.error?.message || "No se pudo cargar caja.");
    else { setRows((r.data || []) as unknown as Expense[]); setCashRows((cash.data || []) as CashMovement[]); setCashOpening(balance.data as {balance_date:string;balance:number}|null); }
    setLoading(false);
  }, [period.start,period.end]);
  useEffect(() => {
    void load();
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel("expenses-management-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_balance_snapshots" }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load]);
  async function review(id: string, status: string) {
    if (!supabase) return;
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    let reviewNote: string | null = null;
    if (status === "Aprobado" && !window.confirm(`¿Aprobar el gasto de S/ ${Number(row.amount).toFixed(2)} por ${row.concept}?`)) return;
    if (status === "Rechazado") {
      reviewNote = window.prompt("Indica el motivo del rechazo:")?.trim() || null;
      if (!reviewNote) return;
    }
    setReviewingId(id); setError(""); setMessage("");
    const { data } = await supabase.auth.getUser();
    const reviewData: Record<string, string | null | undefined> = {
      status,
      reviewed_by: data.user?.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (reviewNote) reviewData.notes = reviewNote;
    const r = await supabase
      .from("expenses")
      .update(reviewData)
      .eq("id", id);
    if (r.error) setError(r.error.message);
    else {
      setMessage(`Gasto ${status.toLowerCase()}.`);
      await load();
    }
    setReviewingId("");
  }
  async function openReceipt(path: string) {
    if (!supabase) return;
    const receiptWindow = window.open("", "_blank");
    if (!receiptWindow) {
      setError("El navegador bloqueó la ventana del comprobante. Habilita las ventanas emergentes para DCS.");
      return;
    }
    receiptWindow.document.title = "Cargando comprobante…";
    const { data, error: signError } = await supabase.storage
      .from("expense-receipts")
      .createSignedUrl(path, 60);
    if (signError) { receiptWindow.close(); setError(`No se pudo abrir el comprobante: ${signError.message}`); }
    else { receiptWindow.opener = null; receiptWindow.location.href = data.signedUrl; }
  }
  async function downloadWeeklyFolder() {
    if (!supabase || downloading) return;
    setDownloading(true);
    setError("");
    try {
      const JSZip = (await import("jszip")).default,
        zip = new JSZip();
      const receipts = weekly.filter((row) => Boolean(row.receipt_url));
      const csv = ["Fecha,Cliente,Unidad,Categoria,Concepto,Importe,Estado,Archivo"];
      for (const row of receipts) {
        const unit = (row.vehicles?.plate || "SIN-UNIDAD").replace(
          /[^a-z0-9-]/gi,
          "_",
        );
        const category = row.category.replace(/[^a-z0-9áéíóúñ-]/gi, "_");
        const extension = row.receipt_url!.split(".").pop() || "jpg";
        const filename = `${row.expense_date}_${row.id.slice(0, 8)}.${extension}`;
        const { data, error: signError } = await supabase.storage
          .from("expense-receipts")
          .createSignedUrl(row.receipt_url!, 300);
        if (signError) throw signError;
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error(`No se pudo descargar ${filename}`);
        zip.file(`${unit}/${category}/${filename}`, await response.blob());
        const values = [
          row.expense_date,
          row.clients?.name || "Sin cliente",
          row.vehicles
            ? `${row.vehicles.name} ${row.vehicles.plate}`
            : "Sin unidad",
          row.category,
          row.concept,
          Number(row.amount).toFixed(2),
          row.status,
          `${unit}/${category}/${filename}`,
        ];
        csv.push(
          values
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(","),
        );
      }
      zip.file("resumen_gastos.csv", "\uFEFF" + csv.join("\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `DCS_comprobantes_semana_${weekStart.toISOString().slice(0, 10)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(
        `Carpeta semanal generada con ${receipts.length} comprobantes.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo generar la carpeta semanal.",
      );
    } finally {
      setDownloading(false);
    }
  }
  const total = rows
    .filter((r) => r.status !== "Rechazado")
    .reduce((n, r) => n + Number(r.amount), 0);
  const sheetIncome=cashRows.filter(row=>row.movement_type==="Ingreso").reduce((sum,row)=>sum+Number(row.amount),0);
  const sheetExpense=cashRows.filter(row=>row.movement_type==="Egreso").reduce((sum,row)=>sum+Number(row.amount),0);
  const movementsAfterClose=cashOpening?cashRows.filter(row=>row.movement_date>cashOpening.balance_date):cashRows;
  const movementAfterCloseNet=movementsAfterClose.reduce((sum,row)=>sum+(row.movement_type==="Ingreso"?1:-1)*Number(row.amount),0);
  const sheetBalance=(cashOpening?Number(cashOpening.balance):0)+movementAfterCloseNet;
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekly = rows.filter(
    (r) =>
      new Date(`${r.expense_date}T12:00:00`) >= weekStart &&
      r.status !== "Rechazado",
  );
  const byVehicle = Object.entries(
    weekly.reduce<Record<string, number>>((summary, r) => {
      const unit = r.vehicles
        ? `${r.vehicles.name} · ${r.vehicles.plate}`
        : "Sin unidad";
      summary[unit] = (summary[unit] || 0) + Number(r.amount);
      return summary;
    }, {}),
  );
  const byCategory = Object.entries(weekly.reduce<Record<string, number>>((summary, row) => { summary[row.category] = (summary[row.category] || 0) + Number(row.amount); return summary; }, {})).sort((a,b)=>b[1]-a[1]);
  const weeklyTotal = weekly.reduce((sum,row)=>sum+Number(row.amount),0);
  const previousWeekStart = new Date(weekStart); previousWeekStart.setDate(previousWeekStart.getDate()-7);
  const previousTotal = rows.filter(row=>{const date=new Date(`${row.expense_date}T12:00:00`);return date>=previousWeekStart&&date<weekStart&&row.status!=="Rechazado"}).reduce((sum,row)=>sum+Number(row.amount),0);
  const weeklyChange = previousTotal > 0 ? ((weeklyTotal-previousTotal)/previousTotal)*100 : null;
  const chartMax = Math.max(1,...byVehicle.map(([,amount])=>amount),...byCategory.map(([,amount])=>amount));
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">GASTOS DESDE LA APP</span>
          <h2>Gastos operativos</h2>
          <p>
            Comprobantes enviados por choferes y auxiliares. Esta información no
            se envía a Google Sheets.
          </p>
        </div>
        <button
          className="primary"
          disabled={downloading || weekly.length === 0}
          onClick={() => void downloadWeeklyFolder()}
        >
          {downloading ? (
            <SpinnerGap className="spin" size={19} />
          ) : (
            <DownloadSimple size={19} />
          )}{" "}
          {downloading ? "Preparando ZIP…" : "Descargar carpeta semanal"}
        </button>
      </section>
      <Notice error={error} message={message} />
      <section className="panel billing-period-filter"><label>Periodo de caja<select value={month} onChange={event=>setMonth(event.target.value)}><option value="all">Todo el año {year}</option>{monthOptions.map(value=><option value={value} key={value}>{new Date(2000,Number(value)-1,1).toLocaleDateString("es-PE",{month:"long"})} {year}</option>)}</select></label></section>
      <section className="metrics-grid compact">
        <article className="metric green"><span>Entradas registradas</span><strong>S/ {sheetIncome.toLocaleString("es-PE",{minimumFractionDigits:2})}</strong></article>
        <article className="metric amber"><span>Salidas registradas</span><strong>S/ {sheetExpense.toLocaleString("es-PE",{minimumFractionDigits:2})}</strong></article>
        <article className="metric blue"><span>Importe total en caja</span><strong>S/ {sheetBalance.toLocaleString("es-PE",{minimumFractionDigits:2})}</strong><small>{cashOpening?`Cierre ${cashOpening.balance_date} + movimientos posteriores`:"Entradas menos salidas del periodo"}</small></article>
      </section>
      <section className="panel data-panel"><div className="panel-title"><div><span>FUENTE: GOOGLE SHEETS</span><h3>Entradas y salidas sincronizadas</h3></div><b className="status green-status">Solo lectura</b></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Concepto</th><th>Importe</th></tr></thead><tbody>{cashRows.slice(0,150).map(row=><tr key={row.id}><td>{row.movement_date}</td><td><b className={`status ${row.movement_type==="Ingreso"?"green-status":"amber-status"}`}>{row.movement_type}</b></td><td>{row.concept}</td><td>S/ {Number(row.amount).toFixed(2)}</td></tr>)}</tbody></table></div></section>
      <section className="metrics-grid compact">
        <article className="metric blue">
          <span>Total registrado en la app</span>
          <strong>
            S/ {total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
          </strong>
        </article>
        <article className="metric amber">
          <span>Pendientes de revisión</span>
          <strong>{rows.filter((r) => r.status === "Pendiente").length}</strong>
        </article>
        <article className="metric green"><span>Total de esta semana</span><strong>S/ {weeklyTotal.toLocaleString("es-PE",{minimumFractionDigits:2})}</strong><small>{weeklyChange===null?"Sin semana anterior para comparar":`${weeklyChange>=0?"+":""}${weeklyChange.toFixed(1)}% frente a la semana anterior`}</small></article>
      </section>
      <section className="expense-charts">
        <article className="panel"><div className="panel-title"><div><span>COMPARATIVO</span><h3>Gasto semanal por unidad</h3></div></div><div className="expense-bars">{byVehicle.map(([label,amount])=><div key={label}><span>{label}</span><i><b style={{width:`${(amount/chartMax)*100}%`}}/></i><strong>S/ {amount.toFixed(2)}</strong></div>)}</div></article>
        <article className="panel"><div className="panel-title"><div><span>DISTRIBUCIÓN</span><h3>Gasto por categoría</h3></div></div><div className="expense-bars category-bars">{byCategory.map(([label,amount])=><div key={label}><span>{label}</span><i><b style={{width:`${(amount/chartMax)*100}%`}}/></i><strong>{weeklyTotal?((amount/weeklyTotal)*100).toFixed(0):0}% · S/ {amount.toFixed(2)}</strong></div>)}</div></article>
      </section>
      <section className="panel weekly-expense-panel">
        <div className="panel-title">
          <div>
            <span>SEMANA ACTUAL</span>
            <h3>Gasto por unidad</h3>
          </div>
        </div>
        <div className="fleet-grid">
          {byVehicle.length ? (
            byVehicle.map(([unit, amount]) => (
              <article className="weekly-expense" key={unit}>
                <Car size={24} />
                <div>
                  <span>{unit}</span>
                  <strong>
                    S/{" "}
                    {amount.toLocaleString("es-PE", {
                      minimumFractionDigits: 2,
                    })}
                  </strong>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              Todavía no hay gastos esta semana.
            </div>
          )}
        </div>
      </section>
      <DataTable loading={loading} empty="No hay gastos enviados desde la app.">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Categoría</th>
            <th>Concepto</th>
            <th>Unidad</th>
            <th>Importe</th>
            <th>Comprobante</th>
            <th>Revisión</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.expense_date}</td>
              <td>{r.clients?.name || "—"}</td>
              <td>{r.category}</td>
              <td>{r.concept}</td>
              <td>
                {r.vehicles ? `${r.vehicles.name} · ${r.vehicles.plate}` : "—"}
              </td>
              <td>S/ {Number(r.amount).toFixed(2)}</td>
              <td>
                {r.receipt_url ? (
                  <button
                    className="receipt-link"
                    onClick={() => void openReceipt(r.receipt_url!)}
                  >
                    Ver foto
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {r.status === "Pendiente" ? (
                  <div className="row-actions">
                    <button disabled={reviewingId === r.id} onClick={() => void review(r.id, "Aprobado")}>
                      {reviewingId === r.id ? "Guardando…" : "Aprobar"}
                    </button>
                    <button
                      className="reject"
                      disabled={reviewingId === r.id}
                      onClick={() => void review(r.id, "Rechazado")}
                    >
                      Rechazar
                    </button>
                  </div>
                ) : (
                  <b className="table-status">{r.status}</b>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </main>
  );
}

export function FleetManagement() {
  const [rows, setRows] = useState<Vehicle[]>([]),
    [loading, setLoading] = useState(true),
    [show, setShow] = useState(false),
    [saving, setSaving] = useState(false),
    [updatingId, setUpdatingId] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    plate: "",
    fuel_type: "Gasolina",
    current_km: "0",
    status: "Disponible",
  });
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const r = await supabase
      .from("vehicles")
      .select("id,name,plate,fuel_type,current_km,status,active")
      .order("name");
    if (r.error) setError(r.error.message);
    else setRows((r.data || []) as Vehicle[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel("fleet-management-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError(""); setMessage("");
    const compactPlate = form.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const odometer = Number(form.current_km);
    if (compactPlate.length !== 6) {
      setError("La placa debe contener 6 letras o números, por ejemplo AWX-880.");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(odometer) || odometer < 0) {
      setError("Ingresa un kilometraje válido.");
      setSaving(false);
      return;
    }
    const normalizedPlate = `${compactPlate.slice(0,3)}-${compactPlate.slice(3)}`;
    const r = await supabase
      .from("vehicles")
      .insert({
        ...form,
        name: form.name.trim(),
        current_km: odometer,
        plate: normalizedPlate,
      });
    if (r.error) setError(r.error.code === "23505" ? "Ya existe una unidad con esa placa." : r.error.message);
    else {
      setMessage("Unidad registrada.");
      setShow(false);
      setForm({name:"",plate:"",fuel_type:"Gasolina",current_km:"0",status:"Disponible"});
      await load();
    }
    setSaving(false);
  }
  async function change(id: string, status: string) {
    if (!supabase) return;
    const vehicle = rows.find((item) => item.id === id);
    if (!vehicle || vehicle.status === status) return;
    if ((status === "Mantenimiento" || status === "Inactivo") && !window.confirm(`¿Cambiar ${vehicle.name} · ${vehicle.plate} a ${status}? No estará disponible para nuevas asignaciones.`)) return;
    setUpdatingId(id); setError(""); setMessage("");
    const r = await supabase
      .from("vehicles")
      .update({ status, active: status !== "Inactivo" && status !== "Mantenimiento", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (r.error) setError(r.error.message);
    else {
      setMessage(`Estado de la unidad actualizado a ${status}.`);
      await load();
    }
    setUpdatingId("");
  }
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">CONTROL DE FLOTA</span>
          <h2>Vehículos</h2>
          <p>Kilometraje y disponibilidad de las unidades.</p>
        </div>
        <button className="primary" onClick={() => { setShow(!show); setError(""); setMessage(""); }}>
          <Plus size={19} />
          {show ? "Cerrar formulario" : "Nueva unidad"}
        </button>
      </section>
      <Notice error={error} message={message} />
      {show && (
        <form className="service-form panel" onSubmit={save}>
          <div className="form-grid">
            <label>
              Nombre
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Placa
              <input
                required
                maxLength={7}
                placeholder="AWX-880"
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })}
              />
            </label>
            <label>
              Combustible
              <select
                value={form.fuel_type}
                onChange={(e) =>
                  setForm({ ...form, fuel_type: e.target.value })
                }
              >
                <option>Gasolina</option>
                <option>GLP</option>
                <option>Diésel</option>
                <option>Eléctrico</option>
                <option>Mixto</option>
              </select>
            </label>
            <label>
              Kilometraje
              <input
                type="number"
                min="0"
                required
                value={form.current_km}
                onChange={(e) =>
                  setForm({ ...form, current_km: e.target.value })
                }
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setShow(false)}>
              Cancelar
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar unidad"}
            </button>
          </div>
        </form>
      )}
      <section className="fleet-grid">
        {loading ? (
          <div className="empty-state">
            <SpinnerGap className="spin" size={28} />
          </div>
        ) : (
          rows.map((v) => (
            <article className="panel fleet-item" key={v.id}>
              <i>
                <Car size={30} />
              </i>
              <div>
                <strong>
                  {v.name} · {v.plate}
                </strong>
                <span>
                  {Number(v.current_km).toLocaleString("es-PE")} km ·{" "}
                  {v.fuel_type}
                </span>
              </div>
              <select
                disabled={updatingId === v.id}
                value={v.status}
                onChange={(e) => void change(v.id, e.target.value)}
              >
                <option>Disponible</option>
                <option>En ruta</option>
                <option>Mantenimiento</option>
                <option>Inactivo</option>
              </select>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

export function ClientsManagement() {
  const [rows, setRows] = useState<
      Array<
        Client & {
          legal_name: string | null;
          ruc: string | null;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
          active: boolean;
        }
      >
    >([]),
    [loading, setLoading] = useState(true),
    [show, setShow] = useState(false),
    [saving, setSaving] = useState(false),
    [updatingId, setUpdatingId] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    ruc: "",
    contact_name: "",
    phone: "",
    email: "",
  });
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const r = await supabase
      .from("clients")
      .select("id,name,legal_name,ruc,contact_name,phone,email,active")
      .order("name");
    if (r.error) setError(r.error.message);
    else setRows(r.data || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError("");
    setMessage("");
    const ruc = form.ruc.replace(/\D/g, "");
    if (ruc && ruc.length !== 11) {
      setError("El RUC debe contener exactamente 11 dígitos.");
      setSaving(false);
      return;
    }
    const r = await supabase
      .from("clients")
      .insert({
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || null,
        ruc: ruc || null,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim().toLowerCase() || null,
      });
    if (r.error) setError(r.error.code === "23505" ? "Ya existe un cliente con ese nombre o RUC." : r.error.message);
    else {
      setMessage("Cliente registrado.");
      setShow(false);
      setForm({
        name: "",
        legal_name: "",
        ruc: "",
        contact_name: "",
        phone: "",
        email: "",
      });
      await load();
    }
    setSaving(false);
  }
  async function toggle(client: (typeof rows)[number]) {
    if (!supabase) return;
    if (client.active && !window.confirm(`¿Desactivar a ${client.name}? Ya no aparecerá al programar nuevos servicios.`)) return;
    setUpdatingId(client.id); setError(""); setMessage("");
    const r = await supabase
      .from("clients")
      .update({ active: !client.active, updated_at: new Date().toISOString() })
      .eq("id", client.id);
    if (r.error) setError(r.error.message);
    else {
      setMessage(client.active ? "Cliente desactivado." : "Cliente activado nuevamente.");
      await load();
    }
    setUpdatingId("");
  }
  return (
    <main className="content">
      <section className="welcome">
        <div>
          <span className="live-dot">CARTERA COMERCIAL</span>
          <h2>Clientes</h2>
          <p>
            Datos fiscales y contactos utilizados en servicios y facturación.
          </p>
        </div>
        <button className="primary" onClick={() => { setShow(!show); setError(""); setMessage(""); }}>
          <Plus size={19} />
          {show ? "Cerrar formulario" : "Nuevo cliente"}
        </button>
      </section>
      <Notice error={error} message={message} />
      {show && (
        <form className="service-form panel" onSubmit={save}>
          <div className="form-grid">
            <label>
              Nombre comercial
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Razón social
              <input
                value={form.legal_name}
                onChange={(e) =>
                  setForm({ ...form, legal_name: e.target.value })
                }
              />
            </label>
            <label>
              RUC
              <input
                inputMode="numeric"
                maxLength={11}
                pattern="[0-9]{11}"
                title="Ingresa los 11 dígitos del RUC"
                value={form.ruc}
                onChange={(e) => setForm({ ...form, ruc: e.target.value.replace(/\D/g, "") })}
              />
            </label>
            <label>
              Contacto
              <input
                value={form.contact_name}
                onChange={(e) =>
                  setForm({ ...form, contact_name: e.target.value })
                }
              />
            </label>
            <label>
              Teléfono
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setShow(false)}>
              Cancelar
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cliente"}
            </button>
          </div>
        </form>
      )}
      <DataTable loading={loading} empty="No hay clientes.">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Razón social</th>
            <th>RUC</th>
            <th>Contacto</th>
            <th>Teléfono</th>
            <th>Email</th>
            <th>Acceso</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{c.name}</strong>
              </td>
              <td>{c.legal_name || "—"}</td>
              <td>{c.ruc || "—"}</td>
              <td>{c.contact_name || "—"}</td>
              <td>{c.phone || "—"}</td>
              <td>{c.email || "—"}</td>
              <td>
                <button
                  className={c.active ? "toggle-active" : "toggle-inactive"}
                  disabled={updatingId === c.id}
                  onClick={() => void toggle(c)}
                >
                  {updatingId === c.id ? "Guardando…" : c.active ? "Activo" : "Inactivo"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </main>
  );
}
