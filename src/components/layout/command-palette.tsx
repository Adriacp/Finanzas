"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { ArrowRight, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate } from "@/core/dates";
import { filterTransactions, sortTransactions } from "@/core/filters";
import { useFinance } from "@/store/finance-store";
import { useCommand, useTxDialog } from "@/store/ui-store";
import { IconBadge } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { NAV } from "./app-shell";

/** Buscador global (Ctrl/Cmd + K): movimientos, secciones y acciones rápidas. */
export function CommandPalette() {
  const { open, setOpen } = useCommand();
  const data = useFinance((s) => s.data);
  const openEdit = useTxDialog((s) => s.openEdit);
  const openNew = useTxDialog((s) => s.openNew);
  const router = useRouter();
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    if (!data || q.trim().length < 2) return [];
    return sortTransactions(filterTransactions(data.transactions, { q }, data.categories, data.accounts)).slice(0, 30);
  }, [data, q]);
  const catById = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade" />
        <Dialog.Content className="fixed left-1/2 top-[8vh] z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-pop">
          <Dialog.Title className="sr-only">Buscador global</Dialog.Title>
          <Dialog.Description className="sr-only">Busca movimientos por nombre, importe, categoría, cuenta, comercio o etiqueta</Dialog.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Buscar movimientos, importes (>50), #etiquetas, secciones…"
                className="h-14 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="p-6 text-center text-sm text-muted-foreground">Sin resultados</Command.Empty>
              {q.trim().length >= 2 && results.length > 0 && (
                <Command.Group heading="Movimientos" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {results.map((t) => {
                    const c = catById.get(t.subcategoryId ?? "") ?? catById.get(t.categoryId ?? "");
                    return (
                      <Command.Item key={t.id} value={t.id} onSelect={() => { setOpen(false); openEdit(t); }}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted">
                        <IconBadge name={c?.icon ?? "tag"} color={c?.color ?? "#94a3b8"} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.concept}</p>
                          <p className="truncate text-xs text-muted-foreground">{formatDate(t.date)} · {c?.name ?? "Sin categoría"}</p>
                        </div>
                        <Money value={t.type === "expense" ? -t.amount : t.amount} colored={t.type !== "transfer"} />
                      </Command.Item>
                    );
                  })}
                  <Command.Item value="all" onSelect={() => go(`/transactions?q=${encodeURIComponent(q)}`)}
                    className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm text-primary data-[selected=true]:bg-muted">
                    <ArrowRight className="size-4" /> Ver todos los resultados en Movimientos
                  </Command.Item>
                </Command.Group>
              )}
              <Command.Group heading="Acciones" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                <Command.Item value="new" onSelect={() => { setOpen(false); openNew(); }}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted">
                  <Plus className="size-4" /> Añadir movimiento
                </Command.Item>
                {NAV.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase())).map((n) => (
                  <Command.Item key={n.href} value={n.href} onSelect={() => go(n.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-foreground data-[selected=true]:bg-muted">
                    <n.icon className="size-4" /> {n.label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
