"use client";
import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, formatMonth, fromISO, todayISO, toISO } from "@/core/dates";
import { upcomingPayments } from "@/core/recurring";
import type { Recurring, Transaction } from "@/core/types";
import { useData } from "@/store/finance-store";
import { useTxDialog } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/misc";
import { Money, useMoney } from "@/components/ui/money";
import { TransactionRow } from "@/components/shared";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export default function CalendarPage() {
  const d = useData();
  const fmt = useMoney();
  const openNew = useTxDialog((s) => s.openNew);
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);

  const first = startOfMonth(fromISO(`${month}-01`));
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(first), { weekStartsOn: 1 });
  const days: string[] = [];
  for (let x = gridStart; x <= gridEnd; x = addDays(x, 1)) days.push(toISO(x));

  const byDay = useMemo(() => {
    const range = { from: days[0], to: days[days.length - 1] };
    const map = new Map<string, { txs: Transaction[]; recurring: Recurring[]; expense: number; income: number; pending: number }>();
    const get = (k: string) => map.get(k) ?? map.set(k, { txs: [], recurring: [], expense: 0, income: 0, pending: 0 }).get(k)!;
    for (const t of d.transactions) {
      if (t.date < range.from || t.date > range.to) continue;
      const e = get(t.date);
      e.txs.push(t);
      if (t.status !== "paid") e.pending += t.type === "expense" ? t.amount : 0;
      else if (t.type === "expense") e.expense += t.amount;
      else if (t.type === "income") e.income += t.amount;
    }
    // Recurrentes previstos (solo desde hoy: lo pasado ya debería estar registrado)
    for (const u of upcomingPayments(d.recurring, { from: today > range.from ? today : range.from, to: range.to })) get(u.date).recurring.push(u.recurring);
    return map;
  }, [d, days, today]);

  const monthTotals = useMemo(() => {
    let exp = 0, inc = 0, planned = 0;
    for (const [k, v] of byDay) if (k.startsWith(month)) { exp += v.expense; inc += v.income; planned += v.pending + v.recurring.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0); }
    return { exp, inc, planned };
  }, [byDay, month]);

  const sel = byDay.get(selected);
  const go = (n: number) => { const m = format(addMonths(first, n), "yyyy-MM"); setMonth(m); setSelected(m === today.slice(0, 7) ? today : `${m}-01`); };

  return (
    <div>
      <PageHeader title="Calendario" subtitle="Gastos, ingresos, facturas y vencimientos" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="p-3 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Mes anterior"><ChevronLeft /></Button>
            <div className="text-center">
              <p className="font-semibold capitalize">{formatMonth(month, "MMMM yyyy")}</p>
              <p className="text-xs text-muted-foreground tabular">
                <span className="text-expense">−{fmt(monthTotals.exp, { decimals: false })}</span> · <span className="text-income">+{fmt(monthTotals.inc, { decimals: false })}</span>
                {monthTotals.planned > 0 && <> · <span className="text-warning">{fmt(monthTotals.planned, { decimals: false })} previsto</span></>}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label="Mes siguiente"><ChevronRight /></Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const e = byDay.get(day);
              const inMonth = day.startsWith(month);
              const isSel = day === selected;
              return (
                <button key={day} onClick={() => setSelected(day)}
                  className={cn("flex min-h-14 flex-col items-center rounded-xl p-1 text-xs transition-colors md:min-h-20 md:items-start md:p-2 cursor-pointer",
                    inMonth ? "hover:bg-muted" : "opacity-35", isSel && "bg-accent ring-1 ring-primary/40", day === today && !isSel && "bg-muted")}>
                  <span className={cn("grid size-6 place-items-center rounded-full font-medium", day === today && "bg-primary text-primary-foreground")}>{Number(day.slice(8))}</span>
                  {e && (
                    <>
                      <span className="mt-0.5 flex gap-0.5 md:hidden">
                        {e.expense > 0 && <i className="size-1.5 rounded-full bg-expense" />}
                        {e.income > 0 && <i className="size-1.5 rounded-full bg-income" />}
                        {(e.pending > 0 || e.recurring.length > 0) && <i className="size-1.5 rounded-full bg-warning" />}
                      </span>
                      <span className="hidden w-full space-y-0.5 text-left text-[10px] leading-tight tabular md:block">
                        {e.expense > 0 && <span className="block truncate text-expense">−{fmt(e.expense, { decimals: false })}</span>}
                        {e.income > 0 && <span className="block truncate text-income">+{fmt(e.income, { decimals: false })}</span>}
                        {(e.pending > 0 || e.recurring.length > 0) && <span className="block truncate text-warning">{e.recurring.length + e.txs.filter((t) => t.status !== "paid").length} previsto</span>}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-expense" /> Gastos</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-income" /> Ingresos</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-warning" /> Pendientes, facturas y recurrentes</span>
          </div>
        </Card>

        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader title={<span className="capitalize">{formatDate(selected, "EEEE, d 'de' MMMM")}</span>}
            action={<Button size="sm" variant="subtle" onClick={() => openNew({ date: selected, status: selected > today ? "scheduled" : "paid" })}><Plus /> Añadir</Button>} />
          <CardBody className="px-3">
            {!sel || (sel.txs.length === 0 && sel.recurring.length === 0) ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin movimientos este día</p>
            ) : (
              <>
                {sel.txs.map((t) => <TransactionRow key={t.id} t={t} />)}
                {sel.recurring.map((r) => {
                  const c = d.categories.find((x) => x.id === (r.subcategoryId ?? r.categoryId));
                  return (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                      <IconBadge name={c?.icon ?? "repeat"} color={c?.color ?? "#14b8a6"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="flex items-center gap-1 text-xs text-warning"><Repeat className="size-3" /> {r.isSubscription ? "Suscripción" : "Pago recurrente"} previsto</p>
                      </div>
                      <Money value={r.type === "expense" ? -r.amount : r.amount} className={cn("text-sm font-semibold", r.type === "income" && "text-income")} />
                    </div>
                  );
                })}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
