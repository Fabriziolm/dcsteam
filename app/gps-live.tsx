"use client";

import { ArrowSquareOut, ArrowsClockwise, Car, CheckCircle, MapPin, NavigationArrow, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type GpsIntegration={id:string;name:string;provider:string;sharing_url:string;updated_at:string};
type RoutePoint={id:string;scheduled_start:string|null;origin:string|null;destination:string|null;destination_lat:number|null;destination_lng:number|null;status:string;clients:{name:string}|null};

function distanceKm(a:{lat:number;lng:number},b:{lat:number;lng:number}){
  const radians=(value:number)=>value*Math.PI/180,dLat=radians(b.lat-a.lat),dLng=radians(b.lng-a.lng),lat1=radians(a.lat),lat2=radians(b.lat);
  const value=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
}

function googleRouteUrl(points:RoutePoint[]){
  const locations=points.map(point=>point.destination_lat!=null&&point.destination_lng!=null?`${point.destination_lat},${point.destination_lng}`:point.destination?.trim()).filter((value):value is string=>Boolean(value));
  if(!locations.length)return "";
  if(locations.length===1)return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locations[0])}`;
  const params=new URLSearchParams({api:"1",origin:locations[0],destination:locations.at(-1)!,travelmode:"driving"});
  if(locations.length>2)params.set("waypoints",locations.slice(1,-1).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function GpsLive(){
  const today=new Date().toISOString().slice(0,10);
  const [source,setSource]=useState<GpsIntegration|null>(null),[points,setPoints]=useState<RoutePoint[]>([]),[selected,setSelected]=useState<string[]>([]),[date,setDate]=useState(today),[loading,setLoading]=useState(true),[frameLoading,setFrameLoading]=useState(true),[error,setError]=useState(""),[frameKey,setFrameKey]=useState(0);
  const [routeMessage,setRouteMessage]=useState("");
  const load=useCallback(async()=>{
    if(!supabase)return;
    setLoading(true);setError("");
    const [gpsResult,pointsResult]=await Promise.all([
      supabase.from("gps_integrations").select("id,name,provider,sharing_url,updated_at").eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
      supabase.from("services").select("id,scheduled_start,origin,destination,destination_lat,destination_lng,status,clients(name)").eq("service_date",date).neq("status","Cancelado").order("scheduled_start",{ascending:true}),
    ]);
    if(gpsResult.error){setError(`No se pudo consultar el GPS: ${gpsResult.error.message}`);setSource(null)}else setSource(gpsResult.data);
    if(pointsResult.error)setError(current=>[current,`No se pudieron cargar los puntos: ${pointsResult.error.message}`].filter(Boolean).join(" "));
    else{
      const loaded=(pointsResult.data||[]) as unknown as RoutePoint[];
      setPoints(loaded);
      setSelected(current=>{
        const available=new Set(loaded.filter(point=>point.destination?.trim()).map(point=>point.id));
        const retained=current.filter(id=>available.has(id));
        return retained.length?retained:[...available];
      });
    }
    setLoading(false);
  },[date]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{if(!supabase)return;const client=supabase;const channel=client.channel("gps-route-points-live").on("postgres_changes",{event:"*",schema:"public",table:"services"},()=>void load()).subscribe();return()=>{void client.removeChannel(channel)}},[load]);
  const safeUrl=useMemo(()=>{if(!source)return "";try{const url=new URL(source.sharing_url);return url.protocol==="https:"||url.protocol==="http:"?url.toString():""}catch{return ""}},[source]);
  const selectedPoints=useMemo(()=>points.filter(point=>selected.includes(point.id)&&point.destination?.trim()),[points,selected]);
  const routeUrl=useMemo(()=>googleRouteUrl(selectedPoints),[selectedPoints]);
  function refreshMap(){setFrameLoading(true);setFrameKey(current=>current+1);void load()}
  function togglePoint(id:string){setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}
  function optimizeByDistance(){
    setRouteMessage("");
    const candidates=selectedPoints.filter(point=>point.destination_lat!=null&&point.destination_lng!=null);
    if(candidates.length<2){setRouteMessage("Se necesitan coordenadas en al menos dos locales para optimizar.");return}
    if(!navigator.geolocation){setRouteMessage("Este dispositivo no permite obtener la ubicación inicial.");return}
    navigator.geolocation.getCurrentPosition(position=>{
      let current={lat:position.coords.latitude,lng:position.coords.longitude},remaining=[...candidates],ordered:RoutePoint[]=[];
      while(remaining.length){let nearestIndex=0,nearestDistance=Infinity;remaining.forEach((point,index)=>{const distance=distanceKm(current,{lat:point.destination_lat!,lng:point.destination_lng!});if(distance<nearestDistance){nearestDistance=distance;nearestIndex=index}});const [nearest]=remaining.splice(nearestIndex,1);ordered.push(nearest);current={lat:nearest.destination_lat!,lng:nearest.destination_lng!}}
      const withoutCoordinates=selectedPoints.filter(point=>point.destination_lat==null||point.destination_lng==null);
      setPoints(existing=>[...ordered,...withoutCoordinates,...existing.filter(point=>!selected.includes(point.id))]);
      setRouteMessage(`Ruta ordenada por cercanía desde tu ubicación: ${ordered.length} locales con coordenadas.`);
    },()=>setRouteMessage("No se pudo obtener la ubicación inicial. Autoriza el GPS del dispositivo e inténtalo nuevamente."),{enableHighAccuracy:true,timeout:10000});
  }
  if(loading&&!source)return <main className="content"><div className="empty-state"><SpinnerGap className="spin" size={30}/>Conectando con Inkacel GPS…</div></main>;
  return <main className="content">
    <section className="welcome"><div><span className="live-dot">RASTREO EXTERNO EN VIVO</span><h2>GPS de unidades</h2><p>Mapa Inkacel y planificación de entregas con los puntos registrados en la app.</p></div>{safeUrl&&<div className="gps-actions"><button className="gps-refresh" disabled={loading} onClick={refreshMap}><ArrowsClockwise className={loading?"spin":""} size={18}/>{loading?"Actualizando…":"Actualizar mapa"}</button><a className="primary gps-external" href={safeUrl} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={19}/>Abrir mapa completo</a></div>}</section>
    {error&&<div className="module-error"><WarningCircle size={20}/>{error}</div>}
    <section className="panel gps-route-planner">
      <div className="panel-title"><div><span>RUTA DE ENTREGAS</span><h3>Puntos identificados automáticamente</h3></div><label className="gps-route-date">Fecha<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label></div>
      <p className="report-description">El nombre del local se toma del cliente y su ubicación del destino registrado. Con coordenadas guardadas, la app puede ordenar los puntos por cercanía desde tu ubicación actual.</p>
      {!loading&&!points.length?<div className="empty-state"><MapPin size={30}/>No hay servicios programados para esta fecha.</div>:<div className="gps-route-points">{points.map((point,index)=>{const hasAddress=Boolean(point.destination?.trim()),checked=selected.includes(point.id);return <label className={`${checked?"selected":""} ${!hasAddress?"missing-address":""}`} key={point.id}><input type="checkbox" checked={checked} disabled={!hasAddress} onChange={()=>togglePoint(point.id)}/><b>{index+1}</b><span><strong>{point.clients?.name||"Local sin identificar"}</strong><small>{point.scheduled_start?.slice(0,5)||"Sin hora"} · {point.destination||"Falta registrar dirección de destino"}</small></span><i title={hasAddress?"Local identificado":"Dirección pendiente"}>{hasAddress?<CheckCircle size={22} weight="fill"/>:<WarningCircle size={22}/>}</i></label>})}</div>}
      {routeMessage&&<div className="module-success"><CheckCircle size={19}/>{routeMessage}</div>}
      <div className="gps-route-summary"><span><strong>{selectedPoints.length}</strong> puntos listos para rutear</span><div className="gps-route-buttons"><button type="button" onClick={optimizeByDistance}><NavigationArrow size={18}/>Optimizar por cercanía</button>{routeUrl?<a className="primary" href={routeUrl} target="_blank" rel="noopener noreferrer"><NavigationArrow size={18}/>Abrir ruta en Google Maps</a>:<button className="primary" disabled><NavigationArrow size={18}/>Faltan puntos con dirección</button>}</div></div>
    </section>
    {source&&!safeUrl&&<div className="module-error"><WarningCircle size={20}/>El enlace configurado no es una dirección web válida.</div>}
    {!source?<section className="panel empty-state"><MapPin size={34}/><strong>Falta configurar el enlace compartido de Inkacel.</strong><button className="approve-button" onClick={()=>void load()}>Reintentar</button></section>:safeUrl?<section className="gps-shell panel"><div className="gps-meta"><div><Car size={21}/><span><strong>{source.name}</strong><small>{source.provider} · actualizado {new Date(source.updated_at).toLocaleString("es-PE",{dateStyle:"short",timeStyle:"short"})}</small></span></div><b className={`status ${frameLoading?"amber-status":"green-status"}`}>{frameLoading?"Conectando":"En vivo"}</b></div><div className="gps-frame-wrap">{frameLoading&&<div className="gps-frame-loading"><SpinnerGap className="spin" size={27}/>Cargando mapa seguro…</div>}<iframe key={frameKey} src={safeUrl} title="Seguimiento GPS de unidades DCS" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>setFrameLoading(false)}/></div></section>:null}
  </main>;
}
