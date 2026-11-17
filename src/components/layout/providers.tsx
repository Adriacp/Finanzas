"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={(resolvedTheme as "light" | "dark") ?? "system"} position="top-center" richColors closeButton toastOptions={{ className: "!rounded-2xl" }} />;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <ThemedToaster />
    </ThemeProvider>
  );
}
