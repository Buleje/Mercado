"use client";

/**
 * «Anotar a mano» en la lista de trozas del despacho con guía (Brandon 15-10:
 * «poner D1, D2, largo, cantidad y que el volumen salga solo; crear y agregar
 * esas trozas sin vincularlas todavía a un permiso»).
 *
 * Una fila de alta (D1, D2, largo, cantidad; el volumen se calcula solo) y la
 * lista de lo anotado. Teclado: Enter pasa al campo siguiente y, en Cantidad,
 * agrega; el foco vuelve a D1 para la próxima troza. Las medidas se revisan con
 * los límites del Cubicador (`revisarTrozaAMano`); el volumen es una vista
 * previa: el servidor lo vuelve a calcular con la misma fórmula al registrar.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DataTable } from "@buleje/design-system";
import { Plus, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  TROZAS_POR_GUIA_MAX,
  revisarTrozaAMano,
  volumenDeFila,
  volumenPorTroza,
  type CampoAMano,
  type CrudoAMano,
} from "@/lib/forestal/loth-trozas-a-mano";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Btn, I } from "./ctp-shared";
import { MARCO, TD, TDR, TH, THR, dec } from "./LothGuiaListaMovilizar";

const VACIO: CrudoAMano = { d1: "", d2: "", largo: "", cantidad: "1" };
const ORDEN: readonly CampoAMano[] = ["d1", "d2", "largo", "cantidad"];
const CAMPOS: Record<CampoAMano, { label: string; placeholder: string }> = {
  d1: { label: "D1 (cm)", placeholder: "45" },
  d2: { label: "D2 (cm)", placeholder: "40" },
  largo: { label: "Largo (m)", placeholder: "3,20" },
  cantidad: { label: "Cantidad", placeholder: "1" },
};
const cm = (m: number) => Math.round(m * 1000) / 10;

/** Los códigos que imprime la guía para una fila: «4», «4 y 5», «4 a 9». */
function codigosDeFila(codigos: readonly string[]): string {
  if (codigos.length <= 1) return codigos[0] ?? "—";
  if (codigos.length === 2) return codigos.join(" y ");
  return `${codigos[0]} a ${codigos[codigos.length - 1]}`;
}

export default function LothGuiaTrozaAMano({ g }: { g: DespachoGuiaLoth }) {
  const [crudo, setCrudo] = useState<CrudoAMano>(VACIO);
  /* Los errores se muestran recién al intentar agregar: mientras se tipea, no se grita. */
  const [intentado, setIntentado] = useState(false);
  const refD1 = useRef<HTMLInputElement>(null);
  const refD2 = useRef<HTMLInputElement>(null);
  const refLargo = useRef<HTMLInputElement>(null);
  const refCantidad = useRef<HTMLInputElement>(null);
  const refs: Record<CampoAMano, typeof refD1> = { d1: refD1, d2: refD2, largo: refLargo, cantidad: refCantidad };
  const revision = useMemo(() => revisarTrozaAMano(crudo), [crudo]);
  const restantes = TROZAS_POR_GUIA_MAX - g.piezas.length;
  const excede = revision.ok && revision.troza.cantidad > restantes;
  const errores = intentado && !revision.ok ? revision.errores : {};
  const mensaje = excede
    ? `La guía lleva hasta ${TROZAS_POR_GUIA_MAX} trozas: quedan ${Math.max(0, restantes)}.`
    : ORDEN.map((c) => errores[c]).find(Boolean);

  /* Qué código imprime cada fila: `piezasManuales` sale en el orden de las filas. */
  const filas = useMemo(() => {
    let i = 0;
    return g.aMano.filas.map((f) => {
      const piezas = g.piezasManuales.slice(i, i + f.cantidad);
      i += f.cantidad;
      return { f, piezas, volumen: volumenDeFila(f) };
    });
  }, [g.aMano.filas, g.piezasManuales]);
  const totalTrozas = g.piezasManuales.length;
  const totalVolumen = filas.reduce((a, x) => a + x.volumen, 0);

  function agregar() {
    setIntentado(true);
    if (!revision.ok) {
      const primero = ORDEN.find((c) => revision.errores[c]);
      if (primero) refs[primero].current?.focus();
      return;
    }
    if (excede) return refs.cantidad.current?.focus();
    g.aMano.agregar(revision.troza);
    setCrudo(VACIO);
    setIntentado(false);
    refs.d1.current?.focus();
  }

  function alPresionar(campo: CampoAMano) {
    return (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const i = ORDEN.indexOf(campo);
      const sig = ORDEN[i + 1];
      if (sig) {
        refs[sig].current?.focus();
        refs[sig].current?.select();
      } else agregar();
    };
  }

  const vista = revision.ok ? volumenDeFila(revision.troza) : null;
  const cadaUna = revision.ok && revision.troza.cantidad > 1 ? volumenPorTroza(revision.troza) : null;

  return (
    <div className="space-y-2 sm:col-span-12" data-testid="trozas-a-mano">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-[var(--text-primary)]">Anotar a mano</span>
        <InfoTip
          title="Trozas anotadas a mano"
          what="Para las trozas que no están en el Trozado: anota D1, D2, largo y cantidad; el volumen se calcula solo con la fórmula SERFOR (Smalian). Al registrar, cada troza queda en el Trozado del libro y sale en la guía con un número (1, 2, 3…)."
          affects={
            g.planId
              ? "Van con el permiso de esta guía."
              : "Sin permiso por ahora: después de registrar, lo eliges en la tabla de guías (Asignar permiso)."
          }
          example="D1 45 · D2 40 · largo 3,20 · cantidad 1 → 0,454 m³"
          ariaLabel="Qué es: anotar trozas a mano"
        />
        {!g.planId && (
          <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
            Sin permiso: lo asignas después
          </span>
        )}
      </div>

      {filas.length > 0 && (
        <div className={MARCO}>
          <DataTable className="w-full">
            <thead>
              <tr>
                <th className={TH}>En la guía</th>
                {/* A 400 px las medidas y la cantidad van debajo del código: con 7 columnas,
                    m³ y «quitar» quedaban tras un scroll lateral (450 px en 330). */}
                <th className={`${THR} hidden sm:table-cell`}>D1 cm</th>
                <th className={`${THR} hidden sm:table-cell`}>D2 cm</th>
                <th className={`${THR} hidden sm:table-cell`}>L m</th>
                <th className={`${THR} hidden sm:table-cell`}>Cant.</th>
                <th className={THR}>m³</th>
                <th className={TH}>
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ f, piezas, volumen }) => {
                const p = piezas[0];
                const codigos = codigosDeFila(piezas.map((x) => x.codigo));
                return (
                  <tr key={f.key}>
                    <td className={TD}>
                      <span className="whitespace-nowrap font-mono font-bold">{codigos}</span>
                      {p && (
                        <span className="block font-mono text-xs tabular-nums text-[var(--text-secondary)] sm:hidden">
                          {dec(cm(p.diamMayorM ?? 0), 1)} · {dec(cm(p.diamMenorM ?? 0), 1)} cm · {dec(p.lengthM, 2)} m
                          {f.cantidad > 1 && ` · ×${f.cantidad}`}
                        </span>
                      )}
                    </td>
                    <td className={`${TDR} hidden sm:table-cell`}>{p ? dec(cm(p.diamMayorM ?? 0), 1) : "—"}</td>
                    <td className={`${TDR} hidden sm:table-cell`}>{p ? dec(cm(p.diamMenorM ?? 0), 1) : "—"}</td>
                    <td className={`${TDR} hidden sm:table-cell`}>{p ? dec(p.lengthM, 2) : "—"}</td>
                    <td className={`${TDR} hidden sm:table-cell`}>{f.cantidad}</td>
                    <td className={`${TDR} font-bold`}>{fmtM3(volumen)}</td>
                    <td className={`${TD} w-px`}>
                      <button
                        type="button"
                        onClick={() => g.aMano.quitar(f.key)}
                        aria-label={`Quitar la troza ${codigos}`}
                        title="Quitar de la guía"
                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)]">
                <td className={`${TD} font-bold text-[var(--text-secondary)] sm:hidden`}>
                  {totalTrozas} {totalTrozas === 1 ? "troza" : "trozas"} a mano
                </td>
                <td colSpan={4} className={`${TD} hidden text-right font-bold uppercase tracking-wide text-[var(--text-secondary)] sm:table-cell`}>
                  A mano
                </td>
                <td className={`${TDR} hidden font-bold sm:table-cell`}>{totalTrozas}</td>
                <td className={`${TDR} font-bold`}>{fmtM3(totalVolumen)}</td>
                <td className={TD} />
              </tr>
            </tfoot>
          </DataTable>
        </div>
      )}

      {/* La fila de alta: cuatro medidas, el volumen calculado y «Agregar». */}
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)_auto]">
        {ORDEN.map((c) => (
          <label key={c} className="grid gap-1">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{CAMPOS[c].label}</span>
            <input
              ref={refs[c]}
              inputMode={c === "cantidad" ? "numeric" : "decimal"}
              autoComplete="off"
              value={crudo[c]}
              placeholder={CAMPOS[c].placeholder}
              onChange={(e) => setCrudo((prev) => ({ ...prev, [c]: e.target.value }))}
              onKeyDown={alPresionar(c)}
              aria-invalid={errores[c] || (c === "cantidad" && excede) ? true : undefined}
              className={`${I} font-mono tabular-nums ${
                errores[c] || (c === "cantidad" && excede) ? "border-[var(--data-error-500)]" : ""
              }`}
            />
          </label>
        ))}
        <div className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Volumen (m³)</span>
          <output
            aria-live="polite"
            className="flex h-11 items-center justify-end gap-1.5 rounded-xl border-[1.5px] border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]"
          >
            {vista == null ? <span className="text-[var(--text-tertiary)]">—</span> : fmtM3(vista)}
            {cadaUna != null && <span className="text-xs font-normal text-[var(--text-tertiary)]">({fmtM3(cadaUna)} c/u)</span>}
          </output>
        </div>
        <Btn variant="primary" onClick={agregar} disabled={restantes <= 0} className="col-span-2 sm:col-span-1">
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
        </Btn>
      </div>
      {mensaje && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {mensaje}
        </p>
      )}
    </div>
  );
}
