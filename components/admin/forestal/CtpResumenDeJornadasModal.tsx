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
import { AlertTriangle, BarChart3, Copy, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn } from "./ctp-shared";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

export interface ResumenDeJornadas {
  dias: string[];
  corridas: {
    id: string;
    lineNo: number;
    dia: string;
    especie: string | null;
    linea: string | null;
    m3: number;
    piezas: number;
    materiaPrimaRef: string | null;
    paquetes: number;
  }[];
  porEspecie: {
    especie: string;
    corridas: number;
    piezas: number;
    m3: number;
    pt: number;
    productos: { producto: string; piezas: number; m3: number; pt: number }[];
  }[];
  totales: { corridas: number; piezas: number; m3: number; pt: number };
}

const CELDA = "px-2 py-1.5 text-sm";
const CIFRA = `${CELDA} text-right font-mono tabular-nums`;

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
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Devolver la medida a la escala en que se midió.
 *
 * El libro guarda cm y metros con **2 decimales**, y 8 pies son 2.4384 m: lo
 * guardado es 2.44, y al volver da 8.0052 → «8.01 pies». Medido de verdad en la
 * corrida N° 28: salían 4.99, 6.99, 8.01 y 1.51. Nadie corta a 8.01 pies, y una
 * planilla llena de esos números se lee como si el sistema no supiera medir.
 *
 * Se acerca al múltiplo de `paso` SÓLO si está a menos de `tolerancia`, y la
 * tolerancia sale del error que mete el libro, no de un número redondo: 0.005 m
 * de redondeo son 0.017 pies, y 0.005 cm son 0.002 pulgadas. Con eso, 8.0052
 * pies vuelve a 8 y una medida que de verdad es otra se queda como está — 8.25
 * pies sigue siendo 8.25, y 2.7 pulgadas no se convierte en 2¾.
 */
export function acercarAEscala(valor: number, paso: number, tolerancia: number): number {
  const cerca = Math.round(valor / paso) * paso;
  return Math.abs(valor - cerca) <= tolerancia ? r2(cerca) : r2(valor);
}

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
  onClose,
  onCopiarAlCubicado,
}: {
  /** Los días a resumir, `YYYY-MM-DD`. Uno o varios. */
  dias: readonly string[];
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
  const [error, setError] = useState<string | null>(null);
  /** La corrida cuyas piezas se están trayendo, para no tocar dos veces. */
  const [copiando, setCopiando] = useState<string | null>(null);
  const [avisoCopia, setAvisoCopia] = useState<string | null>(null);
  const clave = [...dias].sort().join(",");

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    if (!clave) return;
    ctpGet<ResumenDeJornadas>(`/api/admin/forestal/ctp?resumenJornadas=1&dias=${clave}`, {
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
  }, [clave]);

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

  const titulo =
    dias.length === 1
      ? `Lo que salió el ${etiquetaLarga(dias[0]!)}`
      : `Lo que salió en ${dias.length} jornadas`;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Resumen por especie"
      description={titulo}
      variant="wide"
      /* Se abre desde la tira de días, que vive DENTRO de otro modal. */
      aboveModals
      icon={BarChart3}
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="mr-auto text-xs text-[var(--text-tertiary)]">
            Sólo lectura — para corregir una corrida, entrá por ella en el libro.{" "}
            {/* El cierre del mes (revisar, cerrar, bajar el paquete oficial) ya
                existe: este resumen es el paso previo natural, y nadie lo sabía. */}
            <a
              href="/admin?tab=ctp-libro-operaciones&vista=cierre"
              className="font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
            >
              Cerrar el mes
            </a>{" "}
            está en la pestaña Cierre.
          </span>
          <Btn variant="primary" onClick={onClose}>
            Listo
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cifra rotulo="Pie tablar" valor={fmtPt(datos.totales.pt)} unidad="PT" destacado />
              <Cifra rotulo="Volumen" valor={fmtM3(datos.totales.m3)} unidad="m³" />
              <Cifra rotulo="Piezas" valor={fmtPiezas(datos.totales.piezas)} unidad="pza" />
              <Cifra
                rotulo="Corridas"
                valor={String(datos.totales.corridas)}
                unidad={`en ${datos.dias.length} día${datos.dias.length === 1 ? "" : "s"}`}
              />
            </div>

            {/* Por especie, y dentro de cada una por producto. */}
            <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
              <table className="w-full min-w-[34rem] border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    <th className={CELDA}>Especie · producto</th>
                    <th className={`${CELDA} text-right`}>Piezas</th>
                    <th className={`${CELDA} text-right`}>m³</th>
                    <th className={`${CELDA} text-right`}>PT</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.porEspecie.map((e) => (
                    <EspecieYProductos key={e.especie} especie={e} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Las corridas, para saber de dónde sale cada número. */}
            {avisoCopia && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--data-info-500)]/12 px-3 py-2 text-sm text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {avisoCopia}
              </p>
            )}

            {/* Abierto de entrada cuando se puede traer al cubicado: ahí está el
                botón, y un acordeón cerrado lo esconde. */}
            <details open={!!onCopiarAlCubicado} className="rounded-xl border border-[var(--rule-base)] px-3 py-2">
              <summary className="cursor-pointer text-sm font-bold text-[var(--text-secondary)]">
                {datos.corridas.length === 1
                  ? "La corrida que lo compone"
                  : `Las ${datos.corridas.length} corridas que lo componen`}
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse">
                  <thead>
                    <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      <th className={CELDA}>Día</th>
                      <th className={CELDA}>N°</th>
                      <th className={CELDA}>Especie</th>
                      <th className={CELDA}>Línea</th>
                      <th className={CELDA}>Materia prima</th>
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
                        <td className={`${CELDA} text-[var(--text-tertiary)]`}>
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
      className={`rounded-xl border px-3 py-2 ${
        destacado
          ? "border-[var(--accent)] bg-primary/10"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
      }`}
    >
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {rotulo}
      </p>
      <p className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
        {valor} <span className="font-sans text-xs font-normal text-[var(--text-tertiary)]">{unidad}</span>
      </p>
    </div>
  );
}

function EspecieYProductos({
  especie,
}: {
  especie: ResumenDeJornadas["porEspecie"][number];
}) {
  return (
    <>
      <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/60">
        <td className={`${CELDA} font-bold text-[var(--text-primary)]`}>
          {especie.especie}{" "}
          <span className="font-normal text-[var(--text-tertiary)]">
            · {especie.corridas} corrida{especie.corridas === 1 ? "" : "s"}
          </span>
        </td>
        <td className={`${CIFRA} font-bold`}>{fmtPiezas(especie.piezas)}</td>
        <td className={`${CIFRA} font-bold`}>{fmtM3(especie.m3)}</td>
        <td className={`${CIFRA} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
          {fmtPt(especie.pt)}
        </td>
      </tr>
      {especie.productos.map((p) => (
        <tr key={p.producto} className="border-t border-[var(--rule-soft)]">
          <td className={`${CELDA} pl-6 text-[var(--text-secondary)]`}>{p.producto}</td>
          <td className={CIFRA}>{fmtPiezas(p.piezas)}</td>
          <td className={CIFRA}>{fmtM3(p.m3)}</td>
          <td className={CIFRA}>{fmtPt(p.pt)}</td>
        </tr>
      ))}
    </>
  );
}
