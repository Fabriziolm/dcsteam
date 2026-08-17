"use client";

import { DownloadSimple, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};

export function PwaInstall(){
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null),[showHelp,setShowHelp]=useState(false),[installed,setInstalled]=useState(false);
  useEffect(()=>{const base=location.hostname.endsWith("github.io")?"/dcsteam":"";if("serviceWorker" in navigator)void navigator.serviceWorker.register(`${base}/sw.js`);const capture=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPromptEvent)};const done=()=>setInstalled(true);window.addEventListener("beforeinstallprompt",capture);window.addEventListener("appinstalled",done);setInstalled(window.matchMedia("(display-mode: standalone)").matches);return()=>{window.removeEventListener("beforeinstallprompt",capture);window.removeEventListener("appinstalled",done)}},[]);
  async function install(){if(prompt){await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==="accepted")setInstalled(true);setPrompt(null)}else setShowHelp(true)}
  if(installed)return null;
  return <><button className="install-app" onClick={()=>void install()}><DownloadSimple size={18}/><span>Instalar app</span></button>{showHelp&&<div className="install-help"><button onClick={()=>setShowHelp(false)}><X size={18}/></button><strong>Instalar DCS</strong><p><b>iPhone/iPad:</b> abre Compartir y elige “Agregar a inicio”.</p><p><b>Android/Chrome:</b> abre el menú ⋮ y selecciona “Instalar aplicación”.</p></div>}</>;
}
