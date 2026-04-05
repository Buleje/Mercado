"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Truck,
  Map,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/delivery-app", label: "Pedidos", icon: Truck, exact: true },
  { href: "/delivery-app/mapa", label: "Mapa", icon: Map },
  { href: "/delivery-app/perfil", label: "Perfil", icon: User },
];

// ── Shell principal ──────────────────────────────────────────────────────────

export default function DeliveryAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Estado online/offline del repartidor (toggle manual)
  const [isOnline, setIsOnline] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Nombre del repartidor desde localStorage (seteado en el login)
  const [riderName, setRiderName] = useState("Repartidor");
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // Estado de conexión a internet del dispositivo
  const [networkOnline, setNetworkOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRiderName(localStorage.getItem("delivery-rider-name") ?? "Repartidor");
    setPartnerId(localStorage.getItem("delivery-partner-id"));
    const online = localStorage.getItem("delivery-is-online");
    if (online !== null) setIsOnline(online === "true");

    function handleOnline() { setNetworkOnline(true); }
    function handleOffline() { setNetworkOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setNetworkOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function handleToggleOnline() {
    if (!partnerId) {
      // Sin partnerId no podemos hacer la llamada — solo cambiamos estado local
      const next = !isOnline;
      setIsOnline(next);
      localStorage.setItem("delivery-is-online", String(next));
      return;
    }

    setToggling(true);
    const next = !isOnline;
    try {
      const res = await fetch("/api/delivery/toggle-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, isOnline: next }),
      });
      if (res.ok) {
        setIsOnline(next);
        localStorage.setItem("delivery-is-online", String(next));
      }
    } catch {
      // Fallo silencioso — actualizar estado local de todas formas
      setIsOnline(next);
      localStorage.setItem("delivery-is-online", String(next));
    } finally {
      setToggling(false);
    }
  }

  // Ocultar bottom nav en la pantalla de pedido individual (tiene su propio header)
  const hideBottomNav = pathname.includes("/delivery-app/pedido/");

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href) && item.href !== "/delivery-app";
  }

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto">
      {/* Banner sin conexión a internet */}
      {!networkOnline && (
        <div className="bg-red-500 text-white text-center text-xs font-bold py-2 px-4">
          Sin conexion a internet — los cambios se enviaran al reconectar
        </div>
      )}

      {/* Header — solo visible fuera del detalle de pedido */}
      {!hideBottomNav && (
        <header
          className="sticky top-0 z-30 bg-[#00B4A6] text-white px-4 shadow-md"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: "12px" }}
        >
          <div className="flex items-center gap-3">
            {/* Logo + nombre */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Truck className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="font-extrabold text-sm leading-tight">Buleje Delivery</p>
                <p className="text-xs text-white/70 truncate leading-tight">{riderName}</p>
              </div>
            </div>

            {/* Toggle Online/Offline */}
            <button
              type="button"
              onClick={handleToggleOnline}
              disabled={toggling}
              aria-label={isOnline ? "Pasar a offline" : "Pasar a online"}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full
                text-xs font-bold border-2 border-white/30
                transition-all active:scale-95
                disabled:opacity-60 disabled:cursor-not-allowed
                min-h-[36px]
                ${isOnline
                  ? "bg-white/20 text-white"
                  : "bg-red-500/30 text-red-200 border-red-300/50"
                }
              `}
            >
              {isOnline
                ? <Wifi className="h-3.5 w-3.5" />
                : <WifiOff className="h-3.5 w-3.5" />
              }
              {isOnline ? "Online" : "Offline"}
            </button>
          </div>
        </header>
      )}

      {/* Contenido principal */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Bottom navigation */}
      {!hideBottomNav && (
        <nav
          className="
            fixed bottom-0 left-0 right-0 z-30
            max-w-md mx-auto
            bg-white dark:bg-gray-900
            border-t border-gray-200 dark:border-gray-800
            shadow-lg
          "
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex-1 flex flex-col items-center justify-center gap-1
                    min-h-[60px] py-2 px-1
                    transition-colors
                    ${active
                      ? "text-[#00B4A6]"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                    }
                  `}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`}
                  />
                  <span
                    className={`text-[10px] font-bold leading-none ${
                      active ? "text-[#00B4A6]" : ""
                    }`}
                  >
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#00B4A6]" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
