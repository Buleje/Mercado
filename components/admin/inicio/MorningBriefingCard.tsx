"use client";

import { useEffect, useState } from "react";
import { m } from "framer-motion";
import {
  AlertTriangle,
  Package,
  ShoppingCart,
  ArrowRight,
  Sparkles,
  X,
  Plus,
} from "@buleje/design-system/icons";

/**
 * MorningBriefingCard — rediseño del antiguo "¡Buenos días!" modal (2026-05-26).
 *
 * Decisión del dueño (rediseño guiado):
 *   · Formato: TARJETA EMBEBIDA en el tab Inicio (NO overlay bloqueante).
 *     El modal centrado anterior tapaba la pantalla y, si los botones quedaban
 *     fuera de viewport, el usuario quedaba atrapado y debía recargar.
 *   · Contenido: tareas accionables + sugerencia contextual + atajos.
 *   · Frecuencia: solo aparece si hay ALGO accionable (fiados/stock/pedidos).
 *   · Estilo: editorial limpio (sin gradientes, mucho aire, tipografía grande).
 *
 * El saludo "Buenos días, {tienda}" ya lo da TodayHub justo debajo — acá NO se
 * repite; esta tarjeta es el "qué hacer hoy".
 */

type BriefingStats = {
  ventasAyer: number;
  pedidosPendientes: number;
  stockBajo: number;
  fiadosVencidos: number;
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(n);
}

type Tone = "error" | "warning" | "info";

interface Task {
  key: string;
  count: number;
  Icon: typeof AlertTriangle;
  text: string;
  cta: string;
  href: string;
  tone: Tone;
}

const TONE: Record<Tone, { bg: string; fg: string }> = {
  error: { bg: "var(--data-error-50)", fg: "var(--data-error-600)" },
  warning: { bg: "var(--data-warning-50)", fg: "var(--data-warning-600)" },
  info: { bg: "var(--data-info-50)", fg: "var(--data-info-600)" },
};

export default function MorningBriefingCard() {
  const [stats, setStats] = useState<BriefingStats | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("superadmin-impersonate-tenant")) return;
      const dateKey = `briefing-dismissed-${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(dateKey) === "1") {
        setDismissed(true);
        return;
      }
    } catch { /* silent */ }

    // Brandon 2026-06-01: flag `cancelled` en vez de AbortController. Abortar el
    // fetch mientras `r.json()` lee el body genera un AbortError que escapa al
    // `.catch` ("signal is aborted without reason") al desmontar (StrictMode
    // double-mount lo dispara siempre) y ensucia la consola. Dejamos terminar el
    // fetch (es barato) y solo ignoramos el resultado si ya se desmontó.
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/stats");
        if (cancelled || !r.ok) return;
        const s = await r.json();
        if (cancelled || !s) return;
        setStats({
          ventasAyer: s.salesYesterday ?? s.totalRevenue ?? 0,
          pedidosPendientes: s.pendingOrders ?? 0,
          stockBajo: s.lowStockCount ?? 0,
          fiadosVencidos: s.overdueDebts ?? 0,
        });
      } catch {
        /* silent — la tarjeta simplemente no aparece */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      const dateKey = `briefing-dismissed-${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(dateKey, "1");
    } catch { /* silent */ }
  };

  if (!stats || dismissed) return null;

  const allTasks: Task[] = [
    {
      key: "fiados",
      count: stats.fiadosVencidos,
      Icon: AlertTriangle,
      text: stats.fiadosVencidos === 1 ? "fiado vencido" : "fiados vencidos",
      cta: "Cobrar",
      href: "/admin?module=fiados",
      tone: "error",
    },
    {
      key: "pedidos",
      count: stats.pedidosPendientes,
      Icon: ShoppingCart,
      text: stats.pedidosPendientes === 1 ? "pedido pendiente" : "pedidos pendientes",
      cta: "Ver pedidos",
      href: "/admin?tab=pedidos",
      tone: "info",
    },
    {
      key: "stock",
      count: stats.stockBajo,
      Icon: Package,
      text: stats.stockBajo === 1 ? "producto por agotarse" : "productos por agotarse",
      cta: "Reponer",
      href: "/admin?tab=inventario",
      tone: "warning",
    },
  ];
  const tasks = allTasks.filter((t) => t.count > 0);

  // Frecuencia: solo si hay algo accionable. Día tranquilo → no molesta.
  if (tasks.length === 0) return null;

  // Sugerencia contextual (prioridad: fiados → pedidos → stock).
  let sugerencia: string;
  if (stats.fiadosVencidos > 0) {
    sugerencia = `Cobrá los fiados vencidos hoy — mientras más esperás, más difícil es recuperar esa plata.`;
  } else if (stats.pedidosPendientes > 0) {
    sugerencia = `Confirmá los pedidos pendientes rápido para no perder la venta.`;
  } else {
    sugerencia = `Repón el stock bajo antes de quedarte sin vender tus productos estrella.`;
  }

  const fecha = new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <m.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      aria-label="Resumen del día"
      className="relative rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-7"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ocultar resumen del día"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Kicker + headline editorial */}
      <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Para hoy · <span className="capitalize">{fecha}</span>
      </p>
      <h2 className="mt-1 max-w-[34ch] text-2xl font-extrabold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]">
        Tenés {tasks.length} {tasks.length === 1 ? "cosa" : "cosas"} por resolver
      </h2>
      <p className="mt-1.5 text-sm font-medium text-[var(--text-secondary)]">
        Ayer vendiste{" "}
        <span className="font-bold tabular-nums text-[var(--text-primary)]">
          {formatCurrency(stats.ventasAyer)}
        </span>
        .
      </p>

      {/* Tareas accionables */}
      <ul className="mt-5 space-y-2.5">
        {tasks.map(({ key, count, Icon, text, cta, href, tone }) => {
          const palette = TONE[tone];
          return (
            <li key={key}>
              <a
                href={href}
                className="group flex items-center gap-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3.5 transition hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: palette.bg, color: palette.fg }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-tight text-[var(--text-primary)]">
                    <span className="tabular-nums">{count}</span> {text}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-extrabold text-[var(--accent)]">
                  {cta}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      {/* Sugerencia contextual */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Sugerencia del día
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-[var(--text-primary)]">
            {sugerencia}
          </p>
        </div>
      </div>

      {/* Atajos rápidos */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <a
          href="/admin?tab=ventas-caja"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-extrabold text-[var(--surface-canvas)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <Plus className="h-4 w-4" />
          Registrar venta
        </a>
        <a
          href="/admin?tab=pedidos"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Ver pedidos
        </a>
      </div>
    </m.section>
  );
}
