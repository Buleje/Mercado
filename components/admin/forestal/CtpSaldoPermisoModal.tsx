"use client";

/**
 * Saldo por permiso — el apartado de simulación (ADR-409).
 *
 * La pregunta que hasta hoy no tenía pantalla (Brandon, 2026-09-10): *«bajo
 * este permiso entraron N m³ de rolliza; al 56 % dan P pies tablares, ya
 * declaré Q sin lote… ¿cuánto me queda?»*.
 *
 * Es un **apartado aparte y no toca ninguna otra pestaña**: no mueve saldos, no
 * consume trozas, no escribe nada. Lee dos hechos que el libro ya registra —la
 * rolliza que entró bajo cada título habilitante y las corridas declaradas SIN
 * materia prima que lo citan (ADR-402/408)— y hace la resta a la vista.
 *
 * Tres cosas que la pantalla dice en voz alta, porque callarlas la volvería
 * mentirosa:
 *
 *  1. **El 56 % es un TECHO** (ADR-358), no un rendimiento esperado: la columna
 *     dice «aserrable como máximo», nunca «va a salir».
 *  2. **Sólo se resta la producción SIN LOTE.** La corrida que consumió trozas
 *     ya se llevó su madera del patio; restarla otra vez contaría dos veces lo
 *     mismo. Por eso la base normal es la rolliza que sigue en patio.
 *  3. **Lo que no está en m³ no se convierte**: se lista aparte. Un m³
 *     inventado en un libro que se declara ante SERFOR es peor que un hueco.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn } from "./ctp-shared";
import { useSaldoPermisos } from "./hooks/use-saldo-permisos";
import AsignarPermisoMasivo from "./ctp-saldo-asignar-permiso";
import SaldoPermisoTabla from "./ctp-saldo-tabla";
import {
  SIN_PERMISO,
  saldoPorPermiso,
  type BaseDeSaldo,
  type CorridaSinOrigen,
} from "@/lib/forestal/saldo-por-permiso";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { exportarSaldoPorPermiso, printSaldoPorPermiso } from "@/lib/forestal/saldo-permiso-export";

// date-only en UTC: sin eso, en Lima la fecha se corre un día.
const fmtFecha = (f: string) =>
  new Date(f.length <= 10 ? `${f}T12:00:00Z` : f).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

function Kpi({
  label,
  valor,
  sufijo,
  hint,
  alerta,
}: {
  label: string;
  valor: string;
  sufijo: string;
  hint?: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${alerta ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10" : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"}`}
    >
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {valor}{" "}
        <span className="font-sans text-xs font-semibold text-[var(--text-tertiary)]">
          {sufijo}
        </span>
      </p>
      {hint && (
        <p className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export default function CtpSaldoPermisoModal({
  open,
  onClose,
  onVincular,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Cerrar el hueco desde acá: la corrida que se está restando es justo la que
   * no dice de qué madera salió. Lo hace el MISMO vinculador de la pestaña
   * (ADR-408) —con sus cinco reglas—, no una segunda forma de vincular.
   */
  onVincular?: (corrida: CorridaSinOrigen) => void;
}) {
  const { datos, cargando, error, recargar } = useSaldoPermisos(open);
  const [base, setBase] = useState<BaseDeSaldo>("patio");
  const [elegido, setElegido] = useState<string>("");
  const [bajando, setBajando] = useState(false);

  const saldos = useMemo(
    () => (datos ? saldoPorPermiso(datos.rolliza, datos.corridas, { base }) : []),
    [datos, base],
  );
  /* Sin elección, el primero: es el que más producción declarada tiene. */
  const saldo = useMemo(
    () => saldos.find((s) => (s.permiso ?? "") === elegido) ?? saldos[0] ?? null,
    [saldos, elegido],
  );
  /* Las dos salidas llevan TODOS los permisos, no sólo el que está a la vista:
     quien baja el cuadro lo baja para mirarlo entero. La base sí viaja — es lo
     que define qué rolliza se está midiendo. */
  const datosExport = { saldos, base, patioTruncado: datos?.patio.truncado ? datos.patio : null };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Saldo por permiso"
      description="Cuánto producto puede salir todavía de cada título habilitante, y cuánto ya se declaró sin lote contra él."
      icon={Layers}
      variant="info"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="mr-auto text-xs text-[var(--text-tertiary)]">
            Simulación: no mueve saldos ni consume trozas.
          </span>
          <Btn
            onClick={() => printSaldoPorPermiso(datosExport)}
            disabled={saldos.length === 0}
            title="Abrir el cuadro en papel (A4) para imprimir o guardar como PDF"
          >
            <Printer className="h-4 w-4" aria-hidden /> Papel
          </Btn>
          <Btn
            onClick={() => {
              setBajando(true);
              void exportarSaldoPorPermiso(datosExport).finally(() => setBajando(false));
            }}
            disabled={saldos.length === 0 || bajando}
            title="Bajar el cuadro en Excel, con la hoja de las producciones que lo sostienen"
          >
            {bajando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
            )}
            Excel
          </Btn>
          <Btn onClick={() => void recargar()} disabled={cargando}>
            {cargando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Recargar
          </Btn>
          <Btn variant="primary" onClick={onClose}>
            Cerrar
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {error && (
          <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}
        {cargando && !datos && (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el patio y las corridas
            sin lote…
          </p>
        )}

        {datos && saldos.length === 0 && (
          <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
            Todavía no hay trozas con permiso cargado ni producción declarada sin lote.
          </p>
        )}

        {datos && saldos.length > 0 && (
          <>
            {/* Elegir permiso y con qué rolliza se compara */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-56 flex-1">
                <span className="mb-1 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  N° de permiso (título habilitante)
                </span>
                <select
                  value={saldo?.permiso ?? ""}
                  onChange={(e) => setElegido(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                >
                  {saldos.map((s) => (
                    <option key={s.permiso ?? "sin"} value={s.permiso ?? ""}>
                      {s.etiqueta} — {fmtM3(s.totales.rollizaM3)} m³ rolliza
                      {s.totales.producidoM3 > 0
                        ? ` · ${fmtM3(s.totales.producidoM3)} m³ sin lote`
                        : ""}
                      {s.hayExceso ? " ⚠" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div
                role="group"
                aria-label="Qué rolliza se mira"
                className="flex rounded-xl border border-[var(--rule-base)] p-0.5"
              >
                {(
                  [
                    ["patio", "En patio", "La que todavía puede entrar a la sierra"],
                    [
                      "ingresado",
                      "Todo lo ingresado",
                      "Todo lo que entró bajo el permiso, aserrado o no",
                    ],
                  ] as const
                ).map(([v, label, title]) => (
                  <button
                    key={v}
                    type="button"
                    title={title}
                    onClick={() => setBase(v)}
                    aria-pressed={base === v}
                    className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${
                      base === v
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {saldo && (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Kpi
                    label="Rolliza"
                    valor={fmtM3(saldo.totales.rollizaM3)}
                    sufijo="m³"
                    hint={`${fmtPiezas(saldo.totales.piezas)} trozas · ${base === "patio" ? "en patio" : "ingresadas"}`}
                  />
                  <Kpi
                    label="Aserrable al 56 %"
                    valor={fmtPt(saldo.totales.aserrablePt)}
                    sufijo="pt"
                    hint={`${fmtM3(saldo.totales.aserrableM3)} m³ · es un techo, no una promesa`}
                  />
                  <Kpi
                    label="Declarado sin lote"
                    valor={fmtM3(saldo.totales.producidoM3)}
                    sufijo="m³"
                    hint={`${fmtPt(saldo.totales.producidoPt)} pt · ${saldo.corridas.length} corrida(s)`}
                  />
                  <Kpi
                    label="Sobrante"
                    valor={fmtM3(saldo.totales.sobranteM3)}
                    sufijo="m³"
                    hint={`${fmtPt(saldo.totales.sobrantePt)} pt · ${
                      saldo.totales.rollizaSobranteM3 < 0
                        ? `faltan ${fmtM3(Math.abs(saldo.totales.rollizaSobranteM3))} m³ de rolliza`
                        : `quedan ${fmtM3(saldo.totales.rollizaSobranteM3)} m³ de rolliza`
                    }`}
                    alerta={saldo.totales.sobranteM3 < -0.001}
                  />
                </div>

                {saldo.hayExceso && (
                  <p className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-500)]"
                      aria-hidden
                    />
                    <span>
                      Hay especies con <b>sobrante negativo</b>: se declaró sin lote más producto
                      del que esta rolliza puede dar al 56 %. O falta cargar la madera que lo
                      respalda, o esa producción pertenece a otro permiso.
                    </span>
                  </p>
                )}

                <SaldoPermisoTabla saldo={saldo} />

                {/* El montón sin permiso es el estado inicial de cualquier libro
                    que ya venía cargando sin lote: se puede repartir acá mismo. */}
                {saldo.permiso === null && saldo.corridas.length > 0 && (
                  <AsignarPermisoMasivo
                    corridas={saldo.corridas}
                    permisosSugeridos={saldos
                      .map((s) => s.permiso)
                      .filter((p): p is string => Boolean(p))}
                    onAplicado={() => void recargar()}
                  />
                )}

                {/* Qué hay detrás de la resta: las corridas, una por una. */}
                {saldo.corridas.length > 0 && (
                  <details className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                    <summary className="cursor-pointer list-none text-sm font-bold text-[var(--text-primary)]">
                      Qué se restó ({saldo.corridas.length} corrida
                      {saldo.corridas.length === 1 ? "" : "s"} sin lote)
                    </summary>
                    <ul className="mt-2 divide-y divide-[var(--rule-soft)]">
                      {saldo.corridas.map((c) => (
                        <li key={c.id} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="font-mono text-xs text-[var(--text-tertiary)]">
                            #{c.lineNo ?? "—"}
                          </span>
                          <span className="text-[var(--text-tertiary)]">{fmtFecha(c.fecha)}</span>
                          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                            {c.especie ?? "Sin especie"}
                            {c.referencia ? ` · ${c.referencia}` : ""}
                          </span>
                          <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                            {c.unidad === "m3"
                              ? `${fmtM3(c.cantidad)} m³`
                              : `${c.cantidad} ${c.unidad ?? "—"}`}
                          </span>
                          {onVincular && (
                            <button
                              type="button"
                              onClick={() => onVincular(c)}
                              title="Decir de qué trozas salió esta producción"
                              className="shrink-0 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                            >
                              Vincular
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {saldo.sinUnidadM3.length > 0 && (
                  <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                    {saldo.sinUnidadM3.length} corrida(s) de este permiso no declaran en m³ (pt, kg
                    o unidad):
                    <b> no se restan</b>. Convertirlas acá sería inventar un volumen que el libro no
                    dice.
                  </p>
                )}
              </>
            )}

            {datos.patio.truncado && (
              <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                El patio tiene {fmtPiezas(datos.patio.total)} piezas y esta lectura trajo{" "}
                {fmtPiezas(datos.patio.leidas)}: la rolliza que se ve acá es la de esas piezas, no
                la del patio entero.
              </p>
            )}

            <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]">
              <b>Cómo se arma.</b> La rolliza sale de las trozas cuya guía declara este permiso. El{" "}
              <b>56 % es el techo de rendimiento de la plaza</b> (ADR-358): «aserrable» es un
              máximo, no lo que la sierra va a sacar. Se resta{" "}
              <b>sólo la producción declarada sin lote</b> que cita este permiso — una corrida que
              consumió trozas ya descontó su madera del patio, y restarla otra vez contaría dos
              veces lo mismo. Nada de esto escribe en el libro: es un apartado de simulación.
              {saldo?.permiso == null &&
                ` «${SIN_PERMISO}» junta lo que no declaró título habilitante: eso se corrige en la guía o en el asiento.`}
            </p>
          </>
        )}
      </div>
    </AdminModal>
  );
}
