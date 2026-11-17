"use client";
import { ArrowLeftRight, Pencil, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS } from "@/core/defaults";
import { wealth } from "@/core/finance";
import { parseAmount } from "@/core/money";
import type { Account, AccountType } from "@/core/types";
import { accountSchema, fieldErrors } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Switch } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Money } from "@/components/ui/money";
import { ColorPicker } from "@/components/forms/pickers";

export default function AccountsPage() {
  const d = useData();
  const openNew = useTxDialog((s) => s.openNew);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const w = useMemo(() => wealth(d.accounts, d.transactions), [d.accounts, d.transactions]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    d.transactions.forEach((t) => { if (t.accountId) m.set(t.accountId, (m.get(t.accountId) ?? 0) + 1); if (t.toAccountId) m.set(t.toAccountId, (m.get(t.toAccountId) ?? 0) + 1); });
    return m;
  }, [d.transactions]);
  const sorted = [...d.accounts].sort((a, b) => Number(a.archived) - Number(b.archived) || a.sortOrder - b.sortOrder);
  const assets = d.accounts.reduce((s, a) => s + Math.max(0, w.balances.get(a.id) ?? 0), 0);
  const debts = d.accounts.reduce((s, a) => s + Math.min(0, w.balances.get(a.id) ?? 0), 0);

  return (
    <div>
      <PageHeader title="Cuentas" subtitle="Bancos, efectivo, tarjetas y otras cuentas"
        actions={<>
          <Button variant="secondary" onClick={() => openNew({ type: "transfer" })}><ArrowLeftRight /> Transferir</Button>
          <Button onClick={() => setEditing("new")}><Plus /> Nueva cuenta</Button>
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Patrimonio neto" value={w.netWorth} />
        <Stat label="Disponible" value={w.available} />
        <Stat label="Activos" value={assets} />
        <Stat label="Deudas" value={debts} colored />
      </div>

      {d.accounts.length === 0 ? (
        <Card><EmptyState icon={<Wallet />} title="Sin cuentas" description="Crea tu primera cuenta para asociar movimientos." action={<Button onClick={() => setEditing("new")}><Plus /> Nueva cuenta</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((a) => {
            const bal = w.balances.get(a.id) ?? 0;
            return (
              <Card key={a.id} className={a.archived ? "opacity-60" : "overflow-hidden"}>
                <div className="relative p-5">
                  <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full opacity-20 blur-2xl" style={{ background: a.color }} />
                  <div className="flex items-start justify-between">
                    <IconBadge name={a.icon} color={a.color} size="lg" />
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}><Pencil /></Button>
                  </div>
                  <p className="mt-4 font-semibold">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[a.type]}{a.institution ? ` · ${a.institution}` : ""}{a.archived ? " · Archivada" : ""}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight"><Money value={bal} className={bal < 0 ? "text-expense" : ""} /></p>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Saldo inicial <Money value={a.initialBalance} /></span>
                    <Link href={`/transactions?account=${a.id}`} className="font-medium text-primary">{counts.get(a.id) ?? 0} movimientos</Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <AccountDialog value={editing} onClose={() => setEditing(null)} count={editing && editing !== "new" ? counts.get(editing.id) ?? 0 : 0} />
    </div>
  );
}

function Stat({ label, value, colored }: { label: string; value: number; colored?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold md:text-xl"><Money value={value} colored={colored} /></p>
    </Card>
  );
}

function AccountDialog({ value, onClose, count }: { value: Account | "new" | null; onClose: () => void; count: number }) {
  return (
    <Modal open={!!value} onOpenChange={(o) => !o && onClose()} title={value === "new" ? "Nueva cuenta" : "Editar cuenta"} size="sm">
      {value && <AccountForm key={value === "new" ? "new" : value.id} initial={value === "new" ? null : value} onClose={onClose} count={count} />}
    </Modal>
  );
}

function AccountForm({ initial, onClose, count }: { initial: Account | null; onClose: () => void; count: number }) {
  const d = useData();
  const { save, remove } = useFinance();
  const [a, setA] = useState<Account>(initial ?? {
    id: newId(), name: "", type: "checking", institution: null, initialBalance: 0, currency: d.profile.currency, color: "#6366f1", icon: "landmark", archived: false, sortOrder: d.accounts.length,
  });
  const [initialText, setInitialText] = useState(initial ? String(initial.initialBalance).replace(".", ",") : "0");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const row = { ...a, initialBalance: parseAmount(initialText) ?? NaN };
    const r = accountSchema.safeParse(row);
    if (!r.success) return setErrors(fieldErrors(r.error));
    try { await save("accounts", row); toast.success("Cuenta guardada"); onClose(); }
    catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }

  async function del() {
    const msg = count > 0
      ? `Esta cuenta tiene ${count} movimientos. Si la eliminas, quedarán sin cuenta asociada. ¿Prefieres archivarla? Pulsa Aceptar para ELIMINAR definitivamente.`
      : "¿Eliminar esta cuenta?";
    if (!confirm(msg)) return;
    try { await remove("accounts", a.id); toast.success("Cuenta eliminada"); onClose(); }
    catch (e) { toast.error("No se pudo eliminar", { description: (e as Error).message }); }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Field label="Nombre" error={errors.name}><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Ej. Cuenta nómina" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select value={a.type} onChange={(e) => { const t = e.target.value as AccountType; setA({ ...a, type: t, icon: ACCOUNT_TYPE_ICONS[t] }); }}>
            {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
          </Select>
        </Field>
        <Field label="Banco o entidad"><Input value={a.institution ?? ""} onChange={(e) => setA({ ...a, institution: e.target.value || null })} /></Field>
        <Field label="Saldo inicial" error={errors.initialBalance} hint="Negativo para deudas">
          <Input inputMode="decimal" value={initialText} onChange={(e) => setInitialText(e.target.value)} />
        </Field>
        <Field label="Moneda">
          <Select value={a.currency} onChange={(e) => setA({ ...a, currency: e.target.value })}>
            {["EUR", "USD", "GBP", "CHF", "MXN"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Color"><ColorPicker value={a.color} onChange={(c) => setA({ ...a, color: c })} /></Field>
      <Switch checked={a.archived} onChange={(v) => setA({ ...a, archived: v })} label="Archivada" description="Se oculta de los selectores pero conserva su historial" />
      <div className="flex gap-2 pt-2">
        {initial && <Button variant="ghost" className="text-expense" onClick={del}>Eliminar</Button>}
        <Button type="submit" className="ml-auto">Guardar</Button>
      </div>
    </form>
  );
}
