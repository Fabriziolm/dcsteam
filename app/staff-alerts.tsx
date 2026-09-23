"use client";

import {
  BellRinging,
  CheckCircle,
  DeviceMobile,
  PaperPlaneTilt,
  SpeakerHigh,
  SpinnerGap,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type StaffRole = "Chofer" | "Auxiliar";
type AlertMode = "vibration" | "sound" | "both";
type StaffAlert = {
  id: string;
  target_role: StaffRole | "Todos";
  alert_mode: AlertMode;
  message: string;
  created_at: string;
  expires_at: string;
};

const modeLabels: Record<AlertMode, string> = {
  vibration: "Vibración",
  sound: "Sonido",
  both: "Sonido y vibración",
};

export function StaffAlertsManagement({ session }: { session: Session }) {
  const [targetRole, setTargetRole] = useState<StaffAlert["target_role"]>("Todos");
  const [alertMode, setAlertMode] = useState<AlertMode>("both");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<StaffAlert[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadHistory = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("staff_alerts")
      .select("id,target_role,alert_mode,message,created_at,expires_at")
      .order("created_at", { ascending: false })
      .limit(12);
    if (loadError) setError(`No se pudo cargar el historial: ${loadError.message}`);
    else setHistory((data || []) as StaffAlert[]);
  }, []);

  useEffect(() => {
    void loadHistory();
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel("staff-alerts-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_alerts" }, () => void loadHistory())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [loadHistory]);

  async function sendAlert(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !message.trim()) return;
    setSending(true);
    setError("");
    setSuccess("");
    const { error: insertError } = await supabase.from("staff_alerts").insert({
      target_role: targetRole,
      alert_mode: alertMode,
      message: message.trim(),
      created_by: session.user.id,
    });
    if (insertError) setError(`No se pudo enviar la alerta: ${insertError.message}`);
    else {
      setSuccess(`Alerta enviada a ${targetRole === "Todos" ? "choferes y auxiliares" : targetRole.toLocaleLowerCase("es-PE") + "es"}.`);
      setMessage("");
      await loadHistory();
    }
    setSending(false);
  }

  return (
    <main className="content staff-alerts-page">
      <section className="welcome">
        <div>
          <span className="live-dot">AVISO OPERATIVO</span>
          <h2>Alertas al personal</h2>
          <p>Envía una señal inmediata a los móviles conectados a la app.</p>
        </div>
      </section>

      {error && <div className="module-error"><WarningCircle size={20} />{error}</div>}
      {success && <div className="module-success"><CheckCircle size={20} />{success}</div>}

      <section className="staff-alert-layout">
        <form className="panel staff-alert-composer" onSubmit={sendAlert}>
          <div className="alert-composer-heading">
            <i><BellRinging size={30} weight="duotone" /></i>
            <div><span>Nueva alerta</span><h3>¿A quién necesitas avisar?</h3></div>
          </div>

          <fieldset>
            <legend>Destinatarios</legend>
            <div className="alert-choice-row">
              {(["Todos", "Chofer", "Auxiliar"] as const).map((role) => (
                <label className={targetRole === role ? "selected" : ""} key={role}>
                  <input type="radio" name="target-role" value={role} checked={targetRole === role} onChange={() => setTargetRole(role)} />
                  <UsersThree size={19} />
                  <span>{role === "Todos" ? "Todos" : role === "Chofer" ? "Choferes" : "Auxiliares"}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Tipo de aviso</legend>
            <div className="alert-choice-row modes">
              {(["both", "vibration", "sound"] as const).map((mode) => (
                <label className={alertMode === mode ? "selected" : ""} key={mode}>
                  <input type="radio" name="alert-mode" value={mode} checked={alertMode === mode} onChange={() => setAlertMode(mode)} />
                  {mode === "vibration" ? <DeviceMobile size={19} /> : <SpeakerHigh size={19} />}
                  <span>{modeLabels[mode]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="alert-message-field">
            Mensaje
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 160))}
              placeholder="Ejemplo: Comunícate con administración antes de iniciar la ruta."
              rows={4}
              required
            />
            <small>{message.length}/160</small>
          </label>

          <button className="send-staff-alert" disabled={sending || !message.trim()}>
            {sending ? <SpinnerGap className="spin" size={19} /> : <PaperPlaneTilt size={19} weight="fill" />}
            {sending ? "Enviando…" : "Enviar alerta ahora"}
          </button>
          <p className="alert-delivery-note">La señal llega en tiempo real cuando la app está abierta. Si el móvil autorizó notificaciones, también aparece como aviso del sistema.</p>
        </form>

        <section className="panel alert-history">
          <div className="panel-title"><div><span>HISTORIAL RECIENTE</span><h3>Últimos avisos enviados</h3></div></div>
          {history.length === 0 ? <div className="empty-state"><BellRinging size={28} />Todavía no se enviaron alertas.</div> : (
            <div className="alert-history-list">
              {history.map((alert) => (
                <article key={alert.id}>
                  <i><BellRinging size={17} /></i>
                  <div><strong>{alert.message}</strong><span>{alert.target_role === "Todos" ? "Choferes y auxiliares" : alert.target_role} · {modeLabels[alert.alert_mode]}</span></div>
                  <time>{new Date(alert.created_at).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export function StaffAlertReceiver({ session, role }: { session: Session; role: StaffRole }) {
  const [current, setCurrent] = useState<StaffAlert | null>(null);
  const [activationVisible, setActivationVisible] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const handledRef = useRef(new Set<string>());
  const storageKey = `dcs_staff_alerts_enabled_${session.user.id}`;
  const lastAlertKey = `dcs_staff_alert_last_${session.user.id}`;

  const playTone = useCallback(async () => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === "suspended") await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.46);
  }, []);

  const deliver = useCallback((alert: StaffAlert) => {
    if (handledRef.current.has(alert.id) || new Date(alert.expires_at).getTime() <= Date.now()) return;
    handledRef.current.add(alert.id);
    localStorage.setItem(lastAlertKey, alert.created_at);
    setCurrent(alert);
    if (alert.alert_mode !== "sound" && "vibrate" in navigator) navigator.vibrate([260, 120, 260, 120, 520]);
    if (alert.alert_mode !== "vibration") void playTone().catch(() => undefined);
    if ("Notification" in window && Notification.permission === "granted") {
      const options: NotificationOptions = { body: alert.message, tag: alert.id, icon: "./dcs-app-icon.png" };
      if ("serviceWorker" in navigator) void navigator.serviceWorker.ready.then((registration) => registration.showNotification("Alerta de administración", options));
      else new Notification("Alerta de administración", options);
    }
  }, [lastAlertKey, playTone]);

  useEffect(() => {
    setActivationVisible(localStorage.getItem(storageKey) !== "enabled");
    if (!supabase) return;
    const since = localStorage.getItem(lastAlertKey) || new Date(Date.now() - 5 * 60 * 1000).toISOString();
    void supabase
      .from("staff_alerts")
      .select("id,target_role,alert_mode,message,created_at,expires_at")
      .gt("created_at", since)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .then(({ data }) => (data || []).forEach((alert) => deliver(alert as StaffAlert)));
    const client = supabase;
    const channel = client
      .channel(`staff-alerts-${session.user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_alerts" }, (payload) => deliver(payload.new as StaffAlert))
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [deliver, lastAlertKey, session.user.id, storageKey]);

  async function enableAlerts() {
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    localStorage.setItem(storageKey, "enabled");
    setActivationVisible(false);
    if ("vibrate" in navigator) navigator.vibrate(140);
    await playTone().catch(() => undefined);
  }

  function closeAlert() {
    if ("vibrate" in navigator) navigator.vibrate(0);
    setCurrent(null);
  }

  return (
    <>
      {activationVisible && (
        <aside className="staff-alert-activation" role="status">
          <BellRinging size={22} weight="duotone" />
          <div><strong>Activa los avisos del despacho</strong><span>Recibe sonido, vibración y mensajes de administración.</span></div>
          <button onClick={() => void enableAlerts()}>Activar</button>
          <button className="dismiss" aria-label="Cerrar" onClick={() => setActivationVisible(false)}><X size={16} /></button>
        </aside>
      )}
      {current && (
        <aside className="staff-alert-received" role="alert" aria-live="assertive">
          <i><BellRinging size={25} weight="fill" /></i>
          <div><span>Administración · {role}</span><strong>{current.message}</strong><small>{modeLabels[current.alert_mode]}</small></div>
          <button aria-label="Cerrar alerta" onClick={closeAlert}><X size={18} /></button>
        </aside>
      )}
    </>
  );
}
