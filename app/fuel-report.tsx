"use client";

import { DownloadSimple, GasPump, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useReportingYear, yearRange } from "./reporting-year";

type FuelExpense = {
  id: string;
  expense_date: string;
  category: "Gasolina" | "GLP" | "Petróleo";
  amount: number;
  status: string;
  vehicles: { name: string; plate: string } | null;
};
type DeliveryService = { service_date:string; delivery_points:number; status:string; vehicles:{plate:string}|null };

type FuelSummary = {
  key: string;
  unit: string;
  fuel: string;
  loads: number;
  total: number;
  lastLoad: string;
  averageDays: number | null;
  deliveryPoints: number;
};

export function FuelReport() {
  const {year}=useReportingYear(),range=yearRange(year);
  const [rows,setRows]=useState<FuelExpense[]>([]);
  const [services,setServices]=useState<DeliveryService[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    if(!supabase)return;
    setLoading(true);setError("");
    const [result,serviceResult]=await Promise.all([
      supabase.from("expenses").select("id,expense_date,category,amount,status,vehicles(name,plate)").eq("source_system","dcs_app").in("category",["Gasolina","GLP","Petróleo"]).neq("status","Rechazado").gte("expense_date",range.start).lte("expense_date",range.end).order("expense_date",{ascending:true}),
      supabase.from("services").select("service_date,delivery_points,status,vehicles(plate)").eq("status","Completado").gte("service_date",range.start).lte("service_date",range.end).order("service_date",{ascending:true}),
    ]);
    if(result.error||serviceResult.error)setError(result.error?.message||serviceResult.error?.message||"No se pudo calcular el reporte.");
    else {setRows((result.data||[]) as unknown as FuelExpense[]);setServices((serviceResult.data||[]) as unknown as DeliveryService[]);}
    setLoading(false);
  },[range.start,range.end]);
  useEffect(()=>{void load();if(!supabase)return;const client=supabase;const channel=client.channel("fuel-management-report").on("postgres_changes",{event:"*",schema:"public",table:"expenses"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"services"},()=>void load()).subscribe();return()=>{void client.removeChannel(channel)}},[load]);
  const summary=useMemo(()=>{
    const groups=new Map<string,FuelExpense[]>();
    rows.filter(row=>row.vehicles).forEach(row=>{const key=`${row.vehicles!.plate}:${row.category}`;groups.set(key,[...(groups.get(key)||[]),row])});
    return [...groups.entries()].map(([key,items]):FuelSummary=>{
      const ordered=[...items].sort((a,b)=>a.expense_date.localeCompare(b.expense_date));
      const intervals=ordered.slice(1).map((item,index)=>(new Date(`${item.expense_date}T12:00:00`).getTime()-new Date(`${ordered[index].expense_date}T12:00:00`).getTime())/86400000).filter(days=>days>0);
      const plate=ordered[0].vehicles!.plate,firstLoad=ordered[0].expense_date;
      const deliveryPoints=services.filter(service=>service.vehicles?.plate===plate&&service.service_date>=firstLoad).reduce((sum,service)=>sum+Number(service.delivery_points||1),0);
      return {key,unit:`${ordered[0].vehicles!.name} · ${plate}`,fuel:ordered[0].category,loads:ordered.length,total:ordered.reduce((sum,item)=>sum+Number(item.amount),0),lastLoad:ordered.at(-1)!.expense_date,averageDays:intervals.length?intervals.reduce((sum,days)=>sum+days,0)/intervals.length:null,deliveryPoints};
    }).sort((a,b)=>b.total-a.total);
  },[rows,services]);
  function download(){const data=[["Unidad","Combustible","Abastecimientos","Puntos de entrega","Gasto total","Última carga","Duración aproximada (días)"],...summary.map(row=>[row.unit,row.fuel,row.loads,row.deliveryPoints,row.total.toFixed(2),row.lastLoad,row.averageDays?.toFixed(1)||"Sin historial suficiente"])];const csv=data.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`reporte-combustible-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url)}
  return <main className="content fuel-report"><section className="panel"><div className="panel-title"><div><span>COMBUSTIBLE REGISTRADO DESDE LA APP</span><h3>Combustible, abastecimientos y entregas por unidad</h3></div><button className="no-print" disabled={!summary.length} onClick={download}><DownloadSimple size={16}/> Descargar reporte</button></div><p className="report-description">Incluye gasolina, GLP y petróleo. La duración se estima con el promedio de días entre cargas; los puntos corresponden a servicios completados desde la primera carga registrada.</p>{error&&<div className="module-error"><WarningCircle size={19}/>{error}</div>}{loading?<div className="empty-state"><SpinnerGap className="spin" size={25}/>Calculando combustible…</div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Unidad</th><th>Combustible</th><th>Abastecimientos</th><th>Puntos de entrega</th><th>Gasto</th><th>Última carga</th><th>Duración aprox.</th></tr></thead><tbody>{summary.map(row=><tr key={row.key}><td><strong>{row.unit}</strong></td><td><GasPump size={15}/> {row.fuel}</td><td>{row.loads}</td><td>{row.deliveryPoints}</td><td>S/ {row.total.toFixed(2)}</td><td>{row.lastLoad}</td><td>{row.averageDays===null?"Faltan más cargas":`${row.averageDays.toFixed(1)} días`}</td></tr>)}</tbody></table></div>}</section></main>;
}
