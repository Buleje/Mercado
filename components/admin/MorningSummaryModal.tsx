'use client';

import { useState, useEffect } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  X,
  Sun,
  Sunrise,
  Moon,
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  Sparkles,
  ArrowRight,
} from "@buleje/design-system/icons";

type SummaryData = {
  ventasAyer: number;
  pedidosPendientes: number;
  stockBajo: number;
  fiadosVencidos: number;
  sugerencia: string;
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const SUGERENCIAS: Record<number, string> = {
  0: "revisa el stock para la semana que viene",
  1: "planifica las compras de la semana",
  2: "revisa pagos pendientes de fiados",
  3: "verifica productos por vencer",
  4: "actualiza precios si hay cambios del proveedor",
  5: "prepara ofertas de fin de semana",
  6: "revisa el desempeño de la semana",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(n);
}

function getGreeting(hour: number): { text: string; Icon: typeof Sun } {
  if (hour < 6) return { text: "Buenas madrugadas", Icon: Moon };
  if (hour < 12) return { text: "Buenos días", Icon: Sunrise };
  if (hour < 19) return { text: "Buenas tardes", Icon: Sun };
  return { text: "Buenas noches", Icon: Moon };
}

export default function MorningSummaryModal() {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<SummaryData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("superadmin-impersonate-tenant")) return;
    } catch { /* silent */ }

    const now = new Date();
    if (now.getHours() >= 12) return;

    const dateKey = `morning-summary-${now.toISOString().slice(0, 10)}`;
    try {
      if (localStorage.getItem(dateKey) === "shown") return;
    } catch { return; }

    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((stats) => {
        const dayOfWeek = now.getDay();
        setData({
          ventasAyer: stats?.salesYesterday ?? stats?.totalRevenue ?? 0,
          pedidosPendientes: stats?.pendingOrders ?? 0,
          stockBajo: stats?.lowStockCount ?? 0,
          fiadosVencidos: stats?.overdueDebts ?? 0,
          sugerencia: SUGERENCIAS[dayOfWeek] ?? "revisa tu negocio",
        });
        setShow(true);
      });
  }, []);

  const dismiss = (rememberLater = false) => {
    setShow(false);
    if (rememberLater) return;
    try {
      const dateKey = `morning-summary-${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(dateKey, "shown");
    } catch { /* silent */ }
  };

  if (!data) return null;

  const now = new Date();
  const dayName = DIAS[now.getDay()];
  const dateLabel = `${dayName} ${now.getDate()} de ${MESES[now.getMonth()]}`;
  const { text: greetingText, Icon: GreetingIcon } = getGreeting(now.getHours());

  const secondaryKpis = [
    {
      label: "Pedidos pendientes",
      value: String(data.pedidosPendientes),
      Icon: ShoppingCart,
      tone: "info" as const,
    },
    {
      label: "Stock bajo",
      value: `${data.stockBajo} ${data.stockBajo === 1 ? "producto" : "productos"}`,
      Icon: Package,
      tone: "warning" as const,
    },
    {
      label: "Fiados vencidos",
      value: String(data.fiadosVencidos),
      Icon: AlertTriangle,
      tone: "error" as const,
    },
  ];

  return (
    <AnimatePresence>
      {show && (
        <m.div
          className="modal-backdrop flex items-center justify-center px-4"
          style={{ zIndex: 9000 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <m.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="morning-summary-title"
            className="relative w-full max-w-lg overflow-hidden rounded-3xl shadow-[var(--elev-4)] ring-1 ring-[var(--rule-soft)]"
            style={{ background: "var(--surface-raised)" }}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* HERO */}
            <div className="relative isolate overflow-hidden px-7 pt-7 pb-8">
              {/* Gradient + sun glow */}
              <div
                aria-hidden
                className="absolute inset-0 -z-10"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-accent) 0%, #00d3c2 45%, #FAFAF7 100%)",
                }}
              />
              <div
                aria-hidden
                className="absolute -top-20 -right-16 -z-10 h-64 w-64 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 65%)",
                }}
              />

              <button
                type="button"
                onClick={() => dismiss(true)}
                aria-label="Cerrar y recordar luego"
                className="absolute right-4 top-4 rounded-full bg-white/30 p-2 text-white backdrop-blur-sm transition hover:bg-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 text-white">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/25 backdrop-blur-sm shadow-[var(--elev-2)]">
                  <GreetingIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">
                    {dateLabel}
                  </p>
                  <h2
                    id="morning-summary-title"
                    className="text-2xl font-extrabold tracking-tight text-white drop-shadow-sm"
                  >
                    ¡{greetingText}!
                  </h2>
                </div>
              </div>

              {/* Hero KPI: Ventas ayer */}
              <div className="mt-7 rounded-2xl bg-white/85 px-5 py-4 backdrop-blur-md ring-1 ring-white/60 shadow-[var(--elev-2)]">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[var(--data-success-600)]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Ventas de ayer
                  </span>
                </div>
                <p className="mt-1 text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(data.ventasAyer)}
                </p>
              </div>
            </div>

            {/* SECONDARY KPIs */}
            <div className="px-7 pt-5">
              <div className="grid grid-cols-3 gap-3">
                {secondaryKpis.map(({ label, value, Icon, tone }) => {
                  const palette = {
                    info: {
                      bg: "var(--data-info-50)",
                      fg: "var(--data-info-600)",
                    },
                    warning: {
                      bg: "var(--data-warning-50)",
                      fg: "var(--data-warning-600)",
                    },
                    error: {
                      bg: "var(--data-error-50)",
                      fg: "var(--data-error-600)",
                    },
                  }[tone];
                  return (
                    <div
                      key={label}
                      className="rounded-2xl border border-[var(--rule-soft)] p-3"
                      style={{ background: "var(--surface-canvas)" }}
                    >
                      <div
                        className="grid h-9 w-9 place-items-center rounded-xl"
                        style={{ background: palette.bg, color: palette.fg }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        {label}
                      </p>
                      <p className="mt-0.5 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                        {value}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SUGERENCIA */}
            <div className="px-7 pt-5">
              <div
                className="flex items-start gap-3 rounded-2xl border border-[var(--accent-muted)] p-4"
                style={{ background: "var(--accent-soft)" }}
              >
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                  style={{ background: "var(--brand-accent)", color: "#fff" }}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Tarea sugerida para hoy
                  </p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-[var(--text-primary)]">
                    Hoy {dayName.toLowerCase()}, {data.sugerencia}.
                  </p>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex items-center gap-2 px-7 pb-7 pt-5">
              <button
                type="button"
                onClick={() => dismiss(true)}
                className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-secondary)] transition hover:bg-[var(--rule-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
              >
                Más tarde
              </button>
              <button
                type="button"
                onClick={() => dismiss(false)}
                className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-[var(--elev-2)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-accent) 0%, #00998d 100%)",
                }}
              >
                Comenzar el día
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
