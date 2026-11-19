"use client";
import { LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useFinance } from "@/store/finance-store";

/**
 * Aviso fijo arriba cuando no hay conexión o falla la carga de datos, con botón para reintentar.
 * En la app instalada en el iPhone no hay botón de recargar del navegador, por eso hace falta.
 */
export function ConnectionBanner() {
  const error = useFinance((s) => s.error);
  const reload = useFinance((s) => s.reload);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const wasOffline = useRef(false);

  async function retry() {
    setBusy(true);
    await reload();
    setBusy(false);
    setFailed(!!useFinance.getState().error);
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    wasOffline.current = !navigator.onLine;
    const off = () => { wasOffline.current = true; setOnline(false); };
    const on = async () => {
      setOnline(true);
      if (!wasOffline.current) return;
      wasOffline.current = false;
      await reload();
      if (!useFinance.getState().error) toast.success("Conexión recuperada");
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, [reload]);

  if (online && !error) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[55] border-b border-warning/40 bg-warning/15 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <WifiOff className="size-4 shrink-0 text-warning" />
        <span className="min-w-0 flex-1 truncate">{!online ? "Sin conexión" : "No se pudieron cargar los datos"}</span>
        {failed && (
          <button type="button" onClick={() => window.location.reload()} className="shrink-0 text-xs underline cursor-pointer">Recargar la app</button>
        )}
        <button type="button" onClick={retry} disabled={busy}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-background/80 px-3 text-xs font-medium disabled:opacity-60 cursor-pointer">
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Reintentar
        </button>
      </div>
    </div>
  );
}
