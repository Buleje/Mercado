"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut } from "@buleje/design-system/icons";
import {
  MotoIcon,
  PinIcon,
  MapBadge,
  CashIcon,
  PackageIcon,
  LiveSignal,
} from "./icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/delivery-app", label: "Pedidos", icon: PackageIcon, exact: true },
  { href: "/delivery-app/mapa", label: "Mapa", icon: MapBadge },
  { href: "/delivery-app/ganancias", label: "Ganancias", icon: CashIcon },
  { href: "/delivery-app/perfil", label: "Perfil", icon: PinIcon },
];

function csrf(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

export default function DeliveryAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [riderName, setRiderName] = useState("Repartidor");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [networkOnline, setNetworkOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    fetch("/api/delivery/me/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.partner) {
          setRiderName(data.partner.name ?? "Repartidor");
          setPartnerId(data.partner.id);
          setIsOnline(Boolean(data.partner.isOnline));
        }
      })
      .catch(() => { /* probe silencioso: si falla, sigue como guest */ });

    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setNetworkOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleToggleOnline = useCallback(async () => {
    if (!partnerId || toggling) {
      setIsOnline((v) => !v);
      return;
    }
    setToggling(true);
    const next = !isOnline;
    try {
      const res = await fetch("/api/delivery/me/online", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ isOnline: next }),
      });
      if (res.ok) setIsOnline(next);
    } catch {
      setIsOnline(next);
    } finally {
      setToggling(false);
    }
  }, [partnerId, toggling, isOnline]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/delivery/me/online", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ isOnline: false }),
      });
    } catch { /* noop */ }
    document.cookie = "buleje-partner-sess=; Max-Age=0; path=/";
    router.push("/delivery-app/login");
  }, [router]);

  const isActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href) && item.href !== "/delivery-app";
  };

  // Pantallas que ocultan chrome (login, detalle de pedido a pantalla completa)
  const isLogin = pathname === "/delivery-app/login";
  const hideChrome = isLogin || pathname.includes("/delivery-app/pedido/") || pathname.includes("/delivery-app/oferta/");

  if (hideChrome) {
    return (
      <>
        {!networkOnline && <NetworkBanner />}
        {children}
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[var(--surface-canvas)]">
      {!networkOnline && <NetworkBanner />}

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:fixed lg:inset-y-0 lg:left-0 border-r border-[var(--rule-base)] bg-[var(--surface-raised)] z-40">
        <div className="px-6 py-6 border-b border-[var(--rule-base)]">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <MotoIcon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                {riderName}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] font-semibold">
                Repartidor Buleje
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleOnline}
            disabled={toggling}
            aria-pressed={isOnline}
            className={`mt-4 w-full h-12 border-2 inline-flex items-center justify-center gap-2 text-sm font-extrabold transition-colors disabled:opacity-60 ${
              isOnline
                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-secondary)]"
            }`}
          >
            <LiveSignal className="h-2.5 w-2.5" active={isOnline} />
            {isOnline ? "En línea — recibiendo pedidos" : "Toca para conectarte"}
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-4 h-12 text-base font-bold transition-colors ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-6 pt-2 border-t border-[var(--rule-base)]">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full h-11 px-4 text-sm font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--brand-danger)] inline-flex items-center gap-2 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile top header ───────────────────────────────────────── */}
      <header
        className="lg:hidden sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="h-10 w-10 bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <MotoIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight truncate">
              Hola, {riderName}
            </p>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] leading-tight">
              {isOnline ? "En línea — recibiendo pedidos" : "Estás desconectado"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleOnline}
            disabled={toggling}
            aria-pressed={isOnline}
            className={`h-10 px-3.5 inline-flex items-center gap-2 text-sm font-extrabold border-2 transition-colors disabled:opacity-60 ${
              isOnline
                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-secondary)]"
            }`}
          >
            <LiveSignal className="h-2.5 w-2.5" active={isOnline} />
            {isOnline ? "Online" : "Offline"}
          </button>
        </div>
      </header>

      {/* ── Contenido principal ─────────────────────────────────────── */}
      <main className="flex-1 lg:pl-72 pb-24 lg:pb-0 min-w-0">
        {children}
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--surface-raised)] border-t border-[var(--rule-base)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[64px] py-2 transition-colors ${
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "scale-110" : ""} transition-transform`} />
                <span className={`text-xs font-extrabold leading-none ${active ? "" : "font-bold"}`}>
                  {item.label}
                </span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-10 bg-[var(--accent)]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function NetworkBanner() {
  return (
    <div className="bg-[var(--brand-danger)] text-white text-center text-sm font-bold py-2 px-4 sticky top-0 z-50">
      Sin conexión — los cambios se enviarán al volver
    </div>
  );
}
