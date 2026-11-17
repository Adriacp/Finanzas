"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, authError, strongPassword } from "@/components/layout/auth-ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!strongPassword(password)) return setError("Mínimo 8 caracteres, con letras y números.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(authError(error.message));
    router.replace("/");
  }

  return (
    <AuthCard title="Nueva contraseña" subtitle="Elige una contraseña segura">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nueva contraseña"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Repite la contraseña"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        {error && <p className="rounded-xl bg-expense/10 px-3 py-2 text-sm text-expense">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>{loading ? "Guardando…" : "Guardar contraseña"}</Button>
      </form>
    </AuthCard>
  );
}
