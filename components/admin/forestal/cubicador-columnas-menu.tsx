"use client";

/**
 * Las columnas de la tabla del cubicador: cuáles se ven y en qué ORDEN.
 *
 * Todas las de datos se pueden ocultar/mostrar y mover (Brandon, 2026-10-03:
 * «mover o sostener las columnas y cambiarlas de posición»). Sólo «Marcar»
 * (el tilde del PDF/Anexo 04) y «Acciones» quedan fijas en los bordes: son
 * controles, no datos. El orden se cambia arrastrando la cabecera
 * (`useArrastreColumnas`) o, sin mouse, con Subir/Bajar en este menú.
 */
import { ChevronDown, ChevronUp, Columns3, GripVertical, RotateCcw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export type ColOpcional = "numero" | "cant" | "espesor" | "ancho" | "largo" | "medida" | "tipo" | "codigo" | "especie" | "dueno" | "observacion" | "apartado" | "pt" | "m3";

export const COLS_OPCIONALES: { key: ColOpcional; label: string }[] = [
  { key: "numero", label: "N°" },
  { key: "cant", label: "Cant." },
  { key: "espesor", label: "Espesor" },
  { key: "ancho", label: "Ancho" },
  { key: "largo", label: "Largo" },
  { key: "medida", label: "Medida" },
  { key: "tipo", label: "Tipo" },
  /* Sólo se ofrece con `codigoDeTroza` («Producir sin lote»). */
  { key: "codigo", label: "Código" },
  { key: "especie", label: "Especie" },
  { key: "dueno", label: "Dueño" },
  { key: "observacion", label: "Observación" },
  { key: "apartado", label: "Apartado" },
  { key: "pt", label: "Pie tablar" },
  { key: "m3", label: "m³" },
];
const ETIQUETA = Object.fromEntries(COLS_OPCIONALES.map((c) => [c.key, c.label])) as Record<ColOpcional, string>;

export const COLS_DEFAULT: Record<ColOpcional, boolean> = {
  numero: true, cant: true, espesor: true, ancho: true, largo: true,
  medida: true, tipo: true, codigo: true, especie: true, dueno: true, observacion: true, apartado: true, pt: true, m3: true,
};

/** El orden de fábrica, el de siempre: m³ antes que PT (Piezas · m³ · PT en todo el módulo). */
export const COLS_ORDEN_DEFAULT: readonly ColOpcional[] = [
  "numero", "cant", "espesor", "ancho", "largo", "medida", "tipo", "codigo", "especie", "dueno", "observacion", "apartado", "m3", "pt",
];

/**
 * La pista de que el título se puede arrastrar: aparece al pasar el mouse por
 * la cabecera (`group/th` lo pone `useArrastreColumnas`). Va en el padding
 * izquierdo de la `<th>`, así no corre el título.
 */
export function AsaColumna() {
  return (
    <GripVertical
      aria-hidden
      className="pointer-events-none absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover/th:opacity-70"
    />
  );
}

const BTN_MINI = "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-30";

export function MenuColumnas({
  abierto,
  onAlternar,
  visibles,
  onVisibles,
  orden,
  onDesplazar,
  onRestablecerOrden,
  ordenDeFabrica,
  conCodigo,
}: {
  abierto: boolean;
  onAlternar: () => void;
  visibles: Record<ColOpcional, boolean>;
  onVisibles: (next: Record<ColOpcional, boolean>) => void;
  orden: readonly ColOpcional[];
  onDesplazar: (key: ColOpcional, dir: -1 | 1) => void;
  onRestablecerOrden: () => void;
  ordenDeFabrica: boolean;
  conCodigo: boolean;
}) {
  const lista = orden.filter((k) => k !== "codigo" || conCodigo);
  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAlternar(); }}
        title="Elegir y ordenar las columnas de la tabla"
        aria-label="Elegir columnas visibles"
        aria-expanded={abierto}
        className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${abierto ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
      >
        <Columns3 className="h-4 w-4" /> Columnas
      </button>
      {abierto && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-20 mt-1 w-[16rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center gap-1 px-2 py-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Columnas visibles y orden</p>
            <InfoTip
              what="Marca las columnas que quieres ver. Para cambiar el orden, mantén apretado el título de una columna en la tabla y arrástralo, o usa las flechas de acá."
              example="Llevar «Especie» al lado de «Cant.» para dictar más rápido."
            />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {lista.map((key, i) => (
              <li key={key} className="flex items-center gap-1 rounded-lg pr-1 hover:bg-[var(--surface-sunken)]">
                <label className="flex flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={visibles[key]}
                    onChange={(e) => onVisibles({ ...visibles, [key]: e.target.checked })}
                    className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
                  />
                  {ETIQUETA[key]}
                </label>
                <button type="button" onClick={() => onDesplazar(key, -1)} disabled={i === 0} aria-label={`Subir ${ETIQUETA[key]} (más a la izquierda)`} title="Más a la izquierda" className={BTN_MINI}>
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => onDesplazar(key, 1)} disabled={i === lista.length - 1} aria-label={`Bajar ${ETIQUETA[key]} (más a la derecha)`} title="Más a la derecha" className={BTN_MINI}>
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-col border-t border-[var(--rule-soft)] pt-1">
            <button
              type="button"
              onClick={() => onVisibles(COLS_DEFAULT)}
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-bold text-[var(--accent)] hover:bg-primary/10"
            >
              Restablecer todas
            </button>
            {!ordenDeFabrica && (
              <button
                type="button"
                onClick={onRestablecerOrden}
                className="inline-flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-bold text-[var(--accent)] hover:bg-primary/10"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restablecer orden
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
