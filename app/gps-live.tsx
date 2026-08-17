"use client";

import { ArrowSquareOut, ArrowsClockwise, Car, MapPin, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type GpsIntegration={id:string;name:string;provider:string;sharing_url:string;updated_at:string};

export function GpsLive(){
  const [source,setSource]=useState<GpsIntegration|null>(null),[loading,setLoading]=useState(true),[frameLoading,setFrameLoading]=useState(true),[error,setError]=useState(""),[frameKey,setFrameKey]=useState(0);
  const load=useCallback(async()=>{
    if(!supabase)return;
    setLoading(true);setError("");
    const result=await supabase.from("gps_integrations").select("id,name,provider,sharing_url,updated_at").eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle();
    if(result.error){setError(`No se pudo consultar el GPS: ${result.error.message}`);setSource(null)}
    else setSource(result.data);
    setLoading(false);
  },[]);
  useEffect(()=>{void load()},[load]);
  const safeUrl=useMemo(()=>{
    if(!source)return "";
    try{const url=new URL(source.sharing_url);return url.protocol==="https:"||url.protocol==="http:"?url.toString():""}catch{return ""}
  },[source]);
  function refreshMap(){setFrameLoading(true);setFrameKey(current=>current+1);void load()}
  if(loading&&!source)return <main className="content"><div className="empty-state"><SpinnerGap className="spin" size={30}/>Conectando con Inkacel GPS…</div></main>;
  return <main className="content"><section className="welcome"><div><span className="live-dot">RASTREO EXTERNO EN VIVO</span><h2>GPS de unidades</h2><p>Ubicación y estado transmitidos directamente por Inkacel GPS.</p></div>{safeUrl&&<div className="gps-actions"><button className="gps-refresh" disabled={loading} onClick={refreshMap}><ArrowsClockwise className={loading?"spin":""} size={18}/>{loading?"Actualizando…":"Actualizar mapa"}</button><a className="primary gps-external" href={safeUrl} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={19}/>Abrir mapa completo</a></div>}</section>{error&&<div className="module-error"><WarningCircle size={20}/>{error}</div>}{source&&!safeUrl&&<div className="module-error"><WarningCircle size={20}/>El enlace configurado no es una dirección web válida.</div>}{!source?<section className="panel empty-state"><MapPin size={34}/><strong>Falta configurar el enlace compartido de Inkacel.</strong><button className="approve-button" onClick={()=>void load()}>Reintentar</button></section>:safeUrl?<section className="gps-shell panel"><div className="gps-meta"><div><Car size={21}/><span><strong>{source.name}</strong><small>{source.provider} · actualizado {new Date(source.updated_at).toLocaleString("es-PE",{dateStyle:"short",timeStyle:"short"})}</small></span></div><b className={`status ${frameLoading?"amber-status":"green-status"}`}>{frameLoading?"Conectando":"En vivo"}</b></div><div className="gps-frame-wrap">{frameLoading&&<div className="gps-frame-loading"><SpinnerGap className="spin" size={27}/>Cargando mapa seguro…</div>}<iframe key={frameKey} src={safeUrl} title="Seguimiento GPS de unidades DCS" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>setFrameLoading(false)}/></div></section>:null}</main>
}
