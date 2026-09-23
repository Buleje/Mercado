"use client";

/**
 * El resumen de una o varias jornadas: qué salió, por especie y por producto.
 *
 * Pedido de Brandon (2026-09-11): al elegir un día que ya tiene corridas,
 * poder abrir el **resumen por especie** de ese día; y marcando varios días,
 * el de todos juntos —para comparar una semana o cerrar un mes sin exportar
 * nada—.
 *
 * El corte es el del Cuadro Resumen del LO-CTP: especie primero, producto
 * adentro. Es también como pregunta el comprador («¿cuánto tornillo en tablas
 * sacamos esta semana?»).
 *
 * Es de **sólo lectura**. Corregir una corrida es otro acto, con sus reglas —
 * se entra por la corrida, desde el libro.
 */

import { useCallback, useEffect, useState } from "react";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { AlertTriangle, BarChart3, Copy, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaCorta, etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { acercarAEscala } from "@/lib/forestal/escala-de-medida";
import type { DuenosPorDia, ResumenDeJornadas } from "@/lib/forestal/resumen-de-jornadas";
import { nombreCortoDeDueno } from "@/lib/forestal/dueno-de-la-madera";
import {
  CELDA,
  CIFRA,
  ETIQUETA_CORTE,
  TablaPorDia,
  TablaPorDiaEspecieTipo,
  TablaPorEspecie,
  type CorteResumen,
} from "./ctp-resumen-jornadas-tablas";

/* El tipo (y la cuenta) viven en `lib/forestal/resumen-de-jornadas.ts`. */
export type { ResumenDeJornadas };


/** Un paquete como lo devuelve el libro: medidas en cm/m, que es como se declaran. */
interface PaqueteDelLibro {
  codigo?: string | null;
  cantidad?: number | null;
  espesorCm?: number | string | null;
  anchoCm?: number | string | null;
  largoM?: number | string | null;
}

const CM_A_PULG = 2.54;
const M_A_PIE = 0.3048;
const n = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));

/* Vive en `lib/forestal/escala-de-medida.ts` (la usa también la escuadría del
   paquete); se re-exporta para los que ya la importaban de acá. */
export { acercarAEscala };

/**
 * De los paquetes del libro a filas del cubicador.
 *
 * El libro guarda cm y metros —como los declara el LO-CTP— y el cubicador
 * trabaja en pulgadas y pies, que es como se mide en la sierra. La vuelta es
 * exacta salvo redondeo, y el `pieTablar`/`m³` se recalcula al entrar: la
 * fórmula es siempre la del cubicador, nunca la que trae la fuente.
 *
 * Un paquete sin medidas no viaja: una fila de 0×0×0 no se puede editar a algo
 * útil y ensucia el lote con piezas que no existen.
 */
export function piezasDesdePaquetes(
  paquetes: readonly PaqueteDelLibro[],
  especie: string | null,
): PiezaCubicada[] {
  return paquetes
    .map((p) => {
      /* Las escuadrías se cortan en cuartos de pulgada (1, 1½, 2, 3…) y los
         largos en medios pies (8, 10, 10½): ésa es la grilla a la que se vuelve. */
      const espesor = acercarAEscala(n(p.espesorCm) / CM_A_PULG, 0.25, 0.02);
      const ancho = acercarAEscala(n(p.anchoCm) / CM_A_PULG, 0.25, 0.02);
      const largo = acercarAEscala(n(p.largoM) / M_A_PIE, 0.5, 0.05);
      const cantidad = Math.max(0, Math.round(n(p.cantidad)));
      if (espesor <= 0 || ancho <= 0 || largo <= 0 || cantidad <= 0) return null;
      const pieza: PiezaCubicada = {
        /* `agregarVarias` le pone su propio id al entrar: éste es sólo la key
           de React mientras la fila viaja. */
        id: `${p.codigo ?? "paq"}-${espesor}x${ancho}x${largo}`,
        cantidad,
        espesor,
        ancho,
        largo,
        uEspesor: "pulg" as const,
        uAncho: "pulg" as const,
        uLargo: "pies" as const,
        especie: especie ?? undefined,
        /* `agregarVarias` re-cubica: estos dos se recalculan al entrar. */
        pieTablar: 0,
        m3: 0,
      };
      return pieza;
    })
    .filter((p): p is PiezaCubicada => p !== null);
}

export default function CtpResumenDeJornadasModal({
  dias,
  corte: corteInicial = "especie",
  duenos = {},
  onClose,
  onCopiarAlCubicado,
}: {
  /** Los días a resumir, `YYYY-MM-DD`. Uno o varios. */
  dias: readonly string[];
  /**
   * Con qué corte se abre (Brandon, 2026-09-23): cada botón de la barra de días
   * marcados abre el suyo. Adentro se cambia sin volver a pedir nada — los tres
   * salen de la misma respuesta.
   */
  corte?: CorteResumen;
  /** Días de los que entran sólo algunos dueños (elegidos en la barra de días marcados). */
  duenos?: DuenosPorDia;
  onClose: () => void;
  /**
   * Traer las piezas de una corrida al lote cubicado (Brandon, 2026-09-11).
   *
   * Sólo se ofrece si quien monta el modal sabe recibirlas — desde el libro,
   * sin cubicador a la vista, el botón no tendría a dónde mandarlas.
   */
  onCopiarAlCubicado?: (piezas: PiezaCubicada[]) => void;
}) {
  const [datos, setDatos] = useState<ResumenDeJornadas | null>(null);
  const [corte, setCorte] = useState<CorteResumen>(corteInicial);
  const [error, setError] = useState<string | null>(null);
  /** La corrida cuyas piezas se están trayendo, para no tocar dos veces. */
  const [copiando, setCopiando] = useState<string | null>(null);
  const [avisoCopia, setAvisoCopia] = useState<string | null>(null);
  const clave = [...dias].sort().join(",");
  /* Parte de la clave del pedido: elegir otro dueño es otro resumen. */
  const filtro = Object.keys(duenos).length > 0 ? JSON.stringify(duenos) : "";

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    if (!clave) return;
    const conDuenos = filtro ? `&duenos=${encodeURIComponent(filtro)}` : "";
    ctpGet<ResumenDeJornadas>(`/api/admin/forestal/ctp?resumenJornadas=1&dias=${clave}${conDuenos}`, {
      ttlMs: 15_000,
    })
      .then((r) => {
        if (vivo) setDatos(r);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      vivo = false;
    };
  }, [clave, filtro]);

  /**
   * Traer las piezas de UNA corrida al lote cubicado.
   *
   * Se piden sus paquetes al libro —el resumen sólo trae agregados— y se pasan
   * a filas del cubicador, donde se editan, se agregan y se borran como
   * cualquier otra. **No toca la corrida original**: lo que entra es una copia
   * de trabajo, y guardarla crea una corrida NUEVA. Corregir la vieja es otro
   * acto, con su anulación y su motivo — mezclarlos sería editar en silencio lo
   * que el libro ya afirmó.
   */
  const copiar = useCallback(
    async (corrida: ResumenDeJornadas["corridas"][number]) => {
      if (!onCopiarAlCubicado) return;
      setCopiando(corrida.id);
      setAvisoCopia(null);
      try {
        const r = await fetch(`/api/admin/forestal/ctp?entryId=${encodeURIComponent(corrida.id)}`, {
          credentials: "include",
        });
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        const j = (await r.json()) as { entry?: { paquetes?: PaqueteDelLibro[] } };
        const piezas = piezasDesdePaquetes(j.entry?.paquetes ?? [], corrida.especie);
        if (piezas.length === 0) {
          setAvisoCopia(
            `La corrida N° ${corrida.lineNo} no tiene paquetes con medidas: no hay piezas que traer.`,
          );
          return;
        }
        onCopiarAlCubicado(piezas);
        setAvisoCopia(
          `${piezas.length} fila${piezas.length === 1 ? "" : "s"} de la corrida N° ${corrida.lineNo} al lote cubicado. Es una copia: guardarla crea una corrida NUEVA.`,
        );
      } catch (e) {
        setAvisoCopia(`No se pudieron traer las piezas: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setCopiando(null);
      }
    },
    [onCopiarAlCubicado],
  );

  /* Si se sacó algún dueño, el título lo dice: un resumen recortado que se
     lee como el día entero es un número que miente. */
  const soloDe = Object.entries(duenos)
    .map(([d, ds]) => `${ds.map(nombreCortoDeDueno).join(" y ")} el ${etiquetaCorta(d)}`)
    .join("; ");
  const titulo =
    (dias.length === 1
      ? `Lo que salió el ${etiquetaLarga(dias[0]!)}`
      : `Lo que salió en ${dias.length} jornadas`) + (soloDe ? ` · sólo ${soloDe}` : "");

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Resumen ${ETIQUETA_CORTE[corte].toLowerCase()}`}
      description={titulo}
      /* `info` y no `wide`: con 42rem la tabla de corridas se cortaba y el
         botón «Traer al cubicado» quedaba fuera del borde derecho. */
      variant="info"
      /* Se abre desde la tira de días, que vive DENTRO de otro modal. */
      aboveModals
      icon={BarChart3}
      footer={
        <ModalFooter
          nota={
            <>
              Sólo lectura — para corregir una corrida, entra por ella en el libro.{" "}
              {/* El cierre del mes (revisar, cerrar, bajar el paquete oficial) ya
                  existe: este resumen es el paso previo natural, y nadie lo sabía. */}
              <a
                href="/admin?tab=ctp-libro-operaciones&vista=cierre"
                className="font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
              >
                Cerrar el mes
              </a>{" "}
              está en la pestaña Cierre.
            </>
          }
        >
          <Btn variant="primary" onClick={onClose}>
            Listo
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {error ? (
          <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            No se pudo leer el resumen: {error}
          </p>
        ) : !datos ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las corridas…
          </p>
        ) : datos.totales.corridas === 0 ? (
          <p className="py-6 text-sm text-[var(--text-tertiary)]">
            Esos días no tienen ninguna corrida declarada.
          </p>
        ) : (
          <>
            {/* El total primero: es la cifra que se busca al abrir. */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Cifra rotulo="Pie tablar" valor={fmtPt(datos.totales.pt)} unidad="PT" destacado />
              <Cifra rotulo="Volumen" valor={fmtM3(datos.totales.m3)} unidad="m³" />
              <Cifra rotulo="Piezas" valor={fmtPiezas(datos.totales.piezas)} unidad="pza" />
              <Cifra
                rotulo="Corridas"
                valor={String(datos.totales.corridas)}
                unidad={`en ${datos.dias.length} día${datos.dias.length === 1 ? "" : "s"}`}
              />
            </div>

            {/* El corte: los tres salen de la misma respuesta. */}
            <SegmentedControl
              value={corte}
              onChange={setCorte}
              size="sm"
              label="Cómo se agrupa el resumen"
              options={(Object.keys(ETIQUETA_CORTE) as CorteResumen[]).map((c) => ({
                value: c,
                label: ETIQUETA_CORTE[c],
              }))}
            />
            {corte === "dia" ? (
              <TablaPorDia datos={datos} />
            ) : corte === "diaEspecie" ? (
              <TablaPorDiaEspecieTipo datos={datos} />
            ) : (
              <TablaPorEspecie datos={datos} />
            )}

            {/* Las corridas, para saber de dónde sale cada número. */}
            {avisoCopia && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--data-info-500)]/12 px-3 py-2 text-sm text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {avisoCopia}
              </p>
            )}

            {/* Abierto de entrada cuando se puede traer al cubicado: ahí está el
                botón, y un acordeón cerrado lo esconde. */}
            <details
              open={!!onCopiarAlCubicado}
              className="group rounded-xl border border-[var(--rule-base)] [&[open]>summary]:border-b [&[open]>summary]:border-[var(--rule-soft)]"
            >
              <summary className="cursor-pointer select-none rounded-xl px-3.5 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors marker:content-[''] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40">
                <span className="mr-1.5 inline-block text-[var(--text-tertiary)] transition-transform group-open:rotate-90" aria-hidden>
                  ▸
                </span>
                {datos.corridas.length === 1
                  ? "La corrida que lo compone"
                  : `Las ${datos.corridas.length} corridas que lo componen`}
              </summary>
              <div className="overflow-x-auto px-1.5 pb-1.5">
                <table className="w-full min-w-[34rem] border-collapse">
                  <thead>
                    <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      <th className={`${CELDA} whitespace-nowrap`}>Día</th>
                      <th className={CELDA}>N°</th>
                      <th className={CELDA}>Especie</th>
                      <th className={CELDA}>Línea</th>
                      <th className={`${CELDA} whitespace-nowrap`}>Materia prima</th>
                      <th className={`${CELDA} text-right`}>Piezas</th>
                      <th className={`${CELDA} text-right`}>m³</th>
                      {onCopiarAlCubicado && <th className={CELDA} />}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.corridas.map((c) => (
                      <tr key={c.id} className="border-t border-[var(--rule-soft)]">
                        <td className={CELDA}>{etiquetaLarga(c.dia)}</td>
                        <td className={`${CELDA} font-mono tabular-nums`}>{c.lineNo}</td>
                        <td className={CELDA}>{c.especie ?? "—"}</td>
                        <td className={CELDA}>{c.linea ?? "—"}</td>
                        <td
                          className={`${CELDA} max-w-[14rem] truncate text-[var(--text-tertiary)]`}
                          title={c.materiaPrimaRef ?? "sin lote"}
                        >
                          {c.materiaPrimaRef ?? "sin lote"}
                        </td>
                        <td className={CIFRA}>{fmtPiezas(c.piezas)}</td>
                        <td className={CIFRA}>{fmtM3(c.m3)}</td>
                        {onCopiarAlCubicado && (
                          <td className={`${CELDA} text-right`}>
                            <button
                              type="button"
                              onClick={() => void copiar(c)}
                              disabled={copiando !== null || c.paquetes === 0}
                              title={
                                c.paquetes === 0
                                  ? "Esta corrida no declaró paquetes: no hay piezas que traer"
                                  : "Trae sus piezas al lote cubicado para editarlas. No toca la corrida original."
                              }
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-[var(--accent)]"
                            >
                              {copiando === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              )}
                              Traer al cubicado
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </AdminModal>
  );
}

function Cifra({
  rotulo,
  valor,
  unidad,
  destacado = false,
}: {
  rotulo: string;
  valor: string;
  unidad: string;
  destacado?: boolean;
}) {
  return (
    <div
      /* `ring` y no `border` en la destacada: un borde de otro grosor le cambia
         la caja y las cuatro tarjetas dejan de medir lo mismo. */
      className={`rounded-xl border px-3.5 py-3 ${
        destacado
          ? "border-transparent bg-primary/10 ring-1 ring-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
      }`}
    >
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {rotulo}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5 font-mono text-xl font-extrabold leading-none tabular-nums text-[var(--text-primary)]">
        {valor}{" "}
        <span className="font-sans text-xs font-normal leading-none text-[var(--text-tertiary)]">{unidad}</span>
      </p>
    </div>
  );
}
