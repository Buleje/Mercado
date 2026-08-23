"use client";

/**
 * Cuadrar una guía que se contradice a sí misma (ADR-353).
 *
 * La GTF trae el mismo volumen dos veces —cabecera por especie (37) y lista de
 * trozas (35)— y a veces no coinciden. Cuando pasa, el ingreso queda muerto: no
 * se puede consumir (choca con I2) y tampoco corregir (validado ⇒ no editable).
 *
 * Acá se ven **los dos testigos del papel, uno al lado del otro**, y el operador
 * dice cuál vale. El sistema hace los números pero no elige: elegir por él sería
 * decidir, sin el documento a la vista, qué dice un documento.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Scale } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  descuadreDeEspecie,
  propuestasDeCuadre,
  type DescuadreDeGuia,
  type PropuestaDeCuadre,
} from "@/lib/forestal/guia-descuadre";
import { verificarLista, type ResumenVerificacion } from "@/lib/forestal/cubicacion-verificacion";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

/** El asiento del libro, en lo que el cruce necesita de él. */
interface EntryCrudo {
  libroNro?: number | null;
  speciesCommonName?: string | null;
  volumeM3: number | string;
  pieces?: number | null;
}

/** Una fila de la lista de trozas, como la devuelve el endpoint. */
interface TrozaCruda {
  id: string;
  codificacion: string | null;
  cantidad: number | null;
  volumenM3: number | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  largoM?: number | null;
  consumidaEnId?: string | null;
}

/** Un asiento del libro que no cuadra con sus propias piezas. */
interface AsientoDescuadrado {
  entryId: string;
  libroNro: number | null;
  descuadre: DescuadreDeGuia;
  opciones: PropuestaDeCuadre[];
  /** La pieza culpable ya se aserró: ese lado no se puede tocar. */
  piezaConsumida: boolean;
  /** El recalculo pieza por pieza contra sus propias medidas (ADR-360). */
  verificacion: ResumenVerificacion;
}

const m3 = (n: number) => `${n.toFixed(4)} m³`;

function Testigo({ titulo, casillero, volumen, piezas, resaltado }: {
  titulo: string;
  casillero: string;
  volumen: number;
  piezas: number | null;
  resaltado?: boolean;
}) {
  return (
    <div
      className={`flex-1 rounded-xl border p-3 ${
        resaltado
          ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
      }`}
    >
      <p className="text-xs font-semibold text-[var(--text-tertiary)]">
        {titulo} <span className="font-normal">· casillero {casillero}</span>
      </p>
      <p className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">{m3(volumen)}</p>
      {piezas != null && (
        <p className="text-xs text-[var(--text-tertiary)]">
          {piezas} pieza{piezas === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

/**
 * Se abre desde CUATRO pantallas —la tabla de guías, la ficha, el acta de
 * consumo y el barrido del libro— y ninguna tiene los mismos datos a mano. Por
 * eso recibe **ids de asiento** y pide lo suyo: la alternativa era que cada
 * llamador armara un `GuiaIngreso` completo, y el acta de consumo sólo conoce
 * `woodEntryId`. Los GET pasan por `ctpGet`, que deduplica y cachea 8 s.
 */
export default function CtpCuadrarGuiaModal({
  gtfNumber,
  subtitulo,
  entryIds,
  onClose,
  onCuadrada,
}: {
  gtfNumber: string;
  /** Proveedor o de dónde se abrió. Se muestra al lado del resumen. */
  subtitulo?: string;
  /** Los asientos del libro de esa guía. Se cruza cada uno con sus piezas. */
  entryIds: readonly string[];
  onClose: () => void;
  /** La guía cambió: el listado se tiene que releer. */
  onCuadrada: () => void;
}) {
  const [asientos, setAsientos] = useState<AsientoDescuadrado[] | null>(null);
  const [elegido, setElegido] = useState<Record<string, "cabecera" | "lista">>({});
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* `entryIds` suele llegar como literal desde el JSX: sin esto, cada render
     dispara la carga de nuevo. El `?? []` no es paranoia: un modal montado
     mientras cambian sus props (hot reload, o un padre que re-renderiza con la
     lista todavía sin resolver) reventaba acá con «cannot read 'join'». */
  const idsKey = (entryIds ?? []).join(",");

  /** Lo que declara cada asiento y lo que suman sus piezas. */
  const cargar = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    const porAsiento = await Promise.all(
      ids.map(async (id) => {
        const [detalle, piezas] = await Promise.all([
          ctpGet<{ entry?: EntryCrudo }>(`/api/admin/forestal/wood-entries/${encodeURIComponent(id)}`),
          ctpGet<{ trozas?: TrozaCruda[] }>(
            `/api/admin/forestal/trozas?woodEntryId=${encodeURIComponent(id)}`,
          ),
        ]);
        const entry = detalle.entry;
        if (!entry) return null;
        const filas = piezas.trozas ?? [];
        const descuadre = descuadreDeEspecie({
          especie: entry.speciesCommonName ?? null,
          declaradoM3: Number(entry.volumeM3),
          piezasDeclaradas: entry.pieces ?? null,
          filas: filas.map((t) => ({
            id: t.id,
            codificacion: t.codificacion,
            cantidad: t.cantidad,
            volumenM3: t.volumenM3,
          })),
        });
        if (!descuadre) return null;
        const culpable = descuadre.sospechosa?.id;
        return {
          entryId: id,
          libroNro: entry.libroNro ?? null,
          descuadre,
          opciones: propuestasDeCuadre(descuadre),
          piezaConsumida: Boolean(filas.find((t) => t.id === culpable)?.consumidaEnId),
          /* El cruce de las medidas contra el volumen declarado: es lo que dice
             CUÁL de los dos números del papel está mal (ADR-360). */
          verificacion: verificarLista(filas),
        } satisfies AsientoDescuadrado;
      }),
    );
    setAsientos(porAsiento.filter((a): a is AsientoDescuadrado => a !== null));
  }, [idsKey]);

  useEffect(() => {
    let vivo = true;
    cargar().catch((err) => {
      if (vivo) setError(err instanceof Error ? err.message : String(err));
      if (vivo) setAsientos([]);
    });
    return () => {
      vivo = false;
    };
  }, [cargar]);

  const cuadrar = useCallback(
    async (a: AsientoDescuadrado) => {
      const lado = elegido[a.entryId];
      if (!lado) return;
      const opcion = a.opciones.find((o) => o.lado === lado);
      if (!opcion) return;
      setGuardando(a.entryId);
      setError(null);
      try {
        const body =
          opcion.lado === "cabecera"
            ? {
                action: "cuadrar",
                lado: "cabecera",
                motivo: motivo.trim(),
                trozaId: opcion.troza.id,
                cantidad: opcion.troza.cantidad,
                volumenM3: opcion.troza.volumenM3,
              }
            : { action: "cuadrar", lado: "lista", motivo: motivo.trim() };
        const res = await fetch(`/api/admin/forestal/wood-entries/${a.entryId}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`);
        }
        invalidarCtp("wood-entries");
        invalidarCtp("trozas");
        onCuadrada();
        await cargar();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setGuardando(null);
      }
    },
    [elegido, motivo, onCuadrada, cargar],
  );

  const motivoOk = motivo.trim().length >= 3;
  const pendientes = asientos?.length ?? 0;
  const resumen = useMemo(
    () =>
      asientos == null
        ? "Cruzando la cabecera contra la lista de trozas…"
        : pendientes === 0
          ? "Esta guía cuadra: la cabecera y la lista de trozas dicen lo mismo."
          : `${pendientes} asiento${pendientes === 1 ? "" : "s"} sin cuadrar`,
    [asientos, pendientes],
  );

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="info"
      icon={Scale}
      title={`Cuadrar la guía ${gtfNumber}`}
      description={subtitulo ? `${subtitulo} · ${resumen}` : resumen}
      footer={
        <ModalFooter error={error}>
          <Btn variant="secondary" onClick={onClose} disabled={Boolean(guardando)}>
            Cerrar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        {asientos == null ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las piezas de la guía…
          </p>
        ) : pendientes === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/10 p-3 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            La guía cuadra: lo que declara por especie y lo que suman sus trozas dan lo mismo.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
              La guía trae el volumen <b>dos veces</b> y no coinciden. El documento no se corrige solo:
              mirá el papel y decí cuál de los dos lados es el bueno. Queda registrado con tu motivo.
            </p>

            <label className="block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Motivo del cuadre <span className="text-[var(--data-error-600)]">*</span>
              </span>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: la GTF de SERFOR publica la pieza 20/A con cantidad 3 y su propio total dice 1"
                className="mt-1 h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-base text-[var(--text-primary)]"
              />
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                Va al registro de auditoría del libro: es lo que contesta «¿por qué cambió este número?».
              </span>
            </label>

            {asientos.map((a) => (
              <section key={a.entryId} className="rounded-xl border border-[var(--rule-base)]">
                <CardTitle as="h3" className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl bg-[var(--surface-sunken)] px-3 py-2">
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {a.descuadre.especie ?? "Sin especie"}
                  </span>
                  {a.libroNro != null && (
                    <span className="text-xs text-[var(--text-tertiary)]">asiento N° {a.libroNro}</span>
                  )}
                </CardTitle>
                <div className="space-y-3 p-3">
                  <div className="flex flex-wrap gap-2">
                    <Testigo
                      titulo="Cabecera del producto"
                      casillero="37"
                      volumen={a.descuadre.declaradoM3}
                      piezas={a.descuadre.piezasDeclaradas}
                    />
                    <Testigo
                      titulo="Lista de trozas"
                      casillero="35"
                      volumen={a.descuadre.listaM3}
                      piezas={a.descuadre.piezasEnLista}
                      resaltado
                    />
                  </div>

                  {/* El recalculo pieza por pieza (ADR-360): es lo que dice
                      CUÁL de los dos números del papel está mal. Medido contra
                      seis piezas reales, la guía se publica con HUBER — Smalian
                      va al lado porque es la fórmula del operador y su
                      diferencia mide lo cónica que es la troza. */}
                  <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
                    <div className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Recalculado desde las medidas · la guía publica con Huber
                    </div>
                    <TablaCtp>
                      <TheadCtp>
                        <tr>
                          <th className="px-3 py-2 text-left font-bold">Pieza</th>
                          <th className="px-3 py-2 text-left font-bold">D1 × D2 × largo</th>
                          <th className="px-3 py-2 text-right font-bold">Cant.</th>
                          <th className="px-3 py-2 text-right font-bold">Huber</th>
                          <th className="px-3 py-2 text-right font-bold">Smalian</th>
                          <th className="px-3 py-2 text-right font-bold">Guía</th>
                          <th className="px-3 py-2 text-right font-bold">Desvío</th>
                        </tr>
                      </TheadCtp>
                      <TbodyCtp>
                        {a.verificacion.filas.map((f) => (
                          <tr key={f.id ?? f.codificacion}>
                            <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                              {f.codificacion ?? "—"}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">
                              {f.huberM3 == null ? "sin medidas" : `${f.cantidad > 1 ? `${f.cantidad} × ` : ""}pieza`}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                              {f.cantidad}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                              {f.huberM3?.toFixed(4) ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                              {f.smalianM3?.toFixed(4) ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                              {f.declaradoM3?.toFixed(4) ?? "—"}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-bold tabular-nums ${
                                f.estado === "ok"
                                  ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                                  : f.estado === "sin-medidas"
                                    ? "text-[var(--text-tertiary)]"
                                    : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                              }`}
                            >
                              {f.estado === "sin-medidas"
                                ? "sin medidas"
                                : f.estado === "multiplo"
                                  ? `×${f.piezasQueExplican}`
                                  : `${f.desvioPct! > 0 ? "+" : ""}${f.desvioPct} %`}
                            </td>
                          </tr>
                        ))}
                      </TbodyCtp>
                    </TablaCtp>
                    {a.verificacion.duplicadas.length > 0 && (
                      <p className="flex items-start gap-2 border-t border-[var(--rule-base)] bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        La misma troza está cargada dos veces:{" "}
                        {a.verificacion.duplicadas.map((d) => `${d.codificacion} (×${d.veces})`).join(" · ")}. Un
                        duplicado infla el patio sin que ningún total lo delate.
                      </p>
                    )}
                  </div>

                  {a.opciones.length === 0 ? (
                    <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-600)]" aria-hidden />
                      La lista declara <b>menos</b> que la cabecera: falta cargar piezas. Completá la lista
                      desde el detalle del ingreso; acá no hay nada que corregir.
                    </p>
                  ) : (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-semibold text-[var(--text-primary)]">
                        ¿Cuál dice la verdad?
                      </legend>
                      {a.opciones.map((o) => {
                        const bloqueado = o.lado === "cabecera" && a.piezaConsumida;
                        return (
                          <label
                            key={o.lado}
                            className={`flex items-start gap-2 rounded-xl border-2 p-3 ${
                              bloqueado
                                ? "cursor-not-allowed border-[var(--rule-base)] opacity-60"
                                : "cursor-pointer border-[var(--rule-base)] hover:border-[var(--color-primary)]"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`lado-${a.entryId}`}
                              className="mt-1"
                              disabled={bloqueado}
                              checked={elegido[a.entryId] === o.lado}
                              onChange={() => setElegido((p) => ({ ...p, [a.entryId]: o.lado }))}
                            />
                            <span className="text-sm">
                              <b className="text-[var(--text-primary)]">
                                {o.lado === "cabecera" ? "Vale la cabecera" : "Vale la lista de trozas"}
                              </b>
                              <span className="block text-[var(--text-secondary)]">{o.resumen}</span>
                              {bloqueado && (
                                <span className="block text-xs font-semibold text-[var(--data-error-600)]">
                                  Esa pieza ya entró a la sierra: corregí o anulá su corrida primero.
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                      <Btn
                        variant="primary"
                        onClick={() => void cuadrar(a)}
                        disabled={!motivoOk || !elegido[a.entryId] || guardando === a.entryId}
                      >
                        {guardando === a.entryId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Scale className="h-4 w-4" />
                        )}
                        Cuadrar este asiento
                      </Btn>
                    </fieldset>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </ModalBody>
    </AdminModal>
  );
}
