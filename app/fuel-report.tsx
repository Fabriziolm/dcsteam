"use client";

import { DownloadSimple, GasPump, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type FuelExpense = {
  id: string;
  expense_date: string;
  category: "Gasolina" | "GLP";
  amount: number;
  status: string;
  vehicles: { name: string; plate: string } | null;
};

type FuelSummary = {
  key: string;
  unit: string;
  fuel: string;
  loads: number;
  total: number;
  lastLoad: string;
  averageDays: number | null;
};

export function FuelReport() {
  const [rows,setRows]=useState<FuelExpense[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    if(!supabase)return;
    setLoading(true);setError("");
    const result=await supabase.from("expenses")
      .select("id,expense_date,category,amount,status,vehicles(name,plate)")
      .eq("source_system","dcs_app")
      .in("category",["Gasolina","GLP"])
      .neq("status","Rechazado")
      .order("expense_date",{ascending:true});
    if(result.error)setError(result.error.message);
    else setRows((result.data||[]) as unknown as FuelExpense[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void load();if(!supabase)return;const client=supabase;const channel=client.channel("fuel-management-report").on("postgres_changes",{event:"*",schema:"public",table:"expenses"},()=>void load()).subscribe();return()=>{void client.removeChannel(channel)}},[load]);
  const summary=useMemo(()=>{
    const groups=new Map<string,FuelExpense[]>();
    rows.filter(row=>row.vehicles).forEach(row=>{const key=`${row.vehicles!.plate}:${row.category}`;groups.set(key,[...(groups.get(key)||[]),row])});
    return [...groups.entries()].map(([key,items]):FuelSummary=>{
      const ordered=[...items].sort((a,b)=>a.expense_date.localeCompare(b.expense_date));
      const intervals=ordered.slice(1).map((item,index)=>(new Date(`${item.expense_date}T12:00:00`).getTime()-new Date(`${ordered[index].expense_date}T12:00:00`).getTime())/86400000).filter(days=>days>0);
      return {key,unit:`${ordered[0].vehicles!.name} · ${ordered[0].vehicles!.plate}`,fuel:ordered[0].category,loads:ordered.length,total:ordered.reduce((sum,item)=>sum+Number(item.amount),0),lastLoad:ordered.at(-1)!.expense_date,averageDays:intervals.length?intervals.reduce((sum,days)=>sum+days,0)/intervals.length:null};
    }).sort((a,b)=>b.total-a.total);
  },[rows]);
  function download(){const data=[["Unidad","Combustible","Cargas","Gasto total","Última carga","Duración aproximada (días)"],...summary.map(row=>[row.unit,row.fuel,row.loads,row.total.toFixed(2),row.lastLoad,row.averageDays?.toFixed(1)||"Sin historial suficiente"])];const csv=data.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`reporte-combustible-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url)}
  return <main className="content fuel-report"><section className="panel"><div className="panel-title"><div><span>COMBUSTIBLE REGISTRADO DESDE LA APP</span><h3>Consumo y duración aproximada por unidad</h3></div><button className="no-print" disabled={!summary.length} onClick={download}><DownloadSimple size={16}/> Descargar reporte</button></div><p className="report-description">La duración se estima con el promedio de días transcurridos entre cargas aprobadas de la misma unidad y combustible.</p>{error&&<div className="module-error"><WarningCircle size={19}/>{error}</div>}{loading?<div className="empty-state"><SpinnerGap className="spin" size={25}/>Calculando combustible…</div>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Unidad</th><th>Combustible</th><th>Cargas</th><th>Gasto</th><th>Última carga</th><th>Duración aprox.</th></tr></thead><tbody>{summary.map(row=><tr key={row.key}><td><strong>{row.unit}</strong></td><td><GasPump size={15}/> {row.fuel}</td><td>{row.loads}</td><td>S/ {row.total.toFixed(2)}</td><td>{row.lastLoad}</td><td>{row.averageDays===null?"Faltan más cargas":`${row.averageDays.toFixed(1)} días`}</td></tr>)}</tbody></table></div>}</section></main>;
}
