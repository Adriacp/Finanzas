"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Transaction, TxType } from "@/core/types";

/** Estado de interfaz (no financiero): diálogos abiertos, privacidad, etc. */
interface TxDialogState {
  open: boolean;
  initial: Partial<Transaction> | null;
  mode: "create" | "edit";
  defaultType: TxType;
  openNew(defaults?: Partial<Transaction>): void;
  openEdit(tx: Transaction): void;
  openDuplicate(tx: Transaction): void;
  close(): void;
}

export const useTxDialog = create<TxDialogState>((set) => ({
  open: false,
  initial: null,
  mode: "create",
  defaultType: "expense",
  openNew: (defaults) => set({ open: true, mode: "create", initial: defaults ?? null }),
  openEdit: (tx) => set({ open: true, mode: "edit", initial: tx }),
  openDuplicate: (tx) => {
    const { id: _id, createdAt: _c, attachmentPath: _a, ...rest } = tx;
    set({ open: true, mode: "create", initial: { ...rest, attachmentPath: null } });
  },
  close: () => set({ open: false }),
}));

/** Ocultar importes (para usar la app en público). Preferencia local no sensible. */
export const usePrivacy = create<{ hidden: boolean; toggle(): void }>()(
  persist((set, get) => ({ hidden: false, toggle: () => set({ hidden: !get().hidden }) }), { name: "finanzas-privacy" }),
);

export const useCommand = create<{ open: boolean; setOpen(o: boolean): void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
