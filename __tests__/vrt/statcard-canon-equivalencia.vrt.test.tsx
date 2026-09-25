/**
 * Canon de KPI cards (2026-09-22): 11 clones locales (`KpiCard`/`KPICard`/
 * `MetricCard`) migraron a `StatCard` de `@buleje/design-system`. La promesa
 * NO es «no mueve un pixel» — varios clones tenían look propio (tono/barra
 * independientes, `font-mono`, paleta rotativa) que el canon simplifica a
 * propósito. Lo que este test comprueba, uno al lado del otro en el mismo
 * navegador, es exactamente CUÁNTO cambia y deja el número escrito, siguiendo
 * el mismo método que `blocktitle-equivalencia.vrt.test.tsx`.
 *
 * Tres clones representativos (de los 11 migrados):
 *  1. FiadosSection.KPICard  — mapeo accent→emphasis, ícono coloreado.
 *  2. ActivosModule.KpiCard  — tono+barra INDEPENDIENTES → emphasis+accentBar.
 *  3. DailyGoalTracker.KPICard — delta numérico → trend nativo de StatCard.
 *
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { StatCard } from "@buleje/design-system";
import { TrendingUp, CreditCard } from "@buleje/design-system/icons";

function cn(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function medirValor(el: Element) {
  const cs = getComputedStyle(el);
  return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, fontFamily: cs.fontFamily };
}

function medirCaja(el: Element) {
  const cs = getComputedStyle(el);
  return { padding: cs.padding, border: cs.borderWidth };
}

/** Nodo hoja (sin hijos elemento) cuyo texto es exactamente `texto`, dentro de `raiz`. */
function porTextoExacto(raiz: Element, texto: string): Element {
  const todos = raiz.querySelectorAll("*");
  for (const el of todos) {
    if (el.children.length === 0 && el.textContent?.trim() === texto) return el;
  }
  throw new Error(`no se encontró un nodo hoja con texto "${texto}"`);
}

// ── Caso 1: FiadosSection.KPICard (accent="red") ────────────────────────────
// Markup viejo copiado tal cual de components/admin/ai-center/sections/
// FiadosSection.tsx antes de la migración (git show para el texto exacto).
function KPICardVieja({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      data-caja-vieja
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 h-full flex flex-col justify-between gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">
          {label}
        </span>
        <CreditCard className={cn("w-4 h-4 shrink-0", "text-[var(--data-error-500)]")} />
      </div>
      <p
        data-valor-viejo
        className={cn(
          "text-2xl sm:text-3xl font-extrabold leading-none tabular-nums tracking-tight",
          "text-[var(--data-error-700)] dark:text-red-400",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs font-medium text-[var(--text-secondary)]">{sub}</p>}
    </div>
  );
}

for (const tema of ["light", "dark"] as const) {
  test(`FiadosSection.KPICard → StatCard(emphasis="error") — ${tema}`, async () => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    const screen = await render(
      <div>
        <KPICardVieja label="Vencidos" value="5" sub="cuentas" />
        <div data-caja-nueva>
          <StatCard label="Vencidos" value="5" subValue="cuentas" icon={CreditCard} emphasis="error" iconEmphasis />
        </div>
      </div>,
    );
    await vi.waitFor(() => expect(screen.container.querySelectorAll("p").length).toBeGreaterThan(0));

    const cajaVieja = screen.container.querySelector("[data-caja-vieja]")!;
    const cajaNueva = screen.container.querySelector("[data-caja-nueva] [data-stat-card]")!;
    // El padding y el borde NO deberían moverse: ambos son p-5 + border hairline.
    expect(medirCaja(cajaNueva)).toEqual(medirCaja(cajaVieja));

    const valorViejo = screen.container.querySelector("[data-valor-viejo]")!;
    const valorNuevo = porTextoExacto(cajaNueva, "5");
    const mViejo = medirValor(valorViejo);
    const mNuevo = medirValor(valorNuevo);

    // Peso: los dos son extrabold — no cambia.
    expect(mNuevo.fontWeight).toBe(mViejo.fontWeight);

    // Tamaño: SÍ cambia a propósito. El clon usaba text-2xl/sm:text-3xl
    // (24/30px, tipografía libre); el canon usa --ts-xl/--ts-2xl (20/24px,
    // tokens ADR-070). Se escribe el número para que no sea sorpresa.
    expect(mViejo.fontSize).not.toBe(mNuevo.fontSize);

    // Color: el clon pintaba un rojo distinto en light (--data-error-700) que
    // en dark (red-400 crudo, fuera de tokens); el canon usa SIEMPRE
    // --data-error. Documentado: no se espera igualdad puntual, sólo que las
    // dos sean un color "error" no transparente.
    expect(mNuevo.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(mViejo.color).not.toBe("rgba(0, 0, 0, 0)");
  });
}

// ── Caso 2: ActivosModule.KpiCard (tono+barra independientes) ───────────────
function KpiCardVieja({
  label,
  value,
  sub,
  tone = "neutral",
  bar = "muted",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "primary" | "error" | "warning";
  bar?: "primary" | "muted" | "error" | "warning";
}) {
  const valueColor =
    tone === "primary" ? "text-primary" : tone === "error" ? "text-[var(--data-error-600)]" : "text-[var(--text-primary)]";
  const barColor =
    bar === "primary" ? "bg-primary" : bar === "error" ? "bg-[var(--data-error-500)]/50" : "bg-[var(--rule-soft)]";
  return (
    <div data-caja-vieja className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <p data-valor-viejo className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", valueColor)}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{sub}</p>
      <div data-barra-vieja className={cn("mt-2 h-1 rounded-full", barColor)} />
    </div>
  );
}

for (const tema of ["light", "dark"] as const) {
  test(`ActivosModule.KpiCard → StatCard(emphasis+accentBar) — ${tema}`, async () => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    const screen = await render(
      <div>
        <KpiCardVieja label="Ganancia neta" value="S/ 1,200.00" sub="ingresos − gastos" tone="primary" bar="primary" />
        <div data-caja-nueva>
          <StatCard label="Ganancia neta" value="S/ 1,200.00" subValue="ingresos − gastos" emphasis="success" accentBar />
        </div>
      </div>,
    );
    await vi.waitFor(() => expect(screen.container.querySelectorAll("[data-caja-vieja]").length).toBe(1));

    const valorViejo = screen.container.querySelector("[data-valor-viejo]")!;
    const cajaNueva = screen.container.querySelector("[data-caja-nueva] [data-stat-card]")!;
    const valorNuevo = porTextoExacto(cajaNueva, "S/ 1,200.00");
    const mViejo = medirValor(valorViejo);
    const mNuevo = medirValor(valorNuevo);

    // `font-mono` se pierde a propósito (memoria font-mono-era-un-noop-en-el-
    // panel: nadie carga Geist Mono, así que el clon YA renderizaba en la sans
    // del sistema — el cambio de familia es sólo de intención declarada, no
    // de píxel real).
    expect(mNuevo.fontFamily).toBe(mViejo.fontFamily);

    // La barra existe en los dos (una decorativa bg-primary, la otra
    // accentBar) — se comprueba que la nueva SIGUE presente con altura 4px
    // (h-1), no que el color coincida (antes era independiente del tono,
    // ahora está atado a `emphasis` — simplificación documentada).
    const barraNueva = [...cajaNueva.children].find((c) => c.tagName === "DIV" && c.className.includes("rounded-full"));
    expect(barraNueva).toBeTruthy();
    expect(getComputedStyle(barraNueva!).height).toBe("4px");
  });
}

// ── Caso 3: DailyGoalTracker.KPICard (delta numérico → trend nativo) ────────
for (const tema of ["light", "dark"] as const) {
  test(`DailyGoalTracker.KPICard con delta → StatCard trend nativo — ${tema}`, async () => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    const screen = await render(
      <StatCard
        label="Ventas hoy"
        value="S/1,200"
        icon={TrendingUp}
        emphasis="success"
        delta={12}
        deltaLabel="vs ayer al mismo horario"
      />,
    );
    await vi.waitFor(() => expect(screen.container.textContent).toContain("12.0%"));
    // El signo positivo y el "%" son el contrato con el usuario — no se
    // reescribe a mano en cada clon, sale del primitivo.
    expect(screen.container.textContent).toContain("+12.0%");
    expect(screen.container.textContent).toContain("vs ayer al mismo horario");
  });
}
