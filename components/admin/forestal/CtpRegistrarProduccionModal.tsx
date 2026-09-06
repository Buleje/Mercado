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
import { AlertTriangle, Boxes, ChevronDown, Copy, Gauge, Loader2, Pencil, Plus, Trash2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  PRESENTACIONES_LOCTP,
  RENDIMIENTO_PLAUSIBLE_MAX,
  RENDIMIENTO_PLAUSIBLE_MIN,
  TIPOS_PRODUCTO_SALIDA,
  presentacionSugerida,
} from "@/lib/forestal/loctp-catalogos";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
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

/**
 * Un bloque del formulario oficial, con su barra de título.
 *
 * `plegable` lo cierra por defecto y deja el `resumen` a la vista: el material y
 * los datos de la corrida se leen UNA vez y después estorban, pero esconderlos
 * sin decir qué valen obligaría a abrirlos igual para comprobar.
 */
function Bloque({
  titulo,
  meta,
  children,
  onKeyDown,
  plegable = false,
  resumen,
  acciones,
}: {
  titulo: string;
  /** Contexto corto a la derecha del título: el lote, sus fechas. Antes eso era
   *  un bloque entero para tres datos que se miran de reojo. */
  meta?: string;
  children: React.ReactNode;
  /** Atajos del bloque (Enter = Añadir en el del paquete). */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  plegable?: boolean;
  /** Lo que dice el bloque cerrado. Sin esto, plegar es esconder. */
  resumen?: string;
  /** Un control que vive en la barra de título (el interruptor de dimensionar). */
  acciones?: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(!plegable);
  const cabecera = (
    <>
      <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
      {!abierto && resumen ? (
        <span className="min-w-0 flex-1 truncate text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
          {resumen}
        </span>
      ) : (
        meta && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>
      )}
    </>
  );
  return (
    <section className="rounded-xl border border-[var(--rule-base)]">
      {plegable ? (
        <CardTitle as="h3" className="rounded-t-xl bg-[var(--surface-sunken)]">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="flex w-full flex-wrap items-baseline gap-2 rounded-t-xl px-3 py-2 text-left transition-colors hover:bg-[var(--surface-canvas)]"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 self-center text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-180" : ""}`}
              aria-hidden
            />
            {cabecera}
          </button>
        </CardTitle>
      ) : (
        <CardTitle as="h3" className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-[var(--surface-sunken)] px-3 py-2">
          {cabecera}
          {acciones}
        </CardTitle>
      )}
      {abierto && (
        <div className="p-3" onKeyDown={onKeyDown}>
          {children}
        </div>
      )}
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
  productoInicial,
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
  /**
   * Con qué producto arranca el primer paquete (modo inventario, ADR-?): el
   * paso 1 ya preguntó "qué va a salir" y repetir la elección acá sería
   * ignorar lo que el operador ya contestó. Sigue siendo editable.
   */
  productoInicial?: string | null;
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
  const [producto, setProducto] = useState<string>(productoInicial || TIPOS_PRODUCTO_SALIDA[0]?.valor || "");
  /* Arranca en la del producto inicial, para que el primer paquete no salga con
     una presentación que el producto contradice. */
  const [presentacion, setPresentacion] = useState<string>(
    () => presentacionSugerida(productoInicial || TIPOS_PRODUCTO_SALIDA[0]?.valor) ?? "PAQUETES",
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

  /**
   * El paquete que se está EDITANDO, si hay uno.
   *
   * Antes sólo se podía quitar y volver a tipear: equivocarse en el volumen del
   * paquete 3 de 15 costaba re-cargarlo entero. Editando, el formulario es el
   * mismo — un segundo formulario para corregir sería otro lugar donde el
   * volumen puede salir distinto.
   */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /**
   * Cuántos paquetes IGUALES crear de una (A1).
   *
   * El turno real es «doce paquetes de 2 × 20 × 3.20»: doce vueltas del mismo
   * formulario cambiando sólo el correlativo del código. Acá se pone 12 y salen
   * los doce, cada uno con su código libre de la serie.
   */
  const [repetir, setRepetir] = useState("1");
  /** Para devolver el foco acá al abrir y después de cada paquete agregado. */
  const cantidadRef = useRef<HTMLInputElement>(null);

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

  /**
   * El borrador de la carga, guardado por corrida (B1).
   *
   * Cerrar el modal con catorce paquetes cargados los perdía todos, y volver a
   * tipearlos es media hora. Mismo patrón que la selección de trozas del panel
   * del lote: se guarda en cada cambio y se recupera al abrir.
   *
   * ⚠️ Al recuperar se DESCARTA lo que la corrida ya declaró (por código): si
   * el guardado salió bien y el modal se reabre, el borrador viejo volvería a
   * proponer paquetes que ya están en el libro — declararlos dos veces.
   */
  const claveBorrador = `buleje-ctp-produccion-borrador:${lote?.id ?? titulo ?? "produccion"}`;
  const [borradorRecuperado, setBorradorRecuperado] = useState(0);
  const borradorLeido = useRef(false);
  useEffect(() => {
    if (borradorLeido.current) return;
    borradorLeido.current = true;
    try {
      const crudo = localStorage.getItem(claveBorrador);
      if (!crudo) return;
      const b = JSON.parse(crudo) as { paquetes?: PaqueteBorrador[]; dia?: string; linea?: string; observaciones?: string };
      const yaEnElLibro = new Set(codigosUsados);
      const rescatados = (b.paquetes ?? []).filter((p) => p?.codigo && !yaEnElLibro.has(p.codigo));
      if (rescatados.length === 0) {
        localStorage.removeItem(claveBorrador);
        return;
      }
      setPaquetes(rescatados);
      if (b.dia) setDia(b.dia);
      if (b.linea) setLinea(b.linea);
      if (b.observaciones) setObservaciones(b.observaciones);
      setBorradorRecuperado(rescatados.length);
    } catch {
      /* JSON corrupto, storage bloqueado o modo privado: se arranca en blanco,
         que es como estaba antes. Un borrador nunca puede romper la carga. */
    }
  }, [claveBorrador, codigosUsados]);
  useEffect(() => {
    /* No escribir ANTES de leer: el efecto de guardado corre en el primer
       render y pisaría el borrador con el estado vacío — el mismo bug que borró
       los precios por especie del cubicador. */
    if (!borradorLeido.current) return;
    try {
      if (paquetes.length === 0) localStorage.removeItem(claveBorrador);
      else localStorage.setItem(claveBorrador, JSON.stringify({ paquetes, dia, linea, observaciones }));
    } catch {
      /* Sin persistencia se sigue cargando igual: es una red, no un requisito. */
    }
  }, [claveBorrador, paquetes, dia, linea, observaciones]);
  const descartarBorrador = () => {
    setPaquetes([]);
    setBorradorRecuperado(0);
    try { localStorage.removeItem(claveBorrador); } catch { /* idem */ }
  };

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
  /**
   * El paquete que se está editando y el margen que le corresponde A ÉL.
   *
   * `margen` ya descuenta el volumen del paquete editado (está en `paquetes`).
   * Si no se lo devolviera, corregir «3.0 → 3.0» diría que no entra: el propio
   * paquete estaría compitiendo consigo mismo por el tope.
   */
  const editando = useMemo(() => paquetes.find((p) => p.id === editandoId) ?? null, [paquetes, editandoId]);
  const margenParaEste = Math.round((margen + (editando?.volumenM3 ?? 0)) * 10_000) / 10_000;
  /** Cuántos iguales se van a crear. Editando siempre es 1: se corrige uno. */
  const veces = editandoId ? 1 : Math.max(1, Math.min(200, Math.floor(Number(repetir) || 1)));
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
   * Guardar: se limpia el borrador y se entrega.
   *
   * Se limpia ACÁ y no al cerrar: si el guardado falla, el modal queda abierto
   * con los paquetes en pantalla y se puede reintentar. Dejar el borrador vivo
   * después de un guardado exitoso es peor — al reabrir propondría declarar de
   * nuevo lo que ya está en el libro.
   */
  const confirmar = useCallback(() => {
    if (!listo) return;
    try { localStorage.removeItem(claveBorrador); } catch { /* storage bloqueado */ }
    onConfirmar({
      fecha: dia,
      lineaProduccion: linea,
      observaciones: observaciones.trim() || null,
      paquetes,
      volumen: totales.volumen,
    });
  }, [listo, claveBorrador, onConfirmar, dia, linea, observaciones, paquetes, totales.volumen]);

  /* Ctrl+Enter guarda desde cualquier campo: con veinte paquetes cargados,
     buscar el botón con el mouse es el último peaje de la jornada. */
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        confirmar();
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [confirmar]);

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
      : material.volumenM3 > 0 && volumenAUsar * veces > margenParaEste
        ? margenParaEste > 0
          ? veces > 1
            ? `${veces} paquetes de ${fmtM3(volumenAUsar)} m³ pasan el tope del ${RENDIMIENTO_TOPE_PCT} %: entran ${fmtM3(margenParaEste)} m³ más (${Math.floor(margenParaEste / volumenAUsar)} paquete(s)).`
            : `Ese paquete pasa el tope del ${RENDIMIENTO_TOPE_PCT} %: entran ${fmtM3(margenParaEste)} m³ más.`
          : `Ya se llegó al tope del ${RENDIMIENTO_TOPE_PCT} % (${fmtM3(tope)} m³). Sacá un paquete para agregar otro.`
        : null;

  /** Los campos del paquete, tal como quedaron en el formulario. */
  function camposDelForm(id: string, cod: string): PaqueteBorrador {
    return {
      id,
      codigo: cod,
      productType: producto,
      presentacion,
      cantidad: piezas,
      volumenM3: volumenAUsar as number,
      espesorCm: dimensionar ? Number(espesor) || null : null,
      anchoCm: dimensionar ? Number(ancho) || null : null,
      largoM: dimensionar ? Number(largo) || null : null,
      observations: obsPaquete.trim(),
    };
  }

  /** Deja el formulario listo para el paquete siguiente, con el código libre. */
  function prepararSiguiente(ocupados: readonly string[]) {
    const siguiente = proponerCodigo(ocupados);
    setCodigo(siguiente);
    sugeridoRef.current = siguiente;
    codigoTocado.current = false;
    setObsPaquete("");
    setRepetir("1");
    /* `preventScroll`: enfocar sin arrastrar el scroll del modal. Sin esto,
       cada paquete agregado saltaba la vista al medio del formulario y tapaba
       la franja de estado y la lista. */
    cantidadRef.current?.focus({ preventScroll: true });
  }

  function agregar() {
    /* El guard vive en `noEntra` (que es lo que apaga el botón y explica por
       qué): acá sólo se re-afirma el tipo, porque TS no lo puede deducir de él. */
    if (noEntra || !(volumenAUsar && volumenAUsar > 0)) return;

    /* Corrigiendo: se reemplaza EN SU LUGAR, conservando el id y la posición.
       Sacarlo y volver a agregarlo lo mandaría al final de la lista, y el orden
       de los paquetes es el orden en que salieron de la sierra. */
    if (editandoId) {
      const cod = codigo.trim();
      setPaquetes((prev) => prev.map((p) => (p.id === editandoId ? camposDelForm(p.id, cod) : p)));
      setEditandoId(null);
      prepararSiguiente([cod]);
      return;
    }

    /* N paquetes iguales de una (A1): cada uno con el próximo código libre.
       Los ya creados en este mismo click viajan como ocupados —todavía no
       están en el estado— para que la serie no se repita. */
    const nuevos: PaqueteBorrador[] = [];
    const usados: string[] = [];
    for (let k = 0; k < veces; k++) {
      const cod = k === 0 ? codigo.trim() : proponerCodigo(usados);
      if (!cod) break;
      usados.push(cod);
      nuevos.push(camposDelForm(`${Date.now()}-${paquetes.length + k}`, cod));
    }
    setPaquetes((prev) => [...prev, ...nuevos]);
    /* El resto de los campos QUEDA: una jornada carga veinte paquetes iguales
       cambiando el número. */
    prepararSiguiente(usados);
  }

  /**
   * Traer un paquete de la lista al formulario.
   *
   * `editar` lo corrige en su lugar; `duplicar` lo usa de molde y le da el
   * próximo código libre — que es como se cargan dos atados iguales seguidos.
   */
  function cargarEnForm(p: PaqueteBorrador, modo: "editar" | "duplicar") {
    setProducto(p.productType);
    setPresentacion(p.presentacion);
    setPresentacionAuto(false);
    setCantidad(p.cantidad ? String(p.cantidad) : "");
    setObsPaquete(p.observations ?? "");
    setRepetir("1");
    const dim = p.espesorCm != null && p.anchoCm != null && p.largoM != null;
    setDimensionar(dim);
    setEspesor(dim ? String(p.espesorCm) : "");
    setAncho(dim ? String(p.anchoCm) : "");
    setLargo(dim ? String(p.largoM) : "");
    setVolumen(dim ? "" : String(p.volumenM3));
    if (modo === "editar") {
      setEditandoId(p.id);
      setCodigo(p.codigo);
      codigoTocado.current = true;
    } else {
      setEditandoId(null);
      const cod = proponerCodigo([p.codigo]);
      setCodigo(cod);
      sugeridoRef.current = cod;
      codigoTocado.current = false;
    }
    /* `preventScroll`: enfocar sin arrastrar el scroll del modal. Sin esto,
       cada paquete agregado saltaba la vista al medio del formulario y tapaba
       la franja de estado y la lista. */
    cantidadRef.current?.focus({ preventScroll: true });
  }

  /** Salir de la edición sin tocar el paquete. */
  function cancelarEdicion() {
    setEditandoId(null);
    prepararSiguiente([]);
  }

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="info"
      /* 80rem en vez de las 64 del variant: con dos columnas, 64rem dejaba los
         campos del paquete en ~110 px cada uno. `cn` usa twMerge, así que este
         ancho le gana al de la variante. */
      className="sm:max-w-[88rem]"
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
              {fmtM3(totales.volumen)} m³
              {/* Al ampliar, el pie dice las dos cifras: lo que se agrega ahora y
                  con cuánto queda la corrida. Una sola se lee como la otra. */}
              {previo > 0 && ` · total ${fmtM3(acumulado)} m³`}
              {rendimientoPct != null && ` · rendimiento ${rendimientoPct}%`}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Cerrar
          </Btn>
          <Btn variant="primary" disabled={!listo} onClick={confirmar} title="Ctrl+Enter">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Boxes className="h-4 w-4" />}
            {ctaLabel ?? "Guardar producción"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3 @container">
        {/* Un borrador que vuelve SIN avisar es peor que perderlo: el operador
            guardaría paquetes que no recuerda haber cargado. Se dice, y se
            puede descartar de un click. */}
        {borradorRecuperado > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--data-info-500)]/12 px-3 py-2 text-sm text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
            <Boxes className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              Recuperé <b className="tabular-nums">{borradorRecuperado}</b> paquete
              {borradorRecuperado === 1 ? "" : "s"} que habías cargado y no llegaste a guardar.
            </span>
            <button
              type="button"
              onClick={descartarBorrador}
              className="shrink-0 font-bold underline underline-offset-2"
            >
              Descartar y empezar de cero
            </button>
          </p>
        )}


        {/**
         * La FRANJA DE ESTADO: el único renglón que gobierna la tarea.
         *
         * Antes esto vivía adentro del bloque «Material», en una columna
         * lateral: el dato que decide si entra otro paquete estaba enterrado
         * al costado, y el rendimiento se repetía en tres lugares distintos.
         * Acá va a lo ancho, arriba de todo y pegado al scroll — se lee la
         * cuenta completa de izquierda a derecha: qué entró, qué se declaró,
         * cuánto queda.
         */}
        <div
          className={`sticky top-0 z-20 rounded-xl border-2 px-3 py-2 ${
            margen > 0
              ? "border-[var(--rule-base)] bg-[var(--surface-raised)]"
              : "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10"
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">
              Entró{" "}
              <b className="font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(material.volumenM3)} m³</b>
            </span>
            <span aria-hidden className="text-[var(--text-tertiary)]">→</span>
            <span className="text-[var(--text-secondary)]">
              Declarado{" "}
              <b className="font-mono text-base tabular-nums text-[var(--text-primary)]">{fmtM3(acumulado)} m³</b>
              {previo > 0 && (
                <span className="ml-1 text-xs text-[var(--text-tertiary)]">
                  ({fmtM3(previo)} de antes + {fmtM3(totales.volumen)} ahora)
                </span>
              )}
            </span>
            <span
              className={`font-bold ${
                margen > 0
                  ? "text-[var(--text-secondary)]"
                  : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              }`}
            >
              {margen > 0 ? (
                <>
                  Quedan{" "}
                  <b className="font-mono text-base tabular-nums">{fmtM3(margen)} m³</b>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Sin margen: sacá volumen para guardar
                </span>
              )}
            </span>
            {/* El rendimiento, UNA sola vez en todo el modal. */}
            <span className="ml-auto flex items-center gap-1.5">
              <Gauge className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <b className="font-mono text-base tabular-nums text-[var(--text-primary)]">
                {rendimientoPct != null ? `${rendimientoPct} %` : "—"}
              </b>
              <span className="text-xs text-[var(--text-tertiary)]">{veredicto.texto}</span>
            </span>
          </div>
          {tope > 0 && (
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={tope}
              aria-valuenow={Math.min(acumulado, tope)}
              aria-label={`Declarado ${fmtM3(acumulado)} de ${fmtM3(tope)} m³ que permite el tope`}
            >
              <div
                className={`h-full rounded-full transition-[width] ${
                  margen > 0 ? "bg-[var(--accent)]" : "bg-[var(--data-error-500)]"
                }`}
                style={{ width: `${Math.min(100, (acumulado / tope) * 100)}%` }}
              />
            </div>
          )}
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Tope de rendimiento {RENDIMIENTO_TOPE_PCT} % · máximo declarable{" "}
            <b className="font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(tope)} m³</b>
          </p>
        </div>

        {/**
         * Dos columnas desde 1280 px (C1, Brandon 2026-09-03).
         *
         * Apilado, el formulario del paquete quedaba TAPADO por el pie del
         * modal y la lista de lo cargado no se veía nunca: había que scrollear
         * a ciegas entre cargar y comprobar. Izquierda el CONTEXTO —de qué
         * madera se trata y con qué tope—, derecha el TRABAJO —cargar paquetes
         * y verlos aparecer—.
         *
         * `@container` en cada columna: las grillas de adentro miden la COLUMNA
         * y no la ventana. Con breakpoints de viewport, cuatro campos en una
         * columna de 650 px daban 110 px cada uno.
         */}
        {/**
         * UNA columna a todo el ancho (Brandon, 2026-09-03: «más grande, más
         * amplio, mejor ordenado»).
         *
         * Las dos columnas de la vuelta anterior salieron peor: la del
         * formulario quedaba en ~430 px —por debajo del umbral de la grilla— y
         * los campos se apilaban de a UNO por fila, mientras la de la lista
         * quedaba vacía casi todo el tiempo. Los dos bloques quieren ancho, no
         * altura: el formulario porque son campos cortos que entran de a cuatro,
         * y la tabla porque tiene diez columnas.
         *
         * El orden es el del formato oficial: material → corrida → producción.
         * Los dos primeros van plegados, en un renglón: se leen una vez.
         */}
        <div className="grid gap-3 @3xl:grid-cols-2">
        {/* ── Material ── */}
        <div className="@container">
        <Bloque
          titulo="Material"
          plegable
          resumen={`${material.especie}${material.piezas > 0 ? ` · ${material.piezas} trozas` : ""} · ${fmtM3(material.volumenM3)} m³`}
          meta={
            lote
              ? `Lote ${lote.code} · ${fmtDia(lote.inicioProceso ?? lote.fechaApertura)} → ${fmtDia(lote.finProceso)}`
              : undefined
          }
        >
          <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
            {/* Inventario declarado (ADR-?) no trae piezas reales que contar:
                un "Cantidad: 0" al lado de "Volumen: 10.0000" se lee como que
                falta algo, cuando en realidad no aplica. Sólo se muestra
                cuando hay piezas de verdad. */}
            <div className={material.piezas > 0 ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-3"}>
              <Dato
                label="Especie"
                valor={
                  material.especieCientifica
                    ? `${material.especieCientifica} (${material.especie.toUpperCase()})`
                    : material.especie
                }
              />
            </div>
            {material.piezas > 0 && <Dato label="Cantidad" valor={String(material.piezas)} />}
            <div className="grid grid-cols-2 gap-2">
              <Dato label="Volumen" valor={fmtM3(material.volumenM3)} />
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
                        {o.piezas} pza · {fmtM3(o.volumenM3)} m³ de materia prima ({o.pctMateriaPrima} %)
                      </span>
                    </span>
                    <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtM3(o.produccionM3)} m³
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
        </div>

        {/* ── La corrida: se llena UNA vez ──────────────────────────────────
            Estaba mezclada con los campos del paquete, que se repiten por cada
            atado. Dos cosas distintas en la misma grilla hacían tipear la línea
            y la fecha creyendo que eran del paquete. */}
        <div className="@container">
        <Bloque titulo="La corrida" plegable resumen={`${fmtDia(dia)} · ${linea}`}>
          <div className="grid gap-3 @lg:grid-cols-2 @2xl:grid-cols-3">
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
        </div>

        </div>

        {/* ── El paquete: se repite por cada atado que sale de la sierra ── */}
        <Bloque
          titulo={editandoId ? `Corrigiendo el paquete ${editando?.codigo ?? ""}` : "Agregar paquete"}
          meta={editandoId ? "Enter guarda el cambio" : "Enter añade · Ctrl+Enter guarda"}
          /* El interruptor era una fila entera para una casilla. En la barra de
             título ocupa cero alto y sigue estando ANTES de los campos que
             cambia, que es lo que importa para entenderlo. */
          acciones={
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-sm font-bold text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={dimensionar}
                onChange={(e) => setDimensionar(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Dimensionar (espesor × ancho × largo)
            </label>
          }
          onKeyDown={(e) => {
            /* Enter añade, como en cualquier planilla. En un `select` no: ahí
               Enter es «elegir esta opción», y robárselo cambiaría el producto
               sin querer. Ctrl+Enter lo maneja el atajo global de guardar. */
            if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
            const t = e.target as HTMLElement;
            if (t.tagName === "SELECT" || t.tagName === "BUTTON" || t.tagName === "TEXTAREA") return;
            e.preventDefault();
            if (!noEntra) agregar();
          }}
        >
          {/* Las medidas de siempre, antes del formulario: se elige una y los
              cuatro campos quedan puestos. */}
          {medidas.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {medidasDeOtros ? "Las de siempre (de otros productos)" : `Las de siempre en ${producto}`}
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
          <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
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
                {/* El valor oficial del catálogo, tal cual — es como ya se
                    muestra en la tabla del libro y en la tarjeta del lote;
                    una versión acortada acá sería un segundo vocabulario para
                    lo mismo (Brandon, 2026-08-31). */}
                {TIPOS_PRODUCTO_SALIDA.map((t) => (
                  <option key={t.valor} value={t.valor} title={t.label}>
                    {t.valor}
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
                ref={cantidadRef}
                type="number"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className={CAMPO}
              />
            </Campo>
          </div>

          <div className="mt-3 grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
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
                      ? `${fmtM3(volumenCalculado)}  ·  ${pieTablarDe(volumenCalculado).toLocaleString("es-PE")} pt`
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
                  {/* El último paquete siempre se calcula a mano: «me quedan
                      3.030, ¿cuánto pongo?». Acá se pone solo (D1). */}
                  {margenParaEste > 0 && Number(volumen) !== margenParaEste && (
                    <button
                      type="button"
                      onClick={() => setVolumen(String(margenParaEste))}
                      className="mt-1 block text-xs font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
                    >
                      usar el margen restante ({fmtM3(margenParaEste)} m³)
                    </button>
                  )}
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
            {/* Repetir y el botón son la ÚLTIMA celda de la grilla, no una fila
                aparte: la fila de medidas termina en la acción, que es donde el
                ojo llega. Al dimensionar caen solos a la línea siguiente. */}
            <div className="flex flex-wrap items-end justify-end gap-3">
              {/* Doce atados iguales se cargan una vez, no doce (A1). */}
              {!editandoId && (
                <label className="flex flex-col gap-1">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Repetir
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={repetir}
                    onChange={(e) => setRepetir(e.target.value)}
                    aria-label="Cuántos paquetes iguales crear"
                    className={`${CAMPO} w-20 text-center tabular-nums`}
                  />
                </label>
              )}
              <Btn variant="primary" onClick={agregar} disabled={Boolean(noEntra)} title={noEntra ?? undefined}>
                {editandoId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editandoId ? "Guardar cambios" : veces > 1 ? `Añadir ${veces}` : "Añadir"}
              </Btn>
              {editandoId && (
                <Btn variant="secondary" onClick={cancelarEdicion}>
                  <X className="h-4 w-4" /> Cancelar
                </Btn>
              )}
            </div>
          </div>

          {/* Con más de uno, el total se dice ANTES de apretar: es lo que va a
              entrar al libro y lo que puede chocar contra el tope. */}
          {!editandoId && veces > 1 && (volumenAUsar ?? 0) > 0 && (
            <p className="mt-2 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">
              {veces} × {fmtM3(volumenAUsar ?? 0)} ={" "}
              <b className="text-[var(--text-primary)]">{fmtM3((volumenAUsar ?? 0) * veces)} m³</b>
            </p>
          )}

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
          <TablaCtp altoMax="max-h-[45vh]">
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
                {/* Igual al "% aprovechado" del Resumen de Producción por PMF y
                    Producto oficial (Brandon, 2026-09-01): qué parte del
                    consumido representa este paquete, no del acumulado — un
                    número que ya se ve en Rendimiento arriba. */}
                <th className="px-3 py-2 text-right font-bold" title="Del volumen consumido por esta corrida">
                  % aprov.
                </th>
                <th className="px-3 py-2">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {paquetes.length === 0 && (
                <FilaVacia cols={10}>
                  {previo > 0
                    ? "Todavía no agregaste ningún paquete. Los que cargues acá se SUMAN a los que la corrida ya declaró; los anteriores no se tocan."
                    : "Todavía no agregaste ningún paquete. El volumen de la corrida es la suma de los que cargues acá."}
                </FilaVacia>
              )}
              {paquetes.map((p) => (
                <tr
                  key={p.id}
                  className={
                    p.id === editandoId
                      ? "bg-primary/10 ring-1 ring-inset ring-[var(--accent)]"
                      : "hover:bg-[var(--surface-sunken)]"
                  }
                >
                  <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{p.codigo}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{p.productType}</td>
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
                    {fmtM3(p.volumenM3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {material.volumenM3 > 0 ? `${((p.volumenM3 / material.volumenM3) * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      {/* Corregir sin re-tipear: el volumen del paquete 3 de 15
                          se arregla acá, no borrando y volviendo a cargar. */}
                      <button
                        type="button"
                        onClick={() => cargarEnForm(p, "editar")}
                        aria-label={`Editar el paquete ${p.codigo}`}
                        title="Editar este paquete"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {/* Dos atados iguales seguidos: se copia y sale con el
                          próximo código libre de la serie. */}
                      <button
                        type="button"
                        onClick={() => cargarEnForm(p, "duplicar")}
                        aria-label={`Duplicar el paquete ${p.codigo}`}
                        title="Usar este paquete de molde para el siguiente"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaquetes((prev) => prev.filter((x) => x.id !== p.id));
                          /* Si se borra el que se estaba editando, el formulario
                             tiene que salir del modo corrección o quedaría
                             apuntando a un paquete que ya no existe. */
                          if (p.id === editandoId) setEditandoId(null);
                        }}
                        aria-label={`Quitar el paquete ${p.codigo}`}
                        title="Quitar este paquete"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </TbodyCtp>
          </TablaCtp>

          {/* El balance ya no se repite acá: qué entró, qué se declaró y con qué
              rendimiento viven en la franja de estado de arriba, que está a la
              vista todo el tiempo. Tres copias del mismo número enseñaban a no
              mirar ninguna. */}

          {/**
           * El tope avisa por ARRIBA; por abajo no avisaba nadie (D2).
           *
           * Un 22 % no rompe ninguna regla —se puede declarar— pero casi siempre
           * significa que falta cargar un paquete, y eso se descubría al mes
           * siguiente mirando el libro. El veredicto es el MISMO
           * `juzgarRendimientoConsumo` que usan los KPI y la tarjeta del lote: no
           * se inventa acá un segundo umbral.
           */}
          {paquetes.length > 0 && rendimientoPct != null && veredicto.tono !== "ok" && veredicto.tono !== "neutro" && (
            <p
              className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
                veredicto.tono === "malo"
                  ? "bg-[var(--data-error-500)]/12 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                  : "bg-[var(--data-warning-500)]/12 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {veredicto.tono === "malo"
                  ? `Rendimiento ${rendimientoPct} %: por encima del ${RENDIMIENTO_PLAUSIBLE_MAX} % que se ve en aserrío. Revisá que ningún paquete esté cargado de más.`
                  : `Rendimiento ${rendimientoPct} %: por debajo del ${RENDIMIENTO_PLAUSIBLE_MIN} % habitual en aserrío. ¿Falta declarar algún paquete? Se puede guardar igual — es un aviso, no un bloqueo.`}
              </span>
            </p>
          )}
        </Bloque>
      </ModalBody>
    </AdminModal>
  );
}
