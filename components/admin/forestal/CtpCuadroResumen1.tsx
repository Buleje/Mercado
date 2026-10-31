"use client";

/**
 * Cuadro Resumen 1 del LO-CTP (saldos y movimientos de TROZAS), con lo que
 * traía la «Conciliación del período» de Saldos.
 *
 * Compactación del libro (17-10): Saldos › «Lo que firma el libro» repetía el
 * Cuadro 1 con otra tabla (apertura + ingreso − consumido = final). Queda UNA,
 * la oficial, y suma lo que la de Saldos tenía de más:
 *
 *  · la fila de totales (sin ella, comprobar el cuadro es sumar a mano);
 *  · el Kardex de cada especie, sólo donde hay a dónde abrirlo (`onKardex`);
 *  · la fila en negativo resaltada entera, con su porqué en el ⓘ;
 *  · el cruce con el saldo del servidor (`concil`): el (15) de este cuadro
 *    parte del saldo al cierre del mes anterior y se arma en el navegador; el
 *    de «Cómo está hoy» parte de la existencia de apertura del servidor. Si no
 *    coinciden, se dice cuánto y en qué especie — antes la tabla repetida se
 *    probaba contra sí misma y siempre «cerraba».
 *
 * Tolerancia 0,01 m³ = 10 litros de madera: así se mide con cinta en el patio.
 */

import { AlertTriangle, Check, History } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Concil } from "@/hooks/use-ctp-saldos";
import type { FilaResumen1, VolPiezas } from "@/lib/forestal/loctp-resumenes";
import { cn } from "@/lib/utils";
import { IconAction } from "./ctp-shared";
import { Celda, Cuadro, Entero, n4, Th } from "./ctp-cuadro-shared";

const TOLERANCIA_M3 = 0.01;

const FUENTE: Record<Concil["fuenteApertura"], (label: string | null) => string> = {
  cierre: (label) => `del cierre de ${label ?? "el período anterior"}`,
  calculada: () => "acumulada al inicio del período",
  sin_apertura: () => "sin cierre previo",
};

const CHIP = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold";

type ClaveVP =
  | "inicial"
  | "ingresado"
  | "retrozado"
  | "deRetrozado"
  | "consumido"
  | "salido"
  | "saldo";
const CLAVES: readonly ClaveVP[] = [
  "inicial",
  "ingresado",
  "retrozado",
  "deRetrozado",
  "consumido",
  "salido",
  "saldo",
];

function sumar(filas: readonly FilaResumen1[]): Record<ClaveVP, VolPiezas> {
  const out = {} as Record<ClaveVP, VolPiezas>;
  for (const k of CLAVES) {
    const piezas = filas.map((f) => f[k].piezas).filter((p): p is number => p != null);
    out[k] = {
      volumen: filas.reduce((a, f) => a + f[k].volumen, 0),
      piezas: piezas.length ? piezas.reduce((a, p) => a + p, 0) : null,
    };
  }
  return out;
}

export default function CtpCuadroResumen1({
  filas,
  concil,
  onKardex,
  accion,
}: {
  filas: readonly FilaResumen1[];
  /** A la derecha del título (el «Recalcular» cuando el cuadro va dentro de Saldos). */
  accion?: React.ReactNode;
  /** El saldo del servidor del mismo período y especie: con él, el cuadro se cruza. */
  concil?: Concil | null;
  /** Abre el movimiento fila por fila de una especie. */
  onKardex?: (especie: string) => void;
}) {
  const cols = 14 + (onKardex ? 1 : 0);
  const total = sumar(filas);
  const negativas = filas.filter((f) => f.saldo.volumen < -TOLERANCIA_M3);

  const finalDelServidor = new Map((concil?.materiaPrima ?? []).map((m) => [m.especie, m.final]));
  const difieren = concil
    ? filas
        .map((f) => ({
          especie: f.especie,
          diferencia: f.saldo.volumen - (finalDelServidor.get(f.especie) ?? 0),
        }))
        .filter((d) => Math.abs(d.diferencia) > TOLERANCIA_M3)
    : [];
  const apertura = concil ? FUENTE[concil.fuenteApertura](concil.aperturaLabel) : null;

  const pie =
    filas.length === 0 ? null : (
      <div className="space-y-1.5 text-xs">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {concil && (
            <span
              className={cn(
                CHIP,
                difieren.length === 0
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)]"
                  : "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
              )}
            >
              {difieren.length === 0 ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              )}
              {difieren.length === 0
                ? "Cuadra con «Cómo está hoy»"
                : `${difieren.length === 1 ? "1 especie no cuadra" : `${difieren.length} especies no cuadran`} con «Cómo está hoy»`}
            </span>
          )}
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {n4(total.inicial.volumen)} + {n4(total.ingresado.volumen)} −{" "}
            {n4(total.consumido.volumen)} − {n4(total.salido.volumen)} = {n4(total.saldo.volumen)}{" "}
            m³
          </span>
          {concil && (
            <InfoTip
              title="Cruce con el saldo del libro"
              what={`El (3) Inicial de este cuadro es el saldo al cierre del mes anterior. «Cómo está hoy» parte de la existencia de apertura ${apertura}. Las dos cuentas tienen que llegar al mismo (15) Saldo por especie.`}
              affects={
                difieren.length === 0
                  ? "Coinciden en todas las especies, con una tolerancia de 0,01 m³."
                  : `Difieren: ${difieren.map((d) => `${d.especie} ${d.diferencia > 0 ? "+" : "−"}${n4(Math.abs(d.diferencia))} m³`).join(" · ")}. Abre el Kardex de la especie y busca el movimiento de otro mes o sin guía.`
              }
            />
          )}
        </p>
        {negativas.length > 0 && (
          <p className="flex items-center gap-1.5 text-[var(--data-error-ink)]">
            <strong>
              {negativas.length === 1
                ? `${negativas[0].especie} cierra en negativo`
                : `${negativas.length} especies cierran en negativo`}
            </strong>
            <InfoTip
              icono="ayuda"
              title="Cierra en negativo"
              what="El libro consumió o despachó madera que todavía no tiene ingreso que la respalde."
              affects="No es un error de cálculo: es una fecha mal puesta o una guía sin cargar. Abre el Kardex de la especie y compara la fecha de cada corrida contra la de su guía."
            />
          </p>
        )}
      </div>
    );

  return (
    <Cuadro
      titulo="Cuadro Resumen 1 · Saldos y movimientos de trozas"
      subtitulo="Por especie: 16 casilleros. El retrozado (7)-(10) sale del Apartado 2 y no mueve el saldo: cortar una troza no crea ni destruye madera. El N° de trozas consumidas va en «—» porque el consumo se atribuye en m³, no por troza."
      pie={pie}
      accion={accion}
    >
      <thead>
        <tr>
          <Th>(1) Especie</Th>
          <Th>(2) Científico</Th>
          <Th>(3) Inicial m³</Th>
          <Th>(4) Inicial N°</Th>
          <Th>(5) Ingresó m³</Th>
          <Th>(6) Ingresó N°</Th>
          <Th>(7) Retrozado m³</Th>
          <Th>(8) Retrozado N°</Th>
          <Th>(9) De retrozado m³</Th>
          <Th>(10) De retrozado N°</Th>
          <Th>(11) Consumido m³</Th>
          <Th>(12) Consumido N°</Th>
          <Th>(13) Salió m³</Th>
          <Th>(15) Saldo m³</Th>
          {onKardex && <Th>Kardex</Th>}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 ? (
          <tr>
            <td colSpan={cols} className="text-center text-[var(--text-secondary)]">
              Sin movimientos de trozas en el período.
            </td>
          </tr>
        ) : (
          filas.map((f) => (
            <tr
              key={f.especie}
              /* Un saldo negativo es madera que el libro dice haber usado sin
                 tenerla: lo primero que mira un fiscalizador. Sólo el número en
                 rojo se pierde entre catorce columnas; la fila entera lo señala. */
              className={cn(
                f.saldo.volumen < -TOLERANCIA_M3 &&
                  "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10",
              )}
            >
              <td className="font-bold">
                {f.especie}
                {f.cites && (
                  <span className="ml-1.5 rounded bg-[var(--data-error-50)] px-1 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
                    CITES
                  </span>
                )}
              </td>
              <td className="italic text-[var(--text-secondary)]">{f.cientifico ?? "—"}</td>
              <Celda v={f.inicial.volumen} />
              <Entero v={f.inicial.piezas} />
              <Celda v={f.ingresado.volumen} />
              <Entero v={f.ingresado.piezas} />
              <Celda v={f.retrozado.volumen || null} />
              <Entero v={f.retrozado.piezas} />
              <Celda v={f.deRetrozado.volumen || null} />
              <Entero v={f.deRetrozado.piezas} />
              <Celda v={f.consumido.volumen} />
              <Entero v={f.consumido.piezas} />
              <Celda v={f.salido.volumen} />
              <Celda v={f.saldo.volumen} negativo />
              {onKardex && (
                <td className="text-center">
                  <IconAction
                    icon={History}
                    label={`Kardex de ${f.especie}: el movimiento fila por fila`}
                    onClick={() => onKardex(f.especie)}
                  />
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
      {/* El total es la prueba de que el cuadro cierra: sin él hay que sumar
          catorce columnas a mano para creerle. Con el recorte por especie del
          panel (ADR-400) dice «1 especie» a menudo. */}
      {filas.length > 0 && (
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
          <tr>
            <td colSpan={2}>
              Total · {filas.length} {filas.length === 1 ? "especie" : "especies"}
            </td>
            <Celda v={total.inicial.volumen} />
            <Entero v={total.inicial.piezas} />
            <Celda v={total.ingresado.volumen} />
            <Entero v={total.ingresado.piezas} />
            <Celda v={total.retrozado.volumen || null} />
            <Entero v={total.retrozado.piezas} />
            <Celda v={total.deRetrozado.volumen || null} />
            <Entero v={total.deRetrozado.piezas} />
            <Celda v={total.consumido.volumen} />
            <Entero v={total.consumido.piezas} />
            <Celda v={total.salido.volumen} />
            <Celda v={total.saldo.volumen} negativo />
            {onKardex && <td />}
          </tr>
        </tfoot>
      )}
    </Cuadro>
  );
}
