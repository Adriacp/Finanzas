"use client";
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Category, CategoryKind } from "@/core/types";
import { categorySchema, fieldErrors } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Segmented, Switch } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { ColorPicker, IconPicker, sortCats } from "@/components/forms/pickers";
import { cn } from "@/lib/utils";

type Editing = { cat: Category | null; parentId: string | null; kind: CategoryKind } | null;

export default function CategoriesPage() {
  const d = useData();
  const { saveMany } = useFinance();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    d.transactions.forEach((t) => { [t.categoryId, t.subcategoryId].forEach((id) => id && m.set(id, (m.get(id) ?? 0) + 1)); });
    return m;
  }, [d.transactions]);

  const parents = sortCats(d.categories.filter((c) => !c.parentId && c.kind === kind));

  /** Reordenar: intercambia la posición con el vecino y guarda el nuevo orden. */
  async function move(list: Category[], index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[j]] = [reordered[j], reordered[index]];
    try { await saveMany("categories", reordered.map((c, i) => ({ ...c, sortOrder: i }))); }
    catch (e) { toast.error("No se pudo reordenar", { description: (e as Error).message }); }
  }

  return (
    <div>
      <PageHeader title="Categorías" subtitle="Personaliza cómo clasificas tu dinero"
        actions={<Button onClick={() => setEditing({ cat: null, parentId: null, kind })}><Plus /> Nueva categoría</Button>} />
      <Segmented value={kind} onChange={setKind} options={[{ value: "expense", label: "Gastos" }, { value: "income", label: "Ingresos" }]} className="mb-4" />

      <div className="space-y-2">
        {parents.map((p, i) => {
          const subs = sortCats(d.categories.filter((c) => c.parentId === p.id));
          const isOpen = open.has(p.id);
          return (
            <Card key={p.id} className="overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer" onClick={() => setOpen((s) => { const n = new Set(s); if (isOpen) n.delete(p.id); else n.add(p.id); return n; })}>
                  <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <IconBadge name={p.icon} color={p.color} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{subs.length} subcategorías · {usage.get(p.id) ?? 0} movimientos{p.essential ? " · Necesario" : ""}</p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon-sm" onClick={() => move(parents, i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => move(parents, i, 1)} disabled={i === parents.length - 1} aria-label="Bajar"><ArrowDown /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ cat: p, parentId: null, kind })} aria-label={`Editar ${p.name}`}><Pencil /></Button>
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-border bg-muted/30 px-3 py-2 animate-in">
                  {subs.map((s, j) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg py-1.5 pl-9 pr-0">
                      <span className="size-2 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1 truncate text-sm">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{usage.get(s.id) ?? 0}</span>
                      <Button variant="ghost" size="icon-sm" onClick={() => move(subs, j, -1)} disabled={j === 0} aria-label="Subir"><ArrowUp /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => move(subs, j, 1)} disabled={j === subs.length - 1} aria-label="Bajar"><ArrowDown /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ cat: s, parentId: p.id, kind })} aria-label={`Editar ${s.name}`}><Pencil /></Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="ml-7 mt-1 text-primary" onClick={() => setEditing({ cat: null, parentId: p.id, kind })}><Plus /> Añadir subcategoría</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.cat ? "Editar categoría" : editing?.parentId ? "Nueva subcategoría" : "Nueva categoría"}>
        {editing && <CategoryForm key={editing.cat?.id ?? `new-${editing.parentId}`} editing={editing} usage={usage} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function CategoryForm({ editing, usage, onClose }: { editing: NonNullable<Editing>; usage: Map<string, number>; onClose: () => void }) {
  const d = useData();
  const { save, remove, saveMany } = useFinance();
  const parent = editing.parentId ? d.categories.find((c) => c.id === editing.parentId) : undefined;
  const [c, setC] = useState<Category>(editing.cat ?? {
    id: newId(), parentId: editing.parentId, kind: editing.kind, name: "", icon: parent?.icon ?? "tag", color: parent?.color ?? "#6366f1",
    description: null, essential: parent?.essential ?? false, sortOrder: d.categories.filter((x) => x.parentId === editing.parentId).length,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [moveTo, setMoveTo] = useState("");
  const isParent = !c.parentId;
  const subs = d.categories.filter((x) => x.parentId === c.id);
  const used = (usage.get(c.id) ?? 0) + subs.reduce((s, x) => s + (usage.get(x.id) ?? 0), 0);

  async function submit() {
    const r = categorySchema.safeParse(c);
    if (!r.success) return setErrors(fieldErrors(r.error));
    const dupe = d.categories.some((x) => x.id !== c.id && x.parentId === c.parentId && x.kind === c.kind && x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
    if (dupe) return setErrors({ name: "Ya existe una categoría con ese nombre" });
    try {
      await save("categories", { ...c, name: c.name.trim() });
      // Propagar color/tipo/necesario a subcategorías al editar la categoría padre
      if (isParent && editing.cat && subs.length && (editing.cat.color !== c.color || editing.cat.essential !== c.essential || editing.cat.kind !== c.kind)) {
        await saveMany("categories", subs.map((s) => ({ ...s, color: c.color, essential: c.essential, kind: c.kind })));
      }
      toast.success("Categoría guardada");
      onClose();
    } catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }); }
  }

  async function del() {
    if (used > 0 && moveTo) {
      // Reasignar movimientos antes de borrar
      const target = d.categories.find((x) => x.id === moveTo)!;
      const ids = new Set([c.id, ...subs.map((s) => s.id)]);
      const txs = d.transactions.filter((t) => ids.has(t.categoryId ?? "") || ids.has(t.subcategoryId ?? ""))
        .map((t) => ({ ...t, categoryId: target.parentId ?? target.id, subcategoryId: target.parentId ? target.id : null }));
      await saveMany("transactions", txs);
    } else if (!confirm(used > 0 ? `${used} movimientos quedarán sin categoría. ¿Eliminar de todos modos?` : "¿Eliminar esta categoría" + (subs.length ? " y sus subcategorías?" : "?"))) return;
    try { await remove("categories", c.id); toast.success("Categoría eliminada"); onClose(); }
    catch (e) { toast.error("No se pudo eliminar", { description: (e as Error).message }); }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {parent && <p className="text-sm text-muted-foreground">Dentro de <b className="text-foreground">{parent.name}</b></p>}
      <div className="flex items-end gap-3">
        <IconBadge name={c.icon} color={c.color} size="lg" />
        <Field label="Nombre" error={errors.name} className="flex-1"><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus maxLength={60} /></Field>
      </div>
      {isParent && (
        <>
          <Field label="Descripción"><Input value={c.description ?? ""} onChange={(e) => setC({ ...c, description: e.target.value || null })} maxLength={200} /></Field>
          <Field label="Tipo">
            <Segmented value={c.kind} onChange={(k) => setC({ ...c, kind: k })} options={[{ value: "expense", label: "Gasto" }, { value: "income", label: "Ingreso" }]} />
          </Field>
        </>
      )}
      <Field label="Color"><ColorPicker value={c.color} onChange={(v) => setC({ ...c, color: v })} /></Field>
      <Field label="Icono"><IconPicker value={c.icon} onChange={(v) => setC({ ...c, icon: v })} color={c.color} /></Field>
      {c.kind === "expense" && <Switch checked={c.essential} onChange={(v) => setC({ ...c, essential: v })} label="Gasto necesario" description="Para el análisis de gastos necesarios frente a prescindibles" />}
      <p className="text-xs text-muted-foreground">El presupuesto mensual de esta categoría se configura en <b>Presupuestos</b>.</p>

      {editing.cat && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Eliminar</p>
          {used > 0 && (
            <Field label={`Mover sus ${used} movimientos a…`} className="mt-2">
              <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">No mover (quedan sin categoría)</option>
                {sortCats(d.categories.filter((x) => !x.parentId && x.kind === c.kind && x.id !== c.id)).map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    <option value={p.id}>{p.name}</option>
                    {sortCats(d.categories.filter((s) => s.parentId === p.id && s.id !== c.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
          )}
          <Button variant="ghost" size="sm" className="mt-2 text-expense" onClick={del}>Eliminar categoría</Button>
        </div>
      )}
      <div className="flex justify-end"><Button type="submit">Guardar</Button></div>
    </form>
  );
}
