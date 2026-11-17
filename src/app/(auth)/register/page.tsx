"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { siteUrl } from "@/lib/config";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, authError, strongPassword, validEmail } from "@/components/layout/auth-ui";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validEmail(form.email)) return setError("Introduce un email válido.");
    if (!strongPassword(form.password)) return setError("La contraseña debe tener al menos 8 caracteres, con letras y números.");
    if (form.password !== form.confirm) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    const { data, error } = await getSupabase().auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { display_name: form.name.trim() || null }, emailRedirectTo: `${siteUrl}/auth/callback` },
    });
    setLoading(false);
    if (error) return setError(authError(error.message));
    if (data.session) { router.replace("/"); router.refresh(); } else setSent(true);
  }

  if (sent)
    return (
      <AuthCard title="Revisa tu email" subtitle={`Te hemos enviado un enlace de confirmación a ${form.email}.`}>
        <Link href="/login" className="block text-center text-sm font-medium text-primary">Volver a iniciar sesión</Link>
      </AuthCard>
    );

  return (
    <AuthCard title="Crea tu cuenta" subtitle="Tus datos se guardan de forma segura y privada" footer={<>¿Ya tienes cuenta? <Link href="/login" className="font-medium text-primary">Inicia sesión</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nombre (opcional)"><Input autoComplete="name" value={form.name} onChange={set("name")} /></Field>
        <Field label="Email"><Input type="email" autoComplete="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres, con letras y números"><Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} /></Field>
        <Field label="Repite la contraseña"><Input type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} /></Field>
        {error && <p className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>{loading ? "Creando cuenta…" : "Crear cuenta"}</Button>
      </form>
    </AuthCard>
  );
}
