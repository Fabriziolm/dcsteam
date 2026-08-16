"use client";

import { Envelope, Eye, EyeSlash, Lock, SignIn, UserPlus, WarningCircle } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type AuthMode = "login" | "signup";

export function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmation("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      if (password !== confirmation) {
        setError("Las contraseñas no coinciden.");
        setLoading(false);
        return;
      }
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: redirectTo },
      });
      if (authError) {
        setError(authError.message.includes("already registered") ? "Este correo ya está registrado." : authError.message);
      } else if (!data.session) {
        setMessage("Cuenta creada. Revisa tu correo y confirma el enlace para iniciar sesión.");
      } else {
        setMessage("Cuenta creada correctamente.");
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError("Correo o contraseña incorrectos. Verifica tus datos.");
    }
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
          <div className="auth-tabs" role="tablist">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Iniciar sesión</button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")}>Crear cuenta</button>
          </div>
          <span className="login-eyebrow">ACCESO SEGURO</span>
          <h2>{mode === "login" ? "Bienvenido de nuevo" : "Únete al equipo DCS"}</h2>
          <p>{mode === "login" ? "Ingresa con tu cuenta corporativa para continuar." : "Crea tu cuenta. Un administrador podrá asignarte el cargo correspondiente."}</p>

          {!isSupabaseConfigured && <div className="login-config-warning"><WarningCircle size={20} /><span>Falta conectar la URL y la clave pública del proyecto Supabase.</span></div>}

          {mode === "signup" && <label>Nombre completo<div className="login-input"><UserPlus size={19} /><input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre y apellido" autoComplete="name" required /></div></label>}
          <label>Correo electrónico<div className="login-input"><Envelope size={19} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@empresa.com" autoComplete="email" required /></div></label>
          <label>Contraseña<div className="login-input"><Lock size={19} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}</button></div></label>
          {mode === "signup" && <label>Confirmar contraseña<div className="login-input"><Lock size={19} /><input type={showPassword ? "text" : "password"} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Repite la contraseña" autoComplete="new-password" minLength={6} required /></div></label>}
          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-success">{message}</div>}
          <button className="login-submit" type="submit" disabled={!isSupabaseConfigured || loading}>{mode === "login" ? <SignIn size={20} /> : <UserPlus size={20} />}{loading ? "Procesando…" : mode === "login" ? "Iniciar sesión" : "Crear mi cuenta"}</button>
          <small className="login-help">Las cuentas nuevas ingresan con acceso limitado hasta que un administrador asigne su cargo.</small>
        </form>
      </section>
    </main>
  );
}
