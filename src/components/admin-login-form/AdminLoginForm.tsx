"use client";

import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getFriendlyErrorMessage } from "@/lib/errors/friendly-error";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";

/**
 * Tela de login única do painel administrativo, usada tanto em `/admin`
 * (AdminEntry) quanto em `/admin/[slug]` (AdminShell). O comportamento
 * pós-login fica com cada rota, via seus próprios `onAuthStateChanged`.
 */
export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState<"email" | "google" | null>(null);
  const [authError, setAuthError] = useState("");

  const submitEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (authLoading) {
      return;
    }

    setAuthLoading("email");
    setAuthError("");

    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    } catch (error) {
      setAuthError(getFriendlyErrorMessage(error, "Não foi possível entrar. Confira e-mail e senha."));
    } finally {
      setAuthLoading(null);
    }
  };

  const submitGoogleLogin = async () => {
    if (authLoading) {
      return;
    }

    setAuthLoading("google");
    setAuthError("");

    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      setAuthError(getFriendlyErrorMessage(error, "Não foi possível entrar com Google."));
    } finally {
      setAuthLoading(null);
    }
  };

  return (
    <form className="admin-entry__login" onSubmit={submitEmailLogin} aria-busy={Boolean(authLoading)}>
      <span className="admin-entry__hero-icon">
        <ShieldCheck size={26} aria-hidden />
      </span>
      <div className="admin-entry__intro">
        <p className="admin-entry__eyebrow">Painel operacional</p>
        <h1>Entrar no painel</h1>
        <p>Use a conta vinculada ao restaurante que você deseja administrar.</p>
      </div>
      <label className="admin-entry__field">
        <span>E-mail *</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          autoComplete="email"
          disabled={Boolean(authLoading)}
          required
        />
      </label>
      <label className="admin-entry__field">
        <span>Senha *</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          disabled={Boolean(authLoading)}
          required
        />
      </label>
      {authError ? <p className="admin-entry__error" role="alert">{authError}</p> : null}
      <button className="admin-entry__primary" type="submit" disabled={Boolean(authLoading)}>
        {authLoading === "email" ? <Loader2 className="admin-entry__spinner" size={17} aria-hidden /> : null}
        {authLoading === "email" ? "Entrando" : "Entrar"}
      </button>
      <button
        className="admin-entry__secondary"
        type="button"
        onClick={submitGoogleLogin}
        disabled={Boolean(authLoading)}
      >
        {authLoading === "google" ? <Loader2 className="admin-entry__spinner" size={17} aria-hidden /> : null}
        {authLoading === "google" ? "Conectando" : "Entrar com Google"}
      </button>
    </form>
  );
}
