"use client";
import { Database, LogOut, Monitor, Moon, ShieldCheck, Smartphone, Sparkles, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseAmount } from "@/core/money";
import { buildSampleData } from "@/data/sample";
import { isDemoMode } from "@/lib/config";
import { getSupabase } from "@/lib/supabase/client";
import { useData, useFinance } from "@/store/finance-store";
import { usePrivacy } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Segmented, Switch } from "@/components/ui/misc";

export default function SettingsPage() {
  const d = useData();
  const { updateProfile, replaceAll } = useFinance();
  const { theme, setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(d.profile.displayName ?? "");
  const [currency, setCurrency] = useState(d.profile.currency);
  const [budget, setBudget] = useState(d.profile.monthlyBudget != null ? String(d.profile.monthlyBudget) : "");
  useEffect(() => setMounted(true), []);

  async function saveProfile() {
    try {
      await updateProfile({ displayName: name.trim() || null, currency, monthlyBudget: budget ? parseAmount(budget) : null });
      toast.success("Perfil actualizado");
    } catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }

  async function loadSample() {
    if (!confirm("Se sustituirán los datos actuales de la demo por 6 meses de datos de ejemplo. ¿Continuar?")) return;
    await replaceAll(buildSampleData());
    toast.success("Datos de ejemplo cargados");
  }

  async function resetAll() {
    if (!confirm("¿Borrar TODOS tus datos? Se recomienda descargar antes una copia de seguridad. Esta acción no se puede deshacer.")) return;
    if (!confirm("Confirmación final: ¿borrar todo?")) return;
    await replaceAll({ accounts: [], categories: [], transactions: [], budgets: [], recurring: [], goals: [], savedViews: [], profile: { seeded: false } });
    await useFinance.getState().updateProfile({ seeded: false });
    toast.success("Datos borrados. Recarga para empezar de cero.");
    setTimeout(() => window.location.reload(), 800);
  }

  async function logout() {
    await getSupabase().auth.signOut();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Ajustes" />

      {isDemoMode && (
        <Card className="border-warning/40">
          <CardHeader title={<span className="flex items-center gap-2"><Database className="size-4 text-warning" /> Modo demo (sin Supabase)</span>}
            subtitle="Los datos se guardan solo en este navegador y no se sincronizan. Configura Supabase para tener persistencia real, inicio de sesión y sincronización entre dispositivos (ver README)." />
          <CardBody className="flex flex-wrap gap-2">
            <Button variant="subtle" onClick={loadSample}><Sparkles /> Cargar datos de ejemplo</Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Perfil" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
          <Field label="Moneda principal">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{["EUR", "USD", "GBP", "CHF", "MXN"].map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Ingreso/objetivo mensual (opcional)" hint="Solo informativo"><Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
          <div className="sm:col-span-3"><Button onClick={saveProfile}>Guardar perfil</Button></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Apariencia y privacidad" />
        <CardBody className="space-y-4">
          {mounted && (
            <Segmented value={(theme ?? "system") as "light" | "dark" | "system"} onChange={setTheme}
              options={[{ value: "light", label: <span className="flex items-center gap-1.5"><Sun className="size-4" /> Claro</span> }, { value: "dark", label: <span className="flex items-center gap-1.5"><Moon className="size-4" /> Oscuro</span> }, { value: "system", label: <span className="flex items-center gap-1.5"><Monitor className="size-4" /> Sistema</span> }]} />
          )}
          <Switch checked={hidden} onChange={toggle} label="Ocultar importes" description="Útil para usar la app en público" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Smartphone className="size-4" /> Instalar en el iPhone</span>} />
        <CardBody className="text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abre la app en <b>Safari</b> (debe servirse por HTTPS).</li>
            <li>Pulsa el botón <b>Compartir</b> y elige <b>«Añadir a pantalla de inicio»</b>.</li>
            <li>Se abrirá a pantalla completa, como una app nativa.</li>
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="size-4" /> Datos y seguridad</span>} />
        <CardBody className="flex flex-wrap gap-2">
          <Link href="/reports"><Button variant="secondary">Copia de seguridad / exportar</Button></Link>
          <Button variant="ghost" className="text-expense" onClick={resetAll}><Trash2 /> Borrar todos mis datos</Button>
          {!isDemoMode && <Button variant="secondary" onClick={logout} className="ml-auto"><LogOut /> Cerrar sesión</Button>}
        </CardBody>
      </Card>
    </div>
  );
}
