import type { Metadata } from "next";
import Link from "next/link";
import TiendaPreviewHero from "@/components/vender/mi-tienda/TiendaPreviewHero";
import TiendaPreviewKPIs from "@/components/vender/mi-tienda/TiendaPreviewKPIs";
import TiendaPreviewOrders from "@/components/vender/mi-tienda/TiendaPreviewOrders";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import { ChartWrapper } from "@buleje/design-system";

export const metadata: Metadata = {
  title: "Mi Tienda — Preview Seller Buleje",
  description:
    "Preview del panel de vendedor Buleje: pedidos, ingresos, rating y productos.",
  robots: { index: false, follow: false },
};

/**
 * /vender/mi-tienda — Preview dashboard vendedor (demo post-registro).
 *
 * Vista mock sin data real — la cuenta real vive en /admin.
 * Sirve para que el futuro vendedor se haga la idea de qué va a ver.
 */
export default function MiTiendaPreviewPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-raised)]">
      {/* Top bar simple */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/vender"
            className="flex items-center gap-2 text-[var(--text-primary)]"
            aria-label="Buleje Seller"
          >
            <BulejeWordmark size={28} strokeWidth={1.75} textSize={16} />
            <span className="hidden text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] sm:inline">
              Seller · Demo
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-xs font-semibold text-[var(--text-secondary)]">
            <Link href="/vender" className="hover:text-[var(--text-primary)]">
              Volver al inicio
            </Link>
            <span aria-hidden="true" className="text-[var(--text-tertiary)]">
              ·
            </span>
            <Link href="/admin" className="hover:text-[var(--text-primary)]">
              Ir al panel real
            </Link>
          </nav>
        </div>
      </header>

      <TiendaPreviewHero nombreNegocio="Bodega Don Pedro" />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <TiendaPreviewKPIs />

        {/* Chart mock */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Ventas diarias
            </h2>
            <p className="text-xs text-[var(--text-tertiary)]">Últimos 14 días</p>
          </div>
          <ChartWrapper title="Ventas por día">
            <div className="h-48">
              <SalesMockChart />
            </div>
          </ChartWrapper>
        </section>

        <TiendaPreviewOrders />

        {/* Demo disclaimer */}
        <aside className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 text-sm text-[var(--text-secondary)]">
          <strong className="block font-bold text-[var(--text-primary)]">
            Este es un preview con datos ficticios.
          </strong>
          El panel real se activa apenas aprobemos tu solicitud (24h máx). Ahí
          vas a ver los pedidos de verdad, reportes por producto, y puedes
          lanzar promociones en un click.
        </aside>
      </main>
    </div>
  );
}

/**
 * SalesMockChart — mini gráfico SVG con barras de los últimos 14 días.
 * Render SVG puro, sin dependencias extra. Usado sólo en el preview.
 */
function SalesMockChart() {
  // 14 valores mock representando S/ ventas diarias.
  const data = [320, 280, 410, 385, 560, 620, 480, 390, 540, 620, 710, 680, 520, 780];
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return (
    <svg
      viewBox="0 0 560 180"
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label="Gráfico de ventas diarias últimos 14 días"
    >
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* Grid horizontal sutil */}
      <g className="text-[var(--rule-base)]" stroke="currentColor" strokeWidth="1">
        <line x1="0" y1="45" x2="560" y2="45" />
        <line x1="0" y1="90" x2="560" y2="90" />
        <line x1="0" y1="135" x2="560" y2="135" />
      </g>
      {/* Barras */}
      <g className="text-[var(--text-primary)]">
        {data.map((v, i) => {
          const h = ((v - min) / range) * 130 + 20;
          const x = i * 40 + 4;
          const y = 170 - h;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={32}
              height={h}
              rx={4}
              fill="url(#barGrad)"
            />
          );
        })}
      </g>
    </svg>
  );
}
