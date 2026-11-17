"use client";
import { ArrowLeftRight, Paperclip, Repeat, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { create } from "zustand";
import { type DateRange, PERIOD_LABELS, type PeriodKey, periodRange, relativeDayLabel, todayISO } from "@/core/dates";
import type { Account, Category, Transaction } from "@/core/types";
import { useData } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Money, useMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Selector de periodo (compartido entre Inicio y Análisis)
// ---------------------------------------------------------------------------
interface PeriodState {
  key: PeriodKey;
  custom: DateRange;
  set(key: PeriodKey, custom?: DateRange): void;
}
export const usePeriodStore = create<PeriodState>((set) => ({
  key: "month",
  custom: periodRange("month"),
  set: (key, custom) => set((s) => ({ key, custom: custom ?? s.custom })),
}));

export function usePeriod() {
  const { key, custom } = usePeriodStore();
  const range = useMemo(() => periodRange(key, new Date(), custom), [key, custom]);
  return { key, range };
}

export function PeriodPicker({ className }: { className?: string }) {
  const { key, custom, set } = usePeriodStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(custom);
  return (
    <>
      <Select
        aria-label="Periodo"
        className={cn("h-10 min-w-40 bg-card font-medium", className)}
        value={key}
        onChange={(e) => {
          const k = e.target.value as PeriodKey;
          if (k === "custom") { setDraft(custom); setOpen(true); } else set(k);
        }}
      >
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => <option key={k} value={k}>{PERIOD_LABELS[k]}</option>)}
      </Select>
      <Modal open={open} onOpenChange={setOpen} title="Periodo personalizado" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!draft.from || !draft.to || draft.from > draft.to} onClick={() => { set("custom", draft); setOpen(false); }}>Aplicar</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde"><Input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
          <Field label="Hasta"><Input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
        </div>
        {draft.from > draft.to && <p className="mt-2 text-xs text-expense">La fecha inicial debe ser anterior a la final.</p>}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lista de movimientos
// ---------------------------------------------------------------------------
export function useLookups() {
  const d = useData();
  return useMemo(() => ({
    cat: new Map<string, Category>(d.categories.map((c) => [c.id, c])),
    acc: new Map<string, Account>(d.accounts.map((a) => [a.id, a])),
  }), [d.categories, d.accounts]);
}

export function signedAmount(t: Transaction) {
  return t.type === "expense" ? -t.amount : t.type === "transfer" ? t.amount : t.amount;
}

export function TransactionRow({ t, onClick, selected, onSelect }: { t: Transaction; onClick?: () => void; selected?: boolean; onSelect?: (v: boolean) => void }) {
  const { cat, acc } = useLookups();
  const openEdit = useTxDialog((s) => s.openEdit);
  const c = cat.get(t.subcategoryId ?? "") ?? cat.get(t.categoryId ?? "");
  const parent = c?.parentId ? cat.get(c.parentId) : undefined;
  const account = acc.get(t.accountId ?? "");
  const to = acc.get(t.toAccountId ?? "");
  const isTransfer = t.type === "transfer";
  return (
    <div className={cn("group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/70", selected && "bg-accent/60")}>
      {onSelect && (
        <input type="checkbox" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Seleccionar ${t.concept}`}
          className="size-4 shrink-0 accent-[var(--primary)] cursor-pointer" />
      )}
      <button type="button" onClick={onClick ?? (() => openEdit(t))} className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer">
        {isTransfer ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-transfer/15 text-transfer"><ArrowLeftRight className="size-[18px]" /></span>
        ) : (
          <IconBadge name={c?.icon ?? (t.type === "income" ? "trending-up" : "tag")} color={c?.color ?? "#94a3b8"} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            <span className="truncate">{t.concept}</span>
            {t.isRecurring && <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Recurrente" />}
            {t.attachmentPath && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Con adjunto" />}
            {t.type === "refund" && <RotateCcw className="size-3 shrink-0 text-income" aria-label="Reembolso" />}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {isTransfer ? `${account?.name ?? "?"} → ${to?.name ?? "?"}` : [c ? (parent ? `${parent.name} · ${c.name}` : c.name) : "Sin categoría", account?.name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Money value={signedAmount(t)} sign={!isTransfer} className={cn("text-sm font-semibold", t.type === "expense" ? "text-foreground" : isTransfer ? "text-transfer" : "text-income")} />
          {t.status !== "paid" ? (
            <Badge className={t.status === "pending" ? "bg-warning/15 text-warning" : "bg-transfer/15 text-transfer"}>{t.status === "pending" ? "Pendiente" : "Programado"}</Badge>
          ) : t.tags.length > 0 ? (
            <span className="max-w-28 truncate text-[11px] text-muted-foreground">#{t.tags.join(" #")}</span>
          ) : null}
        </div>
      </button>
    </div>
  );
}

export function GroupedTransactions({ txs, selection, onToggle }: { txs: Transaction[]; selection?: Set<string>; onToggle?: (id: string, v: boolean) => void }) {
  const fmt = useMoney();
  const today = todayISO();
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    txs.forEach((t) => (map.get(t.date) ?? map.set(t.date, []).get(t.date)!).push(t));
    return [...map.entries()];
  }, [txs]);
  return (
    <div className="space-y-4">
      {groups.map(([date, list]) => {
        const net = list.reduce((s, t) => s + (t.status !== "paid" ? 0 : t.type === "expense" ? -t.amount : t.type === "transfer" ? 0 : t.amount), 0);
        return (
          <section key={date}>
            <div className="sticky top-14 z-10 -mx-1 flex items-center justify-between bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur lg:top-0">
              <span className="capitalize">{relativeDayLabel(date, today)}</span>
              <span className="tabular">{net !== 0 && fmt(net, { sign: true })}</span>
            </div>
            <div>
              {list.map((t) => (
                <TransactionRow key={t.id} t={t} selected={selection?.has(t.id)} onSelect={onToggle ? (v) => onToggle(t.id, v) : undefined} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de KPI
// ---------------------------------------------------------------------------
export function Delta({ value, invert, className }: { value: number | null; invert?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular", good ? "bg-income/12 text-income" : "bg-expense/12 text-expense", className)}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"} {Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0).replace(".", ",")} %
    </span>
  );
}
