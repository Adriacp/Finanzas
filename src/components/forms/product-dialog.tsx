"use client";
import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PRODUCT_UNITS } from "@/core/defaults";
import { normalize } from "@/core/insights";
import { parseAmount } from "@/core/money";
import { childrenMap, formatPackage, guessUnit, packageUnitsFor, toBaseUnit } from "@/core/products";
import type { Product } from "@/core/types";
import { fieldErrors, productSchema } from "@/core/validation";
import { newId } from "@/data/repository";
import { useData, useFinance } from "@/store/finance-store";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { CategorySelect } from "./pickers";
import { cn } from "@/lib/utils";

const UNIT_HELP: Record<string, string> = {
  l: "El precio se compara por litro: un brik de 1 l y una lata de 500 ml se comparan bien.",
  kg: "El precio se compara por kilo (fruta, carne, productos a granel…).",
  docena: "El precio se compara por docena.",
  ud: "Cada unidad cuenta igual: útil si siempre compras el mismo formato.",
};

/**
 * Crear o editar un producto. Puede ser genérico («Bebida energética», en litros) o una variante/marca
 * de otro («V», formato 500 ml). Las variantes heredan la unidad y la categoría del genérico.
 */
export function ProductDialog({ open, onOpenChange, initial, defaultName, defaultParentId, onSaved, onDeleted }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Product | null;
  defaultName?: string;
  defaultParentId?: string | null;
  onSaved?: (p: Product) => void;
  onDeleted?: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={initial ? "Editar producto" : "Nuevo producto"}>
      {open && <ProductForm key={initial?.id ?? `new-${defaultName ?? ""}`} initial={initial} defaultName={defaultName} defaultParentId={defaultParentId}
        onClose={() => onOpenChange(false)} onSaved={onSaved} onDeleted={onDeleted} />}
    </Modal>
  );
}

function ProductForm({ initial, defaultName, defaultParentId, onClose, onSaved, onDeleted }: {
  initial: Product | null;
  defaultName?: string;
  defaultParentId?: string | null;
  onClose: () => void;
  onSaved?: (p: Product) => void;
  onDeleted?: () => void;
}) {
  const d = useData();
  const { save, saveMany, remove, variantsSupported } = useFinance();
  const kids = useMemo(() => childrenMap(d.products), [d.products]);
  const startName = initial?.name ?? (defaultName ? defaultName.charAt(0).toUpperCase() + defaultName.slice(1) : "");
  const [p, setP] = useState<Product>(() => initial ?? {
    id: newId(), name: startName, unit: guessUnit(startName), categoryId: null, parentId: defaultParentId ?? null, packageSize: null,
  });
  const [isVariant, setIsVariant] = useState(!!p.parentId);
  const parent = isVariant ? d.products.find((x) => x.id === p.parentId) : undefined;
  const baseUnit = parent?.unit ?? p.unit;
  const pkgUnits = packageUnitsFor(baseUnit);
  // Formato: valor y unidad tal como los escribe el usuario (500 ml), se guarda convertido (0,5 l)
  const initPkg = () => {
    if (!p.packageSize) return { text: "", unit: pkgUnits[0].unit };
    const best = [...pkgUnits].reverse().find((u) => p.packageSize! / u.factor >= 1) ?? pkgUnits[0];
    return { text: String(Math.round((p.packageSize / best.factor) * 1000) / 1000).replace(".", ","), unit: best.unit };
  };
  const [pkg, setPkg] = useState(initPkg);
  const unitTouched = useRef(!!initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Unidad sugerida por el nombre mientras no se elija a mano (solo productos nuevos y genéricos)
  useEffect(() => { if (!unitTouched.current && !isVariant) setP((x) => ({ ...x, unit: guessUnit(x.name) })); }, [p.name, isVariant]);
  // Si cambia la unidad base, la unidad del formato debe ser compatible
  useEffect(() => { if (!pkgUnits.some((u) => u.unit === pkg.unit)) setPkg((x) => ({ ...x, unit: pkgUnits[0].unit })); }, [baseUnit]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mientras no se elija a mano, la unidad del formato se deduce del número: 500 → ml, 1,5 → l; 250 → g, 2 → kg; 6 → ud
  const pkgUnitTouched = useRef(!!p.packageSize);
  useEffect(() => {
    if (pkgUnitTouched.current) return;
    const v = parseAmount(pkg.text);
    if (v === null || v <= 0) return;
    const guess = baseUnit === "l" ? (v >= 20 ? "ml" : "l") : baseUnit === "kg" ? (v >= 10 ? "g" : "kg") : baseUnit === "docena" ? (v > 1 ? "ud" : "docena") : baseUnit;
    if (guess !== pkg.unit && pkgUnits.some((u) => u.unit === guess)) setPkg((x) => ({ ...x, unit: guess }));
  }, [pkg.text, baseUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownAndVariantIds = new Set([p.id, ...(kids.get(p.id) ?? []).map((k) => k.id)]);
  const purchases = d.transactionItems.filter((i) => i.productId && ownAndVariantIds.has(i.productId)).length;
  const unitChanged = !!initial && !initial.parentId && !isVariant && initial.unit !== p.unit;
  const generics = d.products.filter((x) => !x.parentId && x.id !== p.id).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const canBeVariant = variantsSupported && !(kids.get(p.id)?.length); // un genérico con variantes no puede pasar a ser variante
  const pkgValue = pkg.text.trim() ? parseAmount(pkg.text) : null;
  const pkgBase = pkgValue && pkgValue > 0 ? toBaseUnit(pkgValue, pkg.unit, baseUnit) : null;

  async function submit() {
    if (isVariant && !parent) return setErrors({ parentId: "Elige de qué producto es variante" });
    if (pkg.text.trim() && !(pkgValue && pkgValue > 0)) return setErrors({ packageSize: "Escribe un formato válido (p. ej. 500)" });
    const row: Product = {
      ...p,
      name: p.name.trim(),
      parentId: isVariant ? parent!.id : null,
      unit: isVariant ? parent!.unit : p.unit,
      categoryId: isVariant ? parent!.categoryId : p.categoryId,
      packageSize: variantsSupported ? pkgBase : null,
    };
    const r = productSchema.safeParse(row);
    if (!r.success) return setErrors(fieldErrors(r.error));
    const clash = d.products.find((x) => x.id !== row.id && (x.parentId ?? null) === row.parentId && normalize(x.name) === normalize(row.name));
    if (clash) return setErrors({ name: row.parentId ? `Ya existe esa variante en ${parent!.name}` : "Ya tienes un producto con ese nombre" });
    if (unitChanged && purchases > 0 && !confirm(
      `Este producto tiene ${purchases} compras registradas en «${initial!.unit}». Si lo cambias a «${row.unit}», sus precios antiguos y los nuevos ` +
      `no serán comparables. Si son formatos distintos, mejor crea una variante. ¿Cambiar la unidad igualmente?`)) return;
    setSaving(true);
    try {
      await save("products", row);
      // Las variantes heredan la unidad y la categoría del genérico
      const variants = kids.get(row.id) ?? [];
      if (!row.parentId && variants.some((v) => v.unit !== row.unit || v.categoryId !== row.categoryId))
        await saveMany("products", variants.map((v) => ({ ...v, unit: row.unit, categoryId: row.categoryId })));
      toast.success(initial ? "Producto guardado" : `Producto «${row.name}» creado`);
      onSaved?.(row);
      onClose();
    } catch (e) {
      toast.error("No se pudo guardar", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!initial) return;
    const nKids = kids.get(initial.id)?.length ?? 0;
    const msg = [
      purchases > 0 ? `Aparece en ${purchases} compras: se conservan con su nombre, pero dejarán de contar en sus estadísticas.` : "",
      nKids > 0 ? `Sus ${nKids} variantes pasarán a ser productos independientes.` : "",
      "¿Eliminar el producto?",
    ].filter(Boolean).join(" ");
    if (!confirm(msg)) return;
    try { await remove("products", initial.id); toast.success("Producto eliminado"); onDeleted?.(); onClose(); }
    catch (e) { toast.error("No se pudo eliminar", { description: (e as Error).message }); }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <Field label="Nombre" error={errors.name}>
        <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder={isVariant ? "Ej. Powerking" : "Ej. Bebida energética"} autoFocus maxLength={80} />
      </Field>

      {(canBeVariant || isVariant) && (
        <Field label="Tipo">
          <Segmented value={isVariant ? "variant" : "generic"} onChange={(v) => setIsVariant(v === "variant")} className="w-full" size="sm"
            options={[{ value: "generic", label: "Producto" }, { value: "variant", label: "Marca / variante de…" }]} />
        </Field>
      )}

      {isVariant ? (
        <Field label="Variante de" error={errors.parentId} hint={parent ? `Se mide en ${parent.unit}, como ${parent.name}. Así se compara con las demás marcas.` : "Ej. «V» es variante de «Bebida energética»"}>
          <Select value={p.parentId ?? ""} onChange={(e) => setP({ ...p, parentId: e.target.value || null })}>
            <option value="">Elige el producto genérico</option>
            {generics.map((g) => <option key={g.id} value={g.id} data-description={`se mide en ${g.unit}`}>{g.name}</option>)}
          </Select>
        </Field>
      ) : (
        <Field label="Se mide en" hint={UNIT_HELP[p.unit] ?? "El precio se compara por esta unidad."}>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...PRODUCT_UNITS, p.unit])].map((u) => (
              <button key={u} type="button" onClick={() => { unitTouched.current = true; setP({ ...p, unit: u }); }}
                className={cn("h-9 min-w-11 rounded-lg border px-3 text-sm font-medium transition-colors cursor-pointer",
                  p.unit === u ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
                {u}
              </button>
            ))}
          </div>
        </Field>
      )}

      {unitChanged && purchases > 0 && (
        <p className="flex gap-2 rounded-xl bg-warning/10 p-2.5 text-xs">
          <TriangleAlert className="size-4 shrink-0 text-warning" />
          Tiene {purchases} compras en «{initial!.unit}»: si cambias la unidad, los precios antiguos y los nuevos no serán comparables.
        </p>
      )}

      {variantsSupported && (
        <Field label="Formato habitual (opcional)" error={errors.packageSize}
          hint={pkgBase ? `Cada envase = ${formatPackage(pkgBase, baseUnit)}. Se propondrá al comprarlo, pero en cada compra puedes elegir otro tamaño.`
            : "Ej. 500 ml. Es solo una sugerencia: en cada compra eliges el tamaño (la misma marca puede venir en 500 ml o 750 ml)."}>
          <div className="flex gap-2">
            <Input inputMode="decimal" className="flex-1" placeholder={baseUnit === "l" ? "500" : baseUnit === "kg" ? "250" : "1"} value={pkg.text}
              onChange={(e) => setPkg({ ...pkg, text: e.target.value })} />
            <Select className="w-24" value={pkg.unit} onChange={(e) => { pkgUnitTouched.current = true; setPkg({ ...pkg, unit: e.target.value }); }} aria-label="Unidad del formato">
              {pkgUnits.map((u) => <option key={u.unit} value={u.unit}>{u.unit}</option>)}
            </Select>
          </div>
        </Field>
      )}

      {!isVariant && (
        <Field label="Categoría (opcional)">
          <CategorySelect categories={d.categories} kind="expense" value={p.categoryId} onChange={(v) => setP({ ...p, categoryId: v })} includeAll />
        </Field>
      )}

      <div className="flex gap-2 pt-1">
        {initial && <Button variant="ghost" className="text-expense" onClick={del}>Eliminar</Button>}
        <Button type="submit" className="ml-auto" disabled={saving}>{initial ? "Guardar" : "Crear producto"}</Button>
      </div>
    </form>
  );
}
