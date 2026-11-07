"use client";

/**
 * Piezas que comparten las seis secciones de Contabilidad: el selector de mes,
 * la cabecera (título + ⓘ + mes + acciones), el cargador con su error y la
 * marca «cuadra». Todo con tokens; nada propio de tabla ni de botón.
 */
import type { ReactNode } from "react";
import { LoadingState } from "@buleje/design-system";
import { Check, ChevronLeft, ChevronRight, RefreshCw, X } from "@buleje/design-system/icons";
import { CabeceraVista } from "@/components/admin/inventario/movimientos/CabeceraVista";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { mesActualLima, moverMes } from "@/hooks/use-mes-contable";
import type { EstadoContabilidad } from "@/hooks/use-contabilidad-datos";
import { mesConAnio } from "../resultado/fuentes";

/** Monto en soles; vacío (—) cuando es cero y `vacioSiCero`. Sin símbolo en las columnas de las tablas. */
/** `-0,00` no existe para una persona: lo que redondea a cero sale «S/ 0.00». */
export const soles = (n: number): string => formatCurrency(Math.abs(n) < 0.005 ? 0 : n);
export const columna = (n: number): string => (Math.abs(n) < 0.005 ? "" : formatCurrency(n, { withSymbol: false }));

export function SelectorDeMes({ mes, onMes }: { mes: string; onMes: (m: string) => void }) {
  const esActual = mes >= mesActualLima();
  const flecha = button({ variant: "secondary", size: "icon", className: "h-12 w-12 shrink-0 rounded-xl" });
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Mes">
      <button type="button" className={flecha} onClick={() => onMes(moverMes(mes, -1))} aria-label="Mes anterior">
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <span className="min-w-[8.5rem] text-center text-base font-bold text-[var(--text-primary)]" aria-live="polite">
        {mesConAnio(mes)}
      </span>
      <button type="button" className={flecha} onClick={() => onMes(moverMes(mes, 1))} disabled={esActual} aria-label="Mes siguiente">
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

interface CabeceraProps {
  titulo: string;
  /** La línea de ayuda en español simple (va en el ⓘ del título). */
  ayuda: string;
  mes?: string;
  onMes?: (m: string) => void;
  accion?: ReactNode;
  acciones?: MenuAccion[];
  onActualizar?: () => void;
}

export function CabeceraConta({ titulo, ayuda, mes, onMes, accion, acciones = [], onActualizar }: CabeceraProps) {
  const menu: MenuAccion[] = onActualizar ? [...acciones, { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: onActualizar }] : acciones;
  return (
    <div className="space-y-2">
      <CabeceraVista
        titulo={titulo}
        ayuda={{ what: ayuda }}
        secciones={mes && onMes ? <SelectorDeMes mes={mes} onMes={onMes} /> : undefined}
        accion={accion}
        acciones={menu}
        tituloMenu="Más"
      />
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{ayuda}</p>
    </div>
  );
}

/** Cargando / error con «Reintentar» / el contenido. */
export function Cargador<T>({ estado, children }: { estado: EstadoContabilidad<T>; children: (datos: T) => ReactNode }) {
  if (estado.cargando) return <LoadingState />;
  if (estado.error || !estado.datos) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{estado.error ?? "No se pudo cargar."}</p>
        <button type="button" onClick={estado.recargar} className={button({ variant: "secondary", className: "h-12 shrink-0 gap-2 rounded-xl" })}>
          <RefreshCw className="h-4 w-4" aria-hidden />Reintentar
        </button>
      </div>
    );
  }
  return <>{children(estado.datos)}</>;
}

/** ✓ Cuadra (verde) o «No cuadra» (rojo, con la diferencia si se sabe). */
export function Cuadra({ ok, diferencia }: { ok: boolean; diferencia?: number }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-success-ink)]">
      <Check className="h-4 w-4" aria-hidden />Cuadra
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-error-ink)]" role="status">
      <X className="h-4 w-4" aria-hidden />No cuadra{diferencia !== undefined && ` (${soles(diferencia)})`}
    </span>
  );
}

type Tono = "neutro" | "ok" | "aviso" | "info";
const TONOS: Record<Tono, string> = {
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]",
  ok: "bg-[var(--data-success-50)] text-[var(--data-success-ink)] border-[var(--data-success-500)]",
  aviso: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] border-[var(--data-warning-500)]",
  info: "bg-[var(--data-info-50)] text-[var(--data-info-ink)] border-[var(--data-info-500)]",
};

export function Insignia({ tono = "neutro", children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${TONOS[tono]}`}>
      {children}
    </span>
  );
}

/** Un bloque con borde, el contenedor estándar de las tarjetas de esta sección. */
export function Bloque({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] ${className}`}>{children}</section>
  );
}

export const FRASE_VACIA = "text-sm text-[var(--text-secondary)]";
