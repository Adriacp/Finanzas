"use client";
import { Goal as GoalIcon, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDate, todayISO } from "@/core/dates";
import { goalProgress } from "@/core/goals";
import { savingsForecast } from "@/core/insights";
import { parseAmount, round2 } from "@/core/money";
import type { Goal } from "@/core/types";
import { fieldErrors, goalSchema } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, PageHeader, Switch } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Money, useMoney } from "@/components/ui/money";
import { AccountSelect, ColorPicker, IconPicker } from "@/components/forms/pickers";
import { cn } from "@/lib/utils";

export default function GoalsPage() {
  const d = useData();
  const fmt = useMoney();
  const today = todayISO();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [contrib, setContrib] = useState<Goal | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const forecast = useMemo(() => savingsForecast(d.transactions, today), [d.transactions, today]);

  const goals = d.goals.filter((g) => showArchived || !g.archived);
  const active = d.goals.filter((g) => !g.archived);
  const totalNeeded = active.reduce((s, g) => s + (goalProgress(g, today).monthlyNeeded ?? 0), 0);
  const totalSaved = active.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = active.reduce((s, g) => s + g.targetAmount, 0);

  return (
    <div>
      <PageHeader title="Objetivos de ahorro" subtitle="Define metas y sigue tu progreso" actions={<Button onClick={() => setEditing("new")}><Plus /> Nuevo objetivo</Button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Ahorrado</p><p className="mt-1 text-xl font-semibold"><Money value={totalSaved} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Objetivo total</p><p className="mt-1 text-xl font-semibold"><Money value={totalTarget} /></p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Necesitas ahorrar al mes</p><p className="mt-1 text-xl font-semibold"><Money value={totalNeeded} /></p></Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Tu ahorro medio mensual</p>
          <p className={cn("mt-1 text-xl font-semibold", forecast.monthlyAverage >= totalNeeded ? "text-income" : "text-warning")}><Money value={forecast.monthlyAverage} /></p>
          <p className="text-[11px] text-muted-foreground">{forecast.monthlyAverage >= totalNeeded ? "Vas en buen camino" : "Por debajo de lo necesario"}</p>
        </Card>
      </div>

      {d.goals.length === 0 ? (
        <Card><EmptyState icon={<GoalIcon />} title="Crea tu primer objetivo" description="Ahorra para un coche, unas vacaciones, un fondo de emergencia o tu vivienda."
          action={<Button onClick={() => setEditing("new")}><Plus /> Nuevo objetivo</Button>} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((g) => {
              const p = goalProgress(g, today);
              const acc = d.accounts.find((a) => a.id === g.accountId);
              return (
                <Card key={g.id} className={cn("p-5", g.archived && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <IconBadge name={g.icon} color={g.color} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{g.deadline ? `Hasta ${formatDate(g.deadline)}` : "Sin fecha límite"}{acc ? ` · ${acc.name}` : ""}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(g)} aria-label={`Editar ${g.name}`}><Pencil /></Button>
                  </div>
                  <div className="my-5 flex items-center gap-4">
                    <Ring pct={p.pct} color={g.color} />
                    <div>
                      <p className="text-2xl font-semibold tracking-tight"><Money value={g.savedAmount} /></p>
                      <p className="text-sm text-muted-foreground">de <Money value={g.targetAmount} /></p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/60 p-3 text-sm">
                    {p.done ? <p className="font-medium text-income">¡Objetivo conseguido! 🎉</p>
                      : p.overdue ? <p className="text-expense">Fecha superada · faltan {fmt(p.remaining)}</p>
                      : p.monthlyNeeded !== null ? <p>Ahorra <b className="tabular">{fmt(p.monthlyNeeded)}</b>/mes durante {p.monthsLeft} {p.monthsLeft === 1 ? "mes" : "meses"}</p>
                      : <p>Faltan <b className="tabular">{fmt(p.remaining)}</b></p>}
                  </div>
                  {g.notes && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{g.notes}</p>}
                  {!p.done && !g.archived && <Button variant="subtle" className="mt-4 w-full" onClick={() => setContrib(g)}><Plus /> Aportar</Button>}
                </Card>
              );
            })}
          </div>
          {d.goals.some((g) => g.archived) && (
            <Button variant="ghost" className="mt-4" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Ocultar archivados" : "Mostrar archivados"}</Button>
          )}
        </>
      )}

      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Nuevo objetivo" : "Editar objetivo"}>
        {editing && <GoalForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!contrib} onOpenChange={(o) => !o && setContrib(null)} title={`Aportar a ${contrib?.name ?? ""}`} size="sm">
        {contrib && <ContributionForm goal={contrib} onClose={() => setContrib(null)} />}
      </Modal>
    </div>
  );
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 72 72" className="size-20 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular">{Math.round(pct)}%</span>
    </div>
  );
}

function ContributionForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const save = useFinance((s) => s.save);
  const [amount, setAmount] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  async function submit() {
    const v = parseAmount(amount);
    if (!v || v <= 0) return toast.error("Introduce un importe válido");
    const saved = round2(Math.max(0, goal.savedAmount + (withdraw ? -v : v)));
    try { await save("goals", { ...goal, savedAmount: saved }); toast.success(withdraw ? "Retirada registrada" : "Aportación registrada"); onClose(); }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Field label="Importe"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus placeholder="0,00" /></Field>
      <Switch checked={withdraw} onChange={setWithdraw} label="Es una retirada" description="Resta del importe ahorrado" />
      <p className="text-xs text-muted-foreground">Consejo: si el dinero se mueve entre tus cuentas, registra también una transferencia en Movimientos.</p>
      <div className="flex justify-end"><Button type="submit">Guardar</Button></div>
    </form>
  );
}

function GoalForm({ initial, onClose }: { initial: Goal | null; onClose: () => void }) {
  const d = useData();
  const { save, remove } = useFinance();
  const [g, setG] = useState<Goal>(initial ?? { id: newId(), name: "", targetAmount: 0, savedAmount: 0, deadline: null, accountId: null, color: "#10b981", icon: "target", notes: null, archived: false });
  const [target, setTarget] = useState(initial ? String(initial.targetAmount).replace(".", ",") : "");
  const [saved, setSaved] = useState(initial ? String(initial.savedAmount).replace(".", ",") : "0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const preview = goalProgress({ ...g, targetAmount: parseAmount(target) ?? 0, savedAmount: parseAmount(saved) ?? 0 }, todayISO());
  const fmt = useMoney();

  async function submit() {
    const row = { ...g, name: g.name.trim(), targetAmount: parseAmount(target) ?? NaN, savedAmount: parseAmount(saved) ?? NaN };
    const r = goalSchema.safeParse(row);
    if (!r.success) return setErrors(fieldErrors(r.error));
    try { await save("goals", row); toast.success("Objetivo guardado"); onClose(); }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }
  async function del() {
    if (!initial || !confirm("¿Eliminar este objetivo?")) return;
    try { await remove("goals", initial.id); toast.success("Objetivo eliminado"); onClose(); }
    catch (e) { toast.error("No se pudo eliminar", { description: (e as Error).message }); }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Field label="Nombre" error={errors.name}><Input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Ej. Fondo de emergencia" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad objetivo" error={errors.targetAmount}><Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="5.000" /></Field>
        <Field label="Ya ahorrado" error={errors.savedAmount}><Input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} /></Field>
        <Field label="Fecha límite"><Input type="date" value={g.deadline ?? ""} onChange={(e) => setG({ ...g, deadline: e.target.value || null })} /></Field>
        <Field label="Cuenta asociada"><AccountSelect accounts={d.accounts} value={g.accountId} onChange={(v) => setG({ ...g, accountId: v })} placeholder="Ninguna" /></Field>
      </div>
      {preview.monthlyNeeded !== null && preview.monthlyNeeded > 0 && (
        <p className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">Necesitarás ahorrar <b>{fmt(preview.monthlyNeeded)}</b> al mes ({preview.monthsLeft} meses).</p>
      )}
      <Field label="Color"><ColorPicker value={g.color} onChange={(c) => setG({ ...g, color: c })} /></Field>
      <Field label="Icono"><IconPicker value={g.icon} onChange={(i) => setG({ ...g, icon: i })} color={g.color} /></Field>
      <Field label="Notas"><Textarea rows={2} value={g.notes ?? ""} onChange={(e) => setG({ ...g, notes: e.target.value || null })} /></Field>
      {initial && <Switch checked={g.archived} onChange={(v) => setG({ ...g, archived: v })} label="Archivado" />}
      <div className="flex gap-2">
        {initial && <Button variant="ghost" className="text-expense" onClick={del}>Eliminar</Button>}
        <Button type="submit" className="ml-auto">Guardar</Button>
      </div>
    </form>
  );
}
