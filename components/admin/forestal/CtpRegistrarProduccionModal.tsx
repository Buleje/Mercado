"use client";

/**
 * Registrar la producción de un lote, con la forma del SNIFFS (ADR-349).
 *
 * El formulario oficial no pregunta "¿cuántos m³ salieron?": declara **paquetes**
 * —código, producto, presentación, piezas y, si se dimensiona, espesor × ancho ×
 * largo— y el volumen sale de sumarlos. Este modal es ese formulario, con los
 * tres bloques en el mismo orden: el **material** que entra, la **información
 * del lote** y la **producción** que se va agregando.
 *
 * El rendimiento se ve mientras se carga, no después de guardar: es el número
 * que decide si la corrida salió bien, y para eso hay que verlo a tiempo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Boxes, Gauge, Loader2, Plus, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { PRESENTACIONES_LOCTP, TIPOS_PRODUCTO_SALIDA, presentacionSugerida } from "@/lib/forestal/loctp-catalogos";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpMaterialPanel, { type PaquetePrevio } from "./CtpMaterialPanel";
import { juzgarRendimientoLote, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  motivosParaGuardar,
  sugerirCodigoPaquete,
  totalesProduccion,
  volumenDimensionado,
  margenDeclarableM3,
  repartirEntreOrigenes,
  topeDeclarableM3,
  RENDIMIENTO_TOPE_PCT,
  type OrigenMateriaPrima,
  type PaqueteBorrador,
} from "@/lib/forestal/produccion-paquetes";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

/** Lo que se va a consumir: las piezas elegidas del lote. */
export interface MaterialAConsumir {
  especie: string;
  especieCientifica?: string | null;
  piezas: number;
  volumenM3: number;
  /** Los títulos habilitantes que amparan esa madera — el (6) del origen. */
  permisos: string[];
  /**
   * Cuánta materia prima puso cada título habilitante (ADR-358).
   *
   * Un lote junta trozas de dos permisos y el paquete que sale de la sierra es
   * madera de los dos: no hay forma física de saber qué tabla vino de qué árbol,
   * pero sí en qué proporción entró cada uno, y eso es lo que la trazabilidad
   * pide poder afirmar.
   */
  origenes?: OrigenMateriaPrima[];
}

export interface ProduccionRegistrada {
  fecha: string;
  lineaProduccion: string;
  observaciones: string | null;
  paquetes: PaqueteBorrador[];
  volumen: number;
}

const CAMPO =
  "h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

const fmtDia = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-PE", { timeZone: "UTC" });
};

/** Un bloque del formulario oficial, con su barra de título. */
function Bloque({
  titulo,
  meta,
  children,
}: {
  titulo: string;
  /** Contexto corto a la derecha del título: el lote, sus fechas. Antes eso era
   *  un bloque entero para tres datos que se miran de reojo. */
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)]">
      <CardTitle as="h3" className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl bg-[var(--surface-sunken)] px-3 py-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        {meta && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
      </CardTitle>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-bold text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

/** Un dato ya decidido: se muestra, no se edita. */
function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="text-sm">
      <span className="mb-1 block font-bold text-[var(--text-secondary)]">{label}</span>
      <p className="flex h-11 items-center rounded-xl bg-[var(--surface-sunken)] px-2.5 font-mono tabular-nums text-[var(--text-primary)]">
        {valor}
      </p>
    </div>
  );
}

export default function CtpRegistrarProduccionModal({
  lote,
  material,
  fecha,
  guardando,
  error,
  titulo,
  descripcion,
  yaDeclaradoM3 = 0,
  paquetesPrevios,
  ctaLabel,
  trozas,
  onConfirmar,
  onClose,
}: {
  /**
   * Opcional: una CORRIDA que ya consumió también declara acá (ADR-349), y su
   * lote puede estar consumido o no existir. El formulario es el mismo —
   * duplicarlo para la otra puerta daría dos formas de declarar lo mismo.
   */
  lote?: LoteAserrio | null;
  material: MaterialAConsumir;
  /** Día sugerido para la producción, `AAAA-MM-DD`. */
  fecha: string;
  guardando: boolean;
  error: string | null;
  /** Encabezados propios cuando no se entra por el lote. */
  titulo?: string;
  descripcion?: string;
  /**
   * Lo que esta MISMA corrida ya declaró en tandas anteriores (ADR-361/365).
   *
   * Con esto el formulario es el mismo para declarar y para ampliar: el tope, el
   * margen y el rendimiento se miden sobre el acumulado —dos tandas del 40 % son
   * 80 % entre las dos— y no sobre lo que se está cargando ahora.
   */
  yaDeclaradoM3?: number;
  /**
   * Lo que la corrida ya declaró, con sus medidas: se muestra en una solapa —
   * «¿qué códigos usé?» y «¿con qué medidas?» son las dos preguntas de quien
   * vuelve a cargar— y de ahí salen los códigos que no se pueden repetir.
   */
  paquetesPrevios?: readonly PaquetePrevio[];
  /** El botón de guardar dice qué hace: «Guardar» ≠ «Agregar a la corrida». */
  ctaLabel?: string;
  /**
   * La madera que entró a la sierra, pieza por pieza.
   *
   * Se despliega bajo pedido: declarar es mirar la pila y anotar lo que salió, y
   * tener la lista a mano —con su código de planta y su GTF— evita salir del
   * modal para responder «¿de qué troza salió esto?». Es la MISMA tabla del
   * LO-CTP, en sólo lectura: esas piezas ya son un hecho registrado.
   */
  trozas?: TrozaConsumible[];
  onConfirmar: (datos: ProduccionRegistrada) => void;
  onClose: () => void;
}) {
  const [dia, setDia] = useState(fecha);
  const [linea, setLinea] = useState("LP");
  const [observaciones, setObservaciones] = useState("");
  const [paquetes, setPaquetes] = useState<PaqueteBorrador[]>([]);

  // ── El formulario de «Agregar producción» ──
  const [codigo, setCodigo] = useState("");
  const codigosUsados = useMemo(() => (paquetesPrevios ?? []).map((p) => p.codigo), [paquetesPrevios]);
  /**
   * Los códigos que la planta ENTERA ya usó.
   *
   * El índice es `@@unique[tenantId, codigo]`: autonumerar desde el último de
   * ESTA corrida proponía un código que la corrida de al lado ya tenía, y el
   * choque volvía recién al guardar. Con la serie de la planta el sugerido sale
   * libre de entrada.
   */
  const [codigosPlanta, setCodigosPlanta] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/ctp?codigosPaquete=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { codigos: [] }))
      .then((j: { codigos?: string[] }) => { if (vivo) setCodigosPlanta(j.codigos ?? []); })
      /* Sin la serie se tipea a mano y el servidor sigue validando: es una
         ayuda, no un requisito. */
      .catch(() => { if (vivo) setCodigosPlanta([]); });
    return () => { vivo = false; };
  }, []);
  const [producto, setProducto] = useState<string>(TIPOS_PRODUCTO_SALIDA[0]?.valor ?? "");
  /* Arranca en la del producto inicial, para que el primer paquete no salga con
     una presentación que el producto contradice. */
  const [presentacion, setPresentacion] = useState<string>(
    () => presentacionSugerida(TIPOS_PRODUCTO_SALIDA[0]?.valor) ?? "PAQUETES",
  );
  const [cantidad, setCantidad] = useState("");
  const [volumen, setVolumen] = useState("");
  /** La presentación la puso el producto y no el operador: se dice, en chico. */
  const [presentacionAuto, setPresentacionAuto] = useState(false);

  /**
   * «Las de siempre»: las medidas que este aserradero más declaró **de ESTE
   * producto**.
   *
   * Salen del propio libro, no de un catálogo que alguien tendría que mantener:
   * lo más producido ES la plantilla. Mezcladas, el que declara listones veía
   * las medidas de la paquetería; por eso se piden por producto y se vuelven a
   * pedir cuando cambia.
   */
  const [medidas, setMedidas] = useState<
    { productType: string | null; presentacion: string | null; espesorCm: number; anchoCm: number; largoM: number; veces: number }[]
  >([]);
  /** Las que se muestran son de OTROS productos: no hay historial de éste. */
  const [medidasDeOtros, setMedidasDeOtros] = useState(false);
  useEffect(() => {
    let vivo = true;
    const pedir = (url: string) =>
      fetch(url, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { medidas: [] }))
        .then((j: { medidas?: typeof medidas }) => j.medidas ?? []);
    pedir(`/api/admin/forestal/ctp?medidas=1&producto=${encodeURIComponent(producto)}`)
      .then(async (propias) => {
        if (!vivo) return;
        if (propias.length > 0) { setMedidas(propias); setMedidasDeOtros(false); return; }
        /* Un producto que nunca se declaró no tiene plantillas: antes que dejar
           el hueco vacío se ofrecen las de la planta, DICIENDO que son de otros
           productos — la medida sirve igual, el que no sirve es un atajo mudo. */
        const generales = await pedir("/api/admin/forestal/ctp?medidas=1");
        if (!vivo) return;
        setMedidas(generales);
        setMedidasDeOtros(generales.length > 0);
      })
      /* Sin plantillas se tipea como siempre: es un atajo, no un requisito. */
      .catch(() => { if (vivo) { setMedidas([]); setMedidasDeOtros(false); } });
    return () => { vivo = false; };
  }, [producto]);

  const [dimensionar, setDimensionar] = useState(false);
  const [espesor, setEspesor] = useState("");
  const [ancho, setAncho] = useState("");
  const [largo, setLargo] = useState("");
  const [obsPaquete, setObsPaquete] = useState("");

  /**
   * El próximo código LIBRE de la serie de la planta, esquivando lo que ya está
   * en el borrador. Se propone; se puede pisar tipeando.
   */
  const proponerCodigo = useCallback(
    (extra: readonly string[] = []) =>
      sugerirCodigoPaquete(codigosPlanta, {
        hoy: new Date(),
        ocupados: [...codigosUsados, ...paquetes.map((p) => p.codigo), ...extra],
      }),
    [codigosPlanta, codigosUsados, paquetes],
  );
  /* Sólo mientras el campo esté intacto: pisar lo que el operador tipeó porque
     llegó una respuesta del servidor es la forma más rápida de perder un código
     escrito a mano. */
  const codigoTocado = useRef(false);
  /**
   * El último código que propuso la pantalla.
   *
   * Sin esto, el primer sugerido —calculado ANTES de que llegue la serie de la
   * planta, o sea sin datos— se quedaba pegado: proponía `PQ-2608-001` teniendo
   * la serie `PQ-0289` a la vista. Se puede reemplazar lo que propuso la
   * pantalla; lo que tipeó el operador, nunca.
   */
  const sugeridoRef = useRef("");
  useEffect(() => {
    if (codigoTocado.current) return;
    const sugerido = proponerCodigo();
    if (!sugerido) return;
    /**
     * El anterior se captura ANTES de mutar la ref.
     *
     * El updater de `setState` corre diferido —en el render siguiente— y para
     * entonces `sugeridoRef.current` ya vale el nuevo: comparando contra la ref
     * adentro, el sugerido inicial (calculado sin la serie de la planta) nunca
     * se reemplazaba. Medido en el navegador: proponía `PQ-2608-001` teniendo
     * `PQ-0289` cargado.
     */
    const anterior = sugeridoRef.current;
    sugeridoRef.current = sugerido;
    setCodigo((actual) => (actual.trim() === "" || actual === anterior ? sugerido : actual));
  }, [proponerCodigo]);

  const piezas = Number(cantidad) || 0;
  /** Dimensionado, el volumen se CALCULA: tipearlo aparte da dos verdades. */
  const volumenCalculado = useMemo(
    () => volumenDimensionado(Number(espesor) || null, Number(ancho) || null, Number(largo) || null, piezas),
    [espesor, ancho, largo, piezas],
  );
  const volumenAUsar = dimensionar ? volumenCalculado : Number(volumen) || null;

  const totales = useMemo(() => totalesProduccion(paquetes, material.volumenM3), [paquetes, material.volumenM3]);
  /**
   * Lo que la corrida va a declarar EN TOTAL: lo de tandas anteriores más lo de
   * ahora. El tope, el rendimiento y la barra se miden contra esto — mirar sólo
   * la tanda dejaría pasar dos del 40 % sobre la misma materia prima.
   */
  const previo = Math.max(0, Number(yaDeclaradoM3) || 0);
  const acumulado = Math.round((previo + totales.volumen) * 10_000) / 10_000;
  const rendimientoPct =
    material.volumenM3 > 0 && acumulado > 0 ? Math.round((acumulado / material.volumenM3) * 1000) / 10 : null;
  const veredicto = juzgarRendimientoLote(rendimientoPct);
  /* El techo del 56 %: no se guarda un asiento que declare más producto del que
     sale físicamente de lo que entró (ADR-358). */
  const tope = topeDeclarableM3(material.volumenM3);
  const margen = margenDeclarableM3(material.volumenM3, acumulado);
  const motivos = useMemo(
    () =>
      motivosParaGuardar(paquetes, {
        consumidoM3: material.volumenM3,
        yaDeclaradoM3: previo,
        codigosUsados,
      }),
    [paquetes, material.volumenM3, previo, codigosUsados],
  );
  /**
   * Cómo se reparte entre los títulos que lo ampararon. Se reparte el ACUMULADO:
   * el reparto es del producto de la corrida, no del de esta tanda, y mostrar
   * sólo la tanda haría creer que al título le tocaron 2 m³ cuando le tocan 5.
   */
  const reparto = useMemo(
    () => repartirEntreOrigenes(acumulado, material.origenes ?? []),
    [acumulado, material.origenes],
  );
  const listo = motivos.length === 0 && !guardando;

  /**
   * Por qué este paquete no entra. `null` = entra.
   *
   * El tope se chequea ANTES de agregarlo y no después: dejarlo entrar para
   * marcarlo en rojo obliga a borrarlo, y entre agregar y borrar el operador ya
   * tipeó el siguiente (ADR-358).
   */
  const noEntra: string | null = !codigo.trim()
    ? "Poné el código del paquete."
    : !(volumenAUsar && volumenAUsar > 0)
      ? "Poné el volumen del paquete."
      : material.volumenM3 > 0 && volumenAUsar > margen
        ? margen > 0
          ? `Ese paquete pasa el tope del ${RENDIMIENTO_TOPE_PCT} %: entran ${margen.toFixed(4)} m³ más.`
          : `Ya se llegó al tope del ${RENDIMIENTO_TOPE_PCT} % (${tope.toFixed(4)} m³). Sacá un paquete para agregar otro.`
        : null;

  function agregar() {
    /* El guard vive en `noEntra` (que es lo que apaga el botón y explica por
       qué): acá sólo se re-afirma el tipo, porque TS no lo puede deducir de él. */
    if (noEntra || !(volumenAUsar && volumenAUsar > 0)) return;
    const volumen = volumenAUsar;
    setPaquetes((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        codigo: codigo.trim(),
        productType: producto,
        presentacion,
        cantidad: piezas,
        volumenM3: volumen,
        espesorCm: dimensionar ? Number(espesor) || null : null,
        anchoCm: dimensionar ? Number(ancho) || null : null,
        largoM: dimensionar ? Number(largo) || null : null,
        observations: obsPaquete.trim(),
      },
    ]);
    /* El código se autonumera y el resto queda: una jornada carga veinte
       paquetes iguales cambiando el número. El recién agregado va como ocupado
       —todavía no está en el estado— para no proponerlo de nuevo. */
    const siguiente = proponerCodigo([codigo.trim()]);
    setCodigo(siguiente);
    sugeridoRef.current = siguiente;
    codigoTocado.current = false;
    setObsPaquete("");
  }

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="info"
      icon={Boxes}
      title={titulo ?? `Producción del lote ${lote ? lote.code : "—"}`}
      description={
        descripcion ??
        `${material.especie} · ${material.piezas} troza${material.piezas === 1 ? "" : "s"} a consumir`
      }
      footer={
        <ModalFooter
          error={error ?? (motivos.length > 0 && paquetes.length > 0 ? motivos[0] : null)}
          nota={
            <span className="font-mono tabular-nums">
              {totales.paquetes} paquete{totales.paquetes === 1 ? "" : "s"} · {totales.piezas} pza ·{" "}
              {totales.volumen.toFixed(4)} m³
              {/* Al ampliar, el pie dice las dos cifras: lo que se agrega ahora y
                  con cuánto queda la corrida. Una sola se lee como la otra. */}
              {previo > 0 && ` · total ${acumulado.toFixed(4)} m³`}
              {rendimientoPct != null && ` · rendimiento ${rendimientoPct}%`}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Cerrar
          </Btn>
          <Btn
            variant="primary"
            disabled={!listo}
            onClick={() =>
              onConfirmar({
                fecha: dia,
                lineaProduccion: linea,
                observaciones: observaciones.trim() || null,
                paquetes,
                volumen: totales.volumen,
              })
            }
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Boxes className="h-4 w-4" />}
            {ctaLabel ?? "Guardar producción"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {/* ── Material ── */}
        <Bloque
          titulo="Material"
          meta={
            lote
              ? `Lote ${lote.code} · ${fmtDia(lote.inicioProceso ?? lote.fechaApertura)} → ${fmtDia(lote.finProceso)}`
              : undefined
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Dato
                label="Especie"
                valor={
                  material.especieCientifica
                    ? `${material.especieCientifica} (${material.especie.toUpperCase()})`
                    : material.especie
                }
              />
            </div>
            <Dato label="Cantidad" valor={String(material.piezas)} />
            <div className="grid grid-cols-2 gap-2">
              <Dato label="Volumen" valor={material.volumenM3.toFixed(4)} />
              <div className="text-sm">
                <span className="mb-1 block font-bold text-[var(--text-secondary)]">Rendimiento</span>
                <p
                  className={`flex h-11 items-center gap-1.5 rounded-xl px-2.5 font-mono font-bold tabular-nums ${
                    veredicto.tono === "ok"
                      ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                      : veredicto.tono === "neutro"
                        ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                        : "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                  }`}
                >
                  <Gauge className="h-4 w-4" aria-hidden />
                  {rendimientoPct != null ? `${rendimientoPct} %` : "—"}
                </p>
              </div>
            </div>
          </div>
          {/* El techo, a la vista MIENTRAS se carga: enterarse al apretar
              «Guardar» es enterarse tarde (ADR-358). */}
          <div
            className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${
              margen > 0
                ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                : "bg-[var(--data-error-500)]/12 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {margen === 0 && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
              Tope de rendimiento <b>{RENDIMIENTO_TOPE_PCT} %</b> · máximo declarable{" "}
              <b className="font-mono tabular-nums">{tope.toFixed(4)} m³</b>
              {/* Lo ya declarado se NOMBRA acá: es lo que explica por qué el
                  margen no es el tope entero (ADR-361). */}
              {previo > 0 && (
                <>
                  {" "}· ya declarado <b className="font-mono tabular-nums">{previo.toFixed(4)} m³</b>
                </>
              )}
            </span>
            <span className="font-mono tabular-nums">
              {margen > 0 ? `quedan ${margen.toFixed(4)} m³` : "sin margen: sacá volumen para guardar"}
            </span>
          </div>

          {/* La barra hace obvio el límite: el número solo se lee, la barra se
              VE llenarse mientras se cargan paquetes. */}
          {tope > 0 && (
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={tope}
              aria-valuenow={Math.min(acumulado, tope)}
              aria-label={`Declarado ${acumulado.toFixed(4)} de ${tope.toFixed(4)} m³ que permite el tope`}
            >
              <div
                className={`h-full rounded-full transition-[width] ${
                  margen > 0 ? "bg-[var(--accent)]" : "bg-[var(--data-error-500)]"
                }`}
                style={{ width: `${Math.min(100, (acumulado / tope) * 100)}%` }}
              />
            </div>
          )}

          {/* Reparto entre títulos habilitantes (ADR-358). */}
          {reparto.length > 1 ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--rule-base)]">
              <div className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Cómo se reparte entre los títulos habilitantes
              </div>
              <ul className="divide-y divide-[var(--rule-soft)]">
                {reparto.map((o) => (
                  <li key={o.permiso ?? "sin"} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <b className="font-mono text-[var(--text-primary)]">{o.permiso ?? "sin título declarado"}</b>
                      <span className="ml-2 text-[var(--text-tertiary)]">
                        {o.piezas} pza · {o.volumenM3.toFixed(4)} m³ de materia prima ({o.pctMateriaPrima} %)
                      </span>
                    </span>
                    <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {o.produccionM3.toFixed(4)} m³
                    </span>
                  </li>
                ))}
              </ul>
              <p className="px-3 py-1.5 text-xs text-[var(--text-tertiary)]">
                Proporcional al volumen que puso cada uno: de una tabla no se puede decir de qué árbol salió, pero sí
                en qué proporción entró cada título.
              </p>
            </div>
          ) : (
            material.permisos.length > 0 && (
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                Amparada por {material.permisos.length === 1 ? "el título" : "los títulos"}{" "}
                <b className="text-[var(--text-secondary)]">{material.permisos.join(" · ")}</b>
              </p>
            )
          )}

          {/**
           * Lo que hay que tener a mano mientras se declara: la madera pieza por
           * pieza, de qué guía y título viene, y lo que la corrida ya declaró.
           * Plegado en solapas — sin esto había que cerrar el modal (perdiendo
           * lo tipeado) para ir a buscarlo a otra pestaña.
           */}
          <CtpMaterialPanel
            trozas={trozas}
            origenes={material.origenes}
            paquetesPrevios={paquetesPrevios}
            fecha={dia}
          />
        </Bloque>

        {/* ── La corrida: se llena UNA vez ──────────────────────────────────
            Estaba mezclada con los campos del paquete, que se repiten por cada
            atado. Dos cosas distintas en la misma grilla hacían tipear la línea
            y la fecha creyendo que eran del paquete. */}
        <Bloque titulo="La corrida">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/**
             * Ampliando, la corrida YA existe: su fecha y su línea son las del
             * asiento que se está completando y el servidor no las toca. Se
             * muestran como dato — un campo editable que no viaja es una mentira
             * de la pantalla.
             */}
            {previo > 0 ? (
              <>
                <Dato label="Línea de producción" valor={linea} />
                <Dato label="Fecha de producción" valor={fmtDia(dia)} />
              </>
            ) : (
              <>
                <Campo label="Línea de producción">
                  <select value={linea} onChange={(e) => setLinea(e.target.value)} className={CAMPO}>
                    {/* Las dos del Cuadro Resumen 3: principal y recuperación. */}
                    <option value="LP">LP · línea principal</option>
                    <option value="LRE">LRE · línea de recuperación</option>
                  </select>
                </Campo>
                <Campo label="Fecha de producción">
                  <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={CAMPO} />
                </Campo>
              </>
            )}
            <Campo label="Observación de la corrida">
              <input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder={previo > 0 ? "Si la escribís, reemplaza la anterior" : "Turno, sierra…"}
                maxLength={300}
                className={CAMPO}
              />
            </Campo>
          </div>

        </Bloque>

        {/* ── El paquete: se repite por cada atado que sale de la sierra ── */}
        <Bloque titulo="Agregar paquete">
          {/* Las medidas de siempre, antes del formulario: se elige una y los
              cuatro campos quedan puestos. */}
          {medidas.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {medidasDeOtros
                  ? "Las de siempre (de otros productos)"
                  : `Las de siempre en ${TIPOS_PRODUCTO_SALIDA.find((t) => t.valor === producto)?.label ?? producto}`}
              </span>
              {medidas.map((m) => (
                <button
                  key={`${m.productType}-${m.presentacion}-${m.espesorCm}-${m.anchoCm}-${m.largoM}`}
                  type="button"
                  title={`Usada ${m.veces} ${m.veces === 1 ? "vez" : "veces"}${m.productType ? ` · ${m.productType}` : ""}`}
                  onClick={() => {
                    /* Se dimensiona sí o sí: el volumen sale de las medidas, y
                       dejarlo en manual daría dos verdades para el mismo bulto. */
                    setDimensionar(true);
                    setEspesor(String(m.espesorCm));
                    setAncho(String(m.anchoCm));
                    setLargo(String(m.largoM));
                    if (m.productType) setProducto(m.productType);
                    if (m.presentacion) setPresentacion(m.presentacion);
                  }}
                  className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-sm tabular-nums text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] sm:h-9"
                >
                  {m.espesorCm} × {m.anchoCm} cm × {m.largoM} m
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Código de paquete">
              <input
                value={codigo}
                onChange={(e) => { codigoTocado.current = true; setCodigo(e.target.value); }}
                placeholder="PQ-001"
                maxLength={60}
                className={CAMPO}
              />
              {/* De dónde salió el sugerido: el código es único en TODA la
                  planta, así que se propone el próximo libre de la serie. */}
              {!codigoTocado.current && codigo && (
                <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                  Siguiente libre de la serie · {codigosPlanta.length} código
                  {codigosPlanta.length === 1 ? "" : "s"} ya usados en la planta
                </span>
              )}
            </Campo>
            <Campo label="Producto">
              {/**
               * Elegir el producto pone la presentación: la paquetería sale
               * ATADA (PAQUETES) y el resto de la aserrada se cuenta pieza por
               * pieza (PIEZAS). Se hace en el gesto y no en un efecto, para que
               * cambiarla a mano después no se revierta sola.
               */}
              <select
                value={producto}
                onChange={(e) => {
                  const valor = e.target.value;
                  setProducto(valor);
                  const sugerida = presentacionSugerida(valor);
                  setPresentacionAuto(sugerida != null);
                  if (sugerida) setPresentacion(sugerida);
                }}
                className={CAMPO}
              >
                {TIPOS_PRODUCTO_SALIDA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Presentación">
              <select
                value={presentacion}
                onChange={(e) => { setPresentacion(e.target.value); setPresentacionAuto(false); }}
                className={CAMPO}
              >
                {PRESENTACIONES_LOCTP.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {/* Un campo que se llena solo sin avisar se lee como un error de
                  la pantalla. Y se puede cambiar: el libro tiene que poder decir
                  que esta vez salió suelto. */}
              {presentacionAuto && (
                <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                  La puso el producto — cambiala si esta vez salió de otra forma.
                </span>
              )}
            </Campo>
            <Campo label="Cantidad (piezas)">
              <input
                type="number"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className={CAMPO}
              />
            </Campo>
          </div>

          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={dimensionar}
              onChange={(e) => setDimensionar(e.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            Dimensionar (espesor × ancho × largo)
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dimensionar ? (
              <>
                <Campo label="Espesor (cm)">
                  <input type="number" min={0} step="0.01" value={espesor} onChange={(e) => setEspesor(e.target.value)} className={CAMPO} />
                </Campo>
                <Campo label="Ancho (cm)">
                  <input type="number" min={0} step="0.01" value={ancho} onChange={(e) => setAncho(e.target.value)} className={CAMPO} />
                </Campo>
                <Campo label="Largo (m)">
                  <input type="number" min={0} step="0.01" value={largo} onChange={(e) => setLargo(e.target.value)} className={CAMPO} />
                </Campo>
                {/* Calculado, no tipeado: con las medidas puestas, escribir otro
                    volumen crea dos verdades sobre el mismo paquete. */}
                <Dato
                  label="Volumen (m³)"
                  valor={
                    volumenCalculado != null
                      ? `${volumenCalculado.toFixed(4)}  ·  ${pieTablarDe(volumenCalculado).toLocaleString("es-PE")} pt`
                      : "—"
                  }
                />
              </>
            ) : (
              <>
                <Campo label="Volumen (m³)">
                  <input
                    type="number"
                    min={0}
                    step="0.0001"
                    value={volumen}
                    onChange={(e) => setVolumen(e.target.value)}
                    className={CAMPO}
                  />
                </Campo>
                {/**
                 * El mismo bulto, en la unidad en la que se canta en el patio.
                 *
                 * El parte del turno viene en pie tablar y el libro se declara en
                 * m³: la conversión se hacía en una calculadora aparte, que es
                 * donde aparecen los volúmenes que después no cuadran. Se
                 * escriben los dos y cada uno actualiza al otro — un solo dato
                 * con dos caras, no dos campos que puedan discrepar.
                 */}
                <Campo label="Pie tablar (equivale)">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={volumen === "" ? "" : String(Math.round((Number(volumen) || 0) * PT_POR_M3))}
                    onChange={(e) => {
                      const pt = Number(e.target.value);
                      setVolumen(e.target.value === "" || !Number.isFinite(pt) ? "" : String(Math.round((pt / PT_POR_M3) * 10_000) / 10_000));
                    }}
                    className={CAMPO}
                  />
                </Campo>
                <Campo label="Observación del paquete">
                  <input value={obsPaquete} onChange={(e) => setObsPaquete(e.target.value)} maxLength={300} className={CAMPO} />
                </Campo>
              </>
            )}
            <div className="flex items-end">
              <Btn variant="primary" onClick={agregar} disabled={Boolean(noEntra)} title={noEntra ?? undefined}>
                <Plus className="h-4 w-4" /> Añadir
              </Btn>
            </div>
          </div>

          {/* Por qué el botón está apagado. Un botón gris sin motivo se lee como
              que la pantalla se rompió. */}
          {noEntra && (volumenAUsar ?? 0) > 0 && (
            <p className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {noEntra}
            </p>
          )}
        </Bloque>

        {/* ── Producción cargada ── */}
        <Bloque
          titulo={previo > 0 ? `Paquetes que se agregan (${paquetes.length})` : `Producción (${paquetes.length})`}
          meta={previo > 0 ? `La corrida ya tiene ${codigosUsados?.length ?? 0} paquete(s) cargados` : undefined}
        >
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-3 py-2 font-bold">Código paquete</th>
                <th className="px-3 py-2 font-bold">Producto</th>
                <th className="px-3 py-2 font-bold">Presentación</th>
                <th className="px-3 py-2 text-right font-bold">Cant.</th>
                <th className="px-3 py-2 text-right font-bold">Esp. (cm)</th>
                <th className="px-3 py-2 text-right font-bold">Ancho (cm)</th>
                <th className="px-3 py-2 text-right font-bold">Largo (m)</th>
                <th className="px-3 py-2 text-right font-bold">Volumen</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {paquetes.length === 0 && (
                <FilaVacia cols={9}>
                  {previo > 0
                    ? "Todavía no agregaste ningún paquete. Los que cargues acá se SUMAN a los que la corrida ya declaró; los anteriores no se tocan."
                    : "Todavía no agregaste ningún paquete. El volumen de la corrida es la suma de los que cargues acá."}
                </FilaVacia>
              )}
              {paquetes.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{p.codigo}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">
                    {TIPOS_PRODUCTO_SALIDA.find((t) => t.valor === p.productType)?.label ?? p.productType}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{p.presentacion}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{p.cantidad}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                    {p.espesorCm ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                    {p.anchoCm ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                    {p.largoM ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {p.volumenM3.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setPaquetes((prev) => prev.filter((x) => x.id !== p.id))}
                      aria-label={`Quitar el paquete ${p.codigo}`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </TbodyCtp>
          </TablaCtp>

          {/* El balance del formato: qué entró, qué salió y con qué rendimiento. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">
              Consumido{" "}
              <b className="font-mono tabular-nums text-[var(--text-primary)]">{material.volumenM3.toFixed(4)} m³</b>
            </span>
            <span className="text-[var(--text-secondary)]">
              Volumen producción{" "}
              <b className="font-mono tabular-nums text-[var(--text-primary)]">{totales.volumen.toFixed(4)} m³</b>
              {previo > 0 && (
                <span className="text-[var(--text-tertiary)]">
                  {" "}+ {previo.toFixed(4)} ya declarado ={" "}
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">{acumulado.toFixed(4)} m³</b>
                </span>
              )}
            </span>
            <span className="text-[var(--text-secondary)]">
              Rendimiento{" "}
              <b className="font-mono tabular-nums text-[var(--text-primary)]">
                {rendimientoPct != null ? `${rendimientoPct} %` : "—"}
              </b>{" "}
              <span className="text-[var(--text-tertiary)]">· {veredicto.texto}</span>
            </span>
          </div>
        </Bloque>
      </ModalBody>
    </AdminModal>
  );
}
