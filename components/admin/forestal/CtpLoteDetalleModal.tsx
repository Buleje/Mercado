"use client";

/**
 * La ficha del lote de aserrío: qué piezas tiene y qué pasó con ellas (ADR-334).
 *
 * Es la pantalla que contesta la pregunta de un fiscalizador —«¿de qué trozas
 * salió esta corrida?»— sin salir del lote: cada pieza con su código de planta,
 * su codificación de origen, sus medidas y su volumen, y el total al pie que
 * tiene que coincidir con el volumen de entrada declarado en la corrida.
 *
 * Sólo se sacan piezas mientras el lote está ABIERTO (L-A3): un lote consumido
 * es parte del libro y moverle madera sería reescribir lo que pasó.
 *
 * **Editar identidad (Brandon, 2026-08-31):** código, especie, orden,
 * tipo de producto a consumir y ventana del proceso — antes sólo la nota. La
 * especie se bloquea si el lote ya tiene piezas (L-A1: una especie por lote,
 * escrita contra las que ya entraron).
 */

import { Fragment, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Loader2, Play, RotateCcw, Trash2, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  ESTADO_LOTE,
  alertasDeLote,
  juzgarRendimientoLote,
  loteVencido,
  margenLote,
  pieTablarDe,
  piezasLibres,
  rendimientoLote,
  salidaDelLote,
  volumenLibre,
  type CorridaDelLote,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { PRODUCTOS_CONSUMIBLES_LOTE } from "@/lib/forestal/lote-programacion";
import type { CambiosLote } from "./hooks/use-lotes-aserrio";
import { Btn, Field, I, ModalBody, ModalFooter, Seccion, productLabel } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";
import { IconAction } from "@/components/admin/shared/module-primitives";
import CtpMarcarUsadoModal from "./CtpMarcarUsadoModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

/** `${valor} m³` con la precisión de tres decimales de SERFOR, salvo que la
 *  corrida declare otra unidad (kg, pt, unidad): ahí se deja el número tal
 *  cual, con su propia unidad. */
const fmtCantidad = (v: number, unit: string | null | undefined) =>
  !unit || unit === "m3" ? `${fmtM3(v)} m³` : `${v.toFixed(4)} ${unit}`;

/** `AAAA-MM-DD` para un `<input type="date">`, o vacío si no hay fecha. */
const paraInputFecha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

/** Un dato de la ficha. Los vacíos se muestran igual: acá el hueco es el dato. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:col-span-4">
      <dt className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export default function CtpLoteDetalleModal({
  lote,
  ahora,
  onQuitar,
  onEditar,
  onDeshacer,
  onDeshacerForzado,
  onProducir,
  onRecargar,
  onClose,
}: {
  lote: LoteAserrio;
  ahora: Date;
  onQuitar: (trozaId: string) => Promise<void>;
  onEditar: (cambios: CambiosLote) => Promise<void>;
  onDeshacer: () => Promise<void>;
  /**
   * Eliminar un lote CONSUMIDO/CERRADO cuya corrida sigue viva (Brandon,
   * 2026-08-31, "sin excepción" 2026-09-01): anula la corrida (con motivo) y
   * suelta el lote, en un solo paso. `forzar` confirma eliminarlo aunque esa
   * corrida ya tenga despacho o reproceso registrado.
   */
  onDeshacerForzado: (motivo: string, forzar?: boolean) => Promise<void>;
  onProducir: () => void;
  /** Refresca el lote tras marcar/desmarcar una corrida como usada. */
  onRecargar: () => Promise<void>;
  onClose: () => void;
}) {
  const [codigo, setCodigo] = useState(lote.code);
  const [especie, setEspecie] = useState(lote.speciesCommon);
  const [especieCientifica, setEspecieCientifica] = useState(lote.speciesScientific ?? "");
  const [orden, setOrden] = useState(lote.ordenProduccion ?? "");
  const [tipo, setTipo] = useState(lote.tipoProductoConsumir ?? "");
  const [inicio, setInicio] = useState(paraInputFecha(lote.inicioProceso));
  const [fin, setFin] = useState(paraInputFecha(lote.finProceso));
  const [nota, setNota] = useState(lote.notes ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [confirmarBorradoForzado, setConfirmarBorradoForzado] = useState(false);
  const [motivoForzado, setMotivoForzado] = useState("");
  const [forzarConSalida, setForzarConSalida] = useState(false);
  /* "Ya se despachó / ya se usó" a mano (Brandon, 2026-09-01): saca la corrida
     de Productos disponibles sin fabricar un despacho que no ocurrió. Mismo
     modal y mismo endpoint que ya usa Productos disponibles — acá sólo se
     dispara desde la corrida, que es donde el operador la tiene delante. */
  const [marcarUsadoCorrida, setMarcarUsadoCorrida] = useState<CorridaDelLote | null>(null);
  const [desmarcando, setDesmarcando] = useState<string | null>(null);

  const abierto = lote.status === "abierto";
  const estado = ESTADO_LOTE[lote.status];
  const libres = piezasLibres(lote);
  const rend = rendimientoLote(lote);
  const veredicto = juzgarRendimientoLote(rend);
  const margen = margenLote(lote);
  const vencido = loteVencido(lote, ahora);
  const alertas = alertasDeLote(lote, ahora);
  const salida = salidaDelLote(lote);
  /* TODAS las corridas vivas que se comieron piezas de este lote, no sólo la
     que lo cerró (`produccion`, ligada a `produccionEntryId`): `cerrar()` deja
     ese campo en null para siempre en un lote consumido a medias y después
     cerrado con lo que sobró, y esa corrida sigue viva aunque el lote diga
     "cerrado" — mirar sólo `produccion` dejaba el botón de eliminar sin poder
     tocar ese caso (Brandon, 2026-09-01: "no me permite eliminar otros lotes
     ya creados"). Mismo criterio que ahora usa el server. */
  const corridasVivas = (lote.corridas ?? []).filter((c) => c.viva);
  const corridaMuerta = Boolean(lote.produccion && !lote.produccion.viva);
  /* Alguna corrida viva ya salió o se reprocesó: forzar el deshacer acá
     dejaría el libro sin poder explicar de dónde salió lo que ya se fue —el
     servidor lo repite igual, pero decirlo antes evita el viaje al error. */
  const corridaConSalida = corridasVivas.some(
    (c) => Number(c.despachadoQty ?? 0) > 0 || Number(c.reprocesadoQty ?? 0) > 0,
  );
  /* Cualquier lote que el "Deshacer lote" simple NO puede tocar —tiene alguna
     corrida todavía viva, cierre entero o cierre con sobras— entra por acá
     (Brandon, 2026-09-01: "eliminar lotes... sin excepción"). Con salida ya
     registrada, pide tildar "forzar" antes de dejar mandar. */
  const necesitaEliminarForzado = !abierto && corridasVivas.length > 0;
  /* Un lote de sesenta piezas no se lee de un scroll: mismo formato y misma
     paginación que el resto de las tablas del libro (ADR-344). */
  const { visibles: piezasEnPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(lote.trozas);

  const especieBloqueada = lote.trozas.length > 0;
  const cambios: CambiosLote = {
    ...(codigo.trim() !== lote.code ? { code: codigo.trim() } : {}),
    ...(!especieBloqueada && especie.trim() !== lote.speciesCommon ? { speciesCommon: especie.trim() } : {}),
    ...((especieCientifica.trim() || null) !== (lote.speciesScientific ?? null) ? { speciesScientific: especieCientifica.trim() || null } : {}),
    ...((orden.trim() || null) !== (lote.ordenProduccion ?? null) ? { ordenProduccion: orden.trim() || null } : {}),
    ...((tipo || null) !== (lote.tipoProductoConsumir ?? null) ? { tipoProductoConsumir: tipo || null } : {}),
    ...(inicio !== paraInputFecha(lote.inicioProceso) ? { inicioProceso: inicio || null } : {}),
    ...(fin !== paraInputFecha(lote.finProceso) ? { finProceso: fin || null } : {}),
    ...((nota.trim() || null) !== (lote.notes ?? null) ? { notes: nota.trim() || null } : {}),
  };
  const hayCambios = Object.keys(cambios).length > 0;

  async function correr(id: string, fn: () => Promise<void>) {
    setOcupado(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function desmarcarUsado(c: CorridaDelLote) {
    setDesmarcando(c.id);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ id: c.id, action: "marcar_usado", usado: false }),
      });
      const data = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!r.ok) throw new Error(data?.message ?? data?.error ?? `El servidor respondió ${r.status}`);
      invalidarCtp("/forestal/ctp");
      await onRecargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesmarcando(null);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={Boxes}
      title={`${lote.code} · ${lote.speciesCommon}`}
      description={estado.hint}
      footer={
        <ModalFooter
          error={error}
          nota={
            <span className="font-mono tabular-nums">
              {lote.piezas} pza · {fmtM3(lote.volumenM3)} m³ ·{" "}
              {pieTablarDe(lote.volumenM3).toLocaleString("es-PE")} pt
              {abierto && libres.length !== lote.piezas && ` · ${libres.length} libres`}
              {margen && ` · quedan ${fmtM3(margen.margenM3)} m³ por declarar`}
            </span>
          }
        >
          {(abierto || corridasVivas.length === 0) &&
            (confirmarBorrado ? (
              <>
                <span className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  ¿Deshacer? Sus piezas vuelven al patio.
                </span>
                <Btn variant="secondary" onClick={() => setConfirmarBorrado(false)}>
                  No
                </Btn>
                <Btn
                  variant="danger"
                  disabled={ocupado != null}
                  onClick={() => void correr("deshacer", onDeshacer)}
                >
                  {ocupado === "deshacer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Sí, deshacer
                </Btn>
              </>
            ) : (
              <Btn variant="danger" onClick={() => setConfirmarBorrado(true)}>
                <Trash2 className="h-4 w-4" /> Deshacer lote
              </Btn>
            ))}
          {necesitaEliminarForzado && !confirmarBorradoForzado && (
            <Btn variant="danger" onClick={() => setConfirmarBorradoForzado(true)}>
              <Trash2 className="h-4 w-4" /> Eliminar lote
            </Btn>
          )}
          {abierto && (
            <Btn variant="primary" disabled={libres.length === 0} onClick={onProducir}>
              <Play className="h-4 w-4" /> Producir de este lote
            </Btn>
          )}
          <Btn variant="secondary" onClick={onClose}>
            Cerrar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        {alertas.map((a) => (
          <p
            key={a.texto}
            className={`mb-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
              a.tono === "warning"
                ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {a.texto}
          </p>
        ))}

        {/* Eliminar sin excepción (Brandon, 2026-09-01): pide motivo antes de
            anular la corrida — misma confirmación inline que "Cerrar el
            lote" en Producción, no un modal sobre otro modal. Con despacho o
            reproceso ya registrado, pide además tildar "forzar": ese
            despacho queda sin corrida de origen, y eso se dice, no se
            esconde. */}
        {confirmarBorradoForzado && (
          <div className="mb-3 space-y-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 p-3">
            <p className="text-sm text-[var(--text-primary)]">
              <b>Eliminar {lote.code}:</b> se anula{corridasVivas.length === 1 ? " la corrida" : "n las corridas"} N°{" "}
              {corridasVivas.map((c) => c.lineNo).join(", ")} (queda{corridasVivas.length === 1 ? "" : "n"} en el libro
              con el motivo) y sus piezas vuelven al patio.
            </p>
            {corridaConSalida && (
              <p className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                Esa corrida ya tiene despacho o reproceso registrado: al anularla, ese despacho/reproceso queda sin
                corrida de origen.
              </p>
            )}
            <input
              autoFocus
              value={motivoForzado}
              onChange={(e) => setMotivoForzado(e.target.value)}
              placeholder="Motivo (se guarda en el historial): se armó por error, especie equivocada…"
              className={I}
            />
            {corridaConSalida && (
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={forzarConSalida}
                  onChange={(e) => setForzarConSalida(e.target.checked)}
                  className="h-5 w-5 accent-[var(--data-error-500)]"
                />
                Forzar: sé que su despacho/reproceso queda sin corrida de origen
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="secondary" onClick={() => { setConfirmarBorradoForzado(false); setMotivoForzado(""); setForzarConSalida(false); }}>
                Cancelar
              </Btn>
              <Btn
                variant="danger"
                disabled={motivoForzado.trim().length < 3 || (corridaConSalida && !forzarConSalida) || ocupado != null}
                onClick={() => void correr("deshacer-forzado", () => onDeshacerForzado(motivoForzado.trim(), forzarConSalida))}
              >
                {ocupado === "deshacer-forzado" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Sí, eliminar
              </Btn>
            </div>
          </div>
        )}

        <Seccion numero={1} title="El lote">
          <Dato label="Estado">
            {estado.label}
            {vencido && (
              <span className="ml-2 rounded-full bg-[var(--data-error-500)]/15 px-2 py-0.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                Vencido
              </span>
            )}
          </Dato>
          <Dato label="Especie">
            {lote.speciesCommon}
            {lote.speciesScientific && <> <span className="italic text-[var(--text-tertiary)]">{lote.speciesScientific}</span></>}
          </Dato>
          <Dato label="Armado">{fmt(lote.fechaApertura)}</Dato>
          <Dato label="Entró a la sierra">{fmt(lote.fechaConsumo)}</Dato>
          <Dato label="Corrida">
            {lote.produccion ? (
              <span className={corridaMuerta ? "line-through opacity-70" : ""}>
                N° {lote.produccion.lineNo} · {fmt(lote.produccion.entryDate)}
                {lote.produccion.productType && ` · ${lote.produccion.productType}`}
                {lote.produccion.quantity != null &&
                  ` · ${fmtCantidad(lote.produccion.quantity, lote.produccion.unit)}`}
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">Todavía no se aserró</span>
            )}
          </Dato>
          <Dato label="Rendimiento">
            {rend != null ? (
              <span className="font-mono tabular-nums">
                {rend}% <span className="font-sans font-normal text-[var(--text-tertiary)]">· {veredicto.texto}</span>
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">
                {lote.produccion ? "La corrida no declaró en m³" : "—"}
              </span>
            )}
          </Dato>
          {/* Dónde terminó la madera: el lote no muere en la corrida (ADR-337). */}
          <Dato label="Salida del producto">
            {salida ? (
              <span className="font-mono tabular-nums">
                {fmtCantidad(salida.salido, salida.unidad)} de {fmtCantidad(salida.producido, salida.unidad)}
                <span className="font-sans font-normal text-[var(--text-tertiary)]">
                  {salida.enPatio > 0 ? ` · quedan ${fmtCantidad(salida.enPatio, salida.unidad)} en patio` : " · todo despachado"}
                </span>
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">Todavía no produjo</span>
            )}
          </Dato>
          {margen && (
            <Dato label="Margen bajo el tope 56 %">
              <span className="font-mono tabular-nums text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                {fmtM3(margen.margenM3)} m³ declarables desde Producción
              </span>
            </Dato>
          )}
        </Seccion>

        {/* Todas las corridas que se comieron piezas de este lote (ADR-365),
            no sólo la que lo cerró: un lote aserrado en tandas tiene varios
            "registros" y hasta ahora sólo se veía el último (Brandon,
            2026-09-01). */}
        {lote.corridas && lote.corridas.length > 0 && (
          <Seccion numero={2} title={`Registros de producción (${lote.corridas.length})`} hint="Cada corrida que se hizo con este lote">
            <div className="sm:col-span-12 overflow-x-auto rounded-xl border border-[var(--rule-base)]">
              <TablaCtp>
                <TheadCtp>
                  <tr>
                    <th className="px-3 py-2 font-bold">N°</th>
                    <th className="px-3 py-2 font-bold">Fecha</th>
                    <th className="px-3 py-2 font-bold">Producto</th>
                    <th className="px-3 py-2 text-right font-bold">Consumido</th>
                    <th className="px-3 py-2 text-right font-bold">Producido</th>
                    <th className="px-3 py-2 text-right font-bold">Despachado</th>
                    <th className="px-3 py-2 text-right font-bold">Reprocesado</th>
                    <th className="px-3 py-2 font-bold">Estado</th>
                    <th className="px-3 py-2 font-bold sr-only">Acciones</th>
                  </tr>
                </TheadCtp>
                <TbodyCtp>
                  {lote.corridas.map((c) => (
                    <Fragment key={c.id}>
                      <tr className={`hover:bg-[var(--surface-sunken)] ${!c.viva ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">N° {c.lineNo}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{fmt(c.entryDate)}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          <div className="flex flex-wrap items-center gap-1">
                            {c.productType ?? "—"}
                            {c.usadoAt && (
                              <span
                                title={c.usadoMotivo ? `Marcada como usada: ${c.usadoMotivo}` : "Marcada como usada"}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                              >
                                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden /> Usada
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {c.volumeInputM3 != null ? fmtCantidad(c.volumeInputM3, "m3") : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                          {c.quantity != null ? fmtCantidad(c.quantity, c.unit) : "sin declarar"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {c.despachadoQty ? fmtCantidad(c.despachadoQty, c.unit) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {c.reprocesadoQty ? fmtCantidad(c.reprocesadoQty, c.unit) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {c.viva ? (
                            c.status === "registrado" ? "Registrado" : c.status
                          ) : (
                            <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">Anulado</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {/* Marcar/desmarcar "ya usada" (Brandon, 2026-09-01): la saca de
                              Productos disponibles sin fabricar un despacho que no ocurrió —
                              para lo que ya salió por fuera del libro (existencias de
                              apertura, mermas) y de otro modo seguiría ofreciéndose. */}
                          {c.viva &&
                            (c.usadoAt ? (
                              <IconAction
                                icon={RotateCcw}
                                tone="success"
                                busy={desmarcando === c.id}
                                disabled={desmarcando != null}
                                onClick={() => void desmarcarUsado(c)}
                                label="Desmarcar: vuelve a aparecer en Productos disponibles"
                              />
                            ) : (
                              <IconAction
                                icon={CheckCircle2}
                                tone="muted"
                                onClick={() => setMarcarUsadoCorrida(c)}
                                label="Marcar como usada/despachada: sale de Productos disponibles sin despacharse ni reprocesarse"
                              />
                            ))}
                        </td>
                      </tr>
                      {/* El detalle de productos de la corrida (ADR-349): sin esto sólo
                          se veía el total y no de qué estaba hecho — un lote de
                          inventario declarado con comercial + larga/angosta + otros
                          mostraba una sola fila (Brandon, 2026-09-01). */}
                      {(c.paquetes?.length ?? 0) > 0 && (
                        <tr className={!c.viva ? "opacity-60" : ""}>
                          <td colSpan={9} className="border-t border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/60 px-3 py-2">
                            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              {(c.paquetes ?? []).map((p) => (
                                <li key={p.id} className="flex items-baseline gap-1.5">
                                  <span className="font-mono font-bold text-[var(--text-primary)]">{p.codigo}</span>
                                  <span className="text-[var(--text-secondary)]">{productLabel(p.productType ?? "")}</span>
                                  {p.presentacion && <span className="text-[var(--text-tertiary)]">· {p.presentacion}</span>}
                                  <span className="text-[var(--text-tertiary)]">· {p.cantidad} pza</span>
                                  <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                                    · {fmtM3(p.volumenM3)} m³
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </TbodyCtp>
              </TablaCtp>
            </div>
          </Seccion>
        )}

        <Seccion numero={3} title="Editar lote" hint="Sólo se guarda lo que cambiaste">
          <Field span={4} label="N° de lote">
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={60} className={`${I} font-mono`} />
          </Field>
          <Field
            span={4}
            label="Especie"
            hint={especieBloqueada ? `Ya tiene ${lote.trozas.length} pieza(s): no se puede cambiar` : undefined}
          >
            <input
              value={especie}
              onChange={(e) => setEspecie(e.target.value)}
              disabled={especieBloqueada}
              className={`${I} disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </Field>
          <Field span={4} label="Especie científica">
            <input value={especieCientifica} onChange={(e) => setEspecieCientifica(e.target.value)} className={`${I} italic`} />
          </Field>
          <Field span={6} label="Orden de producción">
            <input value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="OP-2026-014" className={`${I} font-mono`} />
          </Field>
          <Field span={6} label="Tipo de producto a consumir">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={I}>
              <option value="">Sin especificar</option>
              {PRODUCTOS_CONSUMIBLES_LOTE.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field span={6} label="Inicio del proceso">
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={I} />
          </Field>
          <Field span={6} label="Fin del proceso">
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} min={inicio || undefined} className={I} />
          </Field>
          <div className="sm:col-span-12 flex flex-wrap items-start gap-2">
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              aria-label={`Nota del lote ${lote.code}`}
              placeholder="Sin nota"
              className="w-full sm:w-auto sm:flex-1 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
            <Btn
              variant="secondary"
              disabled={!hayCambios || ocupado != null}
              onClick={() => void correr("editar", () => onEditar(cambios))}
            >
              {ocupado === "editar" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </Btn>
          </div>
        </Seccion>

        <Seccion numero={4} title={`Piezas del lote (${lote.piezas})`} hint="El total tiene que cuadrar con el volumen de entrada de la corrida">
          <div className="sm:col-span-12 space-y-2">
            <TablaCtp>
              <TheadCtp>
                <tr>
                  <th className="px-3 py-2 font-bold">Cód. planta</th>
                  <th className="px-3 py-2 font-bold">Codificación</th>
                  <th className="px-3 py-2 text-right font-bold">D1 × D2 (cm)</th>
                  <th className="px-3 py-2 text-right font-bold">Largo (m)</th>
                  <th className="px-3 py-2 text-right font-bold">Volumen</th>
                  <th className="px-3 py-2 font-bold">Estado</th>
                  {abierto && <th className="px-3 py-2 font-bold sr-only">Quitar</th>}
                </tr>
              </TheadCtp>
              <TbodyCtp>
                {lote.trozas.length === 0 && (
                  <FilaVacia cols={abierto ? 7 : 6}>
                    El lote está vacío. Cargalo desde Consumos eligiendo este lote.
                  </FilaVacia>
                )}
                {piezasEnPagina.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{t.codigoPlanta ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codificacion ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.d1Cm != null || t.d2Cm != null
                        ? `${t.d1Cm?.toFixed(0) ?? "—"} × ${t.d2Cm?.toFixed(0) ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.largoM != null ? t.largoM.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {t.volumenM3 != null ? `${fmtM3(t.volumenM3)} m³` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {t.consumidaEnId ? (
                        abierto ? (
                          <span className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            Consumida por otra corrida
                          </span>
                        ) : (
                          "Aserrada"
                        )
                      ) : (
                        "En el lote"
                      )}
                    </td>
                    {abierto && (
                      <td className="px-3 py-2 text-right">
                        <IconAction
                          icon={X}
                          tone="muted"
                          label={`Sacar la troza ${t.codigoPlanta ?? t.codificacion ?? ""} del lote`}
                          busy={ocupado === t.id}
                          disabled={ocupado != null}
                          onClick={() => void correr(t.id, () => onQuitar(t.id))}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </TbodyCtp>
              {lote.trozas.length > 0 && (
                <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
                      Total {abierto ? `· ${libres.length} libres de ${lote.piezas}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtM3(abierto ? volumenLibre(lote) : lote.volumenM3)} m³
                    </td>
                    <td colSpan={abierto ? 2 : 1} className="px-3 py-2 font-mono text-sm tabular-nums text-[var(--text-tertiary)]">
                      {pieTablarDe(abierto ? volumenLibre(lote) : lote.volumenM3).toLocaleString("es-PE")} pt
                    </td>
                  </tr>
                </tfoot>
              )}
            </TablaCtp>
            <CtpPaginacion
              rango={rango}
              porPagina={porPagina}
              onPorPagina={setPorPagina}
              onIr={ir}
              sustantivo="pieza"
            />
          </div>
        </Seccion>
      </ModalBody>
      {marcarUsadoCorrida && (
        <CtpMarcarUsadoModal
          corridaId={marcarUsadoCorrida.id}
          lineNo={marcarUsadoCorrida.lineNo}
          onClose={() => setMarcarUsadoCorrida(null)}
          onListo={() => {
            setMarcarUsadoCorrida(null);
            void onRecargar();
          }}
        />
      )}
    </AdminModal>
  );
}
