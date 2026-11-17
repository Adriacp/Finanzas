"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/app-shell";
import { isDemoMode } from "@/lib/config";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_50%_-10%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]" />
      <div className="w-full max-w-sm animate-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {isDemoMode ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm shadow-card">
            <p className="font-medium">Modo demo activo</p>
            <p className="mt-1 text-muted-foreground">Supabase no está configurado, así que no hay inicio de sesión. Los datos se guardan solo en este navegador.</p>
            <Link href="/" className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground">Entrar en la demo</Link>
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card">{children}</div>
        )}
        {footer && !isDemoMode && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

export function authError(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "Email o contraseña incorrectos.";
  if (/Email not confirmed/i.test(msg)) return "Confirma tu email antes de iniciar sesión (revisa tu bandeja de entrada).";
  if (/User already registered/i.test(msg)) return "Ya existe una cuenta con este email.";
  if (/Password should be/i.test(msg)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/rate limit/i.test(msg)) return "Demasiados intentos. Espera unos minutos.";
  if (/fetch/i.test(msg)) return "No hay conexión con el servidor.";
  return msg;
}

export const validEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());
export const strongPassword = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
