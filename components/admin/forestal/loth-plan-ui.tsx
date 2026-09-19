/**
 * Átomos visuales de la vista Plan de manejo: el bloque con su título, el botón
 * que pliega, y los campos, la tabla y las pastillas que comparten el editor de
 * especies, el censo y el formulario.
 */

import type { ReactNode } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ChevronDown, Plus, ShieldAlert, type LucideIcon } from "@buleje/design-system/icons";
import { CATEGORIA_COLOR, CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";

/**
 * Un bloque de la vista: título de bloque (`CardTitle`, h3) con su bajada y sus
 * acciones en UNA fila, y el contenido abajo.
 *
 * Antes cada panel traía su propia cabecera —unas en h3 negrita, otras en h4
 * gris en mayúsculas— y los ocho títulos de la página pesaban lo mismo: nada
 * decía qué mandaba. Ahora la vista tiene un solo `SectionTitle` y todos los
 * bloques cuelgan de él con el mismo peso.
 */
export function BloquePlan({ id, titulo, sub, acciones, children, className = "" }: {
  id: string;
  titulo: ReactNode;
  sub?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className={`overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] ${className}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule-soft)] px-4 py-3">
        {/* `grow basis-*` y no `flex-1`: con base 0 el título nunca pide
            renglón y se monta sobre las acciones a 400 px. */}
        <div className="min-w-0 grow basis-[14rem]">
          <CardTitle id={`${id}-titulo`}>{titulo}</CardTitle>
          {sub && <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">{sub}</p>}
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * El botón que muestra u oculta un grupo (indicadores, una tabla de edición).
 * Mismo aspecto que el de las secciones del libro (`LothSeccionKpis`): borde
 * de acento cuando está abierto, flecha que gira.
 */
export function BotonPlegar({ abierto, onClick, controla, label, icon: Icono, titulo, compacto = false }: {
  abierto: boolean;
  onClick: () => void;
  /** id del panel que muestra/oculta (`aria-controls`). */
  controla: string;
  label: string;
  icon: LucideIcon;
  titulo?: string;
  /** Sólo el ícono en móvil (el texto queda para el lector de pantalla). */
  compacto?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-controls={controla}
      title={titulo}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
        abierto
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icono className="h-4 w-4" aria-hidden="true" />
      <span className={compacto ? "max-sm:sr-only" : undefined}>{label}</span>
      <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

/** Una cifra de la línea que se ve con el grupo plegado: rótulo suave, número fuerte. */
export function CifraLinea({ label, valor, tono }: { label?: string; valor: string; tono?: "ok" | "warn" | "danger" }) {
  const color =
    tono === "danger" ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      : tono === "warn" ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : tono === "ok" ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          : "text-[var(--text-primary)]";
  return (
    <span className="whitespace-nowrap">
      <b className={`font-mono font-bold tabular-nums ${color}`}>{valor}</b>
      {label && <span className="text-[var(--text-secondary)]"> {label}</span>}
    </span>
  );
}

export const cls = "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]";
// Input compacto para edición inline dentro de celdas de tabla (alineado a la derecha).
export const editCls = "w-24 h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20";
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>{children}</label>;
}
export function Table({ head, children, alto }: { head: string[]; children: ReactNode; alto?: string }) {
  /* Sin un div de scroll alrededor: `DataTable` ya trae su caja, y dos cajas
     anidadas despegan el `<thead>` fijo. Con `alto`, la tabla scrollea adentro
     y la cabecera queda arriba: un censo de miles de árboles no empuja el
     croquis tres pantallas más abajo. */
  return (
    <DataTable className="w-full text-sm" stickyHeader={Boolean(alto)} wrapperClassName={alto}>
      <thead className="bg-[var(--surface-sunken)] text-left">
        <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2 font-bold text-[var(--text-primary)] ${i >= 2 ? "text-right" : ""}`}>{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </DataTable>
  );
}
export function Cell({ children, right }: { children: ReactNode; right?: boolean }) {
  return <td className={`px-4 py-2.5 ${right ? "text-right" : ""}`}>{children}</td>;
}
export function Mono({ children, bold }: { children: ReactNode; bold?: boolean }) {
  return <span className={`font-mono tabular-nums text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}>{children}</span>;
}
export function AddBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-success-700)] px-3 text-xs font-bold text-white hover:opacity-90"><Plus className="h-3.5 w-3.5" />Agregar</button>;
}
export function CitesPill() {
  return <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]"><ShieldAlert className="h-2.5 w-2.5" />CITES</span>;
}
export function EstadoTag({ estado }: { estado: string }) {
  const m: Record<string, string> = {
    en_pie: "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
    talado: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
    descartado: "bg-[var(--data-error-100)] text-[var(--data-error-700)]",
  };
  const label: Record<string, string> = { en_pie: "En pie", talado: "Talado", descartado: "Descartado" };
  return <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${m[estado] ?? "bg-[var(--surface-sunken)]"}`}>{label[estado] ?? estado}</span>;
}

/** Badge de la categoría POA — el filtro legal que decide si el árbol se tumba. */
export function CategoriaTag({ categoria }: { categoria?: keyof typeof CATEGORIA_LABEL }) {
  if (!categoria) return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold"
      style={{ backgroundColor: `${CATEGORIA_COLOR[categoria]}22`, color: CATEGORIA_COLOR[categoria] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORIA_COLOR[categoria] }} aria-hidden="true" />
      {CATEGORIA_LABEL[categoria]}
    </span>
  );
}
