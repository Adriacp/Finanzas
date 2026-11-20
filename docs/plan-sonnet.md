# Plan 2: arreglos y mejoras

Para ejecutar con Sonnet. **La parte A es obligatoria**; de la B, ejecuta solo las tareas que el usuario indique (por ejemplo: «Ejecuta A, B1 y B3»).
Ejecuta `npm run check` al acabar cada tarea y `npx next build` al final. No hace falta ninguna migración ni tabla nueva en Supabase.

> El plan anterior (precio por unidad, conexión y Origen) ya está hecho y subido.

---

## A1. El origen o comercio «no se guarda» (bug de visualización)

**Causa (ya confirmada):** el valor sí se guarda en el movimiento, pero el botón no lo muestra.
En `src/components/forms/merchant-picker.tsx:42` falta un paréntesis:
```tsx
{value || income ? "Elige o escribe de dónde viene" : "Elige o escribe un comercio"}
```
Se evalúa como `(value || income) ? … : …`, así que con un valor elegido muestra el texto de ayuda.

**Cambio:**
```tsx
{value || (income ? "Elige o escribe de dónde viene" : "Elige o escribe un comercio")}
```
Revisa que no haya otro `||`/`??` mezclado con un ternario sin paréntesis en ese archivo.

## A2. Quitar los adjuntos de tickets

El usuario no los necesita. Se quita la interfaz, pero **se conservan** la columna `attachment_path` y el campo `attachmentPath` del tipo `Transaction`, para no tocar la base de datos. Así, un movimiento que ya tenga adjunto lo conserva al editarlo.

1. `src/components/forms/transaction-form.tsx`:
   - Borrar el estado `file`/`setFile` (línea ~71), el bloque `<Field label="Ticket o factura">` (~336–350) y la función `viewAttachment` (~199).
   - En el guardado (~159–164): quitar la subida y usar `attachmentPath: candidate.attachmentPath`. Quitar el `setFile(null)` (~176).
   - Quitar la llamada `removeAttachment` del borrado (~191).
   - Quitar `initial?.attachmentPath` de la condición de `showMore` (~80).
   - Quitar los imports que queden sin usar (`Paperclip`, `X` si ya no se usa).
2. `src/components/shared.tsx:107`: quitar el icono del clip en la lista de movimientos.
3. `src/data/repository.ts:46-48`: quitar `uploadAttachment`, `attachmentUrl` y `removeAttachment` de la interfaz. Quitar también sus implementaciones en `supabase-repository.ts` (~152–168) y `local-repository.ts` (~122–146), y cualquier test que las use.
4. `grep -rn "attachment\|receipts" src README.md` y limpiar las menciones de la interfaz o el README (no las del tipo, la validación, los CSV o `recurring.ts`, que solo copian `null`).
5. **No** borrar el bucket `receipts` ni la migración 0001.

---

## B. Propuestas opcionales

### B1. Atajos de movimientos frecuentes (recomendado)
Añadir un gasto habitual en el móvil cuesta demasiados toques. En Inicio, mostrar una fila de 4–6 «atajos» calculados del historial, sin tabla nueva.
- `src/core/insights.ts`: `frequentTemplates(txs, now, limit = 6)`.
  - Agrupar los movimientos de los últimos 90 días (no transferencias, con `status: "paid"`) por `type + normalize(concept) + merchant + categoryId`.
  - Ordenar por número de veces y devolver `{ type, concept, merchant, categoryId, subcategoryId, accountId, paymentMethod, lastAmount, count }`.
  - Descartar los grupos con `count < 2`. Añadir un test.
- En Inicio (`src/app/(app)/page.tsx`), arriba en el móvil: chips con desplazamiento horizontal, sin desbordar (`overflow-x-auto`, `-mx-4 px-4`). Cada chip lleva el icono de la categoría, el concepto y el último importe.
- Al tocar un chip se abre el formulario prellenado con fecha y hora actuales y el último importe seleccionado. Revisar `useTxDialog` en `src/store/ui-store.ts`: si `openNew` no acepta datos iniciales, añadir un parámetro opcional `initial?: Partial<Transaction>`.

### B2. Botón «Actualizar datos»
La app instalada en el iPhone no tiene «deslizar para recargar».
- En la hoja «Más» del móvil y en Ajustes, añadir un botón «Actualizar datos». Llama a `useFinance.getState().reload()` con spinner y muestra `toast.success("Datos actualizados")` o el error.

### B3. Carga con esqueleto en vez de pantalla completa
- En `app-shell.tsx`, `FullScreenLoader` tapa toda la app al arrancar. Cambiarlo por la estructura normal (cabecera, barra inferior y barra lateral) con bloques grises animados (`animate-pulse bg-muted rounded-2xl`) en el contenido.
- Así la app parece abrir al instante.

### B4. Gestos en la lista de movimientos (móvil)
- En `src/components/shared.tsx` (fila de movimiento): al deslizar a la izquierda aparecen «Duplicar» y «Eliminar» (este último pide confirmación).
- Hacerlo con pointer events y `transform: translateX`, sin librerías nuevas. Umbral de 72 px; deslizar en vertical no debe activarlo.
- En escritorio no cambia nada.

### B5. Productos en la barra inferior
- Ahora la barra inferior del móvil es: Inicio · Movimientos · + · Análisis · Más.
- Como el usuario usa mucho Productos, proponer: Inicio · Movimientos · + · Productos · Más, con Análisis dentro de «Más».
- Es un cambio de una línea en `MOBILE_TABS` (`app-shell.tsx`). **Preguntar al usuario antes de hacerlo.**

### B6. Lista de la compra (pedida por el usuario: ejecutar siempre)

Lista compartida entre dispositivos, conectada con Productos: para cada artículo muestra el último precio y dónde sale más barato. Al acabar la compra, crea el movimiento con el desglose ya hecho.

**Datos: tabla nueva `shopping_items`, migración 0005.** Necesita tabla para sincronizarse entre el móvil y el ordenador; `localStorage` no se sincroniza. El usuario tendrá que ejecutar el SQL en Supabase. Mientras no lo haga, la app funciona y la lista avisa de que falta la migración.
1. `supabase/migrations/0005_shopping_list.sql`. Copia el patrón de `products` en `0002_products_balances.sql`: RLS, políticas por `user_id = auth.uid()`, el trigger de propietario y los índices. Columnas:
   - `id uuid pk`, `user_id uuid not null`
   - `product_id uuid null references products(id) on delete set null`
   - `name text not null` (máx. 80)
   - `quantity numeric null`, `note text null` (máx. 120)
   - `checked boolean not null default false`
   - `sort_order int not null default 0`, `created_at timestamptz default now()`
2. Documentar la migración en el README junto a las 0001–0004.

**Core y datos** (copia cómo se añadió `products` en el plan anterior):
- `src/core/types.ts`:
  - `ShoppingItem { id, productId: ID | null, name, quantity: number | null, note: string | null, checked: boolean, sortOrder: number, createdAt }`.
  - Añadir `shoppingItems: ShoppingItem[]` a `FinanceData`.
- `src/core/validation.ts`: `shoppingItemSchema`.
- `src/data/repository.ts`:
  - Añadir `shoppingItems` a `EntityMap`, a `ENTITY_ORDER` y a `OPTIONAL_ENTITIES`, para que, si falta la tabla, `loadAll` devuelva `[]` y marque `schemaOutdated`.
  - Exponer el flag `shoppingSupported`, igual que `variantsSupported`.
- `supabase-repository.ts` (tabla `shopping_items`), `local-repository.ts` (demo) y `sample.ts`: 3–4 artículos de ejemplo.
- `src/store/finance-store.ts`: exponer `shoppingSupported`. Las altas, cambios y bajas usan el `save`/`remove` genérico existente.
- En el aviso de `schemaOutdated` de `app-shell.tsx`, mencionar «0005 lista de la compra».
- `src/core/shopping.ts` (puro, con tests):
  - `shoppingInsights(items, products, txItems, txs)` → para cada artículo con producto: `lastUnitPrice` (de `lastUnitPrice()` en `products.ts`), `cheapestMerchant` (de `productStats`) y un importe estimado.
  - `estimatedTotal(...)`.
  - `bestMerchantForList(...)`: el comercio con más artículos de la lista que sale más barato. Si no hay datos, `null`.

**Página `src/app/(app)/shopping/page.tsx`:**
- Añadir `{ href: "/shopping", label: "Lista de la compra", icon: ListChecks }` en `NAV` (`app-shell.tsx`), después de Productos.
- Arriba, una caja «Añadir a la lista»:
  - Reutiliza el selector de productos del desglose (`ProductPicker` de `items-editor.tsx`). Si no se puede reutilizar tal cual, extráelo a su propio archivo.
  - Se puede elegir un producto o escribir texto libre (`productId: null`).
  - Al pulsar Enter se añade y el campo se vacía.
- Lista de pendientes:
  - Cada fila lleva un check grande (48 px de alto en el móvil), el nombre, la cantidad editable y, en gris, «último 1,20 € · más barato en Spar».
  - Tocar la fila la marca o desmarca, con un cambio optimista.
- Sección plegable «En el carro (n)» con los marcados (tachados), y el botón «Quitar marcados».
- Pie fijo en el móvil, por encima de la barra inferior:
  - «Estimado: 23,40 €» y, si existe, «Te sale más barato en HiperDino».
  - Botón «Terminar compra»: abre el formulario de movimiento con tipo Gasto y comercio = el mejor (o vacío). El desglose viene precargado con los artículos marcados que tienen producto: cantidad 1 o la indicada, y el último precio.
  - Al guardar el movimiento, borrar los marcados de la lista. Necesitarás que `useTxDialog.openNew` acepte `initial` e `items` iniciales, y una devolución al guardar, o un flag en `ui-store`. Elige lo más simple.
- Si `shoppingSupported` es falso: estado vacío con el aviso «Ejecuta la migración 0005 en Supabase → SQL Editor».
- Diseño coherente con la página de Productos: tarjetas `rounded-2xl`, `tabular` en los importes y sin desbordar en 375 px.

**Accesos extra:**
- En el detalle de un producto (`products/page.tsx`), botón «Añadir a la lista».
- Atajo en el `CommandPalette` si es fácil.

**Pruebas:**
- Tests de `shopping.ts`.
- Comprobar en la demo, a 375 px: añadir, marcar, «Terminar compra», y que el movimiento se crea con el desglose y la lista se limpia.

---

## Cierre
- `npm run check` y `npx next build`.
- Si el servidor de desarrollo crea un `AGENTS.md` en la raíz, bórralo antes del commit.
- Commit en español y push. El hook pre-push ejecuta `npm run check`.
