"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, authError, validEmail } from "@/components/layout/auth-ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") === "link" ? "El enlace no es válido o ha caducado." : "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validEmail(email)) return setError("Introduce un email válido.");
    if (!password) return setError("Introduce tu contraseña.");
    setLoading(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return setError(authError(error.message));
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Contraseña" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {error && <p className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={loading}>{loading ? "Entrando…" : "Iniciar sesión"}</Button>
      <Link href="/forgot-password" className="block text-center text-sm text-muted-foreground hover:text-foreground">¿Has olvidado tu contraseña?</Link>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Bienvenido de nuevo" subtitle="Inicia sesión para ver tus finanzas" footer={<>¿No tienes cuenta? <Link href="/register" className="font-medium text-primary">Regístrate</Link></>}>
      <Suspense><LoginForm /></Suspense>
    </AuthCard>
  );
}
