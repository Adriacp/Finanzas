"use client";
import { Command } from "cmdk";
import { Check, ChevronDown, Plus, Search, Store, X } from "lucide-react";
import { useMemo, useState } from "react";
import { merchantDirectory, normalize, type MerchantEntry } from "@/core/insights";
import { useData } from "@/store/finance-store";
import { ResponsivePicker, useIsDesktop } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

/**
 * Selector de comercio: lista los comercios que ya has usado (agrupando variantes como «Spar» y «spar »),
 * con buscador y opción de usar uno nuevo. Al elegir uno se informa de su categoría habitual.
 */
export function MerchantPicker({ value, onChange, id }: {
  value: string | null;
  onChange: (name: string | null, entry: MerchantEntry | null) => void;
  id?: string;
}) {
  const d = useData();
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dir = useMemo(() => merchantDirectory(d.transactions), [d.transactions]);
  const catName = useMemo(() => new Map(d.categories.map((c) => [c.id, c.name])), [d.categories]);
  const shown = useMemo(() => {
    const n = normalize(q);
    return (n ? dir.filter((m) => m.key.includes(n)) : dir).slice(0, 80);
  }, [dir, q]);
  const typed = q.trim().replace(/\s+/g, " ").slice(0, 80);
  const exact = typed ? dir.find((m) => m.key === normalize(typed)) : undefined;
  const currentKey = normalize(value ?? "");

  const pick = (name: string | null, entry: MerchantEntry | null) => { onChange(name, entry); setOpen(false); setQ(""); };

  const trigger = (
    <button type="button" id={id} onClick={() => !desktop && setOpen(true)} aria-haspopup="listbox" aria-expanded={open}
      className="flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 text-left text-foreground transition-colors hover:border-foreground/25 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 md:h-10 cursor-pointer">
      <Store className="size-4 shrink-0 text-muted-foreground" />
      <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>{value || "Elige o escribe un comercio"}</span>
      {value ? (
        <span role="button" tabIndex={-1} aria-label="Quitar comercio" onClick={(e) => { e.stopPropagation(); onChange(null, null); }}
          className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" />
        </span>
      ) : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
    </button>
  );

  return (
    <ResponsivePicker open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }} desktop={desktop} title="Comercio" trigger={trigger}
      contentClassName="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
      <Command shouldFilter={false} loop className="outline-none">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Command.Input value={q} onValueChange={setQ} autoFocus={desktop} placeholder="Buscar o añadir comercio…"
            className="h-11 w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
        <Command.List className={cn("overflow-y-auto overscroll-contain p-1.5", desktop && "max-h-72")}>
          {typed && !exact && (
            <Command.Item value="__new" onSelect={() => pick(typed.charAt(0).toUpperCase() + typed.slice(1), null)}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm font-medium text-primary data-[selected=true]:bg-muted">
              <Plus className="size-4" /> Nuevo comercio «{typed}»
            </Command.Item>
          )}
          {!typed && dir.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Escribe el nombre del comercio para añadirlo</p>
          )}
          {shown.map((m) => (
            <Command.Item key={m.key} value={m.key} onSelect={() => pick(m.name, m)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm data-[selected=true]:bg-muted", desktop ? "min-h-11 py-1" : "min-h-12 py-1.5")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.count} {m.count === 1 ? "vez" : "veces"}{m.subcategoryId || m.categoryId ? ` · ${catName.get(m.subcategoryId ?? m.categoryId ?? "") ?? ""}` : ""}
                </span>
              </span>
              {m.key === currentKey && <Check className="size-4 shrink-0 text-primary" />}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </ResponsivePicker>
  );
}
