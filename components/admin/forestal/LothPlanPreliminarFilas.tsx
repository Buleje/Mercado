"use client";

/**
 * Las filas de la ventana «Registrar GTF preliminar»: especie · trozas · m³ ·
 * bloque (el bloque sólo si el plan tiene más de uno), agregar y quitar filas,
 * los totales abajo y el aviso EN VIVO si «saldo si se registran» quedaría
 * negativo. El aviso no bloquea: la guía ya está hecha en papel; lo que se
 * frena es el despacho, y ése sigue midiendo sólo lo registrado.
 */

import { AlertTriangle, Plus, Trash2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { PreliminarDeEspecie } from "@/lib/forestal/loth-plan-preliminares";
import { Btn, I } from "./ctp-shared";

export interface FilaPreliminar {
  key: string;
  especie: string;
  trozas: string;
  m3: string;
  bloque: string;
}

const NUM = "font-mono tabular-nums";
const ETIQUETA = "text-xs font-semibold text-[var(--text-secondary)] sm:sr-only";

/** «12,5» y «1,234.5» también valen: lo que se escribe a mano en el monte. */
export function numeroEscrito(s: string): number | null {
  const t = s.trim().replace(/\s+/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") && t.includes(".") ? t.replace(/,/g, "") : t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function LothPlanPreliminarFilas({
  filas,
  especies,
  bloques,
  previa,
  onCambiar,
  onAgregar,
  onQuitar,
}: {
  filas: FilaPreliminar[];
  /** Las especies del plan (el nombre de la resolución). */
  especies: string[];
  /** Los bloques del plan; con uno solo no se pregunta. */
  bloques: string[];
  /** Cómo quedarían las especies de esta guía si se registran todas las pendientes y ésta. */
  previa: PreliminarDeEspecie[];
  onCambiar: (key: string, cambio: Partial<FilaPreliminar>) => void;
  onAgregar: () => void;
  onQuitar: (key: string) => void;
}) {
  const conBloque = bloques.length > 1;
  const columnas = conBloque
    ? "sm:grid-cols-[minmax(0,2fr)_5.5rem_7.5rem_minmax(0,1.4fr)_3rem]"
    : "sm:grid-cols-[minmax(0,2fr)_5.5rem_7.5rem_3rem]";
  const trozas = filas.reduce((a, f) => a + (numeroEscrito(f.trozas) ?? 0), 0);
  const m3 = filas.reduce((a, f) => a + (numeroEscrito(f.m3) ?? 0), 0);
  const pasadas = previa.filter((p) => p.excede);
  return (
    <div className="space-y-2">
      <div className={`hidden gap-2 px-0.5 text-xs font-semibold text-[var(--text-secondary)] sm:grid ${columnas}`} aria-hidden="true">
        <span>Especie</span>
        <span>Trozas</span>
        <span>m³</span>
        {conBloque && <span>Bloque</span>}
        <span />
      </div>
      <ul className="space-y-2">
        {filas.map((f, i) => (
          <li
            key={f.key}
            data-testid="fila-preliminar"
            className={`grid grid-cols-[1fr_1fr_3rem] items-end gap-2 rounded-xl border border-[var(--rule-base)] p-2 sm:items-center sm:border-0 sm:p-0 ${columnas}`}
          >
            <label className="col-span-2 space-y-1 sm:col-span-1">
              <span className={ETIQUETA}>Especie</span>
              <select className={I} value={f.especie} onChange={(e) => onCambiar(f.key, { especie: e.target.value })} aria-label={`Especie de la fila ${i + 1}`}>
                <option value="">Elige la especie…</option>
                {especies.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <Btn
              variant="ghost"
              className="h-11 w-11 px-0 sm:order-last"
              onClick={() => onQuitar(f.key)}
              disabled={filas.length === 1}
              aria-label={`Quitar la fila ${i + 1}`}
              title="Quitar esta fila"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Btn>
            <label className="space-y-1">
              <span className={ETIQUETA}>Trozas</span>
              <input
                className={`${I} ${NUM}`}
                inputMode="numeric"
                value={f.trozas}
                onChange={(e) => onCambiar(f.key, { trozas: e.target.value })}
                placeholder="30"
                aria-label={`Trozas de la fila ${i + 1}`}
              />
            </label>
            <label className="col-span-2 space-y-1 sm:col-span-1">
              <span className={ETIQUETA}>m³</span>
              <input
                className={`${I} ${NUM}`}
                inputMode="decimal"
                value={f.m3}
                onChange={(e) => onCambiar(f.key, { m3: e.target.value })}
                placeholder="20.000"
                aria-label={`m³ de la fila ${i + 1}`}
              />
            </label>
            {conBloque && (
              <label className="col-span-3 space-y-1 sm:col-span-1">
                <span className={ETIQUETA}>Bloque</span>
                <select className={I} value={f.bloque} onChange={(e) => onCambiar(f.key, { bloque: e.target.value })} aria-label={`Bloque de la fila ${i + 1}`}>
                  <option value="">Elige el bloque…</option>
                  {bloques.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-base)] pt-2">
        <Btn variant="ghost" onClick={onAgregar}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar especie
        </Btn>
        <p data-testid="totales-preliminar" className={`${NUM} text-sm font-semibold text-[var(--text-primary)]`}>
          Total: {trozas} {trozas === 1 ? "troza" : "trozas"} · {fmtM3(m3)} m³
        </p>
      </div>
      {pasadas.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {pasadas.map((p) => (
              <span key={p.clave} className="block">
                <span className="font-bold">{p.especie}:</span> si se registran esta y las pendientes, se pasa por{" "}
                <span className={NUM}>{fmtM3(Math.abs(p.quedaSiSeRegistranM3 ?? 0))} m³</span> (hoy quedan <span className={NUM}>{fmtM3(p.quedaM3 ?? 0)} m³</span>).
              </span>
            ))}
            <span className="block font-medium">Puedes guardarla igual; corrige o anula alguna guía antes de registrarla en SERFOR.</span>
          </span>
        </div>
      )}
    </div>
  );
}
