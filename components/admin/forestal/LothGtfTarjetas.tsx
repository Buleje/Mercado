"use client";

/**
 * Las guías (GTF) del Libro TH en el celular (≤639 px): una tarjeta de ~100 px
 * por guía en vez de la fila-tarjeta de la tabla (un rótulo por columna,
 * 10 renglones). Mismos datos, mismas acciones y las mismas casillas de elegir
 * que las tablas `LothGtfTabla` y `LothGtfBajas`, que siguen desde `sm`.
 * Se ven 8 y «Ver más» abre las siguientes: nada se esconde.
 */

import { useState, type ReactNode } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateNumeric } from "@/lib/format";
import { Button } from "@/components/ui-system/Button";
import { cn } from "@/lib/utils";
import AccionesGtf from "./gtf-acciones-menu";
import { CasillaGuia } from "./gtf-seleccion-casillas";
import { EstadosGtf, type FilaGtf, type Gtf } from "./gtf-tabla-columnas";
import type { FilaBaja } from "./LothGtfBajas";
import ChipPapelesGtf from "./ChipPapelesGtf";
import ChipMonteGtf from "./ChipMonteGtf";
import type { SeleccionGuias } from "./hooks/use-seleccion-guias";

const DE_A_POCO = 8;

/** La lista con su «Ver más». */
function Lista<T>({ filas, id, pintar, foco }: { filas: readonly T[]; id: (f: T) => string; pintar: (f: T) => ReactNode; foco?: (f: T) => boolean }) {
  /* Una guía enfocada por la URL entra aunque pase de las 8 primeras. */
  const [mostradas, setMostradas] = useState(() => Math.max(DE_A_POCO, foco ? filas.findIndex(foco) + 1 : 0));
  if (filas.length === 0) return null;
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" data-gtf-tarjetas>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {filas.slice(0, mostradas).map((f) => (
          <li key={id(f)} ref={foco?.(f) ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}>
            {pintar(f)}
          </li>
        ))}
      </ul>
      {filas.length > mostradas && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMostradas((n) => n + DE_A_POCO)}
          className="w-full rounded-t-none rounded-b-2xl border-t border-[var(--rule-soft)]"
        >
          Ver {Math.min(DE_A_POCO, filas.length - mostradas)} más · quedan {filas.length - mostradas}
        </Button>
      )}
    </div>
  );
}

const fecha = (iso: string | null | undefined, soloFecha = true) => (iso ? formatDateNumeric(iso, { soloFecha }) : "—");
const vol = (g: Gtf) => (g.volumenTotalM3 ? `${fmtM3(Number(g.volumenTotalM3))} m³` : "—");
const enfoque = "bg-[var(--data-info-500)]/15 outline outline-2 -outline-offset-2 outline-[var(--data-info-500)]";

/** Las guías vigentes (la página que se ve). */
export function TarjetasGuias({
  filas, seleccion, focusGtf, sinIngresar, onIngresarCtp, onHoja, onResumen, onAnular, onRecargar,
}: {
  filas: readonly FilaGtf[];
  seleccion?: SeleccionGuias;
  focusGtf?: string | null;
  sinIngresar: ReadonlySet<string>;
  onIngresarCtp: (gtfNumber: string) => void;
  onHoja: (g: Gtf) => void;
  onResumen: (g: Gtf) => void;
  onAnular: (id: string) => void;
  onRecargar: () => void;
}) {
  return (
    <Lista
      filas={filas}
      id={(f) => f.g.id}
      foco={(f) => !!focusGtf && f.g.gtfNumber === focusGtf}
      pintar={({ g, estados }) => (
        <div className={cn("space-y-1 px-3 py-2", g.status === "anulada" && "opacity-50", g.gtfNumber === focusGtf && enfoque)}>
          <div className="flex items-center gap-2">
            {seleccion && <CasillaGuia id={g.id} numero={g.gtfNumber} sel={seleccion} />}
            <div className="min-w-0 flex-1">
              <span className="block font-mono font-bold text-[var(--text-primary)]">{g.gtfNumber}</span>
              <span className="block text-xs tabular-nums text-[var(--text-tertiary)]">
                {fecha(g.gtfDate)} · {g.tipo === "producto" ? "Producto" : "Trozas"}
              </span>
            </div>
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{vol(g)}</span>
            <AccionesGtf
              g={g}
              porIngresar={g.tipo !== "producto" && g.status !== "anulada" && sinIngresar.has(g.gtfNumber)}
              onIngresarCtp={onIngresarCtp}
              onHoja={onHoja}
              onResumen={onResumen}
              onAnular={onAnular}
              onRecargar={onRecargar}
            />
          </div>
          <p className="truncate text-sm text-[var(--text-secondary)]">{[g.titularName, g.destino].filter(Boolean).join(" → ") || "—"}</p>
          <div className="flex flex-wrap items-center gap-1 empty:hidden">
            <EstadosGtf estados={estados} />
            <ChipPapelesGtf g={g} />
            <ChipMonteGtf g={g} />
          </div>
        </div>
      )}
    />
  );
}

/** Las guías dadas de baja. */
export function TarjetasBajas({
  filas, seleccion, focusGtf, onHoja, onResumen, conSello,
}: {
  filas: readonly FilaBaja[];
  seleccion?: SeleccionGuias;
  focusGtf?: string | null;
  onHoja: (g: Gtf) => void;
  onResumen: (g: Gtf) => void;
  conSello: (f: FilaBaja) => Gtf;
}) {
  return (
    <Lista
      filas={filas}
      id={(f) => f.g.id}
      foco={(f) => !!focusGtf && f.g.gtfNumber === focusGtf}
      pintar={(fila) => {
        const { g } = fila;
        return (
          <div className={cn("space-y-1 px-3 py-2", g.gtfNumber === focusGtf && enfoque)}>
            <div className="flex items-center gap-2">
              {seleccion && fila.situacion === "Anulada" && <CasillaGuia id={g.id} numero={g.gtfNumber} sel={seleccion} />}
              <div className="min-w-0 flex-1">
                <span className="block font-mono font-bold text-[var(--text-primary)] line-through decoration-[var(--data-error-500)]/60">{g.gtfNumber}</span>
                <span className="block text-xs tabular-nums text-[var(--text-tertiary)]">
                  {fecha(g.gtfDate)} · {g.tipo === "producto" ? "Producto" : "Trozas"} · {vol(g)}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                  fila.situacion === "Anulada"
                    ? "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]"
                    : "bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
                )}
              >
                {fila.situacion}
              </span>
              <AccionesGtf g={g} soloLectura onHoja={() => onHoja(conSello(fila))} onResumen={() => onResumen(conSello(fila))} />
            </div>
            <p className="truncate text-sm text-[var(--text-secondary)]">{[g.titularName, g.destino].filter(Boolean).join(" → ") || "—"}</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Baja {fecha(fila.fechaBaja, false)}
              {fila.motivo ? ` · ${fila.motivo}` : ""}
            </p>
          </div>
        );
      }}
    />
  );
}
