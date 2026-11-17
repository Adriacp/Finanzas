"use client";
import Link from "next/link";
import { useState } from "react";
import { siteUrl } from "@/lib/config";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, authError, validEmail } from "@/components/layout/auth-ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validEmail(email)) return setError("Introduce un email válido.");
    setLoading(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password` });
    setLoading(false);
    if (error) return setError(authError(error.message));
    setSent(true);
  }

  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace para crear una nueva" footer={<Link href="/login" className="font-medium text-primary">Volver a iniciar sesión</Link>}>
      {sent ? (
        <p className="text-sm">Si existe una cuenta con <b>{email}</b>, recibirás un email con instrucciones en unos minutos.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <p className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>{loading ? "Enviando…" : "Enviar enlace"}</Button>
        </form>
      )}
    </AuthCard>
  );
}
