"use client";

/**
 * Conciliación del período: apertura + movimientos = final (ADR-139 rollforward).
 *
 * Dos cosas que le faltaban y que un fiscalizador pide en el primer minuto:
 *
 *  · **La fila de totales.** Una tabla de conciliación sin suma obliga a hacerla
 *    a mano para comprobar que cierra, que es justo lo que la tabla existe para
 *    demostrar.
 *  · **El kardex de la especie.** El movimiento fila por fila ya existía en el
 *    sistema (`CtpKardexModal`) pero desde acá no había forma de abrirlo: la
 *    conciliación decía «consumiste 5.13 m³» y no había cómo ver de dónde.
 *
 * Y el verde del ingreso pasa a `--data-success-600` con variante dark: el 700
 * sobre superficie oscura quedaba casi negro y la columna no se leía.
 *
 * La columna «− Salió sin aserrar» (ADR-363) aparece SÓLO si hubo: esa madera
 * dejó el patio sin pasar por la sierra, y sin restarla la fila no cerraba —
 * apertura + ingreso − consumido daba un final más alto que el KPI de arriba,
 * que sí la descontaba. Un cero permanente sería una sexta columna que nadie
 * lee; una columna ausente cuando el hecho existe es una tabla que no cuadra.
 */

import { CardTitle, DataTable } from "@buleje/design-system";
import { History, Check, AlertTriangle } from "@buleje/design-system/icons";
import { Th, n2 } from "../ctp-section-shared";
import type { Concil } from "@/hooks/use-ctp-saldos";

const FUENTE: Record<Concil["fuenteApertura"], (label: string | null) => string> = {
  cierre: (label) => `(del cierre de ${label ?? "el período anterior"})`,
  calculada: () => "(acumulada al inicio)",
  sin_apertura: () => "(sin cierre previo)",
};

export default function TablaConciliacion({
  concil,
  onKardex,
}: {
  concil: Concil;
  /** Abre el movimiento fila por fila de una especie. */
  onKardex?: (especie: string) => void;
}) {
  const filas = concil.materiaPrima;
  if (filas.length === 0) return null;

  const total = filas.reduce(
    (a, s) => ({
      apertura: a.apertura + s.apertura,
      ingreso: a.ingreso + s.ingreso,
      consumido: a.consumido + s.consumido,
      directo: a.directo + (s.despachadoDirecto ?? 0),
      final: a.final + s.final,
    }),
    { apertura: 0, ingreso: 0, consumido: 0, directo: 0, final: 0 },
  );
  const hayDirecto = total.directo > 0.0001;

  /* La tabla existe para demostrar que apertura + ingreso − salidas = final.
     Mostrar las cinco columnas y dejar la resta al lector es pedirle que haga
     a mano justo la cuenta que se le está probando. Acá se hace la cuenta y se
     dice si cierra.

     Tolerancia 0.01 m³ = 10 litros de madera: así se mide con cinta en el
     patio. Un epsilon de float (1e-4) convierte cada redondeo de tercer
     decimal en un rojo falso, y siete rojos falsos enseñan a ignorar la
     pantalla entera. */
  const esperado = total.apertura + total.ingreso - total.consumido - total.directo;
  const desvio = Number((total.final - esperado).toFixed(4));
  const cuadra = Math.abs(desvio) <= 0.01;

  const negativas = filas.filter((f) => f.negativa);

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle
          as="h3"
          id="saldos-conciliacion-titulo"
          className="text-base font-bold text-[var(--text-primary)]"
        >
          Conciliación del período · apertura → cierre
        </CardTitle>
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
          Existencia de apertura {FUENTE[concil.fuenteApertura](concil.aperturaLabel)} + movimientos
          del período = existencia final. Así el saldo cuadra con el stock heredado.
        </p>
      </div>
      <DataTable
        className="w-full text-sm"
        wrapperClassName="rounded-none border-0"
        aria-labelledby="saldos-conciliacion-titulo"
      >
        <thead className="bg-[var(--surface-sunken)] text-left">
          <tr>
            <Th>Especie</Th>
            <Th className="text-right">Apertura (m³)</Th>
            <Th className="text-right">+ Ingreso</Th>
            <Th className="text-right">− Consumido</Th>
            {hayDirecto && <Th className="text-right">− Salió sin aserrar</Th>}
            <Th className="text-right bg-[var(--surface-raised)]">= Final (m³)</Th>
            {onKardex && (
              <Th className="text-right">
                <span className="sr-only">Acciones</span>
              </Th>
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map((s) => (
            <tr
              key={s.especie}
              /* Un final negativo es madera que el libro dice haber consumido
                 sin tener: físicamente imposible, y lo primero que mira un
                 fiscalizador. Pintar sólo el número en rojo lo deja perdido
                 entre cinco columnas; la fila entera lo señala. */
              className={`border-t border-[var(--rule-soft)] ${
                s.negativa ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : ""
              }`}
            >
              <td className="px-4 py-2 text-[var(--text-primary)]">
                {s.especie}
                {s.cites && (
                  <span className="ml-2 rounded-full border border-[var(--data-info-500)] px-2 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                    CITES
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                {n2(s.apertura)}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--data-success-ink)]">
                {n2(s.ingreso)}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                {n2(s.consumido)}
              </td>
              {hayDirecto && (
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {n2(s.despachadoDirecto ?? 0)}
                </td>
              )}
              {/* La columna del resultado se separa del resto con su propia
                  superficie: es la que se copia al formulario oficial. */}
              <td
                className={`px-4 py-2 text-right font-mono font-bold tabular-nums ${
                  s.negativa
                    ? "bg-[var(--data-error-500)]/10 text-[var(--data-error-600)] dark:text-[var(--data-error-500)]"
                    : "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                }`}
              >
                {n2(s.final)}
              </td>
              {onKardex && (
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onKardex(s.especie)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:bg-primary/10 hover:text-[var(--text-primary)]"
                    title={`Movimiento de ${s.especie}, fila por fila`}
                  >
                    <History className="h-3.5 w-3.5" aria-hidden /> Kardex
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {/* El total es la prueba de que la conciliación cierra: sin él hay que
            sumar cinco columnas a mano para creerle a la tabla. */}
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
          <tr>
            <td className="px-4 py-2.5 text-[var(--text-primary)]">
              {/* Con el recorte por especie del panel (ADR-400) esta fila dice
                  «1» a menudo: «1 especies» hace dudar de un cuadro que cierra. */}
              Total · {filas.length} {filas.length === 1 ? "especie" : "especies"}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
              {n2(total.apertura)}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--data-success-ink)]">
              {n2(total.ingreso)}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
              {n2(total.consumido)}
            </td>
            {hayDirecto && (
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
                {n2(total.directo)}
              </td>
            )}
            <td className="bg-[var(--surface-raised)] px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
              {n2(total.final)}
            </td>
            {onKardex && <td />}
          </tr>
        </tfoot>
      </DataTable>

      {/* El pie de la tabla: la cuenta hecha, y qué hacer si no cierra o si
          alguna especie quedó en negativo. */}
      <div className="border-t-2 border-[var(--rule-base)] px-4 py-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] ${
              cuadra
                ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)]"
                : "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
            }`}
          >
            {cuadra ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            )}
            {cuadra ? "La conciliación cierra" : "La conciliación no cierra"}
          </span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {n2(total.apertura)} + {n2(total.ingreso)} − {n2(total.consumido)}
            {hayDirecto && ` − ${n2(total.directo)}`} = {n2(esperado)} m³
          </span>
          {!cuadra && (
            <span className="font-mono tabular-nums font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              · difiere {n2(Math.abs(desvio))} m³ del final declarado
            </span>
          )}
        </p>

        {negativas.length > 0 && (
          <p className="mt-2 text-xs text-[var(--data-error-ink)]">
            <strong>
              {negativas.length === 1
                ? `${negativas[0].especie} cierra en negativo`
                : `${negativas.length} especies cierran en negativo`}
              :
            </strong>{" "}
            el libro consumió madera que todavía no tiene ingreso que la respalde. No es un error de
            cálculo — es una fecha mal puesta o una guía sin cargar. Abre el Kardex de la especie y
            compara la fecha de cada corrida contra la de su guía.
          </p>
        )}
      </div>
    </div>
  );
}
