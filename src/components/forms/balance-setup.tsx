"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ACCOUNT_TYPE_LABELS } from "@/core/defaults";
import { adjustedInitialBalance, wealth } from "@/core/finance";
import { parseAmount, round2 } from "@/core/money";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";

/**
 * Ajuste de saldos reales: el usuario escribe lo que ve en su banco y se recalcula el saldo
 * inicial de cada cuenta para que el saldo de la app coincida. No crea movimientos.
 */
export function BalanceSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const d = useData();
  const { saveMany, updateProfile, schemaOutdated } = useFinance();
  const fmt = useMoney();
  const accounts = useMemo(() => d.accounts.filter((a) => !a.archived).sort((a, b) => a.sortOrder - b.sortOrder), [d.accounts]);
  const { balances } = useMemo(() => wealth(d.accounts, d.transactions), [d.accounts, d.transactions]);
  const [real, setReal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setReal({}); }, [open]);

  const parsed = (id: string) => (real[id]?.trim() ? parseAmount(real[id]) : null);
  const changes = accounts
    .map((a) => ({ a, current: balances.get(a.id) ?? 0, target: parsed(a.id) }))
    .filter((x): x is typeof x & { target: number } => x.target !== null && round2(x.target - x.current) !== 0);
  const invalid = accounts.some((a) => real[a.id]?.trim() && parseAmount(real[a.id]) === null);

  async function save() {
    setSaving(true);
    try {
      if (changes.length) await saveMany("accounts", changes.map(({ a, current, target }) => ({ ...a, initialBalance: adjustedInitialBalance(a.initialBalance, current, target) })));
      if (!schemaOutdated) await updateProfile({ balancesConfirmed: true });
      toast.success(changes.length ? `${changes.length} ${changes.length === 1 ? "cuenta ajustada" : "cuentas ajustadas"}` : "Saldos confirmados");
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudieron guardar los saldos", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Saldo real de tus cuentas"
      description="Escribe lo que ves ahora mismo en tu banco. Deja en blanco las que ya estén bien."
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={save} disabled={saving || invalid}>{saving ? "Guardando…" : changes.length ? `Ajustar ${changes.length}` : "Están bien así"}</Button>
      </>}>
      <div className="space-y-2">
        {accounts.map((a) => {
          const current = balances.get(a.id) ?? 0;
          const target = parsed(a.id);
          const diff = target !== null ? round2(target - current) : 0;
          const bad = !!real[a.id]?.trim() && target === null;
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
              <IconBadge name={a.icon} color={a.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[a.type]} · en la app: <span className={cn("tabular", current < 0 && "text-expense")}>{fmt(current)}</span>
                </p>
                {target !== null && diff !== 0 && (
                  <p className={cn("text-xs tabular", diff > 0 ? "text-income" : "text-expense")}>Se ajustará {fmt(diff, { sign: true })}</p>
                )}
              </div>
              <div className="w-32 shrink-0">
                <input inputMode="decimal" aria-label={`Saldo real de ${a.name}`} placeholder={String(current).replace(".", ",")}
                  value={real[a.id] ?? ""} onChange={(e) => setReal({ ...real, [a.id]: e.target.value })}
                  className={cn("h-10 w-full rounded-lg border bg-card px-2.5 text-right tabular focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15",
                    bad ? "border-expense" : "border-input")} />
              </div>
            </div>
          );
        })}
        <p className="pt-1 text-xs text-muted-foreground">
          No se crea ningún movimiento: se ajusta el saldo inicial de la cuenta, así tus ingresos y gastos no cambian.
          Las tarjetas de crédito con deuda van en negativo. Puedes repetir este ajuste cuando quieras desde Cuentas.
        </p>
      </div>
    </Modal>
  );
}
