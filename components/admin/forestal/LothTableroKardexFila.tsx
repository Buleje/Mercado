"use client";

/**
 * Un renglón del Kárdex del permiso: cuándo y con qué documento, qué movimiento
 * (con sus avisos), de qué especie, árbol y troza, cuánto entró o salió y cómo
 * quedan los casilleros. Lo que el movimiento cambió va en negrita; una línea
 * anulada se ve tachada y dice «no cuenta».
 */

import { AlertTriangle, FileText } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { MOVIMIENTO_KARDEX, type FilaKardex } from "@/lib/forestal/loth-kardex";
import { fechaKardex, notasDeFila } from "@/lib/forestal/loth-kardex-reporte";
import type { CascadaEspecie } from "@/lib/forestal/loth-saldo-cascada";
import {
  ANULADA_CHIP,
  FIJA,
  NUM,
  SOLO_ESCRITORIO,
  TD,
  TONO_MOV,
  type Casillero,
} from "./loth-kardex-estilos";
import type { NavTablero } from "./LothTableroTabla";

export default function LothTableroKardexFila({
  f,
  s,
  previo,
  casilleros,
  sinBase,
  hoyKey,
  nav,
}: {
  f: FilaKardex;
  s: CascadaEspecie | null;
  previo: CascadaEspecie | null;
  casilleros: Casillero[];
  sinBase: boolean;
  hoyKey: string;
  nav?: NavTablero;
}) {
  const notas = notasDeFila(f, sinBase).filter((n) => !n.startsWith("Anulada"));
  const tachado = f.anulada ? "line-through text-[var(--text-tertiary)]" : "";
  const troza = f.troza && !/^-+$/.test(f.troza) ? f.troza : null;
  const chip = `inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${f.anulada ? ANULADA_CHIP : TONO_MOV[f.movimiento]}`;
  return (
    <tr
      className={`group border-t border-[var(--rule-soft)] ${f.anulada ? "bg-[var(--surface-sunken)]/40" : "hover:bg-[var(--surface-sunken)]"}`}
      data-kardex-fila={f.movimiento}
      data-anulada={f.anulada || undefined}
    >
      <td
        className={`${TD} ${FIJA} whitespace-nowrap bg-[var(--surface-raised)] group-hover:bg-[var(--surface-sunken)]`}
      >
        <span className="block text-[var(--text-primary)]">{fechaKardex(f.dia, hoyKey)}</span>
        <span className={`block font-mono text-xs text-[var(--text-secondary)] ${tachado}`}>
          N° {f.lineNo}
        </span>
        {f.gtf && (
          <button
            type="button"
            onClick={() => nav?.onVerGtf?.(f.gtf as string)}
            className="mt-0.5 flex items-center gap-1 font-mono text-xs font-bold max-sm:flex-nowrap! max-sm:justify-start! text-[var(--data-info-700)] underline-offset-2 hover:underline dark:text-[var(--data-info-500)]"
          >
            <FileText className="h-3 w-3" aria-hidden="true" />
            {f.gtf}
          </button>
        )}
        {/* En el celular: el movimiento y la especie acá, pegados a las cifras. */}
        <span className="mt-1 flex items-center gap-1.5 sm:hidden max-sm:flex-nowrap! max-sm:justify-start!">
          <span className={chip}>{MOVIMIENTO_KARDEX[f.movimiento].label}</span>
          <span className="text-xs text-[var(--text-secondary)]">{f.especie ?? "—"}</span>
          {notas.length > 0 && (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              role="img"
              aria-label={notas.join(". ")}
            />
          )}
        </span>
      </td>
      <td className={`${TD} ${SOLO_ESCRITORIO}`}>
        <div className="w-32 [overflow-wrap:anywhere]">
          <span className={chip} title={MOVIMIENTO_KARDEX[f.movimiento].efecto}>
            {MOVIMIENTO_KARDEX[f.movimiento].label}
          </span>
          {f.anulada && (
            <span
              className="ml-1.5 text-xs font-bold text-[var(--text-tertiary)]"
              title={f.motivoAnulacion ?? undefined}
            >
              Anulada
            </span>
          )}
          {f.movimiento === "trozado" && !f.anulada && f.m3 != null && (
            <span className="block text-xs whitespace-nowrap text-[var(--text-tertiary)]">
              {fmtM3(f.m3)} m³ al patio
            </span>
          )}
          {f.cantidad && (
            <span className="block text-xs text-[var(--text-tertiary)]">{f.cantidad}</span>
          )}
          {f.movimiento === "despacho_producto" && f.m3 != null && !f.anulada && (
            <span className="block text-xs text-[var(--text-tertiary)]">
              {fmtM3(f.m3)} m³ despachados como producto
            </span>
          )}
          {notas.map((n) => (
            <span
              key={n}
              className="mt-0.5 flex items-start gap-1 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {n}
            </span>
          ))}
        </div>
      </td>
      <td className={`${TD} ${SOLO_ESCRITORIO}`}>
        <span className="block w-36 [overflow-wrap:anywhere] text-[var(--text-primary)]">
          {f.especie ?? "—"}
        </span>
        <span className="block w-36 font-mono text-xs [overflow-wrap:anywhere] text-[var(--text-secondary)]">
          {f.arbol ?? "—"}
          {troza && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => nav?.onVerCadena?.(troza)}
                className="font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
              >
                {troza}
              </button>
            </>
          )}
        </span>
      </td>
      <td
        className={`${NUM} ${f.anulada ? tachado : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"}`}
      >
        {f.entraM3 != null ? fmtM3(f.entraM3) : ""}
      </td>
      <td
        className={`${NUM} ${f.anulada ? tachado : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}
      >
        {f.saleM3 != null ? fmtM3(f.saleM3) : ""}
      </td>
      {s ? (
        casilleros.map((c) => {
          const cambio = previo != null && Math.abs(previo[c] - s[c]) > 0.0005;
          return (
            <td
              key={c}
              className={`${NUM} ${s[c] < 0 ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : cambio ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
            >
              {fmtM3(s[c])}
            </td>
          );
        })
      ) : (
        <td colSpan={casilleros.length} className={`${NUM} text-xs text-[var(--text-tertiary)]`}>
          {f.anulada ? "no cuenta" : "no suma al permiso"}
        </td>
      )}
    </tr>
  );
}
