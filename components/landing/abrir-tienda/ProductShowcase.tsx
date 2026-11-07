import { BRAND_GEO } from "@/lib/geo";
import { ShoppingCart, TrendingUp, Store } from "@buleje/design-system/icons";

/**
 * ProductShowcase — "Mirá cómo se ve". La página DESCRIBE beneficios; esta
 * sección los MUESTRA con mockups enmarcados (navegador = tienda online,
 * celular = panel del vendedor). UI representativa en CSS (sin assets externos)
 * para que el bodeguero "vea" el producto antes de registrarse. Brandon puede
 * reemplazar los mockups por screenshots reales sin tocar el layout.
 */
export default function ProductShowcase() {
  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <p className="mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            Mirá cómo se ve
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-[var(--text-primary)]">
            Tu negocio,{" "}
            <span className="font-serif italic text-[var(--accent)]">online y profesional.</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            Así lo ven tus clientes y así lo manejás vos — desde el celular, sin
            instalar nada.
          </p>
        </div>

        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* ── Tienda online (marco navegador) ── */}
          <figure className="min-w-0">
            <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(2,6,23,0.12)]">
              {/* barra del navegador */}
              <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-[var(--data-error-500)]/70" aria-hidden />
                <span className="h-3 w-3 rounded-full bg-[var(--data-warning-500)]/70" aria-hidden />
                <span className="h-3 w-3 rounded-full bg-[var(--accent)]/70" aria-hidden />
                <span className="ml-3 inline-flex flex-1 items-center rounded-md bg-[var(--surface-raised)] px-3 py-1 text-xs font-semibold text-[var(--text-tertiary)]">
                  tutienda.buleje.pe
                </span>
              </div>
              {/* contenido mock de la tienda */}
              <div className="p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    <Store className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold leading-tight text-[var(--text-primary)]">Bodega Don Lucho</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Abierto · {BRAND_GEO.city}</p>
                  </div>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-bold text-white">
                    <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> 3
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { n: "Arroz Costeño", p: "S/ 4.50" },
                    { n: "Aceite Primor", p: "S/ 9.90" },
                    { n: "Leche Gloria", p: "S/ 3.80" },
                    { n: "Inca Kola 1.5L", p: "S/ 8.00" },
                    { n: "Atún Florida", p: "S/ 5.20" },
                    { n: "Fideos Don V.", p: "S/ 2.40" },
                  ].map((it) => (
                    <div key={it.n} className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2">
                      <div className="mb-2 aspect-square rounded-md bg-gradient-to-br from-[var(--surface-sunken)] to-[var(--accent-soft)]" aria-hidden />
                      <p className="truncate text-[11px] font-semibold leading-tight text-[var(--text-secondary)]">{it.n}</p>
                      <p className="text-xs font-extrabold text-[var(--text-primary)]">{it.p}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <figcaption className="mt-4 text-center text-sm font-semibold text-[var(--text-secondary)]">
              Tu tienda online con tu marca — abierta 24/7
            </figcaption>
          </figure>

          {/* ── Panel del vendedor (marco celular) ── */}
          <figure className="mx-auto min-w-0 max-w-[300px]">
            <div className="overflow-hidden rounded-[2rem] border-[6px] border-[var(--text-primary)] bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(2,6,23,0.18)]">
              {/* notch */}
              <div className="flex justify-center bg-[var(--text-primary)] py-1.5">
                <span className="h-1.5 w-16 rounded-full bg-white/30" aria-hidden />
              </div>
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Hoy</p>
                <div className="mt-1 flex items-end gap-2">
                  <p className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] tabular-nums">S/ 248</p>
                  <span className="mb-1 inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                    <TrendingUp className="h-3 w-3" strokeWidth={2.5} aria-hidden /> +18%
                  </span>
                </div>
                {/* mini barras */}
                <div className="mt-4 flex h-16 items-end gap-1.5">
                  {[40, 62, 35, 80, 55, 72, 95].map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-t bg-[var(--accent)]/80"
                      style={{ height: `${h}%` }}
                      aria-hidden
                    />
                  ))}
                </div>
                {/* pedidos */}
                <div className="mt-4 space-y-2">
                  {[
                    { c: "Pedido #1042", s: "Yape · S/ 32" },
                    { c: "Pedido #1041", s: "Efectivo · S/ 18" },
                  ].map((o) => (
                    <div key={o.c} className="flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
                      <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
                      <span className="text-xs font-bold text-[var(--text-primary)]">{o.c}</span>
                      <span className="ml-auto text-xs font-semibold text-[var(--text-secondary)]">{o.s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <figcaption className="mt-4 text-center text-sm font-semibold text-[var(--text-secondary)]">
              Tu panel: ventas, pedidos y stock en vivo
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
