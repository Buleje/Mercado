"use client";

/**
 * Partes de `LothDespachoPorGuia` (sacadas para que la vista no pase de 300
 * líneas, 08-10): el estado de la guía, el desglose de sus trozas y el botón
 * «Hoja de despacho» (QR3), que imprime lo que sube al camión con un QR a la
 * lista pública de la guía.
 */

import { useState } from "react";
import { ArrowRight, Loader2, Printer } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { medidasDeLinea } from "@/lib/forestal/loth-despacho-medidas";
import { filaAnulada, type FilaPorGuia } from "@/lib/forestal/loth-despacho-por-guia";
import { imprimirHojaDespacho, type PermisoDeLaHoja } from "@/lib/forestal/loth-despacho-hoja";
import { ingresarGtfAlCtp } from "./LothGtfCtp";

export const TH = "px-3 py-2.5 font-bold text-[var(--text-primary)] whitespace-nowrap";
export const TD = "px-3 py-2.5 align-top";
export const DER = "text-right font-mono tabular-nums";
const m = (v: string | null, dp: number) => (v == null ? "—" : Number(v).toFixed(dp));

const CHIP = "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold";
const TONO = {
  error: "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  ok: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  aviso: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

export function EstadoGuia({ f, hayCtp }: { f: FilaPorGuia; hayCtp: boolean }) {
  if (filaAnulada(f)) return <span className={`${CHIP} ${TONO.error}`}>Anulada</span>;
  const ctp = f.guia?.ctp ?? null;
  if (!f.guia) return <span className={`${CHIP} ${TONO.neutro}`}>Guía no encontrada</span>;
  if (ctp === "ingresada") return <span className={`${CHIP} ${TONO.ok}`}>En el CTP</span>;
  if (ctp === "otra_empresa") return <span className={`${CHIP} ${TONO.neutro}`}>Va a otra empresa</span>;
  if (ctp === "por_ingresar") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className={`${CHIP} ${TONO.aviso}`}>Por ingresar al CTP</span>
        {hayCtp && f.gtfNumber && (
          <button
            type="button"
            onClick={() => ingresarGtfAlCtp(f.gtfNumber as string)}
            className="inline-flex min-h-6 items-center gap-1 text-xs font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
          >
            Ingresar al CTP <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </span>
    );
  }
  return <span className={`${CHIP} ${TONO.neutro}`}>Emitida</span>;
}

/** Las trozas de una guía con sus medidas (las del trozado) y el total. */
export function Desglose({ f, onDetalle, hoja }: { f: FilaPorGuia; onDetalle: (e: LothEntryDTO) => void; hoja?: React.ReactNode }) {
  const anulada = filaAnulada(f);
  return (
    <table className="w-full text-sm" aria-label={`Trozas de la guía ${f.gtfNumber ?? "sin número"}`}>
      <thead>
        <tr className="text-xs text-[var(--text-secondary)]">
          <th className={TH}>Cód. troza</th>
          <th className={TH}>Especie</th>
          <th className={`${TH} text-right`}>D1</th>
          <th className={`${TH} text-right`}>D2</th>
          <th className={`${TH} text-right`}>Largo</th>
          <th className={`${TH} text-right`}>m³</th>
        </tr>
      </thead>
      <tbody>
        {f.lineas.map((e) => {
          const md = medidasDeLinea(e);
          const tachada = e.status === "anulado";
          return (
            <tr key={e.id} className={tachada && !anulada ? "opacity-60" : undefined}>
              <td className={TD}>
                <button
                  type="button"
                  onClick={() => onDetalle(e)}
                  title="Abre el detalle del despacho"
                  className={`font-mono font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)] ${tachada ? "line-through" : ""}`}
                >
                  {e.trozaCode ?? "—"}
                </button>
              </td>
              <td className={TD}>{md.especie ?? "—"}</td>
              <td className={`${TD} ${DER}`}>{m(md.d1, 2)}</td>
              <td className={`${TD} ${DER}`}>{m(md.d2, 2)}</td>
              <td className={`${TD} ${DER}`}>{m(md.largo, 2)}</td>
              <td className={`${TD} ${DER} font-bold`}>{m(md.m3, 4)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-[var(--rule-base)]">
          <td className={TD} colSpan={5}>
            <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
              Total · {anulada ? f.anuladas : f.trozas} troza{(anulada ? f.anuladas : f.trozas) === 1 ? "" : "s"}
            </span>
            {!anulada && f.anuladas > 0 && <span className="ml-2 text-xs text-[var(--text-tertiary)]">({f.anuladas} anuladas, no suman)</span>}
            {hoja && <span className="ml-3 inline-block align-middle">{hoja}</span>}
          </td>
          <td className={`${TD} ${DER} font-black`}>{anulada ? <span className="line-through">{fmtM3(f.m3Anuladas)}</span> : fmtM3(f.m3)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

const ESPERA =
  '<!doctype html><meta charset="utf-8"><title>Armando la hoja…</title><p style="font:16px system-ui;padding:24px">Armando la hoja de despacho…</p>';

/**
 * «Hoja de despacho» de una guía: la ventana se abre en el clic (después de un
 * `await` el navegador la bloquea) y la hoja espera la base pública del QR.
 */
export function BotonHojaDespacho({ f, permiso }: { f: FilaPorGuia; permiso: PermisoDeLaHoja }) {
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imprimir = () => {
    const ventana = window.open("", "_blank", "width=980,height=760");
    if (!ventana) {
      setError("El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.");
      return;
    }
    ventana.document.write(ESPERA);
    setArmando(true);
    setError(null);
    imprimirHojaDespacho(f, { ventana, permiso })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        try {
          ventana.close();
        } catch {
          /* ya cerrada */
        }
      })
      .finally(() => setArmando(false));
  };
  return (
    <>
      <button
        type="button"
        onClick={imprimir}
        disabled={armando}
        title="Hoja de despacho: las trozas con sus medidas y un QR a la lista de esta guía"
        aria-label={`Hoja de despacho de la guía ${f.gtfNumber ?? ""}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:opacity-60"
      >
        {armando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
        Hoja de despacho
      </button>
      {error && (
        <span role="alert" className="mt-1 block max-w-[14rem] whitespace-normal text-left text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </span>
      )}
    </>
  );
}
