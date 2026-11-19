"use client";
import {
  ArrowLeftRight, CalendarDays, ChartPie, Ellipsis, Eye, EyeOff, FileText, Goal, LayoutDashboard, Plus, Repeat, Search, Settings,
  Tags, Wallet, PiggyBank, ShoppingBasket, Store, LoaderCircle, TriangleAlert, Database,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isDemoMode, isSupabaseConfigured } from "@/lib/config";
import { getSupabase } from "@/lib/supabase/client";
import { LocalRepository } from "@/data/local-repository";
import { SupabaseRepository } from "@/data/supabase-repository";
import { useFinance } from "@/store/finance-store";
import { useCommand, usePrivacy, useTxDialog } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TransactionDialog } from "@/components/forms/transaction-form";
import { CommandPalette } from "./command-palette";
import { ConnectionBanner } from "./connection-banner";

export const NAV = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/transactions", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/analytics", label: "Análisis", icon: ChartPie },
  { href: "/products", label: "Productos", icon: ShoppingBasket },
  { href: "/merchants", label: "Comercios", icon: Store },
  { href: "/budgets", label: "Presupuestos", icon: PiggyBank },
  { href: "/accounts", label: "Cuentas", icon: Wallet },
  { href: "/recurring", label: "Recurrentes", icon: Repeat },
  { href: "/goals", label: "Objetivos", icon: Goal },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/categories", label: "Categorías", icon: Tags },
  { href: "/reports", label: "Informes", icon: FileText },
  { href: "/settings", label: "Ajustes", icon: Settings },
] as const;

const MOBILE_TABS = [NAV[0], NAV[1], null, NAV[2]] as const;

/** Evita arrancar la carga de datos dos veces en paralelo. */
let booting = false;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function AppShell({ children }: { children: ReactNode }) {
  const { status, error, init, reload, schemaOutdated } = useFinance();
  const router = useRouter();
  const path = usePathname();
  const openNew = useTxDialog((s) => s.openNew);
  const setCmd = useCommand((s) => s.setOpen);
  const { hidden, toggle } = usePrivacy();
  const [more, setMore] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const lastSync = useRef(Date.now());

  // Arranque: elegir repositorio (Supabase o demo local) y cargar datos.
  // `booting` se marca ANTES de cualquier espera: React puede ejecutar este efecto
  // dos veces seguidas (modo estricto) y no debe arrancar (ni sembrar datos) dos veces.
  useEffect(() => {
    if (isSupabaseConfigured) {
      const sb = getSupabase();
      const shouldBoot = !booting && useFinance.getState().status === "idle";
      if (shouldBoot) booting = true;
      sb.auth.getUser().then(({ data }) => {
        if (!data.user) { booting = false; return router.replace("/login"); }
        setEmail(data.user.email ?? null);
        if (shouldBoot) init(new SupabaseRepository(sb, data.user.id));
      });
    } else if (isDemoMode && !booting && useFinance.getState().status === "idle") {
      booting = true;
      init(new LocalRepository());
    }
  }, [init, router]);

  // Cierre de sesión (en esta u otra pestaña)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data: sub } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        booting = false;
        useFinance.getState().reset();
        router.replace("/login");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  // Sincronización entre dispositivos: recargar al volver a la app
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - lastSync.current > 20_000 && useFinance.getState().status === "ready") {
        lastSync.current = Date.now();
        reload();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  // Atajos de teclado: N = nuevo movimiento, Ctrl/Cmd+K = buscador
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd(true); }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "n" && !document.querySelector("[role=dialog]")) { e.preventDefault(); openNew(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNew, setCmd]);

  useEffect(() => setMore(false), [path]);

  // Acceso directo de la PWA: /transactions?new=1 abre el formulario
  useEffect(() => {
    if (status === "ready" && new URLSearchParams(window.location.search).get("new") === "1") openNew();
  }, [status, openNew]);

  if (!isSupabaseConfigured && !isDemoMode) return <SetupRequired />;
  if (status === "error") return <FullScreenError message={error ?? "Error"} onRetry={async () => { await reload(); if (useFinance.getState().status !== "ready") window.location.reload(); }} />;
  if (status !== "ready") return <FullScreenLoader />;

  return (
    <div className="min-h-dvh">
      <ConnectionBanner />
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Finanzas</span>
        </div>
        <div className="px-3 pb-3">
          <Button className="w-full justify-start" onClick={() => openNew()}>
            <Plus /> Añadir movimiento <kbd className="ml-auto rounded bg-white/20 px-1.5 text-[10px]">N</kbd>
          </Button>
          <button onClick={() => setCmd(true)} className="mt-2 flex h-9 w-full items-center gap-2 rounded-xl border border-border bg-background/60 px-3 text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            <Search className="size-4" /> Buscar… <kbd className="ml-auto text-[10px]">Ctrl K</kbd>
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                isActive(path, n.href) ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <n.icon className="size-[18px]" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          {isDemoMode ? (
            <Link href="/settings" className="flex items-center gap-2 rounded-xl bg-warning/15 px-3 py-2 text-[12px] font-medium text-foreground">
              <Database className="size-4 text-warning" /> Modo demo · datos locales
            </Link>
          ) : (
            <p className="truncate px-3">{email}</p>
          )}
        </div>
      </aside>

      {/* Cabecera móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-4 pt-safe backdrop-blur-xl lg:hidden">
        <Logo />
        <span className="font-semibold tracking-tight">Finanzas</span>
        {isDemoMode && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium">Demo</span>}
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={hidden ? "Mostrar importes" : "Ocultar importes"}>{hidden ? <EyeOff /> : <Eye />}</Button>
          <Button variant="ghost" size="icon" onClick={() => setCmd(true)} aria-label="Buscar"><Search /></Button>
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 pt-5 pb-32 md:px-8 md:pt-8 lg:pb-12">
          <div className="hidden justify-end lg:flex -mb-2">
            <Button variant="ghost" size="sm" onClick={toggle} className="text-muted-foreground">
              {hidden ? <EyeOff /> : <Eye />} {hidden ? "Mostrar importes" : "Ocultar importes"}
            </Button>
          </div>
          {schemaOutdated && (
            <div className="mb-4 flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>Hay funciones nuevas que necesitan actualizar la base de datos. Ejecuta en Supabase → SQL Editor los archivos pendientes de <code className="text-xs">supabase/migrations</code> (0002 productos y saldos, 0003 marcas de producto, 0004 formato por compra) y recarga.</p>
            </div>
          )}
          <div key={path} className="animate-in">{children}</div>
        </div>
      </main>

      {/* Barra inferior móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-safe backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {MOBILE_TABS.map((n, i) =>
            n ? (
              <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 text-[10px] font-medium", isActive(path, n.href) ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="size-[22px]" /> {n.label}
              </Link>
            ) : (
              <div key={i} className="flex justify-center">
                <button onClick={() => openNew()} aria-label="Añadir movimiento"
                  className="-mt-6 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 cursor-pointer">
                  <Plus className="size-7" />
                </button>
              </div>
            ),
          )}
          <button onClick={() => setMore(true)} className={cn("flex flex-col items-center gap-0.5 text-[10px] font-medium cursor-pointer", more ? "text-primary" : "text-muted-foreground")}>
            <Ellipsis className="size-[22px]" /> Más
          </button>
        </div>
      </nav>

      <Modal open={more} onOpenChange={setMore} title="Más secciones" size="sm">
        <div className="grid grid-cols-3 gap-2">
          {NAV.slice(3).map((n) => (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-2 rounded-2xl border border-border p-3 text-xs font-medium", isActive(path, n.href) ? "bg-accent text-accent-foreground" : "bg-card")}>
              <n.icon className="size-6" /> {n.label}
            </Link>
          ))}
        </div>
      </Modal>

      <TransactionDialog />
      <CommandPalette />
    </div>
  );
}

export function Logo() {
  return (
    <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l5-5 4 4 7-8" /></svg>
    </span>
  );
}

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Logo />
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    </div>
  );
}

function FullScreenError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm text-center">
        <TriangleAlert className="mx-auto mb-3 size-8 text-expense" />
        <p className="font-semibold">No se pudieron cargar tus datos</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <Button className="mt-5" onClick={onRetry}>Reintentar</Button>
      </div>
    </div>
  );
}

function SetupRequired() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-lg rounded-3xl border border-border bg-card p-8 shadow-card">
        <Logo />
        <h1 className="mt-4 text-xl font-semibold">Configura Supabase</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crea un archivo <code>.env.local</code> con <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, ejecuta
          la migración <code>supabase/migrations/0001_init.sql</code> y reinicia el servidor. Consulta el README.
        </p>
      </div>
    </div>
  );
}
