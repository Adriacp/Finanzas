# Plan: precio por unidad, reconexión y «Origen» en ingresos

Para ejecutar con Sonnet. Cada tarea es independiente; hazlas en orden y ejecuta `npm run check` al final de cada una.
No hace falta migración de base de datos.

## Contexto rápido
- App Next.js + Zustand + Supabase. Lógica pura en `src/core` (con tests vitest), UI en `src/app/(app)` y `src/components`.
- Los productos guardan cantidades en su unidad (`ud`, `kg`, `g`, `l`, `ml`…). `fmt()` formatea dinero con 2 decimales.

---

## 1. Precio por unidad mal redondeado (bug)

**Causa:** en `src/core/products.ts`, `productStats` redondea los precios medios por unidad con `round2` (líneas ~115, 118, 125, 156, 160).
Yakisoba 1,42 € / 93 g = 0,0153 €/g y Maggi 1,97 € / 90 g = 0,0219 €/g: los dos quedan en 0,02.
Además se **ordena** con el valor redondeado, así que el orden de «más barata» puede salir mal.

**Cambios:**
1. En `src/core/products.ts`, quitar `round2` de todos los `avgUnitPrice` (medias de producto, variantes, comercios y `cheapestMerchant`). Solo `lineTotal` y los totales en euros siguen redondeados.
2. Crear en `src/core/products.ts` una función `formatUnitPrice(pricePerUnit: number, unit: string, fmt: (n: number) => string): string`:
   - `g` → mostrar por kg (precio × 1000, «€/kg»); `ml` → por l (× 1000, «€/l»); `cl` → por l (× 100).
   - El resto: `fmt(precio)` + `/unidad`. Si el precio es < 0,10, usar 3 o 4 decimales significativos (por ejemplo, `Intl.NumberFormat` con `maximumSignificantDigits: 3`) para que nunca salga 0,00.
3. Sustituir los `${fmt(x.avgUnitPrice)}/${unit}` por `formatUnitPrice(...)` en:
   - `src/app/(app)/products/page.tsx`, líneas ~129, 191, 194, 208 y 216. Para el `Stat` de la 208, cambiar la etiqueta a «Precio medio» y poner la unidad dentro del valor.
   - `src/app/(app)/merchants/page.tsx`, líneas ~102, 103 y 109.
   - En la página de productos, cambiar el subtítulo «Comparadas por precio por g» para que use la unidad mostrada (kg).
4. Test en `src/core/products.test.ts`: dos variantes con 1,42 €/93 g y 1,97 €/90 g → la de 93 g sale primero, con precios distintos. `formatUnitPrice(0.0153, "g")` debe contener «15,27» y «€/kg».

**Fuera de alcance:** el campo «Precio / g» del formulario (`items-editor.tsx`) ya acepta 3 decimales; no tocarlo.

## 2. Botón de reintentar al perder conexión

**Situación:** con la app instalada en el iPhone no hay botón de recargar del navegador. El store ya tiene `reload()` (`src/store/finance-store.ts:146`), que vuelve a pedir los datos y pone `error` si falla.

**Cambios:**
1. Crear `src/components/layout/connection-banner.tsx` (componente cliente):
   - Escucha `online`/`offline` de `window` y usa `navigator.onLine` como estado inicial.
   - Lee `error` del store.
   - Se muestra si no hay conexión **o** si hay `error`. Es una barra fija arriba, con `pt-safe` si existe esa utilidad; si no, `env(safe-area-inset-top)`.
   - Textos: «Sin conexión» / «No se pudieron cargar los datos».
   - Botón «Reintentar»: llama a `reload()`, muestra un spinner mientras tanto y, si sigue fallando, ofrece «Recargar la app» (`window.location.reload()`).
   - Al volver el evento `online`, llamar a `reload()` automáticamente y mostrar un toast «Conexión recuperada» (sonner).
2. Montarlo en `src/components/layout/app-shell.tsx`.
3. Si `status === "error"` tiene ya una pantalla propia (buscar `status === "error"` en `src/`), añadirle el mismo botón «Reintentar».
4. Probar en el navegador con DevTools → Network → Offline, y luego Online.

## 3. «Comercio» → «Origen» en los ingresos

**Recomendación:** no crear un campo nuevo. Seguir usando `transaction.merchant` y cambiar solo la etiqueta y las sugerencias según el tipo. Así no hay migración y los datos antiguos siguen valiendo.

**Cambios:**
1. `src/core/insights.ts`: `merchantDirectory(txs, kind?: "expense" | "income")`. Si se pasa `kind`, contar solo los movimientos de ese grupo: gasto = `expense` + `refund`; ingreso = `income`. Mantener el comportamiento actual sin parámetro.
2. `src/components/forms/merchant-picker.tsx`: añadir la prop `kind` y pasarla a `merchantDirectory`. Textos según `kind`:
   - Ingreso: título «Origen», placeholder «Buscar o añadir origen…», «Nuevo origen «X»», vacío «Elige o escribe de dónde viene (empresa, cliente, persona…)», icono `Building2` o `HandCoins` en vez de `Store`.
3. `src/components/forms/transaction-form.tsx` (~línea 219):
   - Etiqueta `tx.type === "income" ? "Origen" : "Comercio"`; pasar `kind`.
   - Para ingresos, el concepto automático es «Ingreso de X» en vez de «Compra X».
4. `src/app/(app)/transactions/page.tsx:210`: etiqueta «Comercio / origen» en el filtro.
5. `src/lib/exporters.ts` y `csv-import.tsx`: renombrar la columna a «Comercio / origen». En la importación, aceptar también la cabecera antigua «Comercio».
6. La página Comercios ya filtra por `t.type === "expense"` (`src/core/merchants.ts:49`), así que los ingresos no ensucian las comparaciones; no tocarla.
7. Test en `src/core/products.test.ts` o en un test de insights: `merchantDirectory(txs, "income")` no devuelve comercios de gastos.

---

## Cierre
- Ejecutar `npm run check` y `npx next build`.
- Hacer commit con un mensaje en español. El hook pre-push vuelve a pasar `npm run check`.
- Probar en móvil (375 px): en la página de productos, Fideos instantáneos debe mostrar los precios en €/kg (Kung-Fu, Yakisoba ≈ 15,27 €/kg, Maggi ≈ 21,89 €/kg). Al crear un ingreso debe salir «Origen».
