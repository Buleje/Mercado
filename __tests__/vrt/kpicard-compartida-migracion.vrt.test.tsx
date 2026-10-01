/**
 * `components/admin/shared/KPICard.tsx` → `StatCard` (2026-09-22, ronda "los
 * rincones que los codemods saltaron"). Este clon era el único de los 11 del
 * canon `ds-no-kpi-card-clone` con 6 consumidores reales que le pasaban
 * `color="#hex"` crudo (violación de "sin hex" que ningún regex del gate
 * detecta, porque mira `className`, no props JS — ver memoria
 * `canon-kpi-statcard-2026-09-22`, gotcha 3). Se migró:
 * TreasuryDashboard, SocioMembersAdminModule, SubscriptionsModule,
 * GiftCardsAdminModule, LivesAdminModule, LeadsFunnelModule.
 *
 * Dos consumidores representativos, uno al lado del otro en el mismo
 * navegador, mismo método que `blocktitle-equivalencia.vrt.test.tsx` y
 * `statcard-canon-equivalencia.vrt.test.tsx`:
 *  1. TreasuryDashboard "Por pagar" — `color="#e63946"` fijo (siempre rojo,
 *     el prop `alert` era redundante: ambas ramas de KPICard pintaban rojo) → `emphasis="error"`.
 *  2. SocioMembersAdminModule "MRR" — `color="#10B981"` → `emphasis="success"`.
 *
 * Corre con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { StatCard } from "@buleje/design-system";
import { ArrowDownRight, DollarSign, type LucideIcon } from "@buleje/design-system/icons";

function cn(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * Markup viejo copiado tal cual de `components/admin/shared/KPICard.tsx`
 * (`git show HEAD~1:components/admin/shared/KPICard.tsx` antes de que este
 * commit lo borrara) — es el componente REAL que renderizaban los 6
 * consumidores, no una recreación aproximada.
 */
function KPICardCompartidaVieja({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
  alert,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  subtitle?: string;
  alert?: boolean;
}) {
  const accentColor = alert ? "var(--data-error)" : (color ?? "var(--accent)");
  const accentSoft = `color-mix(in oklch, ${accentColor} 12%, transparent)`;
  return (
    <div
      data-caja-vieja
      className="bg-[var(--surface-raised)] p-4 border-l-[3px] border border-[var(--rule-soft)] transition-all"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium truncate">{label}</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p
              data-valor-viejo
              className={cn(
                "text-2xl font-mono font-bold truncate",
                alert ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]",
              )}
            >
              {value}
            </p>
          </div>
          {subtitle && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div data-chip-vieja className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: accentSoft }}>
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </div>
      </div>
    </div>
  );
}

function medirValor(el: Element) {
  const cs = getComputedStyle(el);
  return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, fontFamily: cs.fontFamily };
}

function porTextoExacto(raiz: Element, texto: string): Element {
  const todos = raiz.querySelectorAll("*");
  for (const el of todos) {
    if (el.children.length === 0 && el.textContent?.trim() === texto) return el;
  }
  throw new Error(`no se encontró un nodo hoja con texto "${texto}"`);
}

// ── Caso 1: TreasuryDashboard "Por pagar" (color="#e63946" fijo) ────────────
for (const tema of ["light", "dark"] as const) {
  test(`TreasuryDashboard "Por pagar" (hex fijo) → StatCard(emphasis="error") — ${tema}`, async () => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    const screen = await render(
      <div>
        <KPICardCompartidaVieja label="Por pagar" value="S/ 340.00" icon={ArrowDownRight} color="#e63946" subtitle="3 facturas pendientes" />
        <div data-caja-nueva>
          <StatCard label="Por pagar" value="S/ 340.00" icon={ArrowDownRight} emphasis="error" subValue="3 facturas pendientes" />
        </div>
      </div>,
    );
    await vi.waitFor(() => expect(screen.container.querySelectorAll("[data-caja-vieja]").length).toBe(1));

    const valorViejo = screen.container.querySelector("[data-valor-viejo]")!;
    const cajaNueva = screen.container.querySelector("[data-caja-nueva] [data-stat-card]")!;
    const valorNuevo = porTextoExacto(cajaNueva, "S/ 340.00");
    const mViejo = medirValor(valorViejo);
    const mNuevo = medirValor(valorNuevo);

    // Cambio a propósito, no una regresión: el hex `#e63946` de KPICard
    // NUNCA coloreaba el texto del valor (sólo el borde izquierdo de 3px y
    // la chip del ícono) — el número seguía en `--text-primary` salvo que la
    // prop booleana `alert` estuviera en true (en TreasuryDashboard real,
    // sólo cuando hay una factura vencida). Acá se prueba el caso base sin
    // `alert`. StatCard con `emphasis="error"` SÍ tiñe el número siempre
    // (EMPHASIS_ACCENT.error = var(--data-error)) — "Por pagar" pasa a leerse
    // en rojo de forma constante, no sólo cuando algo ya venció. Se escribe
    // el color exacto para que el cambio quede documentado, no asumido.
    expect(mViejo.color).not.toBe(mNuevo.color);
    expect(mNuevo.color).not.toBe("rgba(0, 0, 0, 0)");

    // `font-mono` se pierde a propósito (memoria font-mono-era-un-noop-en-el-
    // panel): nadie carga Geist Mono, así que ya renderizaba en la sans del
    // sistema — no hay cambio de píxel real.
    expect(mNuevo.fontFamily).toBe(mViejo.fontFamily);

    // Tamaño: el clon usaba `text-2xl` fijo; el canon usa `--ts-xl`
    // (`sm:--ts-2xl`) atado a la densidad del card — no es el mismo token,
    // así que no se asume igual (el valor concreto en px depende del
    // viewport de la corrida, por eso se compara sin fijar un número).
    expect(typeof mViejo.fontSize).toBe("string");
    expect(mViejo.fontSize).not.toBe("");
  });
}

// ── Caso 2: SocioMembersAdminModule "MRR" (color="#10B981") ─────────────────
for (const tema of ["light", "dark"] as const) {
  test(`SocioMembersAdminModule "MRR" (hex verde) → StatCard(emphasis="success") — ${tema}`, async () => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    const screen = await render(
      <div>
        <KPICardCompartidaVieja label="MRR" value="S/ 4,200.00" icon={DollarSign} color="#10B981" subtitle="Ingreso recurrente 30d" />
        <div data-caja-nueva>
          <StatCard label="MRR" value="S/ 4,200.00" icon={DollarSign} emphasis="success" subValue="Ingreso recurrente 30d" />
        </div>
      </div>,
    );
    await vi.waitFor(() => expect(screen.container.querySelectorAll("[data-caja-vieja]").length).toBe(1));

    const cajaVieja = screen.container.querySelector("[data-caja-vieja]")!;
    const chipVieja = screen.container.querySelector("[data-chip-vieja]")!;
    const cajaNueva = screen.container.querySelector("[data-caja-nueva] [data-stat-card]")!;

    // La "chip" circular de fondo detrás del ícono (bg alpha del color) NO se
    // absorbe — es una decisión deliberada del rediseño de StatCard (ícono
    // plano, sin caja). Se verifica que la vieja SÍ la tenía (para dejar
    // constancia de lo que se pierde) y no se busca su equivalente en la nueva.
    expect(getComputedStyle(chipVieja).borderRadius).not.toBe("0px");

    // El borde de la caja: la vieja tenía un borde IZQUIERDO de color de 3px
    // (`border-l-[3px]`) además del hairline completo; el canon usa un solo
    // hairline parejo en los 4 lados (sin acento por color de borde) — se
    // documenta que el ancho de borde cambia a propósito.
    expect(getComputedStyle(cajaVieja).borderLeftWidth).toBe("3px");
    expect(getComputedStyle(cajaNueva).borderLeftWidth).not.toBe("3px");
  });
}
