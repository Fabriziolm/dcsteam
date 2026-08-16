"use client";

import { Envelope, Eye, EyeSlash, Lock, SignIn, WarningCircle } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError("Correo o contraseña incorrectos. Verifica tus datos.");
    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <img src="./dcs-logo-white.png" alt="Express by DCS Company" />
        <div>
          <span>PLATAFORMA INSTITUCIONAL</span>
          <h1>La operación completa, en un solo lugar.</h1>
          <p>Servicios, equipo, flota y resultados conectados para tomar mejores decisiones.</p>
        </div>
        <small>Express by DCS Company · Lima, Perú</small>
      </section>
      <section className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="mobile-login-logo"><img src="./dcs-logo.png" alt="Express" /></div>
          <span className="login-eyebrow">ACCESO SEGURO</span>
          <h2>Bienvenido de nuevo</h2>
          <p>Ingresa con tu cuenta corporativa para continuar.</p>

          {!isSupabaseConfigured && (
            <div className="login-config-warning"><WarningCircle size={20} /><span>Falta conectar la URL y la clave pública del proyecto Supabase.</span></div>
          )}

          <label>Correo electrónico<div className="login-input"><Envelope size={19} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@empresa.com" autoComplete="email" required /></div></label>
          <label>Contraseña<div className="login-input"><Lock size={19} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu contraseña" autoComplete="current-password" minLength={6} required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}</button></div></label>
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" type="submit" disabled={!isSupabaseConfigured || loading}><SignIn size={20} />{loading ? "Ingresando…" : "Iniciar sesión"}</button>
          <small className="login-help">¿Necesitas acceso? Solicítalo al administrador de DCS.</small>
        </form>
      </section>
    </main>
  );
}
