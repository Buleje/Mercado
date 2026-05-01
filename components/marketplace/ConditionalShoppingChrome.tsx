"use client";

/**
 * Renderiza widgets de compra (StickyCart, BottomNav, FloatingWidgets) **solo**
 * en rutas de shopping. Se oculta en flujos de inscripción/onboarding como
 * `/marketplace/repartidor/*`, donde no hay contexto de compra.
 */
import { usePathname } from "next/navigation";

const HIDE_PREFIXES = [
  "/marketplace/repartidor",
  "/marketplace/aplicar",
  "/marketplace/onboarding",
  "/marketplace/vender",
];

export default function ConditionalShoppingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (HIDE_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <>{children}</>;
}
