/**
 * StorePoliciesBlock — 3 cards: delivery, pagos, devoluciones.
 *
 * Mobile (Brandon, mayo 14 2026): colapsado en un boton "Ver politicas"
 * que al tocar despliega el grid. Asi la seccion no roba scroll en el
 * pie de la pagina cuando el cliente ya esta listo para comprar.
 * Desktop (sm+): grid 3 cols permanente como antes.
 */

import { Truck, Wallet, RefreshCw, ChevronDown } from "@buleje/design-system/icons";

interface PolicyCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function PolicyCard({ icon, title, description }: PolicyCardProps) {
  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden>
        {icon}
      </span>
      <h3 className="text-sm font-bold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function PoliciesGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <PolicyCard
        icon={<Truck className="h-5 w-5" />}
        title="Delivery"
        description="Gratis en pedidos mayores a S/30. Tiempo promedio 25 minutos. Cobertura en tu zona."
      />
      <PolicyCard
        icon={<Wallet className="h-5 w-5" />}
        title="Pagos"
        description="Aceptamos Yape, Plin y efectivo al recibir. Sin recargos por método de pago."
      />
      <PolicyCard
        icon={<RefreshCw className="h-5 w-5" />}
        title="Devoluciones"
        description="Reembolso completo si el producto llega dañado. Reportar por WhatsApp dentro de las 2 horas."
      />
    </div>
  );
}

export default function StorePoliciesBlock() {
  return (
    <section aria-labelledby="store-policies-heading" className="space-y-4 sm:space-y-6">
      {/* Mobile: accordion colapsado por defecto */}
      <details className="sm:hidden group rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-sunken)]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <Truck className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                Políticas
              </p>
              <p
                id="store-policies-heading"
                className="text-base font-extrabold text-[var(--text-primary)] leading-tight"
              >
                Comprar en esta tienda
              </p>
            </div>
          </div>
          <ChevronDown
            className="h-5 w-5 shrink-0 text-[var(--text-secondary)] transition-transform group-open:rotate-180"
            strokeWidth={2.25}
            aria-hidden
          />
        </summary>
        <div className="px-4 pb-4 pt-1">
          <PoliciesGrid />
        </div>
      </details>

      {/* Desktop: header + grid completo permanente */}
      <div className="hidden sm:block space-y-6">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
            Políticas
          </p>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Comprar en esta tienda
          </h2>
        </div>
        <PoliciesGrid />
      </div>
    </section>
  );
}
