"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Transaction, TransactionItem, TxType } from "@/core/types";

/** Estado de interfaz (no financiero): diálogos abiertos, privacidad, etc. */
interface TxDialogState {
  open: boolean;
  initial: Partial<Transaction> | null;
  mode: "create" | "edit";
  /** Al duplicar: movimiento original (para copiar también su desglose) */
  sourceId: string | null;
  defaultType: TxType;
  /** Desglose precargado (p. ej. al terminar la compra de la lista) */
  initialItems: TransactionItem[] | null;
  /** Se ejecuta una vez que el movimiento se ha guardado */
  onSaved: (() => void) | null;
  openNew(defaults?: Partial<Transaction>, opts?: { items?: TransactionItem[]; onSaved?: () => void }): void;
  openEdit(tx: Transaction): void;
  openDuplicate(tx: Transaction): void;
  close(): void;
}

export const useTxDialog = create<TxDialogState>((set) => ({
  open: false,
  initial: null,
  mode: "create",
  sourceId: null,
  defaultType: "expense",
  initialItems: null,
  onSaved: null,
  openNew: (defaults, opts) => set({ open: true, mode: "create", initial: defaults ?? null, sourceId: null, initialItems: opts?.items ?? null, onSaved: opts?.onSaved ?? null }),
  openEdit: (tx) => set({ open: true, mode: "edit", initial: tx, sourceId: null, initialItems: null, onSaved: null }),
  openDuplicate: (tx) => {
    const { id: _id, createdAt: _c, attachmentPath: _a, ...rest } = tx;
    set({ open: true, mode: "create", initial: { ...rest, attachmentPath: null }, sourceId: tx.id, initialItems: null, onSaved: null });
  },
  close: () => set({ open: false }),
}));

/** Ocultar importes (para usar la app en público). Preferencia local no sensible. */
export const usePrivacy = create<{ hidden: boolean; toggle(): void }>()(
  persist((set, get) => ({ hidden: false, toggle: () => set({ hidden: !get().hidden }) }), { name: "finanzas-privacy" }),
);

export const useCommand = create<{ open: boolean; setOpen(o: boolean): void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
