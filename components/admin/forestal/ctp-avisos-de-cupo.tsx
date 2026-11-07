"use client";

/**
 * Lo que frena un acta de consumo, agrupado y en palabras simples (27-09).
 *
 * Brandon vio tres cajas rojas de tres renglones para la MISMA causa
 * («la guía no cuadra consigo misma») y pidió «explica de manera sencilla».
 * Además la causa era otra: las guías cuadraban, sus trozas colgaban de la fila
 * de otra especie (ADR-435). Ahora es UNA caja por causa —título corto, qué
 * hacer, la lista de guías— y UN botón: «Acomodar trozas» o «Cuadrar la guía».
 *
 * La usan el acta de Consumos (`CtpConsumirLoteModal`) y la producción desde un
 * lote (`CtpProduccionDeLote`): la misma madera, el mismo aviso.
 */

import { AlertTriangle, ArrowLeftRight, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { avisosDeCupo, type AvisoDeCupo, type CupoDeGuia } from "@/lib/forestal/consumo-trozas";
import { Btn } from "./ctp-shared";

/* Acomodar es ordenar, no un error: la guía está bien. Va en el tono de aviso;
   cuadrar y «no alcanza» sí son un problema de la cifra, en rojo. */
const TONO: Record<AvisoDeCupo["causa"], string> = {
  /* Texto chico de color semántico → `-ink` (el `-700` del preset da 4,13:1). */
  otra_fila: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]",
  descuadre: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
  sin_cupo: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
};

const AYUDA: Record<AvisoDeCupo["causa"], { what: string; affects: string; example: string }> = {
  otra_fila: {
    what: "Una guía con varias especies tiene una fila por especie en el libro. Estas trozas quedaron en la fila de otra especie.",
    affects:
      "El tope de esa fila frena el consumo. «Acomodar» pasa cada troza a la fila de su especie: no cambia lo declarado ni lo ya consumido.",
    example: "Guía 0000009: 4 trozas de Cachimbo estaban en la fila de Yacuchapana (8,309 m³); la de Cachimbo declara 10,677 m³.",
  },
  descuadre: {
    what: "La cabecera de la guía declara menos m³ de esa especie que lo que suman sus trozas, y todavía no se consumió nada.",
    affects: "Ninguna combinación de piezas entra: hay que corregir la guía, no elegir menos madera.",
    example: "Declara 4,161 m³ de Mashonaste y sus trozas suman 8,247 m³.",
  },
  sin_cupo: {
    what: "De esa guía ya se consumió una parte y lo que queda no alcanza para las piezas elegidas.",
    affects: "Saca piezas de esa guía o elige de otra guía de la misma especie.",
    example: "Declara 10,000 m³, ya se usaron 8,000 y pides 6,000: sobran 4,000.",
  },
};

export default function CtpAvisosDeCupo({
  cupos,
  ocupado = false,
  puedeAcomodar,
  onAcomodar,
  onCuadrar,
}: {
  cupos: readonly CupoDeGuia[];
  ocupado?: boolean;
  /** Acomodar lo firma admin o dueño (el servidor pide lo mismo). */
  puedeAcomodar: boolean;
  /** Abre «Acomodar trozas» con esas guías. Sin él, no hay botón. */
  onAcomodar?: (woodEntryIds: string[]) => void;
  /** Abre el cuadre de UNA guía. Sin él, no hay botón. */
  onCuadrar?: (woodEntryId: string, gtfNumber: string | null) => void;
}) {
  const avisos = avisosDeCupo(cupos);
  if (avisos.length === 0) return null;
  return (
    <div className="space-y-2">
      {avisos.map((a) => {
        const unaGuia = a.guias.length === 1;
        const g0 = a.guias[0]!;
        const boton =
          a.causa === "otra_fila" && onAcomodar ? (
            <Btn
              variant="secondary"
              onClick={() => onAcomodar(a.guias.map((g) => g.woodEntryId))}
              disabled={ocupado || !puedeAcomodar}
              title={puedeAcomodar ? undefined : "Solo el administrador o el dueño acomodan trozas"}
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden /> Acomodar trozas
            </Btn>
          ) : a.causa === "descuadre" && onCuadrar && unaGuia ? (
            <Btn variant="secondary" onClick={() => onCuadrar(g0.woodEntryId, g0.gtfNumber)} disabled={ocupado}>
              <Scale className="h-4 w-4" aria-hidden /> Cuadrar la guía
            </Btn>
          ) : null;
        return (
          <div key={a.causa} role="status" data-causa={a.causa} className={`rounded-xl px-3 py-2 text-sm ${TONO[a.causa]}`}>
            <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex items-center gap-1 font-bold">
                  {a.titulo}
                  <InfoTip icono="ayuda" title={a.titulo} {...AYUDA[a.causa]} />
                </p>
                <p className="text-[var(--text-secondary)]">{a.detalle}</p>
              </div>
              {boton}
            </div>
            <ul className="mt-1.5 space-y-1 pl-6 text-[var(--text-secondary)]">
              {a.guias.map((g) => (
                <li key={g.woodEntryId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    <b className="font-mono tabular-nums text-[var(--text-primary)]">{g.gtfNumber ?? "—"}</b> · {g.linea}
                  </span>
                  {a.causa === "descuadre" && onCuadrar && !unaGuia && (
                    <button
                      type="button"
                      onClick={() => onCuadrar(g.woodEntryId, g.gtfNumber)}
                      disabled={ocupado}
                      className="font-bold text-[var(--accent-ink)] underline disabled:opacity-60 dark:text-[var(--accent)]"
                    >
                      Cuadrar
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {a.causa === "otra_fila" && onAcomodar && !puedeAcomodar && (
              <p className="mt-1 pl-6 font-bold">Pídeselo al administrador: solo él o el dueño acomodan trozas.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
