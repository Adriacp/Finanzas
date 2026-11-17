# Finanzas — gestión financiera personal

Aplicación web (PWA instalable) para controlar ingresos, gastos, presupuestos, suscripciones y objetivos de ahorro.
Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Recharts · Zustand · Supabase (PostgreSQL + Auth + Storage).

---

## 1. Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena las variables (ver abajo)
npm run dev                  # http://localhost:3000
```

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm test` | Tests unitarios de la lógica de negocio (Vitest) |
| `npm run lint` | Comprobación de tipos (TypeScript) |
| `npm run build && npm start` | Build de producción |

### Modo demo (sin Supabase)
Si no configuras Supabase y `NEXT_PUBLIC_ENABLE_DEMO=true`, la app arranca en **modo demo**: todo funciona, pero los
datos se guardan **solo en ese navegador** (localStorage), sin login ni sincronización. Sirve para probarla.
En *Ajustes → Cargar datos de ejemplo* tienes 6 meses de datos realistas. **No lo uses para tus datos reales.**

---

## 2. Configurar Supabase (persistencia real y multi-dispositivo)

1. Crea un proyecto en <https://supabase.com> (el plan gratuito sirve).
2. **SQL Editor → New query**: pega y ejecuta `supabase/migrations/0001_init.sql`.
   Crea las tablas, índices, Row Level Security, el trigger de perfil y el bucket privado `receipts` para los tickets.
3. **Project Settings → API**: copia la *Project URL* y la *anon public key* en `.env.local`:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<tu-proyecto>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key (es pública por diseño; la seguridad la da RLS) |
   | `NEXT_PUBLIC_SITE_URL` | URL de la app (`http://localhost:3000` en local, tu dominio en producción) |
   | `NEXT_PUBLIC_ENABLE_DEMO` | `false` en producción |

4. **Authentication → URL Configuration**:
   - *Site URL*: el mismo valor que `NEXT_PUBLIC_SITE_URL`.
   - *Redirect URLs*: añade `<SITE_URL>/auth/callback` (confirmación de email y recuperación de contraseña).
5. Reinicia `npm run dev`. Regístrate: al primer inicio de sesión se crean tus categorías y cuentas por defecto.

> **Nunca** pongas la `service_role` key en el frontend ni en variables `NEXT_PUBLIC_*`. Esta app no la necesita.

### Despliegue
Vercel (recomendado): importa el repo, añade las 4 variables de entorno y despliega. HTTPS es obligatorio para la PWA.

---

## 3. Arquitectura

```
src/
├─ core/            ← Lógica de negocio PURA (TS sin React/Next/DOM). Reutilizable tal cual en iOS.
│  ├─ types.ts         modelo de dominio
│  ├─ finance.ts       saldos, patrimonio, totales, agregaciones (transferencias excluidas de ingresos/gastos)
│  ├─ budgets.ts       presupuestos efectivos por mes, umbrales 50/75/90/100 %
│  ├─ recurring.ts     frecuencias, próximos cobros, coste mensual/anual
│  ├─ goals.ts         progreso y ahorro mensual necesario
│  ├─ insights.ts      duplicados, sugerencia de categoría, gastos inusuales, previsiones, resumen mensual
│  ├─ filters.ts       búsqueda y filtros combinables (>50, <20, #etiqueta…)
│  ├─ csv.ts           importación de extractos bancarios y exportación CSV
│  ├─ validation.ts    esquemas Zod de todos los formularios
│  └─ core.test.ts     21 tests
├─ data/            ← Acceso a datos (patrón repositorio)
│  ├─ repository.ts          interfaz FinanceRepository
│  ├─ supabase-repository.ts implementación real (PostgreSQL + Storage)
│  ├─ local-repository.ts    implementación del modo demo
│  └─ sample.ts              datos de ejemplo
├─ store/           ← Estado (Zustand) con mutaciones optimistas y rollback. Sin dependencias web.
├─ components/      ← UI: primitivas (ui/), formularios, gráficos, layout
├─ lib/             ← Supabase clients, exportadores (Excel/PDF), utilidades
├─ app/             ← Rutas (App Router): (app)/* privadas, (auth)/* públicas, auth/callback
└─ proxy.ts         ← Refresco de sesión y protección de rutas (Next 16 “proxy”, antes middleware)
supabase/migrations ← Esquema SQL + RLS + Storage
public/sw.js        ← Service worker (PWA)
```

**Flujo de datos**: UI → store (Zustand) → `FinanceRepository` → Supabase. La UI nunca llama a Supabase directamente.

**Decisiones clave**
- *Carga completa + cálculo en cliente*: al iniciar se cargan todos los datos del usuario (paginados de 1000 en 1000)
  y todas las estadísticas se calculan en memoria con `core/`. Para un uso personal (decenas de miles de movimientos)
  es instantáneo y permite filtros y gráficos sin latencia. Si algún día se queda corto, se pueden mover agregaciones
  a vistas/RPC de PostgreSQL sin tocar la UI.
- *Importes siempre positivos* + `type` (gasto/ingreso/transferencia/reembolso). Los reembolsos restan gasto, las
  transferencias solo mueven saldo entre cuentas.
- *Saldos calculados* (saldo inicial + movimientos pagados); los pendientes/programados no afectan al saldo.
- *Sincronización entre dispositivos*: todo vive en PostgreSQL; la app recarga al volver al primer plano.

### Seguridad
- Row Level Security en **todas** las tablas: `user_id = auth.uid()` para leer y escribir.
- Trigger que impide referenciar cuentas/categorías de otro usuario.
- Bucket `receipts` privado; cada usuario solo accede a `receipts/<su-uid>/…`; URLs firmadas de 10 minutos.
- Restricciones `CHECK` en BD (importes > 0, tipos válidos, transferencias con destino distinto…) además de Zod en el cliente.
- Cabeceras de seguridad (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Los datos financieros no se guardan en localStorage (salvo en el modo demo, que lo indica claramente).
  El service worker no cachea respuestas de Supabase.

---

## 4. Funcionalidades

| Área | Estado |
|---|---|
| Dashboard (patrimonio, disponible, ingresos/gastos/balance, % ahorro, comparación con periodo anterior, pendientes, presupuestos, últimos movimientos, categorías, evolución) con 9 periodos | ✅ |
| Movimientos: alta rápida (botón + tecla `N`), editar, duplicar, eliminar, selección múltiple, todos los campos pedidos, adjunto de ticket (foto/PDF) | ✅ |
| Categorías y subcategorías: crear, editar, eliminar (con reasignación de movimientos), reordenar, icono, color, descripción, necesario/prescindible | ✅ |
| Cuentas: tipos, entidad, saldo inicial, saldo calculado, moneda, color, archivar; transferencias neutras | ✅ |
| Presupuestos global / categoría / subcategoría, generales o de un mes, avisos 50/75/90/100 %, historial y gráfico | ✅ |
| Recurrentes y suscripciones: frecuencias, próximos pagos, totales mensual/anual, activos/cancelados, registrar pago, registrar vencidos | ✅ |
| Análisis: por categoría/subcategoría (drill-down), evolución, comparación entre meses y años, días de mayor gasto, medias, fijos/variables, necesarios/prescindibles, patrimonio, previsión, dónde ahorrar | ✅ |
| Objetivos de ahorro con ahorro mensual necesario y aportaciones | ✅ |
| Calendario mensual con gastos, ingresos, pendientes y recurrentes previstos | ✅ |
| Buscador global (`Ctrl/Cmd + K`), filtros combinables y vistas favoritas guardadas | ✅ |
| Informes CSV, Excel y PDF por periodo/categoría/cuenta/tipo; copia de seguridad y restauración (JSON) | ✅ |
| Registro, login, recuperación de contraseña, RLS | ✅ (requiere Supabase) |
| Inteligentes: duplicados, autocompletado de comercios, sugerencia de categoría (historial + reglas), gastos inusuales, resumen y comparación mensual, suscripciones poco usadas, previsión de gasto y ahorro, importación CSV bancario | ✅ |
| Modo claro/oscuro, responsive mobile-first, ocultar importes, PWA instalable | ✅ |

### Limitaciones conocidas (v1)
- **Supabase no se ha probado contra un proyecto real** en este entorno (no había credenciales). El flujo completo
  se ha verificado con el repositorio local del modo demo, que implementa la misma interfaz; el SQL y el repositorio
  Supabase están escritos y tipados pero conviene probarlos al conectar tu proyecto.
- **Multimoneda**: cada cuenta guarda su moneda, pero los totales se suman sin conversión de divisas.
- **Avisos de presupuesto**: son notificaciones dentro de la app (al registrar un gasto). Las notificaciones push
  llegarán con la app nativa.
- **Recurrentes**: los cobros se registran con un toque (o “Registrar todos” los vencidos); no se generan solos en segundo plano
  (requeriría un cron en Supabase, ver hoja de ruta).
- **CSV**: se asume UTF-8. Si tu banco exporta en Latin-1 y ves caracteres raros, vuelve a guardarlo como UTF-8.
- La copia de seguridad JSON no incluye los archivos adjuntos (siguen en Supabase Storage).
- Sin sincronización en tiempo real: los cambios de otro dispositivo aparecen al volver a abrir/enfocar la app.

---

## 5. PWA (iPhone ya, antes de la app nativa)
La app incluye `manifest.webmanifest`, iconos generados, `apple-touch-icon`, `viewport-fit=cover` con *safe areas*
y un service worker. En el iPhone: **Safari → Compartir → Añadir a pantalla de inicio**. Se abre a pantalla completa.

## 6. Hoja de ruta hacia iOS nativo (Expo / React Native)
1. Convertir el repo en monorepo (pnpm/Turborepo): `packages/core` (= `src/core`), `packages/data`
   (= `src/data` + `src/store`), `apps/web` (Next) y `apps/mobile` (Expo Router).
2. `core`, `store` y `SupabaseRepository` funcionan sin cambios en React Native (`@supabase/supabase-js` +
   `AsyncStorage`/`expo-secure-store` para la sesión).
3. Los nombres de iconos son de Lucide → `lucide-react-native`. Los colores/tokens de `globals.css` se exportan a NativeWind.
4. Gráficos: `victory-native` o `react-native-skia` reutilizando las series que ya calcula `core/finance.ts`.
5. Face ID: `expo-local-authentication` para desbloquear la app. Push: `expo-notifications` + Supabase Edge Function
   programada (cron) que evalúe presupuestos y próximos cobros y genere los recurrentes automáticamente.
6. Cámara para tickets: `expo-image-picker` → mismo bucket `receipts`.
