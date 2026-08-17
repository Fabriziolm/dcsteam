"use client";

import { ArrowSquareOut, Car, MapPin, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type GpsIntegration={id:string;name:string;provider:string;sharing_url:string;updated_at:string};

export function GpsLive(){
  const [source,setSource]=useState<GpsIntegration|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{if(!supabase)return;void supabase.from("gps_integrations").select("id,name,provider,sharing_url,updated_at").eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle().then(({data,error})=>{if(error)setError(error.message);else setSource(data);setLoading(false)})},[]);
  if(loading)return <main className="content"><div className="empty-state"><SpinnerGap className="spin" size={30}/>Conectando con Inkacel GPS…</div></main>;
  return <main className="content"><section className="welcome"><div><span className="live-dot">RASTREO EXTERNO EN VIVO</span><h2>GPS de unidades</h2><p>Ubicación y estado transmitidos directamente por Inkacel GPS.</p></div>{source&&<a className="primary gps-external" href={source.sharing_url} target="_blank" rel="noreferrer"><ArrowSquareOut size={19}/>Abrir mapa completo</a>}</section>{error&&<div className="module-error"><WarningCircle size={20}/>{error}</div>}{!source?<section className="panel empty-state"><MapPin size={34}/><strong>Falta configurar el enlace compartido de Inkacel.</strong></section>:<section className="gps-shell panel"><div className="gps-meta"><div><Car size={21}/><span><strong>{source.name}</strong><small>{source.provider}</small></span></div><b className="status green-status">En vivo</b></div><iframe src={source.sharing_url} title="Seguimiento GPS de unidades DCS" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></section>}</main>
}
