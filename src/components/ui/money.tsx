"use client";
import { formatMoney } from "@/core/money";
import { useFinance } from "@/store/finance-store";
import { usePrivacy } from "@/store/ui-store";
import { cn } from "@/lib/utils";

export function useCurrency() {
  return useFinance((s) => s.data?.profile.currency ?? "EUR");
}

export function useMoney() {
  const currency = useCurrency();
  const hidden = usePrivacy((s) => s.hidden);
  return (n: number, opts?: Parameters<typeof formatMoney>[2]) => (hidden ? "•••• €" : formatMoney(n, currency, opts));
}

/** Importe con formato, color opcional por signo y cifras tabulares. */
export function Money({ value, className, sign, colored, compact, decimals }: { value: number; className?: string; sign?: boolean; colored?: boolean; compact?: boolean; decimals?: boolean }) {
  const fmt = useMoney();
  return (
    <span className={cn("tabular whitespace-nowrap", colored && (value > 0 ? "text-income" : value < 0 ? "text-expense" : ""), className)}>
      {fmt(value, { sign, compact, decimals })}
    </span>
  );
}
