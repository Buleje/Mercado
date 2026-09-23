"use client";

/**
 * CubicadorMadera — cubica madera aserrada por VOZ en modo CONTINUO. Tocás el
 * micrófono UNA vez y dictás solo los 3 números ("dos seis ocho" = espesor 2,
 * ancho 6, largo 8): cada dictado se agrega SOLO a la tabla y el micrófono sigue
 * escuchando para el siguiente. La especie se elige de un menú y se aplica a lo
 * que dictes. Pie tablar + m³, totales, conversiones y CSV. Persiste por tenant
 * en localStorage (sin DB). Reconocimiento: Web Speech API (Chrome, es-PE).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Table, Trash2, Plus, Volume2, Check, Square, Send, Copy, AlertTriangle, MessageCircle, Save, FileText, Loader2, X, FileSpreadsheet, Receipt, Search, Sigma, Layers, Columns3, ChevronDown, Maximize2, Minimize2, ArrowUp, UserCheck } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import {
  cubicarPieza, mejoresNumeros, detectarComando, ESPECIES_MADERA, toFeet, toInches,
  esEco, escuadriasFrecuentes, leerDictado, medidaSospechosa, partirConFijas, numerosPorPieza, PT_POR_M3, recubicarPiezas, m3DesdePt,
  type PiezaCubicada, type Unidad, type MedidasFijas,
} from "@/lib/forestal/cubicacion";
import {
  loadConfig, saveConfig, CONFIG_DEFAULT, aplicarAjustesDeVoz,
  type AjustesDeVoz, type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";
import { pitido, prepararPitido } from "@/lib/forestal/pitido";
import { exportarPDF, exportarExcel } from "@/lib/forestal/cubicador-export";
import { hoyISO, nombreSugerido, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { agruparPor, resumenACsv, DIMENSIONES_RESUMEN, ETIQUETA_DIMENSION, type DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import {
  siguienteApartado, filasPendientes, asignarApartado, disolverApartado,
  quitarAsignaciones, podarAsignados, resumenApartados, totalizarFilas,
  etiquetaApartado, renombrarApartado, podarNombres,
  type ApartadosAsignados, type NombresApartado,
} from "@/lib/forestal/cubicacion-apartados";
import ApartadosPanel, { colorClaseApartado } from "./cubicacion-apartados";
import CubicacionesGuardadas from "./CubicacionesGuardadas";
import ImportarCubicacionModal from "./ImportarCubicacionModal";
import LiquidacionModal from "./LiquidacionModal";
import EnviarLibroModal from "./EnviarLibroModal";
import Anexo04Modal from "./Anexo04Modal";
import DuenosModal from "./DuenosModal";
import { clasificarTipo, ORDEN_TIPO, tipoDePieza, tipoEsManual, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { TipoSelect } from "./tipo-badge";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import { AccionLote, MenuAcciones } from "./cubicador-acciones";
import { useTecladoGrilla, enfocarCelda } from "./celdas-excel";
import {
  AsaRelleno,
  BarraSeleccion,
  CELDA_SELECCIONADA,
  useRellenoArrastre,
  useSeleccionRango,
  type ColumnaSeleccionable,
} from "./seleccion-celdas";
import PanelEntradaVoz from "./cubicador-entrada-voz";
import { resolverEspecie, type FuenteCodigoDeTroza, type TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";
import { piezasParaGuardar, piezasParaVincular } from "@/lib/forestal/cubicacion-para-guardar";
import CtpEspeciesCatalogoModal from "./CtpEspeciesCatalogoModal";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import CubicadorKpis from "./cubicador-kpis";
import CubicadorPrecio from "./CubicadorPrecio";
import { usePrecioCubicador } from "./hooks/use-precio-cubicador";
import { explicarPrecioDePieza, precioDePieza, type ContextoPrecio } from "@/lib/forestal/precio-de-pieza";
import ControlLecturaFlotante from "./cubicador-lectura-flotante";
import { useLecturaEnVoz, type ContextoLectura } from "@/hooks/use-lectura-en-voz";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  acomodarAlOrden, empiezaBloque, enOrdenDelPapel, esOrdenFilas, especieAlInicio, numeroDeFila, ordenarFilas,
  textoPorTramos, ultimaAnotada, unidadDeLargoEnVoz,
  type LargoEnLectura, type OrdenFilas,
} from "@/lib/forestal/cubicador-bloques-especie";
import { claveDueno, duenoDictado, opcionesDeDueno, reclavearFichas } from "@/lib/forestal/duenos-cubicador";
import {
  leerObservacionGuardada, tomarObservacion, OBSERVACION_MAX, type ObservacionDeCarga,
} from "@/lib/forestal/observacion-de-pieza";
import { useTablaVentaneada } from "@/hooks/use-tabla-ventaneada";
import { formatNumber } from "@/lib/format";

// Web Speech API no está en lib.dom — tipado mínimo local.
/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * La unidad de cada medida es FIJA (Brandon, 2026-09-23: «en general es así la
 * regla: el ancho y el espesor en pulgadas, el largo en pies»). La tabla ya no
 * ofrece cambiarla; sólo una pieza que llegó en otra (un Excel con columna de
 * unidad) la muestra, para que un 5 cm no se lea como 5 pulgadas.
 */
const UNIDAD_ESTANDAR = { espesor: "pulg", ancho: "pulg", largo: "pies" } as const satisfies Record<string, Unidad>;
// Rangos para los dropdowns de carga manual (rápida, sin tipear).
/** Grillas con navegación de teclado (ver `celdas-excel.tsx`). */
const GRILLA_CARGA = "cub-carga";
const GRILLA_TABLA = "cub-tabla";
/**
 * Alto del visor de la tabla ventaneada, en px (el alto de fila lo mide
 * `use-tabla-ventaneada`).
 *
 * El del visor es CONSTANTE a propósito: cuando salía de `filas × altoFila`,
 * una medición distinta cambiaba el alto de la caja, el navegador re-encuadraba
 * el scroll y eso disparaba otra medición — el scroll saltaba solo, sin parar.
 * Con más de 150 filas (el umbral de ventaneo) el mínimo siempre era este
 * número, así que fijarlo no cambia nada de lo que se ve.
 */
const ALTO_VISOR_TABLA = 600;
/** Lo que ocupan cabecera, filtros y pie cuando la tabla toma la pantalla. */
const ALTO_CHROME_EXPANDIDA = 250;
/** Orden de tabulación de la fila de carga: Cant → Espesor → Ancho → Largo. */
const COL_CANT = 0, COL_ESPESOR = 1, COL_ANCHO = 2, COL_LARGO = 3;
/** Las 4 columnas navegables de la fila de carga, en orden — TODAS. Dentro
 *  del componente se filtra por `colsVisibles` (ver `tablaColumnas`): con
 *  Cant./Espesor/Ancho/Largo ahora ocultables en la TABLA, la fila de carga
 *  de arriba sigue teniendo las 4 fijas — sólo cambia la navegación de la
 *  tabla, que ya no puede ser un array de módulo (depende de estado). */
const TABLA_COLUMNAS_TODAS = [COL_CANT, COL_ESPESOR, COL_ANCHO, COL_LARGO] as const;

/**
 * Índice de cada columna de la tabla del lote, para la selección de rango.
 *
 * Es un mapa aparte del `COL_*` de arriba: aquél ordena el TABULADO de la fila
 * de carga (4 campos), éste ubica columnas en la tabla (12). Compartir la
 * numeración haría que agregar una columna a la tabla moviera el foco del
 * teclado de la carga.
 */
const TCOL = {
  numero: 0, cant: 1, espesor: 2, ancho: 3, largo: 4, medida: 5,
  tipo: 6, especie: 7, apartado: 8, pt: 9, m3: 10, acciones: 11,
} as const;

/**
 * Columnas OPCIONALES de la tabla del lote — TODAS se pueden ocultar/mostrar
 * y la elección queda guardada por tenant hasta que se cambie de nuevo.
 *
 * Sólo "Marcar" (el tilde del PDF/Anexo 04) y "Acciones" (duplicar/editar
 * por voz/borrar) quedan fijas: son controles operativos, no datos. Ocultar
 * Cant./Espesor/Ancho/Largo saca esa columna de la navegación de teclado de
 * la TABLA (`tablaColumnasVisibles`, dentro del componente) — la fila de
 * carga de arriba (`TABLA_COLUMNAS_TODAS`) no se toca, sigue con las 4.
 */
type ColOpcional = "numero" | "cant" | "espesor" | "ancho" | "largo" | "medida" | "tipo" | "codigo" | "especie" | "dueno" | "observacion" | "apartado" | "pt" | "m3";
/* Las dos cuentas del cubicador, escritas una sola vez y mostradas al pasar el
   mouse por el encabezado: el pie tablar es la fórmula comercial y el m³ SALE
   de él (÷ 424), no del volumen geométrico. */
const FORMULA_PT = "Pie tablar = espesor″ × ancho″ × largo′ × cantidad ÷ 12";
const FORMULA_M3 = `m³ = pie tablar ÷ ${PT_POR_M3}`;

const COLS_OPCIONALES: { key: ColOpcional; label: string }[] = [
  { key: "numero", label: "N°" },
  { key: "cant", label: "Cant." },
  { key: "espesor", label: "Espesor" },
  { key: "ancho", label: "Ancho" },
  { key: "largo", label: "Largo" },
  { key: "medida", label: "Medida" },
  { key: "tipo", label: "Tipo" },
  /* Sólo se ofrece con `codigoDeTroza` («Producir sin lote»). */
  { key: "codigo", label: "Código" },
  { key: "especie", label: "Especie" },
  { key: "dueno", label: "Dueño" },
  { key: "observacion", label: "Observación" },
  { key: "apartado", label: "Apartado" },
  { key: "pt", label: "Pie tablar" },
  { key: "m3", label: "m³" },
];
const COLS_DEFAULT: Record<ColOpcional, boolean> = {
  numero: true, cant: true, espesor: true, ancho: true, largo: true,
  medida: true, tipo: true, codigo: true, especie: true, dueno: true, observacion: true, apartado: true, pt: true, m3: true,
};

// Especies de madera comunes en la Selva Central peruana (single-source en cubicacion.ts).
/** Las de fábrica: el piso cuando el catálogo del tenant todavía no cargó. */
const ESPECIES = ESPECIES_MADERA;
// Solo los errores DUROS cortan el dictado; no-speech/network/aborted son
// transitorios en modo continuo y el reconocedor se reinicia solo.
const ERR_MSG: Record<string, string> = {
  "not-allowed": "Permiso de micrófono denegado. Toca el ícono de candado en la barra de direcciones, permite el micrófono y recarga la página.",
  "service-not-allowed": "El navegador bloqueó el micrófono. Revisa los permisos del sitio y recarga.",
  "audio-capture": "No se encontró micrófono. Conecta uno y reintenta.",
};

const fmtPt = (v: number) => formatNumber(v, 2);
const fmtM3 = (v: number) => formatNumber(v, 3);
/**
 * Dónde guarda este cubicador su lote.
 *
 * El `espacio` lo pone quien lo monta (Brandon, 2026-09-09): el cubicador de
 * Herramientas usa el de siempre (`""`) y el que se abre DENTRO del Libro para
 * declarar una producción usa el suyo, así lo que se cubica ahí no pisa el lote
 * del cubicador ni aparece en Resúmenes, en el reparto ni en el papel. Es la
 * misma pantalla con otra libreta.
 */
const storageKey = (espacio = "") => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-cubicacion-${slug}${espacio}`;
};
const saveLocal = (next: PiezaCubicada[], espacio = "") => {
  try { localStorage.setItem(storageKey(espacio), JSON.stringify(next)); } catch { /* quota */ }
};
/** Lee un derivado del lote (`-precio`, `-precios-especie`) sin explotar en SSR. */
const leerGuardado = (sufijo: string, espacio = ""): string | null => {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(`${storageKey(espacio)}${sufijo}`); } catch { return null; }
};
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Por especie o más nuevas primero, cada cambio vuelve a acomodar la tabla (`acomodarAlOrden`). */
const acomodarFilas = (filas: PiezaCubicada[], orden: OrdenFilas): PiezaCubicada[] => acomodarAlOrden(filas, orden);
/** Las tres medidas, sin especie: lo que se lee dentro de un tramo de la misma especie. */
const medidaSinEspecie = (r: PiezaCubicada) => `${r.espesor}, ${r.ancho}, ${r.largo}`;
/** El largo de una pieza al leer con «Largo fijo al leer» (ver `largoFijoEn`). */
const LARGO_EN_VOZ: LargoEnLectura<PiezaCubicada> = {
  largo: (r) => r.largo,
  unidad: (r, valor) => unidadDeLargoEnVoz(r.uLargo, valor),
  sinLargo: (r) => `${r.espesor}, ${r.ancho}`,
};
/** Cuánto tiempo el micrófono debe desconfiar de lo que escucha tras hablar. */
const MARGEN_ECO_MS = 700;
/** Números sueltos que esperan a completar un trío: caducan solos. */
const CARRY_TTL_MS = 25_000;

// Voz que repite lo dictado (SpeechSynthesis). cancel() antes de hablar: en
// dictado rápido gana el último, sin encolar audio viejo que quede atrás.
// `onEco` publica la ventana en que suena el parlante — el reconocedor la usa
// para no volver a guardar la pieza que él mismo acaba de cantar.
function decir(texto: string, voz: AjustesDeVoz, onEco?: (hasta: number, texto: string) => void) {
  // TODO el trabajo de síntesis va DIFERIDO — incluido `cancel()`, no sólo
  // `speak()`. En Windows/SAPI `cancel()` en sí puede quedarse colgado un
  // rato largo si hay algo sonando, y si eso pasa en el MISMO tick que el
  // Enter que agrega la pieza, el foco tarda en volver a espesor y cargar
  // rápido se siente trabado — aunque el dato ya haya entrado bien. Diferido,
  // React ya movió el foco antes de que la voz se ponga a trabajar: si la voz
  // tarda, tarda para el oído, no para la mano.
  setTimeout(() => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      aplicarAjustesDeVoz(u, voz, synth.getVoices());
      if (onEco) {
        // Estimación por si `onend` no llega (pasa si se cancela a mitad).
        // Con la velocidad REAL: en Windows 10× suena a 3×, y estimar con
        // 10 acortaba la ventana y dejaba pasar el eco.
        const estimadoMs = Math.max(800, (texto.length / Math.max(0.6, Math.min(3, u.rate))) * 90);
        onEco(Date.now() + estimadoMs + MARGEN_ECO_MS, texto);
        u.onend = () => onEco(Date.now() + MARGEN_ECO_MS, texto);
      }
      synth.speak(u);
    } catch { /* TTS no disponible */ }
  }, 0);
}

/**
 * El tip de «guardado» (Brandon, 2026-09-23): con «Repite: no» una pieza
 * dictada entra muda y quien dicta, sin mirar la pantalla, no sabe si se
 * guardó. Sólo para lo que entra POR VOZ: a mano los ojos ya están en la
 * pantalla y un tip en cada Enter sería ruido. Con la voz prendida, la
 * confirmación ya es la voz. Grave si la pieza tiene medidas raras — la voz,
 * en ese caso, dice «Revisa».
 */
function tipSiNoRepite(cfg: CubicadorConfig, veces: number, raro = false) {
  if (cfg.speak || !cfg.pitidoAlGuardar) return;
  pitido({ veces, tono: raro ? "revisa" : "guardado", volumen: cfg.voiceVolume });
}

/**
 * El parlante con una flecha hacia arriba: leer, pero SUBIENDO la tabla.
 *
 * Los dos ítems de lectura viven pegados en el mismo menú; con el mismo
 * parlante en los dos, la única diferencia sería el texto — y el ícono se ve
 * antes que el texto.
 */
function IconoLeerAlReves({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}>
      <Volume2 className="h-full w-full" aria-hidden />
      <ArrowUp className="absolute -right-1 -top-1 h-2.5 w-2.5 stroke-[3]" aria-hidden />
    </span>
  );
}

export default function CubicadorMadera({ onPresent, espacio = "", onLote, piezasAImportar, onImportado, codigoDeTroza }: {
  onPresent?: () => void;
  /**
   * Sufijo de la clave de almacenamiento. `""` = el lote de siempre (la pestaña
   * Herramientas). Cualquier otro valor monta un cubicador AISLADO: las mismas
   * funciones, otra libreta — lo que se cubica ahí no toca el lote del
   * cubicador, ni Resúmenes, ni el reparto, ni el papel.
   */
  espacio?: string;
  /** Avisa hacia afuera qué hay cubicado, para los flujos que lo montan adentro
   *  (declarar una producción sin lote, por ejemplo). */
  onLote?: (piezas: PiezaCubicada[]) => void;
  /**
   * Piezas que alguien de AFUERA quiere meter en el lote cubicado.
   *
   * La puerta que pidió Brandon (2026-09-11) para traer las piezas de una
   * corrida ya declarada y poder editarlas, agregarles y borrarles acá adentro.
   * Entran por el mismo camino que el Excel importado —se re-cubican desde las
   * medidas— así que ninguna fuente ajena impone otra fórmula.
   *
   * Se avisa con `onImportado` para que quien las mandó lo ponga en `null`: sin
   * eso, cualquier re-render volvería a agregarlas.
   */
  piezasAImportar?: PiezaCubicada[] | null;
  onImportado?: (cuantas: number) => void;
  /**
   * El campo «Código» de la troza con sugerencias del patio y su columna en
   * la tabla — sólo «Producir sin lote» (Brandon, 2026-09-14). Sin esto, el
   * cubicador es exactamente el de siempre.
   *
   * El código es INTERNO: se guarda con las piezas en el `localStorage` de
   * este espacio y nada más — no agrupa en `unificarPorMedida`, no se
   * declara, no consume ni marca trozas y no sale al servidor.
   */
  codigoDeTroza?: FuenteCodigoDeTroza;
}) {
  const [rows, setRows] = useState<PiezaCubicada[]>([]);
  const { confirm } = useConfirm();
  /* Lo cubicado, hacia afuera: quien monta el cubicador dentro de otro flujo
     necesita saber qué hay sin volver a leer localStorage. */
  /* Con «más nuevas primero» sale en el orden en que se dictó (`enOrdenDelPapel`):
     quien lo recibe arma paquetes y corridas, y no tiene por qué heredar la
     tabla dada vuelta. `ordenRef` ya tiene el orden nuevo cuando `rows` cambia. */
  useEffect(() => { onLote?.(enOrdenDelPapel(rows, ordenRef.current)); }, [rows, onLote]);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");        // caption en vivo (interim)
  const [lastAdded, setLastAdded] = useState<PiezaCubicada | null>(null);
  const [addedFlash, setAddedFlash] = useState(0);     // cuántas piezas entró la última frase
  const [supported, setSupported] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [especie, setEspecie] = useState("");
  /** De quién es lo que se está dictando ahora — se pone FIJO al elegirlo,
   *  igual que la especie, hasta que se cambie a mano. */
  const [dueno, setDueno] = useState("");
  /** La ficha del Directorio del dueño fijo, si salió de ahí (ADR-430). Con
   *  ella, cada pieza que se dicta queda atada a su cliente y toma su precio. */
  const [duenoParteId, setDuenoParteId] = useState<string | null>(null);
  const duenoParteIdRef = useRef<string | null>(null);
  /** Los dueños elegidos alguna vez del Directorio en este equipo: nombre →
   *  ficha. Así el chip, la voz («dueño Juan») o la celda de la tabla atan la
   *  pieza a su ficha sin volver a buscarla. */
  const [fichasDueno, setFichasDueno] = useState<Record<string, { id: string; nombre: string }>>(() => {
    try {
      /* Re-clavea las guardadas por `toLowerCase()` (antes del 23-09). */
      return reclavearFichas(JSON.parse(leerGuardado("-duenos-directorio", espacio) ?? "{}"));
    } catch { return {}; }
  });
  const fichasDuenoRef = useRef(fichasDueno);
  const fichaDe = useCallback((nombre: string | null | undefined) => {
    const k = claveDueno(nombre);
    return k ? (fichasDuenoRef.current[k] ?? null) : null;
  }, []);
  /** El código de la troza que se le pega a lo que sigue (sólo con
   *  `codigoDeTroza`). El ref se pone al día en el MISMO evento, como
   *  `manualRef`: el Enter que agrega la pieza puede llegar antes del render. */
  const [codigoTroza, setCodigoTroza] = useState("");
  const codigoRef = useRef("");
  const cambiarCodigo = useCallback((v: string) => { codigoRef.current = v; setCodigoTroza(v); }, []);
  const conCodigo = Boolean(codigoDeTroza);
  /** La observación que se le pega a lo que sigue (`observacion-de-pieza.ts`):
   *  suelta va a la próxima pieza y se borra; fija, a todas y sobrevive a
   *  recargar. Ref al día en el mismo evento, como `codigoRef`. */
  const [observacion, setObservacion] = useState<ObservacionDeCarga>(() => leerObservacionGuardada(leerGuardado("-observacion", espacio)));
  const observacionRef = useRef(observacion);
  const ponerObservacion = useCallback((next: ObservacionDeCarga) => {
    observacionRef.current = next;
    setObservacion(next);
    try {
      if (next.fija) localStorage.setItem(`${storageKey(espacio)}-observacion`, JSON.stringify(next));
      else localStorage.removeItem(`${storageKey(espacio)}-observacion`);
    } catch { /* quota */ }
  }, [espacio]);
  /** Lo que lleva la pieza que entra AHORA — y la suelta se consume. */
  const tomarObservacionDeCarga = useCallback(() => {
    const { valor, siguiente } = tomarObservacion(observacionRef.current);
    if (siguiente !== observacionRef.current) ponerObservacion(siguiente);
    return valor;
  }, [ponerObservacion]);
  /** Dueños guardados en este dispositivo (no sólo en el lote actual). Se
   *  CREAN sólo en el modal de Dueños o al elegir uno del Directorio; la
   *  barra, la tabla y la voz sólo eligen de acá (Brandon 23-09: la barra
   *  guardaba cada letra tipeada — «w», «l», «lu» — como un dueño). */
  const [duenosConocidos, setDuenosConocidos] = useState<string[]>(() => {
    try { return JSON.parse(leerGuardado("-duenos", espacio) ?? "[]") as string[]; } catch { return []; }
  });
  const recordarDueno = useCallback((nombre: string) => {
    const limpio = nombre.trim();
    if (!limpio) return;
    setDuenosConocidos((prev) => {
      if (prev.some((d) => claveDueno(d) === claveDueno(limpio))) return prev;
      const next = [...prev, limpio].slice(-50); // tope: no crece sin límite
      try { localStorage.setItem(`${storageKey(espacio)}-duenos`, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);
  /** Cambia el dueño actual — ELIGE, no crea: el nombre ya tiene que estar
   *  en la lista (la barra, la tabla y la voz sólo ofrecen lo que hay). */
  const aplicarDueno = useCallback((v: string, ficha?: { id: string; nombre: string } | null) => {
    /* Los refs al toque (como `codigoRef`): la pieza puede llegar en el mismo
       lote de resultados de voz, antes del render. */
    const f = ficha !== undefined ? ficha : fichaDe(v);
    duenoRef.current = v;
    duenoParteIdRef.current = f?.id ?? null;
    setDueno(v);
    setDuenoParteId(f?.id ?? null);
  }, [fichaDe]);
  /** Ata un nombre a su ficha del Directorio y lo suma a la lista: desde ahí
   *  las piezas con ese nombre toman su precio pactado (ADR-430). */
  const atarFichaDueno = useCallback((p: { id: string; nombre: string }) => {
    const next = { ...fichasDuenoRef.current, [claveDueno(p.nombre)]: { id: p.id, nombre: p.nombre } };
    fichasDuenoRef.current = next;
    setFichasDueno(next);
    try { localStorage.setItem(`${storageKey(espacio)}-duenos-directorio`, JSON.stringify(next)); } catch { /* quota */ }
    recordarDueno(p.nombre);
  }, [recordarDueno, espacio]);
  /** Un dueño elegido del Directorio: queda fijo, atado a su ficha, y se
   *  recuerda para atar después las piezas escritas con ese nombre. */
  const elegirDuenoDelDirectorio = useCallback((p: { id: string; nombre: string }) => {
    atarFichaDueno(p);
    aplicarDueno(p.nombre, p);
  }, [aplicarDueno, atarFichaDueno]);
  /** Saca un dueño de la lista GUARDADA — no toca las piezas que ya lo usan
   *  (son texto libre, no una referencia): borrar del catálogo no reescribe
   *  el lote. */
  const olvidarDueno = useCallback((nombre: string) => {
    setDuenosConocidos((prev) => {
      const next = prev.filter((d) => claveDueno(d) !== claveDueno(nombre));
      try { localStorage.setItem(`${storageKey(espacio)}-duenos`, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);
  const [showDuenosModal, setShowDuenosModal] = useState(false);
  /* El catálogo de especies de ESTA planta (ADR-410). Una sola lectura para el
     selector, la tabla y el dictado: si el dictado usara otra lista, reconocería
     especies que el selector no ofrece. */
  const [showEspeciesModal, setShowEspeciesModal] = useState(false);
  const catalogoEspecies = useEspeciesCatalogo();
  const especiesOfrecidas = catalogoEspecies.nombres.length > 0 ? catalogoEspecies.nombres : ESPECIES;
  const [config, setConfig] = useState<CubicadorConfig>(CONFIG_DEFAULT);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showAjustes, setShowAjustes] = useState(false);
  const avisarRaras = config.avisarRaras;
  const [editingId, setEditingId] = useState<string | null>(null); // fila que se edita por voz
  const [manual, setManual] = useState({ cantidad: "1", espesor: "", ancho: "", largo: "" });
  /**
   * Espejo SÍNCRONO de `manual`. Cargando rápido, el Enter de "cerrar esta
   * pieza" puede llegar antes de que React re-renderice con el último dígito
   * tipeado — `addManual` leía el `manual` VIEJO (le faltaba un carácter), la
   * validación de medidas fallaba en silencio, y había que tocar Enter una
   * SEGUNDA vez para que recién ahí tomara el valor correcto. El ref se pone
   * al día en el MISMO evento que cambia el valor (no en un `useEffect`, que
   * llega un render tarde) — mismo patrón que `fijasRef`/`especieRef` para el
   * reconocedor de voz, acá aplicado al tecleo rápido.
   */
  const manualRef = useRef(manual);
  const setManualSync = useCallback((next: typeof manual) => {
    manualRef.current = next;
    setManual(next);
  }, []);
  /* Los precios del lote (general, por especie, modo y el trato de cada
     dueño) viven en `usePrecioCubicador`, más abajo: se leen en SU
     inicializador —nunca en un efecto que corra después del que persiste—. */
  /**
   * Orden de la tabla (Brandon, 2026-09-22): como se dictó, o en bloques de
   * especie para revisar la pila especie por especie al terminar.
   *
   * No es una vista: REORDENA las filas. Así el N°, la lectura en voz alta, el
   * PDF y el Excel dicen lo mismo que la pantalla — un orden sólo de pantalla
   * hacía que «fila 12» nombrara una cosa en la tabla y otra en el parlante.
   * Volver a «como se dictó» sale del id de cada pieza, que guarda cuándo se
   * anotó. Se recuerda por libreta.
   */
  const [ordenFilas, setOrdenFilas] = useState<OrdenFilas>(() => {
    const raw = leerGuardado("-orden", espacio);
    return esOrdenFilas(raw) ? raw : "dictado";
  });
  /** Para los callbacks estables (dictado, importación): leen el orden de AHORA. */
  const ordenRef = useRef<OrdenFilas>(ordenFilas);
  /**
   * Filas TILDADAS del lote (distinto de la selección de celdas tipo Excel).
   *
   * Es lo que decide qué va al papel: con piezas marcadas, el PDF y el Anexo 04
   * salen SÓLO con ésas. Un lote de 300 medidas rara vez se despacha entero, y
   * hasta ahora había que vaciar el cubicador o editar el PDF a mano.
   */
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /**
   * Lo que se lleva el papel: lo TILDADO si hay algo tildado, el lote entero si
   * no. Así el botón sigue funcionando igual para el que nunca marca nada, y el
   * que marca no tiene que acordarse de un segundo botón.
   */
  const rowsParaPapel = useMemo(
    () => enOrdenDelPapel(marcadas.size > 0 ? rows.filter((r) => marcadas.has(r.id)) : rows, ordenFilas),
    [rows, marcadas, ordenFilas],
  );
  /**
   * Apartados — función EXTRA: separar el lote en bloques (10, 14, los que
   * hagan falta) con su propio total. Vive en su PROPIA clave de localStorage
   * y afuera de `PiezaCubicada` a propósito — la cubicación continua y normal
   * sigue exactamente igual, esto es sólo una anotación de sesión encima.
   */
  const [asignados, setAsignados] = useState<ApartadosAsignados>(() => {
    const raw = leerGuardado("-apartados", espacio);
    if (!raw) return {};
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as ApartadosAsignados) : {};
    } catch { return {}; }
  });
  /** Nombre puesto a mano por apartado ("Camión A", "Cliente López"). */
  const [nombresApartado, setNombresApartado] = useState<NombresApartado>(() => {
    const raw = leerGuardado("-apartados-nombres", espacio);
    if (!raw) return {};
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as NombresApartado) : {};
    } catch { return {}; }
  });
  const [showApartados, setShowApartados] = useState(false);
  const [showResumen, setShowResumen] = useState(false);
  const [dimResumen, setDimResumen] = useState<DimensionResumen>("especie");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false); // ya quedó registrado en el Libro CTP
  /** Cubicación guardada que se está editando (null = lote nuevo sin guardar). */
  const [cubicacionActual, setCubicacionActual] = useState<{ id: string; nombre: string } | null>(null);
  const [showGuardar, setShowGuardar] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [showImportar, setShowImportar] = useState(false);
  const [showLiquidacion, setShowLiquidacion] = useState(false);
  const [showPdf, setShowPdf] = useState(false); // vista previa del ANEXO N° 04
  const [showEnviarModal, setShowEnviarModal] = useState(false);
  const [loteCreado, setLoteCreado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState<string | null>(null);
  const [historialToken, setHistorialToken] = useState(0);
  const [form, setForm] = useState({ nombre: "", fecha: hoyISO(), cliente: "", notas: "" });
  /** El precio del lote (ADR-430): modo Aserrío/Venta/A mano, lo puesto a mano
   *  y el trato de cada dueño del Directorio, vigente el día del lote. */
  const precios = usePrecioCubicador({
    espacio,
    rows,
    fecha: form.fecha,
    grupos: catalogoEspecies.grupos,
    cargandoGrupos: catalogoEspecies.cargando,
  });
  const [paused, setPaused] = useState(false); // "pausar" por voz → ignora números hasta "continúa"
  /** Medidas que quedan fijas ("pon fijo el largo a 4"): no se dictan más. */
  const [fijas, setFijas] = useState<MedidasFijas>({});

  // Toasts flotantes de acción (agregar / eliminar / guardar / importar…).
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const medidaTxt = useCallback(
    (r: { espesor: number; ancho: number; largo: number; especie?: string }) =>
      `${r.espesor}×${r.ancho}×${r.largo}${r.especie ? ` · ${r.especie}` : ""}`,
    []
  );

  // Filtros de la tabla del lote (no tocan los datos, solo la vista).
  const [filtroEspecie, setFiltroEspecie] = useState("");   // "" = todas
  const [filtroTipo, setFiltroTipo] = useState<TipoComercial | "">("");
  const [filtroDueno, setFiltroDueno] = useState("");        // "" = todos
  const [busqueda, setBusqueda] = useState("");             // medidas / texto libre
  /** Columnas opcionales ocultas/mostradas — por tenant, hasta que se cambie. */
  const [colsVisibles, setColsVisibles] = useState<Record<ColOpcional, boolean>>(() => {
    const raw = leerGuardado("-cols", espacio);
    if (!raw) return COLS_DEFAULT;
    try { return { ...COLS_DEFAULT, ...(JSON.parse(raw) as Partial<Record<ColOpcional, boolean>>) }; } catch { return COLS_DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem(`${storageKey(espacio)}-cols`, JSON.stringify(colsVisibles)); } catch { /* quota */ } }, [colsVisibles]);
  /**
   * Qué paneles están plegados. Es una preferencia de trabajo, no un estado de
   * la sesión: quien revisa un lote ya medido no quiere el micrófono ocupando
   * media pantalla cada vez que entra. Se guarda por tenant, como las columnas.
   */
  /* `precio` (Brandon, 2026-09-23: «poder ocultar la sección de precio»):
     plegado sigue diciendo el valor del lote en una línea. */
  const [plegados, setPlegados] = useState<{ kpis: boolean; voz: boolean; precio: boolean }>(() => {
    const base = { kpis: false, voz: false, precio: false };
    const raw = leerGuardado("-plegados", espacio);
    if (!raw) return base;
    try {
      return { ...base, ...(JSON.parse(raw) as Partial<typeof base>) };
    } catch {
      return base;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(`${storageKey(espacio)}-plegados`, JSON.stringify(plegados)); } catch { /* quota */ }
  }, [plegados]);
  /** La tabla ocupando la pantalla entera, para leer un lote largo. */
  const [tablaExpandida, setTablaExpandida] = useState(false);
  /**
   * Alto del visor ventaneado. Sigue siendo un número FIJO mientras se
   * scrollea —de eso dependía que el scroll no se moviera solo—; lo único que
   * lo cambia es expandir/contraer o redimensionar la ventana.
   */
  const [altoVisor, setAltoVisor] = useState(ALTO_VISOR_TABLA);
  useEffect(() => {
    const calcular = () =>
      setAltoVisor(tablaExpandida ? Math.max(320, window.innerHeight - ALTO_CHROME_EXPANDIDA) : ALTO_VISOR_TABLA);
    calcular();
    if (!tablaExpandida) return;
    window.addEventListener("resize", calcular);
    return () => window.removeEventListener("resize", calcular);
  }, [tablaExpandida]);
  useEffect(() => {
    if (!tablaExpandida) return;
    /* Escape sale, como de cualquier capa que tapa la pantalla. Y el fondo no
       scrollea detrás: si no, al cerrar apareces en otra parte de la página. */
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") setTablaExpandida(false); };
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [tablaExpandida]);

  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  useEffect(() => {
    if (!colsMenuOpen) return;
    const cerrar = () => setColsMenuOpen(false);
    window.addEventListener("click", cerrar);
    return () => window.removeEventListener("click", cerrar);
  }, [colsMenuOpen]);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const idRef = useRef(0);
  const especieRef = useRef(especie);
  const duenoRef = useRef(dueno);
  const duenosConocidosRef = useRef(duenosConocidos);
  /** Espejo del catálogo: el closure del reconocedor lee la lista fresca —si
   *  leyera la constante, el dictado no reconocería una especie recién creada. */
  const especiesRef = useRef<readonly string[]>(ESPECIES);
  const configRef = useRef(config);
  const wantListeningRef = useRef(false);
  /** Números sueltos entre frases + CUÁNDO llegaron (caducan a los 25s). */
  const carryRef = useRef<{ nums: number[]; ts: number }>({ nums: [], ts: 0 });
  /** Ventana en que suena el parlante, para descartar el eco de la propia voz. */
  const ecoRef = useRef<{ hasta: number; texto: string }>({ hasta: 0, texto: "" });
  /** Reinicios del reconocedor, para frenar un bucle start/end que queme CPU. */
  const reinicioRef = useRef<{ ultimo: number; seguidos: number }>({ ultimo: 0, seguidos: 0 });
  /** Wake Lock: la pantalla no se apaga mientras se dicta en el patio. */
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  /** Espejo de las fijas: el closure del reconocedor las lee siempre frescas. */
  const fijasRef = useRef<MedidasFijas>({});
  // Guardamos SOLO en resultados FINALES (estables). Los intermedios se revisan
  // constantemente en Chrome real → committear sobre ellos causaba volteados y
  // duplicados. lastFinalRef = último índice final procesado (evita reprocesar);
  // se reinicia en cada nueva sesión (Chrome corta/reinicia y los índices vuelven a 0).
  const lastFinalRef = useRef(-1);
  const pausedRef = useRef(false);
  // Modo del dictado: agregar filas nuevas, o EDITAR una fila puntual por voz.
  const modeRef = useRef<{ type: "add" } | { type: "edit"; id: string }>({ type: "add" });
  const rowsRef = useRef<PiezaCubicada[]>([]);
  /**
   * Las escuadrías que ESTE lote ya viene cortando, para desempatar hipótesis.
   *
   * El reconocedor devuelve tres lecturas y varias veces empatan: las tres
   * caen en rango y ninguna es más creíble que la otra. Ahí gana la que
   * reproduce una medida que el operario ya dictó veinte veces esta mañana —
   * un aserradero corta las mismas cuatro o cinco escuadrías todo el día.
   *
   * SÓLO desempata: nunca le gana a una lectura con más números en rango, ni
   * reemplaza un número por otro (`mejoresNumeros` no reordena nada). Se
   * recalcula junto con `rowsRef` para no pagar un render extra por pieza.
   */
  const frecuentesRef = useRef<ReturnType<typeof escuadriasFrecuentes>>([]);
  useEffect(() => {
    rowsRef.current = rows;
    frecuentesRef.current = escuadriasFrecuentes(rows);
  }, [rows]);
  const resetVoz = () => { carryRef.current = { nums: [], ts: 0 }; lastFinalRef.current = -1; ecoRef.current = { hasta: 0, texto: "" }; };
  useEffect(() => { especieRef.current = especie; }, [especie]);
  useEffect(() => { duenoRef.current = dueno; }, [dueno]);
  useEffect(() => { duenosConocidosRef.current = duenosConocidos; }, [duenosConocidos]);
  useEffect(() => { especiesRef.current = especiesOfrecidas; }, [especiesOfrecidas]);
  /** Una troza elegida en el campo «Código»: su código y su especie, con el
   *  nombre que ofrece el catálogo. Sin especie en la troza, no se toca. */
  const elegirTroza = useCallback((t: TrozaParaCodigo) => {
    cambiarCodigo(t.codigo);
    const nombre = resolverEspecie(t.especie, especiesRef.current);
    if (nombre) setEspecie(nombre);
  }, [cambiarCodigo]);
  // Las fijas sobreviven al refresh: un lote de un mismo largo puede llevar
  // toda la mañana y recargar la página no debería soltar la medida.
  useEffect(() => { fijasRef.current = fijas; }, [fijas]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${storageKey(espacio)}-fijas`);
      if (raw) setFijas(JSON.parse(raw) as MedidasFijas);
    } catch { /* ignore */ }
  }, []);
  const aplicarFijas = useCallback((next: MedidasFijas) => {
    fijasRef.current = next;
    setFijas(next);
    try { localStorage.setItem(`${storageKey(espacio)}-fijas`, JSON.stringify(next)); } catch { /* quota */ }
  }, []);
  useEffect(() => { configRef.current = config; }, [config]);
  // Cargar config + voces disponibles (getVoices puede llegar async).
  useEffect(() => {
    setConfig(loadConfig());
    const load = () => { try { setVoices(window.speechSynthesis?.getVoices?.() ?? []); } catch { /* ignore */ } };
    load();
    try { window.speechSynthesis.onvoiceschanged = load; } catch { /* ignore */ }
    return () => { try { window.speechSynthesis.onvoiceschanged = null; } catch { /* ignore */ } };
  }, []);
  const updateConfig = useCallback((patch: Partial<CubicadorConfig>) => {
    setConfig((prev) => { const next = { ...prev, ...patch }; saveConfig(next); return next; });
  }, []);
  const hablar = useCallback((texto: string) => {
    if (!configRef.current.speak) return;
    decir(texto, configRef.current, (hasta, dicho) => {
      ecoRef.current = { hasta, texto: dicho };
    });
  }, []);

  // Las filas sí se cargan por efecto: no hay ningún efecto que las persista
  // (se guardan a mano en `persist`), así que no compiten por el mismo lugar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(espacio));
      /* Se RE-CUBICA al hidratar: un lote guardado antes de que el m³ saliera
         del pie tablar trae el volumen geométrico y el total lo arrastraría
         (13.026 PT mostraban 30,738 m³ en vez de 30,722). */
      if (raw) setRows(acomodarFilas(recubicarPiezas(JSON.parse(raw) as PiezaCubicada[]), ordenRef.current));
    } catch { /* ignore */ }
  }, []);

  const nuevoId = () => `p-${Date.now()}-${idRef.current++}`;

  const persist = useCallback((next: PiezaCubicada[]) => {
    const acomodadas = acomodarFilas(next, ordenRef.current);
    setRows(acomodadas);
    saveLocal(acomodadas, espacio);
  }, []);

  // addPieza estable (functional update) — lo llama el closure del reconocedor
  // con las filas frescas, sin depender de `rows` (que estaría stale).
  const addPieza = useCallback((p: {
    cantidad: number; espesor: number; ancho: number; largo: number;
    uEspesor: Unidad; uAncho: Unidad; uLargo: Unidad; especie?: string; dueno?: string; duenoParteId?: string; codigo?: string;
    observacion?: string;
  }) => {
    const { pieTablar, m3 } = cubicarPieza(p);
    const row: PiezaCubicada = { id: nuevoId(), ...p, pieTablar, m3 };
    /* Con el orden por especie, la pieza nueva cae al final de SU bloque. */
    setRows((prev) => { const next = acomodarFilas([...prev, row], ordenRef.current); saveLocal(next, espacio); return next; });
    setLastAdded(row);
  }, []);

  /** Suma un lote entero de una (importación de Excel): las piezas ya vienen
   *  cubicadas; se les da id propio para no chocar con las de la sesión. */
  const agregarVarias = useCallback((nuevas: PiezaCubicada[]) => {
    if (nuevas.length === 0) return;
    // El Excel importado trae su propio pieTablar/m³: se re-cubica desde las
    // medidas para que ninguna planilla ajena imponga otra fórmula.
    const conId = recubicarPiezas(nuevas).map((p) => ({ ...p, id: nuevoId() }));
    setRows((prev) => { const next = acomodarFilas([...prev, ...conId], ordenRef.current); saveLocal(next, espacio); return next; });
    setLastAdded(conId[conId.length - 1]);
    const piezas = nuevas.reduce((a, p) => a + p.cantidad, 0);
    pushToast({ tono: "success", msg: `${conId.length} ${conId.length === 1 ? "fila importada" : "filas importadas"}`, detail: `${piezas} piezas al lote` });
  }, [pushToast]);

  /* La puerta de afuera: lo que llega por `piezasAImportar` entra una sola vez
     y se avisa. `agregarVarias` ya re-cubica y avisa por toast. */
  useEffect(() => {
    if (!piezasAImportar || piezasAImportar.length === 0) return;
    agregarVarias(piezasAImportar);
    onImportado?.(piezasAImportar.length);
  }, [piezasAImportar, agregarVarias, onImportado]);

  // Borra la última fila (comando de voz "elimina el último"). Estable.
  const borrarUltimo = useCallback(() => {
    setRows((prev) => {
      if (!prev.length) return prev;
      /* Agrupada por especie (o con las nuevas arriba), la última fila de la
         tabla no es la última que se dictó: «elimina el último» borra lo que se
         acaba de anotar. */
      const victima = ultimaAnotada(prev, ordenRef.current);
      const next = prev.filter((r) => r.id !== victima?.id);
      saveLocal(next, espacio);
      return next;
    });
    setLastAdded(null);
    carryRef.current = { nums: [], ts: 0 };
  }, []);

  // Actualiza las medidas de UNA fila (edición por voz). Estable.
  const updateRow = useCallback((id: string, espesor: number, ancho: number, largo: number) => {
    setRows((prev) => {
      const next = prev.map((r) => {
        if (r.id !== id) return r;
        const upd = { ...r, espesor, ancho, largo };
        const { pieTablar, m3 } = cubicarPieza(upd);
        return { ...upd, pieTablar, m3 };
      });
      saveLocal(next, espacio);
      return next;
    });
  }, []);

  // ── Reconocimiento de voz (continuo, auto-add) ──
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.lang = "es-PE";
    rec.interimResults = true;
    rec.continuous = true;
    // Tres hipótesis: `mejoresNumeros` elige la que da medidas creíbles para
    // la medida que toca. NUNCA reordena los números DENTRO de una hipótesis
    // (eso volteaba lo dictado); solo elige entre lecturas completas.
    rec.maxAlternatives = 3;

    // Procesa SOLO resultados FINALES (estables) → sin duplicados ni valores
    // erráticos. El interim solo alimenta el caption. Cada final se procesa una
    // vez (lastFinalRef). Primero mira si es un COMANDO de voz; si no, números.
    const procesarFinal = (idx: number, alternativas: string[]) => {
      lastFinalRef.current = idx;
      const texto = alternativas[0] ?? "";

      // ── ECO DEL PARLANTE ──
      // Trabajando con el altavoz del celular, el micrófono escucha la voz que
      // repite la medida y la pieza entraba DOS veces. Si llega dentro de la
      // ventana en que sonó el parlante y trae los mismos números, es el eco.
      if (Date.now() < ecoRef.current.hasta && esEco(texto, ecoRef.current.texto)) return;

      // ── COMANDOS DE VOZ ──
      const cmd = detectarComando(texto, configRef.current.comandos);
      if (cmd) {
        if (cmd.tipo === "pausar") { pausedRef.current = true; setPaused(true); carryRef.current = { nums: [], ts: 0 }; setLiveText(""); hablar("en pausa"); }
        else if (cmd.tipo === "continuar") { pausedRef.current = false; setPaused(false); carryRef.current = { nums: [], ts: 0 }; setLiveText(""); hablar("sigo"); }
        else if (cmd.tipo === "borrar-ultimo") { borrarUltimo(); hablar("borrado"); }
        else if (cmd.tipo === "fijar") {
          // Fijar cambia cuántos números trae cada pieza: lo que quedó a medio
          // dictar con la regla anterior ya no aplica.
          carryRef.current = { nums: [], ts: 0 };
          aplicarFijas({ ...fijasRef.current, [cmd.dimension]: cmd.valor });
          setErrMsg(null);
          hablar(`${cmd.dimension} fijo en ${cmd.valor}`);
        }
        else if (cmd.tipo === "desfijar") {
          carryRef.current = { nums: [], ts: 0 };
          if (cmd.dimension) {
            const next = { ...fijasRef.current };
            delete next[cmd.dimension];
            aplicarFijas(next);
            hablar(`${cmd.dimension} libre`);
          } else {
            aplicarFijas({});
            hablar("todo libre");
          }
        }
        else if (cmd.tipo === "especie") {
          const found = especiesRef.current.find((s) => sinAcentos(s).startsWith(cmd.palabra));
          /* La ref al toque: si la pieza llega en el mismo lote de resultados,
             el efecto que la sincroniza todavía no corrió. */
          if (found) { especieRef.current = found; setEspecie(found); hablar(found); }
          else setErrMsg(`No reconocí la especie "${cmd.palabra}".`);
        }
        else if (cmd.tipo === "dueno") {
          // Sólo ELIGE entre los que existen (guardados o ya en el lote): lo
          // que el reconocedor oye mal no se vuelve un dueño nuevo. Se crean
          // en el modal de Dueños (Brandon 23-09).
          const opciones = opcionesDeDueno([
            duenosConocidosRef.current,
            rowsRef.current.map((r) => r.dueno ?? ""),
          ]);
          const nombre = duenoDictado(cmd.palabra, opciones);
          if (nombre) { aplicarDueno(nombre); hablar(nombre); }
          else setErrMsg(`«${cmd.palabra}» no está en tus dueños: créalo en Dueños (el botón + junto al campo).`);
        }
        else if (cmd.tipo === "resumen") {
          setShowResumen(true);
          const dim = cmd.dimension as DimensionResumen;
          if ((DIMENSIONES_RESUMEN as readonly string[]).includes(dim)) {
            setDimResumen(dim);
            hablar(`resumen ${ETIQUETA_DIMENSION[dim].replace("Por ", "")}`);
          } else {
            hablar("resumen");
          }
        }
        else if (cmd.tipo === "total") {
          const t = totalVozRef.current;
          const base = `${t.piezas} piezas, ${Math.round(t.pt)} pie tablar`;
          hablar(t.conValor ? `${base}, ${Math.round(t.valor)} soles` : base);
        }
        return;
      }

      // ── MODO EDICIÓN: 3 números reemplazan la fila y sale ──
      // Se leen SIN las fijas: al corregir una fila se dictan las tres medidas.
      if (modeRef.current.type === "edit") {
        const nums = mejoresNumeros(alternativas, {}, 0, { frecuentes: frecuentesRef.current });
        if (nums.length >= 3 && nums[0] > 0 && nums[1] > 0 && nums[2] > 0) {
          updateRow(modeRef.current.id, nums[0], nums[1], nums[2]);
          hablar(`${nums[0]}, ${nums[1]}, ${nums[2]}`);
          tipSiNoRepite(configRef.current, 1);
          modeRef.current = { type: "add" };
          setEditingId(null); wantListeningRef.current = false;
          setListening(false); setLiveText("");
          try { rec.stop(); } catch { /* ignore */ }
        } else {
          setErrMsg("No entendí 3 números para la fila. Prueba de nuevo.");
        }
        return;
      }

      /* ── LA ESPECIE SOLA (Brandon, 2026-09-22) ──
         «panguana» cambia la especie de lo que sigue, sin el «especie»
         delante; «panguana dos cuatro diez» la cambia y anota la pieza en la
         misma frase. Dictar por bloques de especie es eso: la especie una vez
         y después sólo medidas. Va DESPUÉS de los comandos (mandan ellos) y
         del modo edición (ahí se esperan tres números). */
      if (pausedRef.current) return; // en pausa: ignora números — y la especie sola, que en pausa es charla

      let alts = alternativas;
      let anuncio = "";
      /* Sólo la lectura PRINCIPAL del reconocedor: una hipótesis dudosa no
         puede cambiar la especie de todo lo que sigue. Las del catálogo y las
         que ya están en la tabla (una especie que entró por Excel o por el
         código de una troza también se dicta sola). */
      const conocidas = [...especiesRef.current, ...rowsRef.current.map((r) => r.especie?.trim() ?? "").filter(Boolean)];
      const detectada = especieAlInicio(alternativas[0] ?? "", conocidas);
      if (detectada) {
        alts = alternativas.map((a) => especieAlInicio(a, [detectada.especie])?.resto ?? a);
        const sinMedidas = !alts.some((a) => /\d|[a-z]/i.test(a));
        /* Ya era la especie en curso: no se anuncia. Si además no trae
           medidas, es casi siempre el ECO del parlante diciendo «Panguana»
           — `esEco` sólo compara números y repetirla armaba un lazo sin fin. */
        if (claveEspecie(detectada.especie) === claveEspecie(especieRef.current)) {
          if (sinMedidas) return;
        } else {
          especieRef.current = detectada.especie; // la pieza de esta misma frase ya entra con ella
          setEspecie(detectada.especie);
          setErrMsg(null);
          anuncio = detectada.especie;
          if (sinMedidas) { hablar(detectada.especie); return; }
        }
      }

      // Cantidad dictada ("cinco piezas de 2 8 10") separada de las medidas.
      // Se pasan las fijas y cuántos números quedaron esperando: sin eso, un
      // "quince" suelto se leería como espesor (imposible) y se partiría en 1·5.
      const carryVigente = Date.now() - carryRef.current.ts < CARRY_TTL_MS ? carryRef.current.nums : [];
      const { cantidad: cantDictada, nums } = leerDictado(
        alts,
        fijasRef.current,
        carryVigente.length,
        { frecuentes: frecuentesRef.current },
      );

      // ── MODO AGREGAR: chunk en tríos, arrastra el sobrante a la próxima frase ──
      // El sobrante CADUCA: números de hace rato pegados a una frase nueva
      // armaban piezas fantasma (dictaste "2 6", te fuiste, volviste con "8 10 12").
      const all = [...carryVigente, ...nums];
      // Con medidas fijas, cada pieza necesita MENOS números dictados.
      const { piezas: nuevas, resto } = partirConFijas(all, fijasRef.current);
      let added = 0;
      let ultima: { espesor: number; ancho: number; largo: number } | null = null;
      for (const { espesor, ancho, largo } of nuevas) {
        addPieza({
          cantidad: cantDictada, espesor, ancho, largo,
          uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
          especie: especieRef.current || undefined,
          dueno: duenoRef.current || undefined,
          duenoParteId: (duenoRef.current && duenoParteIdRef.current) || undefined,
          codigo: codigoRef.current.trim() || undefined,
          /* Suelta, la lleva sólo la primera pieza de la frase. */
          observacion: tomarObservacionDeCarga(),
        });
        ultima = { espesor, ancho, largo }; added++;
      }
      carryRef.current = { nums: resto, ts: resto.length > 0 ? Date.now() : 0 };
      setLiveText("");
      if (added && ultima) {
        setAddedFlash(added); setErrMsg(null);
        const raro = medidaSospechosa(ultima.espesor, ultima.ancho, ultima.largo);
        // Dicta SOLO lo que varía — igual que la carga manual: con el largo
        // fijo ya dictaste 2 números, y que la confirmación repita el 3° que
        // ni siquiera dijiste es lo que hace sentir lenta la tanda. Lo raro
        // SÍ lee las 3 medidas completas: ahí la claridad importa más que la
        // velocidad (es la fila que hay que revisar).
        const variables = [
          fijasRef.current.espesor == null ? ultima.espesor : null,
          fijasRef.current.ancho == null ? ultima.ancho : null,
          fijasRef.current.largo == null ? ultima.largo : null,
        ].filter((v): v is number => v != null);
        const confirmacion = added > 1 ? `${added} piezas`
          : raro ? `${ultima.espesor}, ${ultima.ancho}, ${ultima.largo}. Revisa`
            : `${cantDictada > 1 ? `${cantDictada} de ` : ""}${variables.join(", ")}`;
        hablar(anuncio ? `${anuncio}. ${confirmacion}` : confirmacion);
        tipSiNoRepite(configRef.current, added, raro);
      } else if (anuncio) {
        hablar(anuncio); // cambió la especie y los números quedaron esperando
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) { interim += (res[0]?.transcript ?? "") + " "; continue; }
        if (i <= lastFinalRef.current) continue; // ya procesado este final
        // Todas las hipótesis del motor, no sólo la primera.
        const alts: string[] = [];
        for (let k = 0; k < (res.length ?? 1); k++) {
          const t = res[k]?.transcript;
          if (typeof t === "string" && t.trim()) alts.push(t);
        }
        procesarFinal(i, alts.length ? alts : [""]);
      }
      if (interim.trim()) setLiveText(interim.trim()); // caption (no guarda)
    };
    rec.onend = () => {
      // Chrome corta tras silencios/timeout → reiniciar. La nueva sesión reinicia
      // los índices a 0 → reseteamos lastFinalRef; el carry se conserva.
      if (!wantListeningRef.current) { setListening(false); return; }
      lastFinalRef.current = -1;
      // Backoff: si el reconocedor corta al instante una y otra vez (micrófono
      // ocupado, pestaña en segundo plano), reiniciar sin pausa quema CPU y
      // batería en el celular. Tras 4 cortes seguidos y rápidos, se espacia.
      const ahora = Date.now();
      const rapido = ahora - reinicioRef.current.ultimo < 1200;
      reinicioRef.current = { ultimo: ahora, seguidos: rapido ? reinicioRef.current.seguidos + 1 : 0 };
      const espera = reinicioRef.current.seguidos >= 4
        ? Math.min(4000, 250 * reinicioRef.current.seguidos)
        : 0;
      const arrancar = () => {
        if (!wantListeningRef.current) return;
        try { rec.start(); } catch { wantListeningRef.current = false; setListening(false); }
      };
      if (espera > 0) setTimeout(arrancar, espera);
      else arrancar();
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const code = e?.error ?? "";
      if (code in ERR_MSG) { wantListeningRef.current = false; setListening(false); setErrMsg(ERR_MSG[code]); }
      // no-speech / network / aborted: transitorio → onend reintenta, sin ruido.
    };
    recRef.current = rec;
    return () => { wantListeningRef.current = false; try { rec.stop(); } catch { /* ignore */ } };
  }, [addPieza, updateRow, borrarUltimo, hablar, aplicarFijas, aplicarDueno, tomarObservacionDeCarga]);

  /**
   * La lectura en voz alta vive en `use-lectura-en-voz`, compartida con el
   * cubicador de trozas: dos lecturas con reglas propias es como se termina
   * arreglando la pausa en una y no en la otra.
   */
  const lecturaVoz = useLecturaEnVoz<PiezaCubicada>({
    rate: () => configRef.current.voiceRate,
    voiceURI: () => configRef.current.voiceURI,
    pitch: () => configRef.current.voicePitch,
    volume: () => configRef.current.voiceVolume,
    /* El micrófono y el parlante no pueden estar prendidos a la vez: lo que
       dicta la tabla entraría como una pieza nueva. Y se sale del modo edición,
       que apunta a una fila que la lectura va a dejar atrás. */
    onAntesDeArrancar: () => {
      if (wantListeningRef.current) {
        wantListeningRef.current = false;
        try { recRef.current?.stop(); } catch { /* ignore */ }
        setListening(false);
      }
      modeRef.current = { type: "add" };
      setEditingId(null);
    },
    onError: (msg) => setErrMsg(msg),
    idDeFila: (id) => `cub-row-${id}`,
  });
  const readingId = lecturaVoz.leyendoId;
  const stopLeer = lecturaVoz.detener;
  /**
   * Lectura por tramos de especie (Brandon, 2026-09-22): al entrar a 2+ filas
   * seguidas de la misma especie dice «Continúa con panguana» UNA vez y
   * después sólo las medidas; una fila suelta se lee como siempre, con su
   * especie al final. Ver `textoPorTramos`.
   *
   * Con «Largo fijo al leer» (Brandon, 2026-09-23), una racha de 5+ piezas del
   * mismo largo se anuncia una vez y se lee sólo espesor y ancho. El ajuste se
   * mira en cada fila (por ref): apagarlo a mitad de la lectura vale desde la
   * siguiente que se encola.
   */
  const medidaEnVoz = useCallback(
    (r: PiezaCubicada, ctx: ContextoLectura<PiezaCubicada>) =>
      textoPorTramos(r, ctx, medidaSinEspecie, configRef.current.largoFijoAlLeer ? LARGO_EN_VOZ : undefined),
    [],
  );

  /**
   * Mantiene la pantalla encendida mientras se dicta: en el patio el celular
   * se bloqueaba a los 30 s y con la pantalla apagada Chrome corta el
   * micrófono — había que desbloquear y volver a tocar el botón cada rato.
   */
  const wakeLock = useCallback(async (activar: boolean) => {
    try {
      if (activar) {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (!nav.wakeLock || wakeRef.current) return;
        wakeRef.current = await nav.wakeLock.request("screen");
      } else if (wakeRef.current) {
        const w = wakeRef.current;
        wakeRef.current = null;
        await w.release();
      }
    } catch { /* sin soporte o denegado: el dictado sigue igual */ }
  }, []);

  // El sistema puede soltar el lock al minimizar; se re-pide al volver.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && wantListeningRef.current) void wakeLock(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLock(false);
    };
  }, [wakeLock]);

  const toggleListen = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    stopLeer();
    modeRef.current = { type: "add" }; setEditingId(null);
    pausedRef.current = false; setPaused(false);
    if (wantListeningRef.current) {
      wantListeningRef.current = false; rec.stop(); setListening(false);
      resetVoz(); setLiveText("");
      void wakeLock(false);
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      return;
    }
    wantListeningRef.current = true;
    resetVoz(); setLiveText(""); setErrMsg(null);
    /* Tocar el micrófono ES el gesto que destraba el audio del tip: las
       piezas llegan desde el reconocedor, que no cuenta como gesto. */
    prepararPitido();
    reinicioRef.current = { ultimo: 0, seguidos: 0 };
    void wakeLock(true);
    try { rec.start(); setListening(true); } catch { /* ya corriendo */ }
  }, [stopLeer, wakeLock]);

  // Editar una fila por voz: seleccionás la fila, dictás 3 números y la cambia.
  const startEdit = useCallback((rowId: string) => {
    const rec = recRef.current;
    if (!rec) return;
    stopLeer();
    if (editingId === rowId) { // volver a tocar = cancelar edición
      modeRef.current = { type: "add" }; setEditingId(null);
      wantListeningRef.current = false; try { rec.stop(); } catch { /* ignore */ }
      setListening(false); setLiveText("");
      return;
    }
    modeRef.current = { type: "edit", id: rowId };
    setEditingId(rowId); setErrMsg(null); setLiveText(""); resetVoz();
    prepararPitido(); // el tip de «corregida» también llega desde el reconocedor
    if (!wantListeningRef.current) {
      wantListeningRef.current = true;
      try { rec.start(); setListening(true); } catch { /* ya corriendo */ }
    }
  }, [editingId, stopLeer]);

  /**
   * Leer toda la tabla en voz alta, resaltando y siguiendo cada fila.
   *
   * Dos sentidos, un solo camino: al derecho (de la primera pieza a la última)
   * y **al revés** (Brandon, 2026-09-15), que arranca por la última y baja.
   * Al revés es para cotejar contra la pila física: la pila se destapa desde
   * arriba y arriba está lo ÚLTIMO que se cargó — escuchar desde la primera
   * obliga a ir contando al revés en la cabeza mientras se mueve madera.
   *
   * Tocar el sentido que YA suena corta la lectura y tocar el OTRO cambia de
   * sentido en el aire; las dos cosas las resuelve `leer` según el sentido que
   * se le pide.
   */
  /* ¿Lo que suena es la tabla ENTERA? Entonces el control flotante numera
     como la columna N° (con «más nuevas primero», de abajo hacia arriba). Un
     apartado o lo pendiente es otra lista: ahí «fila 3 de 8» es la tercera que
     se lee de esa lista, como siempre. */
  const [lecturaDeLaTabla, setLecturaDeLaTabla] = useState(true);
  const leerTabla = useCallback(() => {
    setLecturaDeLaTabla(true);
    lecturaVoz.leer(() => rowsRef.current, medidaEnVoz);
  }, [lecturaVoz, medidaEnVoz]);
  const leerTablaAlReves = useCallback(() => {
    setLecturaDeLaTabla(true);
    lecturaVoz.leer(() => rowsRef.current, medidaEnVoz, undefined, { haciaAtras: true });
  }, [lecturaVoz, medidaEnVoz]);
  /* Qué sentido está sonando AHORA: manda cuál de los dos ítems se ofrece como
     «Detener». Terminada la tanda el panel sigue abierto pero ya no lee, por
     eso se mira `readingId` y no el estado. */
  const leyendoAlReves = !!readingId && lecturaVoz.estado?.haciaAtras === true;
  const leyendoAlDerecho = !!readingId && !leyendoAlReves;

  /**
   * Arranca la lectura DESDE una fila. Es lo que se pide en la práctica: se
   * cortó en la 120 de 300 y no hay por qué escuchar las 119 de antes.
   */
  const leerDesdeFila = useCallback((id: string) => {
    setLecturaDeLaTabla(true);
    lecturaVoz.leerDesde(() => rowsRef.current, medidaEnVoz, id);
  }, [lecturaVoz, medidaEnVoz]);

  /**
   * Dicta SOLO espesor · ancho · largo de un grupo de filas (un apartado, o
   * lo pendiente) — sin especie ni totales, lo mínimo para copiar a mano o
   * al oído sin mirar la pantalla. `ids` filtra en vivo (no una foto
   * congelada): si el grupo cambia mientras lee, lee lo que hay ahora.
   */
  const leerMedidas = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setLecturaDeLaTabla(false);
    lecturaVoz.leer(
      () => rowsRef.current.filter((r) => idSet.has(r.id)),
      (r) => `${r.espesor}, ${r.ancho}, ${r.largo}`,
    );
  }, [lecturaVoz]);

  /**
   * Cambia el orden de la tabla y la REORDENA (ver `ordenFilas`). Si estaba
   * leyendo, corta: seguir por el mismo índice en otro orden nombraría otra
   * fila que la que se ve.
   */
  const cambiarOrden = useCallback((orden: OrdenFilas) => {
    ordenRef.current = orden;
    setOrdenFilas(orden);
    try { localStorage.setItem(`${storageKey(espacio)}-orden`, orden); } catch { /* ignore */ }
    if (lecturaVoz.activa()) lecturaVoz.detener();
    persist(ordenarFilas(rowsRef.current, orden));
  }, [espacio, lecturaVoz, persist]);

  const addManual = useCallback(() => {
    // SIEMPRE por ref (manualRef/fijasRef), nunca por el `manual`/`fijas` del
    // closure: cargando rápido, esta función se llama desde un keydown que
    // puede disparar antes de que React re-renderice con el último dígito
    // tipeado — leer el estado en vez del ref hacía fallar la validación en
    // silencio y obligaba a tocar Enter una segunda vez.
    const m = manualRef.current;
    const f = fijasRef.current;
    const c = Math.max(1, Math.round(Number(m.cantidad) || 1));
    // Las medidas fijadas con el candado mandan sobre lo tipeado.
    const e = Number(f.espesor ?? m.espesor);
    const a = Number(f.ancho ?? m.ancho);
    const l = Number(f.largo ?? m.largo);
    if (!(e > 0 && a > 0 && l > 0)) {
      pushToast({ tono: "warning", msg: "Faltan medidas", detail: "Espesor, ancho y largo tienen que ser mayores a 0." });
      return false;
    }
    addPieza({ cantidad: c, espesor: e, ancho: a, largo: l, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: especieRef.current || undefined, dueno: duenoRef.current || undefined, duenoParteId: (duenoRef.current && duenoParteIdRef.current) || undefined, codigo: codigoRef.current.trim() || undefined, observacion: tomarObservacionDeCarga() });
    // Lo fijado se conserva; sólo se limpia lo que se vuelve a tipear en cada pieza.
    setManualSync({
      cantidad: "1",
      espesor: f.espesor != null ? String(f.espesor) : "",
      ancho: f.ancho != null ? String(f.ancho) : "",
      largo: f.largo != null ? String(f.largo) : "",
    });
    pushToast({ tono: "success", msg: "Pieza agregada", detail: medidaTxt({ espesor: e, ancho: a, largo: l, especie: especieRef.current || undefined }) });
    /**
     * Dicta SOLO lo que cambió: lo fijo con candado es igual en toda la tanda
     * y repetirlo cada vez sería puro relleno cuando se está cargando rápido
     * a mano. Sin candados dicta las 3 medidas, con el largo fijo dicta sólo
     * espesor y ancho — la misma idea vale para cualquier candado puesto.
     */
    const variables = [
      f.espesor == null ? e : null,
      f.ancho == null ? a : null,
      f.largo == null ? l : null,
    ].filter((v): v is number => v != null);
    if (variables.length > 0) hablar(`${c > 1 ? `${c} de ` : ""}${variables.join(", ")}`);
    return true;
  }, [setManualSync, addPieza, pushToast, medidaTxt, hablar, tomarObservacionDeCarga]);

  /**
   * Enter cierra la pieza y devuelve el foco al espesor para encadenar la siguiente:
   * el operario carga cientos por día sin soltar el teclado.
   */
  /**
   * `grillaId` porque hay DOS copias del panel de entrada (arriba y al final
   * de la tabla, mismo lote) — el foco tiene que volver a la copia donde el
   * operario está parado, no siempre a la de arriba.
   */
  const confirmarCarga = useCallback((grillaId: string) => {
    if (addManual()) {
      // El foco vuelve al primer campo que NO esté fijado con el candado.
      const f = fijasRef.current;
      const primeraLibre = f.espesor == null ? COL_ESPESOR : f.ancho == null ? COL_ANCHO : f.largo == null ? COL_LARGO : COL_CANT;
      // Sincrónico, SIN `requestAnimationFrame`: el elemento del campo ya
      // existe en el DOM (no depende de que React termine de re-renderizar),
      // así que enfocarlo puede esperar un cuadro entero es un hueco real —
      // cargando rápido, el primer dígito de la pieza siguiente se tipeaba
      // ANTES de que llegara ese cuadro y caía en el campo donde se apretó
      // Enter (todavía enfocado), pegándose al valor viejo o completando la
      // pieza con datos de otro campo. Mismo criterio que `enfocarCelda` ya
      // usa puertas adentro.
      enfocarCelda(grillaId, 0, primeraLibre);
    }
  }, [addManual]);

  /**
   * Edición a mano de una fila (cantidad/medidas/especie) — sin pasar por voz.
   *
   * Estas seis leen SIEMPRE por `rowsRef` (nunca `rows` directo) y
   * `setLastAdded` en forma funcional: así quedan con identidad estable
   * (`useCallback` con deps que no cambian en cada tecla) y `FilaCubicada`
   * —memoizada, ver más abajo— puede saltarse el repintado de las filas
   * que no cambiaron. Con un lote de 683+ piezas (caso real de Brandon),
   * reconstruir las ~13.000 celdas de la tabla en CADA cambio de estado
   * —incluido abrir un modal que no toca ni una fila— era el freeze real.
   */
  const editarCampo = useCallback((id: string, campo: "cantidad" | "espesor" | "ancho" | "largo", valor: number) => {
    if (!(valor > 0)) return;
    persist(rowsRef.current.map((r) => {
      if (r.id !== id) return r;
      const upd = { ...r, [campo]: campo === "cantidad" ? Math.round(valor) : valor };
      const { pieTablar, m3 } = cubicarPieza(upd);
      return { ...upd, pieTablar, m3 };
    }));
  }, [persist]);
  const editarEspecie = useCallback((id: string, especieNueva: string) => {
    persist(rowsRef.current.map((r) => (r.id === id ? { ...r, especie: especieNueva || undefined } : r)));
  }, [persist]);
  const editarDueno = useCallback((id: string, duenoNuevo: string) => {
    /* Un nombre ya elegido del Directorio se ata a su ficha; cualquier otro
       queda como texto, sin precio pactado (ADR-430). */
    const ficha = fichaDe(duenoNuevo);
    persist(rowsRef.current.map((r) => (r.id === id ? { ...r, dueno: duenoNuevo.trim() || undefined, duenoParteId: ficha?.id } : r)));
  }, [persist, fichaDe]);
  /** Código de la troza editado en la tabla: texto libre. No cambia la
   *  especie de la fila — eso sólo lo hace el campo de arriba. */
  const editarCodigo = useCallback((id: string, codigoNuevo: string) => {
    persist(rowsRef.current.map((r) => (r.id === id ? { ...r, codigo: codigoNuevo.trim() || undefined } : r)));
  }, [persist]);
  /**
   * Pasa una medida que vino en otra unidad (un Excel con columna de unidad) a
   * la del cubicador: 5 cm → 1.969 pulg. CONVIERTE, no re-etiqueta: el volumen
   * queda igual. Si la etiqueta del archivo estaba mal, después se corrige el
   * número en la celda — lo que no se puede es dejar la pieza sin salida
   * ahora que la tabla no ofrece elegir la unidad (revisión 23-09).
   */
  const aUnidadEstandar = useCallback((id: string, campo: "espesor" | "ancho" | "largo") => {
    const clave = campo === "espesor" ? "uEspesor" : campo === "ancho" ? "uAncho" : "uLargo";
    persist(rowsRef.current.map((r) => {
      if (r.id !== id) return r;
      const valor = campo === "largo" ? toFeet(r[campo], r[clave]) : toInches(r[campo], r[clave]);
      const upd = { ...r, [campo]: Math.round(valor * 1000) / 1000, [clave]: UNIDAD_ESTANDAR[campo] };
      const { pieTablar, m3 } = cubicarPieza(upd);
      return { ...upd, pieTablar, m3 };
    }));
  }, [persist]);
  const editarObservacion = useCallback((id: string, nueva: string) => {
    persist(rowsRef.current.map((r) => (r.id === id ? { ...r, observacion: nueva.trim().slice(0, OBSERVACION_MAX) || undefined } : r)));
  }, [persist]);
  /**
   * Fuerza el tipo comercial de una pieza, o lo devuelve a automático.
   *
   * La medida no siempre decide: el aserradero vende por costumbre y por
   * cliente. Antes, para que el papel saliera con el tipo correcto había que
   * falsear la MEDIDA — que es justo el dato que va a la guía.
   */
  const editarTipo = useCallback((id: string, tipoNuevo: TipoComercial | "") => {
    persist(rowsRef.current.map((r) => (r.id === id ? { ...r, tipo: tipoNuevo || undefined } : r)));
  }, [persist]);
  /** Duplica la fila justo debajo: el mismo tipo de pieza se repite todo el día. */
  const duplicar = useCallback((id: string) => {
    const rowsNow = rowsRef.current;
    const i = rowsNow.findIndex((r) => r.id === id);
    if (i < 0) return;
    const copia: PiezaCubicada = { ...rowsNow[i], id: nuevoId() };
    const next = [...rowsNow.slice(0, i + 1), copia, ...rowsNow.slice(i + 1)];
    persist(next);
    setLastAdded(copia);
    pushToast({ tono: "success", msg: "Fila duplicada", detail: medidaTxt(copia) });
  }, [persist, pushToast, medidaTxt]);

  const borrar = useCallback((id: string) => {
    const rowsNow = rowsRef.current;
    const victima = rowsNow.find((r) => r.id === id);
    persist(rowsNow.filter((r) => r.id !== id));
    setLastAdded((prev) => (prev?.id === id ? null : prev));
    if (victima) pushToast({ tono: "warning", msg: "Fila eliminada", detail: medidaTxt(victima), undo: () => persist(ordenarFilas(rowsNow, ordenRef.current)) });
  }, [persist, pushToast, medidaTxt]);
  // Deshacer del flash de dictado: quita la última SIN toast (ya es una acción de deshacer).
  const deshacer = () => {
    if (!lastAdded) return;
    persist(rows.filter((r) => r.id !== lastAdded.id));
    setLastAdded(null);
    /* Una observación SUELTA se consumió con esa pieza: si el campo quedó
       vacío, vuelve, para que la pieza corregida la lleve de nuevo. La fija
       nunca se fue. */
    const obs = observacionRef.current;
    if (lastAdded.observacion && !obs.fija && !obs.texto.trim()) {
      ponerObservacion({ texto: lastAdded.observacion, fija: false });
    }
  };
  const limpiar = () => {
    if (rows.length === 0) return;
    const prev = rows;
    persist([]); setLastAdded(null);
    pushToast({ tono: "warning", msg: "Lote vaciado", detail: `${prev.length} ${prev.length === 1 ? "fila" : "filas"}`, undo: () => persist(ordenarFilas(prev, ordenRef.current)) });
  };

  useEffect(() => { try { localStorage.setItem(`${storageKey(espacio)}-apartados`, JSON.stringify(asignados)); } catch { /* ignore */ } }, [asignados]);
  useEffect(() => { try { localStorage.setItem(`${storageKey(espacio)}-apartados-nombres`, JSON.stringify(nombresApartado)); } catch { /* ignore */ } }, [nombresApartado]);
  /**
   * Fila borrada, lote vaciado o reemplazado (nueva/guardada) → sus
   * asignaciones de apartado no pueden seguir señalando a un id que ya no
   * existe. OJO: `rows` arranca en `[]` y se carga por efecto (ver arriba,
   * "las filas sí se cargan por efecto") — mismo bug de "el efecto que
   * persiste corre antes que el que carga" ya documentado con precios, y acá
   * más filoso: en React Strict Mode (dev) los efectos de montaje se INVOCAN
   * DOS VECES antes del primer commit real, así que un ref "saltar sólo la
   * primera vez" no alcanza (la segunda pasada ya no salta y poda contra el
   * `[]` de arranque de todas formas). La comparación por REFERENCIA sí
   * aguanta eso: `rows` sigue siendo exactamente el mismo array del `useState`
   * inicial en ambas pasadas — recién cambia de referencia cuando el efecto
   * de carga hace su `setRows` y el componente vuelve a renderizar de verdad.
   */
  const rowsInicialesRef = useRef(rows);
  useEffect(() => {
    if (rows === rowsInicialesRef.current) return; // todavía no llegaron las filas reales
    setAsignados((prev) => podarAsignados(prev, rows));
  }, [rows]);
  /**
   * Un apartado sin filas vivas pierde su nombre — SIN esto, un lote nuevo
   * (que numera de nuevo desde 1) heredaría el nombre del "Apartado 1" del
   * lote anterior. `asignados` en sí no tiene el problema de arranque en `[]`
   * de arriba (se lee sincrónico del storage en el inicializador), así que
   * este efecto puede ir directo sin el mismo guard.
   */
  useEffect(() => {
    setNombresApartado((prev) => podarNombres(prev, asignados));
  }, [asignados]);

  const pendientesAp = useMemo(() => filasPendientes(rows, asignados), [rows, asignados]);
  const resumenAp = useMemo(() => resumenApartados(rows, asignados), [rows, asignados]);
  /** Lo que ENTRARÍA al próximo apartado ahora mismo: lo marcado (si hay algo
   *  marcado y sin apartado todavía) o si no todo lo pendiente. Un solo lugar
   *  para esta cuenta — la usan tanto el botón de cerrar como la vista previa
   *  de totales del panel. */
  const candidatasAp = useMemo(
    () => (marcadas.size > 0 ? rows.filter((r) => marcadas.has(r.id) && asignados[r.id] == null) : pendientesAp),
    [rows, marcadas, asignados, pendientesAp],
  );
  const totalCandidatasAp = useMemo(() => totalizarFilas(candidatasAp), [candidatasAp]);
  /** Cierra un apartado con lo marcado (si hay algo marcado) o con todo lo pendiente. */
  const cerrarApartado = () => {
    if (candidatasAp.length === 0) return;
    const numero = siguienteApartado(asignados);
    setAsignados((prev) => asignarApartado(prev, candidatasAp.map((r) => r.id), numero));
    if (marcadas.size > 0) setMarcadas(new Set());
    pushToast({
      tono: "success", msg: `Apartado ${numero} cerrado`,
      detail: `${candidatasAp.length} ${candidatasAp.length === 1 ? "fila" : "filas"}`,
      undo: () => setAsignados((prev) => disolverApartado(prev, numero)),
    });
  };
  const quitarApartado = (numero: number) => setAsignados((prev) => disolverApartado(prev, numero));
  /** "Usar este apartado para imprimir": tilda sus filas — Anexo 04/Excel/PDF
   *  ya salen SÓLO con lo tildado (`rowsParaPapel`), así que reusar `marcadas`
   *  es gratis: nada que enseñarle de nuevo al que exporta. */
  const usarApartadoParaImprimir = (ids: string[]) => {
    setMarcadas(new Set(ids));
    pushToast({ tono: "success", msg: "Filas marcadas", detail: "Anexo 04, Excel y PDF van a salir sólo con este apartado." });
  };
  const renombrarApartadoActual = (numero: number, nombre: string) => setNombresApartado((prev) => renombrarApartado(prev, numero, nombre));

  /* El m³ del TOTAL se deriva del pie tablar total, no de sumar los m³ de cada
     fila: sumar 300 valores ya redondeados a 4 decimales corre el total unas
     centésimas y la cuenta que se hace a mano —13.026 ÷ 424 = 30,722— dejaba de
     dar (Brandon, 2026-09-01). Con esto, TOTAL × 424 = PT total, exacto. */
  const totales = useMemo(() => {
    const pt = rows.reduce((a, r) => a + r.pieTablar, 0);
    return { piezas: rows.reduce((a, r) => a + r.cantidad, 0), pt, m3: m3DesdePt(pt) };
  }, [rows]);
  const precio = precios.general;

  // Especies presentes en el lote (para el editor de precio por especie).
  const especiesLote = useMemo(
    () => [...new Set(rows.map((r) => r.especie?.trim()).filter((e): e is string => !!e))],
    [rows],
  );
  // ¿Alguna pieza sin especie? (opción "Sin especie" en el filtro).
  const haySinEspecie = useMemo(() => rows.some((r) => !r.especie?.trim()), [rows]);
  // Dueños presentes en el lote — mismo criterio que especiesLote/haySinEspecie.
  const duenosLote = useMemo(
    () => [...new Set(rows.map((r) => r.dueno?.trim()).filter((d): d is string => !!d))],
    [rows],
  );
  const haySinDueno = useMemo(() => rows.some((r) => !r.dueno?.trim()), [rows]);
  // Lo que se puede ELEGIR en la barra y en la tabla: los guardados en el
  // dispositivo (con su forma escrita) + los que ya trae ESTE lote, sin repetir
  // aunque cambien mayúsculas o acentos.
  const duenosParaElegir = useMemo(
    () => opcionesDeDueno([duenosConocidos, duenosLote]),
    [duenosLote, duenosConocidos],
  );
  /** Los códigos del patio para el datalist de la celda «Código», sin repetir. */
  const codigosParaDatalist = useMemo(
    () => [...new Map((codigoDeTroza?.trozas ?? []).map((t) => [t.codigo, t] as const)).values()],
    [codigoDeTroza?.trozas],
  );
  // Tipos comerciales presentes, en el orden canónico (para el filtro por tipo).
  const tiposLote = useMemo(() => {
    const set = new Set<TipoComercial>(rows.map((r) => tipoDePieza(r)));
    return ORDEN_TIPO.filter((t) => set.has(t));
  }, [rows]);
  // Vista filtrada del lote: conserva el índice original para el N° estable.
  const filtrando = filtroEspecie !== "" || filtroTipo !== "" || filtroDueno !== "" || busqueda.trim() !== "";
  const norm = (s: string) => s.toLowerCase().replace(/[×*]/g, "x").replace(/\s+/g, "");
  const filasVisibles = useMemo(() => {
    const q = norm(busqueda);
    return rows
      .map((r, indice) => ({ r, indice }))
      .filter(({ r }) => {
        if (filtroEspecie && (r.especie?.trim() || "__sin__") !== filtroEspecie) return false;
        if (filtroTipo && tipoDePieza(r) !== filtroTipo) return false;
        if (filtroDueno && (r.dueno?.trim() || "__sin__") !== filtroDueno) return false;
        if (q) {
          const hay = norm(`${r.espesor}x${r.ancho}x${r.largo} ${r.especie ?? ""} ${r.dueno ?? ""} ${r.codigo ?? ""} ${r.observacion ?? ""} ${tipoDePieza(r)}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [rows, filtroEspecie, filtroTipo, filtroDueno, busqueda]);
  const limpiarFiltros = useCallback(() => { setFiltroEspecie(""); setFiltroTipo(""); setFiltroDueno(""); setBusqueda(""); }, []);

  /**
   * Ventaneo de la tabla (memoria `cubicador-freeze-lotes-grandes`): con
   * 700+ filas × ~10 controles cada una, montar la tabla ENTERA de una crea
   * miles de nodos DOM en un solo commit de React y cuelga el tab —
   * confirmado con un CPU profile real (no supuesto), no un problema de
   * re-render (por eso memoizar la fila no alcanzaba). Por debajo del umbral
   * se sigue rindiendo TODO, sin costo de ventaneo, para el caso común.
   *
   * Es SEGURO para selección por arrastre y navegación por teclado porque
   * ambas trabajan por posición (`fila`/`col`), no por ref de DOM
   * (`seleccion-celdas.tsx`/`celdas-excel.tsx`): el gesto de mouse ya estaba
   * limitado a lo que se ve en pantalla, y `enfocarCelda`/`filasDe` ya
   * toleran una fila ausente (no revientan, sólo no mueven el foco esa vez)
   * — el sobremontaje generoso hace que eso casi nunca pase en uso normal.
   */
  /* El ventaneo vive en `use-tabla-ventaneada`, compartido con el cubicador de
     trozas: dos ventaneos escritos aparte es como se termina arreglando el
     scroll en uno y no en el otro. */
  const ventana = useTablaVentaneada(filasVisibles, { altoVisor });
  const virtualizarTabla = ventana.virtualizar;
  const inicioVentana = ventana.inicioVentana;
  const filasEnVentana = ventana.filasEnVentana;
  const colchonSuperior = ventana.colchonSuperior;
  const colchonInferior = ventana.colchonInferior;
  const primeraFilaRef = ventana.primeraFilaRef;
  /* Se arma acá y no en el JSX: un `data-*` dentro de un literal tipado como
     `HTMLAttributes` no compila por el chequeo de propiedades de más. */
  const propsTabla = useMemo(() => {
    /* Pasa por `Record` a propósito: un `data-*` en un literal tipado como
       `HTMLAttributes` lo rechaza el chequeo de propiedades de más, aunque en
       JSX sea válido. */
    const p: Record<string, unknown> = { ...ventana.propsContenedor };
    p["data-grilla"] = GRILLA_TABLA;
    return p as React.HTMLAttributes<HTMLDivElement>;
  }, [ventana.propsContenedor]);


  /**
   * Teclado de la tabla. `data-fila` es la posición VISIBLE (no el índice del lote):
   * con un filtro puesto, las flechas tienen que moverse por lo que se ve.
   */
  // Estables (useCallback) por la misma razón que editarCampo/duplicar/borrar
  // más arriba: `onEliminarFila`/`onDuplicarFila` inline acá rompían la
  // identidad de `teclasTabla` en CADA render, y `teclasTabla` es prop de
  // cada fila de la tabla — con eso ninguna fila podía memoizarse nunca.
  const onEliminarFilaVisible = useCallback((posicion: number) => {
    const fila = filasVisibles[posicion];
    if (fila) borrar(fila.r.id);
  }, [filasVisibles, borrar]);
  const onDuplicarFilaVisible = useCallback((posicion: number) => {
    const fila = filasVisibles[posicion];
    if (fila) duplicar(fila.r.id);
  }, [filasVisibles, duplicar]);
  /**
   * Cant./Espesor/Ancho/Largo ahora se pueden ocultar en la TABLA — la
   * navegación de teclado tiene que saltearse la que no está. Sin esto, una
   * flecha hacia la columna oculta buscaba un `data-col` que ya no existe en
   * el DOM y se quedaba quieta en vez de saltar a la siguiente visible.
   */
  const tablaColumnasVisibles = useMemo(
    () => TABLA_COLUMNAS_TODAS.filter((c) =>
      c === COL_CANT ? colsVisibles.cant
      : c === COL_ESPESOR ? colsVisibles.espesor
      : c === COL_ANCHO ? colsVisibles.ancho
      : colsVisibles.largo),
    [colsVisibles.cant, colsVisibles.espesor, colsVisibles.ancho, colsVisibles.largo],
  );
  const teclasTabla = useTecladoGrilla({
    grilla: GRILLA_TABLA,
    totalFilas: filasVisibles.length,
    columnas: tablaColumnasVisibles,
    onEliminarFila: onEliminarFilaVisible,
    onDuplicarFila: onDuplicarFilaVisible,
  });
  // Totales de la vista (iguales al lote si no hay filtro activo).
  const totalesVisibles = useMemo(() => {
    const sub = filasVisibles.reduce(
      (a, { r }) => ({ piezas: a.piezas + r.cantidad, pt: a.pt + r.pieTablar }),
      { piezas: 0, pt: 0 },
    );
    return { ...sub, m3: m3DesdePt(sub.pt) }; // mismo criterio que el total
  }, [filasVisibles]);

  // ── Gestos de planilla: marcar un rango y arrastrar para repetir ──────────
  /**
   * La selección trabaja en POSICIONES VISIBLES, igual que el teclado: con un
   * filtro puesto, marcar «de la 3 a la 8» tiene que abarcar lo que se ve.
   */
  const sel = useSeleccionRango(filasVisibles.length);
  const columnasSel = useMemo<ColumnaSeleccionable[]>(() => {
    const pieza = (pos: number) => filasVisibles[pos]?.r ?? null;
    // Sólo columnas de la MISMA unidad. Espesor/ancho/largo se pueden marcar
    // para copiar, pero no se suman: un lote mezcla pulgadas con centímetros
    // y el total sería un número sin unidad. Una columna OCULTA no entra: un
    // rango arrastrado que la salte numéricamente (de Cant. a m³, por ej.) no
    // debe mostrar la cuenta de una columna que ni siquiera se ve.
    const cols: ColumnaSeleccionable[] = [];
    if (colsVisibles.cant) cols.push({ col: TCOL.cant, label: "Cant.", unidad: "pzas", decimales: 0, leer: (p) => pieza(p)?.cantidad ?? null });
    if (colsVisibles.pt) cols.push({ col: TCOL.pt, label: "Pie tablar", unidad: "PT", decimales: 2, leer: (p) => pieza(p)?.pieTablar ?? null });
    if (colsVisibles.m3) cols.push({ col: TCOL.m3, label: "m³", unidad: "m³", decimales: 3, leer: (p) => pieza(p)?.m3 ?? null });
    return cols;
  }, [filasVisibles, colsVisibles.cant, colsVisibles.pt, colsVisibles.m3]);
  /** La columna «Código» existe sólo en «Producir sin lote», y ahí se puede ocultar. */
  const verCodigo = conCodigo && colsVisibles.codigo;
  /** Cuántas columnas hay ANTES de Pie tablar/m³ ahora mismo — el rótulo del
   *  pie de tabla las abarca todas; con columnas ocultas, un colSpan fijo se
   *  quedaba corto o largo y desalineaba los totales. */
  const colSpanTotales = 1 // "Marcar" (el tilde del PDF) es la única fija de las de la izquierda
    + (colsVisibles.numero ? 1 : 0) + (colsVisibles.cant ? 1 : 0)
    + (colsVisibles.espesor ? 1 : 0) + (colsVisibles.ancho ? 1 : 0) + (colsVisibles.largo ? 1 : 0)
    + (colsVisibles.medida ? 1 : 0) + (colsVisibles.tipo ? 1 : 0)
    + (verCodigo ? 1 : 0) + (colsVisibles.especie ? 1 : 0) + (colsVisibles.dueno ? 1 : 0)
    + (colsVisibles.observacion ? 1 : 0) + (colsVisibles.apartado ? 1 : 0);

  /**
   * Arrastre de relleno: se toma el asa de una celda y se baja.
   *
   * El valor sale SIEMPRE de la fila de origen, así que rellenar y después
   * corregir el origen no arrastra el cambio — es una copia, no un vínculo.
   */
  const rellenarCampo = useCallback(
    (campo: "especie" | "tipo" | "dueno" | "codigo") => (origen: number, posiciones: number[]) => {
      const base = filasVisibles[origen]?.r;
      if (!base) return;
      const ids = new Set(posiciones.map((p) => filasVisibles[p]?.r.id).filter(Boolean));
      if (ids.size === 0) return;
      const valor = campo === "especie" ? base.especie : campo === "dueno" ? base.dueno : campo === "codigo" ? base.codigo : base.tipo;
      /* El dueño viaja con su ficha: copiar el nombre sin ella cambiaría el precio. */
      persist(rows.map((r) => (!ids.has(r.id) ? r : campo === "dueno" ? { ...r, dueno: base.dueno, duenoParteId: base.duenoParteId } : { ...r, [campo]: valor })));
      const etiqueta = campo === "especie" ? (valor || "sin especie") : campo === "dueno" ? (valor || "sin dueño") : campo === "codigo" ? (valor || "sin código") : (valor ?? "automático");
      pushToast({
        tono: "success",
        msg: `${ids.size} ${ids.size === 1 ? "fila" : "filas"} → ${etiqueta}`,
        detail: "Arrastra el cuadradito de la esquina para repetir un valor.",
      });
    },
    [filasVisibles, rows, persist, pushToast],
  );
  const rellenoEspecie = useRellenoArrastre(useMemo(() => rellenarCampo("especie"), [rellenarCampo]));
  const rellenoTipo = useRellenoArrastre(useMemo(() => rellenarCampo("tipo"), [rellenarCampo]));
  const rellenoDueno = useRellenoArrastre(useMemo(() => rellenarCampo("dueno"), [rellenarCampo]));
  const rellenoCodigo = useRellenoArrastre(useMemo(() => rellenarCampo("codigo"), [rellenarCampo]));
  /** Arrastre de relleno de la columna Apartado: copia el número (o "sin
   *  apartado") de la fila de origen hacia las filas pisadas — mismo gesto
   *  que especie/tipo arriba. Escribe en `asignados`, no en `rows` (el
   *  apartado no es un campo de la pieza). */
  const rellenarApartado = useCallback((origen: number, posiciones: number[]) => {
    const base = filasVisibles[origen]?.r;
    if (!base) return;
    const valor = asignados[base.id];
    const ids = posiciones.map((p) => filasVisibles[p]?.r.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    setAsignados((prev) => (valor != null ? asignarApartado(prev, ids, valor) : quitarAsignaciones(prev, ids)));
    pushToast({
      tono: "success",
      msg: `${ids.length} ${ids.length === 1 ? "fila" : "filas"} → ${valor != null ? `Apartado ${valor}` : "sin apartado"}`,
      detail: "Arrastra el cuadradito de la esquina para repetir un valor.",
    });
  }, [filasVisibles, asignados, pushToast]);
  const rellenoApartado = useRellenoArrastre(rellenarApartado);
  /* Precio por PT de cada pieza (ADR-430, `lib/forestal/precio-de-pieza`): el
     trato de su dueño del Directorio, si el modo lo usa y lo cubre; si no, el
     de su especie o el general a mano. Los seis que valorizan (resumen, valor,
     cabecera, WhatsApp, CSV, PDF/Excel) leen ESTE resolver. */
  const precioDe = precios.precioDe;
  /** ¿Hay piezas con un precio que no es el general? Cambia cómo se rotula. */
  const precioVariable = precios.precioVariable;
  const conValor = precios.conValor;
  const valorLote = precios.valorLote;
  const soles = (v: number) => formatNumber(v, 2);
  const rotuloPrecio = precios.calculando
    ? "leyendo el precio de los clientes…"
    : !conValor
      ? "pon el precio en «Precio», arriba de la tabla"
      : precioVariable
        ? precios.modo === "manual" ? "precio por especie" : "precio de cada cliente"
        : `S/ ${soles(precio)} por PT`;
  /* Piezas con dueño escrito a mano (sin ficha): en modo Aserrío/Venta van al
     precio a mano. Las que ya se pueden atar —su nombre es de alguien elegido
     antes del Directorio— se atan con un clic. */
  const { sinDirectorio, vinculables } = useMemo(() => {
    let sin = 0;
    let atables = 0;
    for (const r of rows) {
      if (!r.dueno?.trim() || r.duenoParteId) continue;
      sin += r.cantidad;
      if (fichasDueno[claveDueno(r.dueno)]) atables += r.cantidad;
    }
    return { sinDirectorio: sin, vinculables: atables };
  }, [rows, fichasDueno]);
  const vincularConFichas = useCallback(() => {
    persist(rowsRef.current.map((r) => {
      const f = !r.duenoParteId ? fichaDe(r.dueno) : null;
      return f ? { ...r, duenoParteId: f.id } : r;
    }));
  }, [persist, fichaDe]);
  const nombreDeCliente = useCallback(
    (id: string) => rows.find((r) => r.duenoParteId === id)?.dueno?.trim() || "un cliente",
    [rows],
  );

  // Espejo del total para el comando de voz "cuánto llevo" (el handler del
  // reconocedor vive en un closure; lee el ref para no quedar con datos viejos).
  const totalVozRef = useRef({ piezas: 0, pt: 0, valor: 0, conValor: false });
  useEffect(() => { totalVozRef.current = { piezas: totales.piezas, pt: totales.pt, valor: valorLote, conValor }; }, [totales, valorLote, conValor]);

  // Resumen agrupado por la dimensión elegida (especie/largo/sección/…), con el
  // valor resuelto por especie cuando corresponde.
  const resumen = useMemo(() => agruparPor(rows, dimResumen, precioDe), [rows, dimResumen, precioDe]);
  const exportarResumenCSV = () => {
    const csv = resumenACsv(resumen, dimResumen, conValor);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `resumen-${dimResumen}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Números del dictado en curso, AGRUPADOS en tríos (espesor·ancho·largo) para
  // que se vea cómo se cuadran las piezas en vivo — y no una barra continua que
  // confunde en el dictado rápido.
  const liveGroups = useMemo(() => {
    if (!listening || !liveText) return null;
    /* El caption en vivo usa el mismo desempate que el dictado de verdad: si
       mostrara otra lectura, el operario vería una medida y entraría otra. */
    const nums = mejoresNumeros([liveText], fijas, 0, { frecuentes: frecuentesRef.current });
    // El tamaño del grupo depende de las fijas: con el largo fijo, cada DOS
    // números ya son una pieza y así se ven mientras se dicta.
    const paso = numerosPorPieza(fijas) || 3;
    const triples: number[][] = [];
    let i = 0;
    for (; i + paso <= nums.length; i += paso) triples.push(nums.slice(i, i + paso));
    return { triples, resto: nums.slice(i) };
  }, [listening, liveText, fijas]);

  /** Abre el modal para elegir grado y si se envuelve en un lote de producción. */
  const enviarAlLibro = () => {
    if (!rows.length || enviando) return;
    setLoteCreado(null);
    setShowEnviarModal(true);
  };

  /**
   * Registra el lote cubicado en el Libro CTP como PRODUCCIÓN (unit "pt") y,
   * si se pidió, lo envuelve en un LOTE (código L-YYYY-NNN). Sin consumos: el
   * libro admite huecos y la materia prima se atribuye después en el Libro —
   * forzarla acá fabricaría atribuciones inventadas (invariantes I2/I5).
   */
  const confirmarEnvio = async ({ grade, crearLote }: { grade: string; crearLote: boolean }) => {
    if (!rows.length || enviando) return;
    const especies = [...new Set(rows.map((r) => r.especie).filter(Boolean))] as string[];
    const speciesCommon = especies.length === 1 ? especies[0] : (especie || null);
    const porMedida = agruparPor(enOrdenDelPapel(rows, ordenFilas), "medida").grupos;
    const resumenTxt = porMedida.slice(0, 6).map((g) => `${g.cantidad}× ${g.label}`).join("; ");
    const cantidad = Math.round(totales.pt * 100) / 100;
    let codigoLote: string | null = null;
    setEnviando(true);
    setErrMsg(null);
    try {
      // 1) Producción en el Libro CTP.
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "POST",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({
          section: "produccion",
          productType: "Madera aserrada",
          speciesCommon,
          quantity: cantidad,
          unit: "pt",
          pieces: totales.piezas,
          observations: `Cubicado con la herramienta por voz — ${rows.length} filas. ${resumenTxt}`.slice(0, 1000),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          j?.error === "spec_disabled"
            ? "El Libro CTP no está habilitado para esta tienda."
            : (j?.message ?? j?.error ?? `HTTP ${r.status}`),
        );
      }
      const entryId: string | undefined = j?.entry?.id;

      // 2) Lote de producción que envuelve esa corrida (opcional).
      if (crearLote && entryId) {
        const rl = await fetch("/api/admin/forestal/lotes", {
          method: "POST",
          headers: { "content-type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({
            productType: "Madera aserrada",
            speciesCommon,
            unit: "pt",
            grade: grade || null,
            miembros: [{ produccionEntryId: entryId, quantity: cantidad }],
          }),
        });
        const jl = await rl.json().catch(() => ({}));
        if (!rl.ok) throw new Error(jl?.message ?? jl?.error ?? `No se pudo crear el lote (HTTP ${rl.status})`);
        codigoLote = jl?.lote?.codigo ?? "creado";
        setLoteCreado(codigoLote);
      }
      // 3) Dejar el hilo cubicación → corrida del Libro. Sin esto, el ANEXO N° 04
      //    de un despacho futuro no tiene de dónde sacar las medidas pieza por
      //    pieza (el Libro guarda especie y volumen, no E·A·L). Se guarda sola
      //    la cubicación si todavía no estaba guardada.
      if (entryId) {
        void fetch("/api/admin/forestal/cubicaciones", {
          method: "POST",
          headers: { "content-type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({
            id: cubicacionActual?.id || undefined,
            nombre: cubicacionActual?.nombre
              || nombreSugerido(speciesCommon || undefined, { piezas: totales.piezas, pieTablar: totales.pt, m3: totales.m3 }),
            fecha: form.fecha || hoyISO(),
            cliente: form.cliente.trim() || undefined,
            especie: speciesCommon || undefined,
            precioPt: precio,
            /* El código de la troza es interno del cubicado: no sale al servidor. */
            /* En el orden del papel, no el de la tabla: con «más nuevas
               primero» el Anexo 04 saldría al revés (`piezasParaVincular`). */
            piezas: piezasParaVincular(rowsRef.current, ordenRef.current),
            ctpEntryId: entryId,
          }),
        })
          .then((res) => res.json().catch(() => ({})))
          .then((jc: { cubicacion?: { id: string; nombre: string } }) => {
            if (jc?.cubicacion) setCubicacionActual({ id: jc.cubicacion.id, nombre: jc.cubicacion.nombre });
            setHistorialToken((t) => t + 1);
          })
          .catch((err) => setErrMsg(`Quedó en el Libro, pero no se pudo vincular la cubicación: ${String(err).slice(0, 80)}`));
      }

      setEnviado(true);
      setShowEnviarModal(false);
      pushToast({ tono: "success", msg: "Enviado al Libro CTP", detail: codigoLote ? `Lote ${codigoLote}` : undefined });
    } catch (e) {
      setErrMsg(`No se pudo registrar en el Libro: ${e instanceof Error ? e.message : String(e)}`);
      pushToast({ tono: "error", msg: "No se pudo enviar al Libro", detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnviando(false);
    }
  };

  /**
   * Guarda el lote como cubicación con nombre y fecha. Los totales los
   * recalcula el servidor desde las piezas — el papel guardado no depende de
   * lo que diga la pantalla.
   */
  const guardarCubicacion = async () => {
    if (!rows.length || guardando) return;
    setGuardando(true);
    setErrMsg(null);
    try {
      const r = await fetch("/api/admin/forestal/cubicaciones", {
        method: "POST",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({
          id: cubicacionActual?.id || undefined,
          nombre: form.nombre.trim() || nombreSugerido(especie || undefined, { piezas: totales.piezas, pieTablar: totales.pt, m3: totales.m3 }),
          fecha: form.fecha,
          cliente: form.cliente.trim() || null,
          especie: especie || null,
          notas: form.notas.trim() || null,
          precioPt: precio,
          /* En el orden del papel: el Anexo 04 numera lo guardado tal cual llega. */
          piezas: piezasParaGuardar(rows, ordenFilas),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(
          j?.error === "specialization_disabled" ? (j.message as string)
            : j?.error === "validation_error" ? "Revisa los datos de la cubicación."
              : (j?.message ?? `HTTP ${r.status}`),
        );
      }
      const { cubicacion } = (await r.json()) as { cubicacion: CubicacionRegistro };
      setCubicacionActual({ id: cubicacion.id, nombre: cubicacion.nombre });
      setGuardadoOk(cubicacion.nombre);
      setShowGuardar(false);
      setHistorialToken((v) => v + 1);
      setTimeout(() => setGuardadoOk(null), 6000);
      pushToast({ tono: "success", msg: "Cubicación guardada", detail: `«${cubicacion.nombre}»` });
    } catch (e) {
      const msg = `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`;
      setErrMsg(msg);
      pushToast({ tono: "error", msg: "No se pudo guardar", detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setGuardando(false);
    }
  };

  /** Carga una cubicación guardada en la tabla para seguir o re-exportar. */
  const abrirCubicacion = async (c: CubicacionRegistro) => {
    if (rows.length > 0 && !cubicacionActual && !(await confirm({
      title: "Vas a reemplazar el lote que tienes en pantalla",
      description: "No está guardado. ¿Seguir?",
      intent: "warning",
      confirmLabel: "Sí, reemplazar",
    }))) return;
    persist(recubicarPiezas(c.piezas));
    setEspecie(c.especie ?? "");
    precios.setPrecioPt(c.precioPt ? String(c.precioPt) : "");
    setForm({ nombre: c.nombre, fecha: c.fecha, cliente: c.cliente ?? "", notas: c.notas ?? "" });
    setCubicacionActual(c.id ? { id: c.id, nombre: c.nombre } : null);
    setShowHistorial(false);
    setLastAdded(null);
    setEnviado(false);
  };

  /** Arranca un lote en blanco (lo guardado queda en el historial). */
  const nuevaCubicacion = async () => {
    if (rows.length > 0 && !cubicacionActual && !(await confirm({
      title: "El lote actual no está guardado y se va a borrar",
      description: "¿Seguir?",
      intent: "danger",
      confirmLabel: "Sí, borrar",
    }))) return;
    limpiar();
    setCubicacionActual(null);
    setForm({ nombre: "", fecha: hoyISO(), cliente: "", notas: "" });
    setEnviado(false);
  };

  /**
   * Manda el resumen por WhatsApp: en el patio se cierra el trato por chat, y
   * el comprador quiere el detalle por medida, el total en PT y el precio.
   */
  const compartirWhatsApp = () => {
    const gruposWa = agruparPor(rows, "medida").grupos;
    const lineas = gruposWa.slice(0, 12).map((g) => `• ${g.cantidad}× ${g.label} = ${fmtPt(g.pieTablar)} PT`);
    const extra = gruposWa.length > 12 ? `\n…y ${gruposWa.length - 12} medidas más` : "";
    const texto = [
      `*Cubicación${especie ? ` · ${especie}` : ""}*`,
      `${totales.piezas} piezas · ${fmtPt(totales.pt)} PT · ${fmtM3(totales.m3)} m³`,
      "",
      ...lineas,
      extra,
      conValor ? `\n*Total: S/ ${soles(valorLote)}* (${rotuloPrecio})` : "",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  };

  const exportarCSV = () => {
    const head = ["Cantidad", "Espesor", "uEsp", "Ancho", "uAnc", "Largo", "uLar", "Especie", "PieTablar", "m3", "ValorS/"];
    const lines = enOrdenDelPapel(rows, ordenFilas).map((r) => [r.cantidad, r.espesor, r.uEspesor, r.ancho, r.uAncho, r.largo, r.uLargo, r.especie ?? "", r.pieTablar, r.m3, (r.pieTablar * precioDe(r)).toFixed(2)].join(","));
    const csv = "﻿" + [head.join(","), ...lines, ["TOTAL", "", "", "", "", "", "", "", totales.pt.toFixed(2), totales.m3.toFixed(3), valorLote.toFixed(2)].join(",")].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `cubicacion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    pushToast({ tono: "success", msg: "CSV descargado" });
  };

  /** Corre una descarga (PDF/Excel) avisando el resultado por toast. */
  const descargarConAviso = (p: Promise<void>, ok: string, err: string) =>
    p.then(() => pushToast({ tono: "success", msg: ok }))
      .catch(() => { setErrMsg(err); pushToast({ tono: "error", msg: err }); });

  return (
    <div className="group relative space-y-4">
      {/* Lo que llevás medido, antes del micrófono: los tres números que decide
          el módulo (m³, pie tablar, piezas) estaban sólo abajo de la tabla o
          detrás del panel de Resumen, y se carga mirando acá arriba. */}
      <CubicadorKpis
        oculto={plegados.kpis}
        onOcultar={() => setPlegados((v) => ({ ...v, kpis: true }))}
        onMostrar={() => setPlegados((v) => ({ ...v, kpis: false }))}
        rows={rows}
        totales={totales}
        totalesVisibles={totalesVisibles}
        filtrando={filtrando}
        valorLote={valorLote}
        conValor={conValor}
        hayPreciosEspecie={precioVariable}
        precio={precio}
        rotuloPrecio={rotuloPrecio}
        avisarRaras={avisarRaras}
        fmtPt={fmtPt}
        fmtM3={fmtM3}
        /* Tocar un tipo del mix filtra la tabla por él: la pregunta que sigue a
           «el 60 % es Comercial» es «¿cuáles?». */
        onFiltrarTipo={(t) => {
          setFiltroTipo((actual) => (actual === t ? "" : t));
          document.getElementById(`cub-tabla-ancla`)?.scrollIntoView({ block: "start", behavior: "smooth" });
        }}
      />

      {/* Panel de voz. Plegado deja una tira con su nombre y el botón para
          traerlo de vuelta: si desapareciera del todo, la función se perdería. */}
      {plegados.voz ? (
        <button
          type="button"
          onClick={() => setPlegados((v) => ({ ...v, voz: false }))}
          className="flex w-full items-center justify-between gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5 text-left transition-colors hover:border-[var(--accent)]"
        >
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
            <Mic className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Cargar piezas
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden /> Mostrar
          </span>
        </button>
      ) : (
      <PanelEntradaVoz
        onPlegar={() => setPlegados((v) => ({ ...v, voz: true }))}
        grillaId={GRILLA_CARGA}
        onPresent={onPresent}
        onImportar={() => setShowImportar(true)}
        showAjustes={showAjustes}
        onToggleAjustes={() => setShowAjustes((v) => !v)}
        config={config}
        onUpdateConfig={updateConfig}
        voices={voices}
        onProbarVoz={() => decir("dos, seis, ocho", config)}
        supported={supported}
        listening={listening}
        onToggleListen={toggleListen}
        paused={paused}
        fijas={fijas}
        onAplicarFijas={aplicarFijas}
        especie={especie}
        onEspecieChange={setEspecie}
        especies={especiesOfrecidas}
        onAbrirEspecies={() => setShowEspeciesModal(true)}
        dueno={dueno}
        duenoDelDirectorio={Boolean(dueno && duenoParteId)}
        onDuenoChange={aplicarDueno}
        duenosConocidos={duenosParaElegir}
        onAbrirDuenos={() => setShowDuenosModal(true)}
        liveGroups={liveGroups}
        errMsg={errMsg}
        lastAdded={lastAdded}
        addedFlash={addedFlash}
        onDeshacer={deshacer}
        fmtPt={fmtPt}
        manual={manual}
        onManualChange={setManualSync}
        onConfirmarCarga={confirmarCarga}
        codigoTroza={codigoDeTroza ? {
          valor: codigoTroza,
          onValor: cambiarCodigo,
          onElegir: elegirTroza,
          trozas: codigoDeTroza.trozas,
          cargando: codigoDeTroza.cargando,
          error: codigoDeTroza.error,
        } : undefined}
        observacion={{
          texto: observacion.texto,
          fija: observacion.fija,
          onTexto: (v) => ponerObservacion({ ...observacionRef.current, texto: v }),
          onFijar: () => ponerObservacion({ ...observacionRef.current, fija: !observacionRef.current.fija }),
        }}
      />
      )}

      {/* El precio del lote (ADR-430): con qué se valoriza cada pieza —el trato
          de su dueño del Directorio o lo puesto a mano— y de dónde salió. Arriba
          de la tabla: es lo que se mira antes de liquidar o mandar el papel. */}
      {rows.length > 0 && (
        <CubicadorPrecio
          precios={precios}
          especiesLote={especiesLote}
          fecha={form.fecha}
          nombreDe={nombreDeCliente}
          sinDirectorio={sinDirectorio}
          vinculables={vinculables}
          onVincular={vincularConFichas}
          onAbrirDirectorio={() => setShowDuenosModal(true)}
          plegado={plegados.precio}
          onPlegado={(v) => setPlegados((prev) => ({ ...prev, precio: v }))}
        />
      )}

      {/* Tabla acumulada. Expandida se despega del flujo y toma la pantalla:
          un lote de 700 filas dentro de una caja de 600 px obliga a scrollear
          dos veces (la página y la tabla) para leer una columna entera. */}
      <div
        id="cub-tabla-ancla"
        className={
          tablaExpandida
            ? "fixed inset-0 z-system overflow-auto bg-[var(--surface-raised)] p-4 sm:p-5"
            : "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Table className="h-4 w-4 text-[var(--accent)]" /> {cubicacionActual ? cubicacionActual.nombre : "Lote cubicado"} ({rows.length})
              {/* Va pegado al título y no dentro de un menú: se usa para LEER, y
                  buscar el botón en un desplegable rompe justo eso. */}
              <button
                type="button"
                onClick={() => setTablaExpandida((v) => !v)}
                title={tablaExpandida ? "Salir de pantalla completa (Esc)" : "Ver la tabla en pantalla completa"}
                aria-label={tablaExpandida ? "Salir de pantalla completa" : "Ver la tabla en pantalla completa"}
                aria-pressed={tablaExpandida}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              >
                {tablaExpandida ? (
                  <><Minimize2 className="h-3.5 w-3.5" aria-hidden /> Salir</>
                ) : (
                  <><Maximize2 className="h-3.5 w-3.5" aria-hidden /> Pantalla completa</>
                )}
              </button>
            </CardTitle>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {cubicacionActual ? "Guardada — al tocar «Guardar» se actualiza esta misma cubicación." : "Sin guardar — vive sólo en este dispositivo hasta que la guardes."}
            </p>
          </div>
          {/* Dos acciones a la vista y tres menús (ver `cubicador-acciones`):
              catorce botones del mismo peso no tenían jerarquía — «Vaciar» se
              veía igual que «CSV» y las dos que mueven el trabajo se perdían. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* El apartado en curso, en la MISMA fila que las demás decisiones
                sobre el lote: cerrarlo es una acción del lote, como Guardar o
                Enviar al Libro. Vivía arriba, dentro del panel de voz, donde
                además repetía los tres números del resumen. */}
            {totalCandidatasAp.piezas > 0 && (
              <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-primary/10 px-2.5 py-1.5">
                <div className="min-w-0 leading-tight">
                  <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    Apartado {siguienteApartado(asignados)} sin guardar
                  </div>
                  <div className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                    {totalCandidatasAp.piezas} {totalCandidatasAp.piezas === 1 ? "pieza" : "piezas"} ·{" "}
                    {fmtPt(totalCandidatasAp.pieTablar)} PT
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => leerMedidas(totalCandidatasAp.ids)}
                  title="Dicta en voz espesor · ancho · largo de estas piezas, una por una"
                  aria-label="Leer en voz alta las piezas del apartado"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={cerrarApartado}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-bold text-white transition hover:brightness-95"
                >
                  <Layers className="h-3.5 w-3.5" /> Cerrar apartado {siguienteApartado(asignados)}
                </button>
              </div>
            )}
            {rows.length > 0 && (
              <>
                <AccionLote
                  label={cubicacionActual ? "Actualizar" : "Guardar"}
                  Icono={Save}
                  destacado
                  hint="Guardar esta cubicación con nombre y fecha"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      nombre: f.nombre || nombreSugerido(especie || undefined, { piezas: totales.piezas, pieTablar: totales.pt, m3: totales.m3 }),
                    }));
                    setShowGuardar((v) => !v);
                  }}
                />
                <AccionLote
                  label={enviando ? "Registrando…" : "Enviar al Libro"}
                  Icono={Send}
                  destacado
                  disabled={enviando}
                  hint="Registrar este lote como producción en el Libro CTP"
                  onClick={() => void enviarAlLibro()}
                />

                <MenuAcciones
                  etiqueta="Ver"
                  Icono={Table}
                  items={[
                    { key: "resumen", label: "Resumen por especie y tipo", Icono: Table, activo: showResumen, onClick: () => setShowResumen((v) => !v) },
                    {
                      key: "apartados",
                      label: "Apartados",
                      Icono: Layers,
                      activo: showApartados,
                      badge: resumenAp.length > 0 ? `${resumenAp.length}` : undefined,
                      hint: "Separar el lote en bloques (apartados) con su propio total",
                      onClick: () => setShowApartados((v) => !v),
                    },
                    {
                      key: "liquidacion",
                      label: "Liquidación",
                      Icono: Receipt,
                      hint: "Comprobante de liquidación por especie para el comprador",
                      onClick: () => setShowLiquidacion(true),
                    },
                    {
                      key: "leer",
                      label: leyendoAlDerecho ? "Detener la lectura" : "Leer la tabla en voz alta",
                      Icono: leyendoAlDerecho ? Square : Volume2,
                      activo: leyendoAlDerecho,
                      hint: "Lee en voz alta cada pieza, desde la primera hasta la última",
                      onClick: leerTabla,
                    },
                    {
                      key: "leer-al-reves",
                      label: leyendoAlReves ? "Detener la lectura" : "Leer al revés",
                      Icono: leyendoAlReves ? Square : IconoLeerAlReves,
                      activo: leyendoAlReves,
                      hint: "Lee en voz alta desde la última pieza hacia atrás, en el orden en que destapas la pila",
                      onClick: leerTablaAlReves,
                    },
                  ]}
                />

                {/* El contador de marcadas sube al botón: si el papel va a
                    traer 12 piezas y no las 700, no puede quedar escondido. */}
                <MenuAcciones
                  etiqueta="Descargar"
                  Icono={FileText}
                  badge={marcadas.size > 0 ? `· ${marcadas.size}` : undefined}
                  items={[
                    {
                      key: "anexo",
                      label: "ANEXO N° 04 (SERFOR)",
                      Icono: FileText,
                      badge: marcadas.size > 0 ? `${marcadas.size} pza` : undefined,
                      hint: marcadas.size > 0 ? `Vista previa con las ${marcadas.size} piezas marcadas` : "Vista previa del ANEXO N° 04 antes de descargar",
                      onClick: () => setShowPdf(true),
                    },
                    {
                      key: "excel",
                      label: "Excel",
                      badge: marcadas.size > 0 ? `${marcadas.size} pza` : undefined,
                      hint: marcadas.size > 0 ? `Excel con las ${marcadas.size} piezas marcadas` : "Excel del lote entero",
                      onClick: () => descargarConAviso(
                        exportarExcel(rowsParaPapel, { precioPt: precio, especieGlobal: especie || undefined, precioDe: precioVariable ? precioDe : undefined, asignados, nombresApartado }),
                        "Excel generado",
                        "No se pudo generar el Excel.",
                      ),
                    },
                    { key: "csv", label: "CSV", onClick: exportarCSV },
                    { key: "wsp", label: "Mandar el resumen por WhatsApp", Icono: MessageCircle, onClick: compartirWhatsApp },
                  ]}
                />

                {marcadas.size > 0 && (
                  <button type="button" onClick={() => setMarcadas(new Set())} className="rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]">
                    Quitar las {marcadas.size} marcas
                  </button>
                )}
              </>
            )}

            {/* Cambiar de lote. «Vaciar» vive acá abajo y separada: borra el
                trabajo del día, no puede estar pegada a «Excel». */}
            <MenuAcciones
              etiqueta="Lote"
              Icono={FileText}
              alineacion="derecha"
              items={[
                { key: "guardadas", label: "Cubicaciones guardadas", Icono: FileText, activo: showHistorial, onClick: () => setShowHistorial((v) => !v) },
                ...(rows.length > 0
                  ? [
                      { key: "nueva", label: "Empezar un lote nuevo", Icono: Plus, hint: "Lo guardado no se pierde", onClick: nuevaCubicacion },
                      { key: "vaciar", label: "Vaciar este lote", peligro: true, hint: "Borra las piezas cargadas de este dispositivo", onClick: limpiar },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>

        {/* Historial de cubicaciones guardadas */}
        {showHistorial && (
          <div className="mb-3">
            <CubicacionesGuardadas onAbrir={abrirCubicacion} onCerrar={() => setShowHistorial(false)} recargarToken={historialToken} />
          </div>
        )}

        {/* Formulario de guardado: nombre, fecha, cliente y notas */}
        {showGuardar && (
          <div className="mb-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-canvas)] p-4">
            <p className="mb-3 text-sm font-bold text-[var(--text-primary)]">
              {cubicacionActual ? "Actualizar la cubicación" : "Guardar esta cubicación"}
              <span className="ml-2 font-mono text-xs font-normal text-[var(--text-tertiary)]">
                {totales.piezas} piezas · {fmtPt(totales.pt)} PT{conValor ? ` · S/ ${soles(valorLote)}` : ""}
              </span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Nombre</span>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Lote Tornillo · Sr. Pérez"
                  maxLength={120}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Fecha del trabajo</span>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value || hoyISO() })}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Cliente o destino (opcional)</span>
                <input
                  value={form.cliente}
                  onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                  placeholder="Maderera del Centro"
                  maxLength={120}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Notas (opcional)</span>
                <input
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Entregado en camión, falta el saldo"
                  maxLength={600}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void guardarCubicacion()} disabled={guardando}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {guardando ? "Guardando…" : cubicacionActual ? "Actualizar" : "Guardar"}
              </button>
              <button type="button" onClick={() => setShowGuardar(false)} className="h-11 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Cancelar
              </button>
              <span className="text-xs text-[var(--text-tertiary)]">Queda en tu cuenta: la ves desde cualquier dispositivo.</span>
            </div>
          </div>
        )}

        {guardadoOk && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2 dark:bg-[var(--data-success-500)]/12">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <Check className="h-4 w-4" /> Guardada como «{guardadoOk}».
            </span>
            <button type="button" onClick={() => { setShowHistorial(true); setGuardadoOk(null); }} className="rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95 dark:text-[var(--data-success-500)]">
              Ver guardadas
            </button>
          </div>
        )}

        {enviado && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2 dark:bg-[var(--data-success-500)]/12">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <Check className="h-4 w-4" /> {loteCreado ? <>Registrado como lote <b>{loteCreado}</b>. El certificado + QR está en Lotes; atribuye las guías desde el Libro.</> : <>Registrado en el Libro CTP como producción. Atribuye la materia prima (guías) desde el Libro.</>}
            </span>
            <span className="flex gap-2">
              {loteCreado && (
                <a href="/admin?tab=forestal-lotes" className="rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95 dark:text-[var(--data-success-500)]">
                  Ver el lote
                </a>
              )}
              <a href="/admin?tab=ctp-libro-operaciones" className="rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95 dark:text-[var(--data-success-500)]">
                Ver en el Libro
              </a>
              <button type="button" onClick={() => { limpiar(); setEnviado(false); }} className="rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Vaciar el lote
              </button>
            </span>
          </div>
        )}

        {/* Apartados — separar el lote en bloques (10, 14…) con su propio total. */}
        {showApartados && rows.length > 0 && (
          <ApartadosPanel
            pendientes={pendientesAp.length}
            marcadasCount={marcadas.size}
            resumen={resumenAp}
            proximoNumero={siguienteApartado(asignados)}
            totalPendiente={totalCandidatasAp}
            nombres={nombresApartado}
            onCerrar={cerrarApartado}
            onQuitar={quitarApartado}
            onRenombrar={renombrarApartadoActual}
            onUsarParaImprimir={usarApartadoParaImprimir}
            onLeerFilas={leerMedidas}
            fmtPt={fmtPt}
            fmtM3={fmtM3}
          />
        )}

        {/* Resúmenes del lote — la misma madera leída por especie, largo, sección… */}
        {showResumen && rows.length > 0 && (
          <div className="mb-3 rounded-xl border-2 border-[var(--accent)]/40 bg-primary/10 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {DIMENSIONES_RESUMEN.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDimResumen(d)}
                    aria-pressed={dimResumen === d}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${dimResumen === d ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  >
                    {ETIQUETA_DIMENSION[d]}
                  </button>
                ))}
              </div>
              <button type="button" onClick={exportarResumenCSV} title="Descargar este resumen en CSV" className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--accent)]/20 bg-[var(--surface-raised)]">
              <DataTable className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    <th className="px-3 py-2">{ETIQUETA_DIMENSION[dimResumen].replace("Por ", "")}</th>
                    {/* Piezas · m³ · PT, la convención del módulo (2026-09-09). */}
                    <th className="px-3 py-2 text-right">Piezas</th>
                    <th className="px-3 py-2 text-right" title={FORMULA_M3}>m³</th>
                    <th className="px-3 py-2 text-right" title={FORMULA_PT}>Pie tablar</th>
                    <th className="px-3 py-2">Peso del lote</th>
                    {conValor && <th className="px-3 py-2 text-right">Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {resumen.grupos.map((g) => (
                    <tr key={g.clave} className="border-t border-[var(--accent)]/15">
                      <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{g.label}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{g.cantidad}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(g.m3)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtPt(g.pieTablar)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${g.pctPt}%` }} />
                          </div>
                          <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{g.pctPt}%</span>
                        </div>
                      </td>
                      {conValor && <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--accent)]">S/ {soles(g.valor)}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--accent)]/40 font-bold text-[var(--text-primary)]">
                    <td className="px-3 py-2">Total · {resumen.grupos.length} {resumen.grupos.length === 1 ? "grupo" : "grupos"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{resumen.total.cantidad}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">{fmtM3(resumen.total.m3)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtPt(resumen.total.pieTablar)}</td>
                    <td className="px-3 py-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">100%</td>
                    {conValor && <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">S/ {soles(resumen.total.valor)}</td>}
                  </tr>
                </tfoot>
              </DataTable>
            </div>
          </div>
        )}
        {editingId && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-primary/10 px-3 py-2 text-sm font-bold text-[var(--accent)]">
            <Mic className="h-4 w-4 animate-pulse" /> Dicta los 3 números para reemplazar esa fila (espesor · ancho · largo)…
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no cubicaste nada. Dicta o carga una pieza para empezar.</p>
        ) : (
          <>
            {/* Filtros de la vista — especie · tipo · buscar medida (no alteran los datos) */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar medida (2x8, 8, tornillo…)"
                  aria-label="Buscar por medida, especie o tipo"
                  className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
                />
              </div>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as TipoComercial | "")}
                aria-label="Filtrar por tipo"
                className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Todos los tipos</option>
                {tiposLote.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={filtroEspecie}
                onChange={(e) => setFiltroEspecie(e.target.value)}
                aria-label="Filtrar por especie"
                className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Todas las especies</option>
                {especiesLote.map((e) => <option key={e} value={e}>{e}</option>)}
                {haySinEspecie && <option value="__sin__">Sin especie</option>}
              </select>
              {/* Orden (Brandon, 2026-09-22): no filtra, REORDENA — la lectura
                  y la tabla lo siguen. «Más nuevas primero» (2026-09-23) va con
                  una sola especie también: es para ver arriba lo que se acaba
                  de dictar. «Por especie» sólo se ofrece si hay qué agrupar. */}
              {(rows.length > 1 || ordenFilas !== "dictado") && (
                <select
                  value={ordenFilas}
                  onChange={(e) => { if (esOrdenFilas(e.target.value)) cambiarOrden(e.target.value); }}
                  aria-label="Orden de las filas"
                  title="Como se dictó: en el orden en que entraron las piezas. Más nuevas primero: lo último que dictaste arriba, y cada pieza conserva su N°. Por especie: la tabla en bloques de especie, y lo que dictes después cae al final de su bloque."
                  className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="dictado">Orden: como se dictó</option>
                  <option value="recientes">Orden: más nuevas primero</option>
                  {(especiesLote.length + (haySinEspecie ? 1 : 0) > 1 || ordenFilas === "especie") && (
                    <option value="especie">Orden: por especie</option>
                  )}
                </select>
              )}
              {duenosLote.length > 0 && (
                <select
                  value={filtroDueno}
                  onChange={(e) => setFiltroDueno(e.target.value)}
                  aria-label="Filtrar por dueño"
                  className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Todos los dueños</option>
                  {duenosLote.map((d) => <option key={d} value={d}>{d}</option>)}
                  {haySinDueno && <option value="__sin__">Sin dueño</option>}
                </select>
              )}
              {filtrando && (
                <>
                  <span className="text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                    {filasVisibles.length} de {rows.length}
                  </span>
                  <button type="button" onClick={limpiarFiltros} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                    <X className="h-4 w-4" /> Limpiar
                  </button>
                </>
              )}
              {/* Columnas opcionales: ocultar/mostrar y restablecer — queda
                  guardado por tenant hasta que se vuelva a tocar. */}
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setColsMenuOpen((v) => !v); }}
                  title="Elegir columnas visibles de la tabla"
                  aria-label="Elegir columnas visibles"
                  aria-expanded={colsMenuOpen}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${colsMenuOpen ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
                >
                  <Columns3 className="h-4 w-4" /> Columnas
                </button>
                {colsMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full z-20 mt-1 min-w-[190px] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
                  >
                    <p className="px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Columnas visibles</p>
                    {COLS_OPCIONALES.filter(({ key }) => key !== "codigo" || conCodigo).map(({ key, label }) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                        <input
                          type="checkbox"
                          checked={colsVisibles[key]}
                          onChange={(e) => setColsVisibles((c) => ({ ...c, [key]: e.target.checked }))}
                          className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
                        />
                        {label}
                      </label>
                    ))}
                    <div className="mt-1 border-t border-[var(--rule-soft)] pt-1">
                      <button
                        type="button"
                        onClick={() => setColsVisibles(COLS_DEFAULT)}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-bold text-[var(--accent)] hover:bg-primary/10"
                      >
                        Restablecer todas
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {conCodigo && (
              <datalist id="cub-codigos-datalist">
                {codigosParaDatalist.map((t) => (
                  <option key={t.codigo} value={t.codigo}>{[t.especie, t.guia ? `GTF ${t.guia}` : null].filter(Boolean).join(" · ")}</option>
                ))}
              </datalist>
            )}
            {/**
             * UNA sola caja con scroll, la de `DataTable`.
             *
             * Antes había dos, una dentro de la otra: `DataTable` trae la suya
             * (`overflow-x-auto`) y acá se la envolvía en otra con el alto
             * máximo y el scroll vertical. Con dos contenedores anidados el
             * `<thead>` sticky se pega al de ADENTRO —que no scrollea en
             * vertical— y la cabecera se iba con las filas: medido, −24 px por
             * paso de rueda hasta desaparecer. Y el gesto del trackpad, que casi
             * siempre trae algo de horizontal, salta entre una caja y la otra.
             *
             * `overflowAnchor: none`: el ventaneo cambia el alto de los dos
             * `<tr>` colchón en cada scroll, y el anclaje automático de Chrome
             * corrige la posición para compensarlo, peleando contra el cálculo
             * de la ventana. Es requisito de toda lista virtualizada a mano.
             */}
            <DataTable
              className="w-full min-w-[960px] text-sm"
              wrapperClassName="rounded-xl"
              wrapperProps={propsTabla}
            >
              <thead>
                <tr className={`bg-[var(--surface-sunken)] text-left text-[length:var(--ts-xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] ${virtualizarTabla ? "sticky top-0 z-10" : ""}`}>
                  {/* El tilde manda: lo marcado es lo que se lleva el papel. */}
                  <th className="w-10 px-2 py-2 text-center" title="Marca las piezas que van al PDF y al Anexo 04">
                    <input
                      type="checkbox"
                      aria-label="Marcar todas las piezas visibles"
                      checked={filasVisibles.length > 0 && filasVisibles.every(({ r }) => marcadas.has(r.id))}
                      ref={(el) => {
                        if (el) {
                          const n = filasVisibles.filter(({ r }) => marcadas.has(r.id)).length;
                          el.indeterminate = n > 0 && n < filasVisibles.length;
                        }
                      }}
                      onChange={(e) => {
                        const ids = filasVisibles.map(({ r }) => r.id);
                        setMarcadas((prev) => {
                          const next = new Set(prev);
                          for (const id of ids) { if (e.target.checked) next.add(id); else next.delete(id); }
                          return next;
                        });
                      }}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </th>
                  {colsVisibles.numero && <th className="px-2 py-2 text-center">N°</th>}
                  {/* Click en el título = columna entera marcada, como en una
                      planilla. Sólo en las que aportan una cuenta: marcar
                      "Medida" no suma nada y el gesto quedaría sin respuesta. */}
                  {colsVisibles.cant && <ThCol col={TCOL.cant} sel={sel} filas={filasVisibles.length}>Cant.</ThCol>}
                  {/* La unidad va en el título, una vez, y no en cada fila (Brandon, 2026-09-23). */}
                  {colsVisibles.espesor && <th className="px-3 py-2">Espesor <span className="font-normal normal-case">(pulg)</span></th>}
                  {colsVisibles.ancho && <th className="px-3 py-2">Ancho <span className="font-normal normal-case">(pulg)</span></th>}
                  {colsVisibles.largo && <th className="px-3 py-2">Largo <span className="font-normal normal-case">(pies)</span></th>}
                  {colsVisibles.medida && <th className="px-3 py-2">Medida</th>}
                  {colsVisibles.tipo && <th className="px-3 py-2">Tipo</th>}
                  {verCodigo && <th className="px-3 py-2">Código</th>}
                  {colsVisibles.especie && <th className="px-3 py-2">Especie</th>}
                  {colsVisibles.dueno && <th className="px-3 py-2">Dueño</th>}
                  {colsVisibles.observacion && <th className="px-3 py-2">Observación</th>}
                  {colsVisibles.apartado && <th className="px-3 py-2">Apartado</th>}
                  {/* m³ antes que PT: Piezas · m³ · PT en todo el módulo (2026-09-09). */}
                  {colsVisibles.m3 && <ThCol col={TCOL.m3} sel={sel} filas={filasVisibles.length} className="text-right" hint={FORMULA_M3}>m³</ThCol>}
                  {colsVisibles.pt && <ThCol col={TCOL.pt} sel={sel} filas={filasVisibles.length} className="text-right" hint={FORMULA_PT}>Pie tablar</ThCol>}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filasVisibles.length === 0 && (
                  <tr>
                    <td colSpan={16} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
                      Ninguna pieza coincide con el filtro.{" "}
                      <button type="button" onClick={limpiarFiltros} className="font-bold text-[var(--accent)] underline">Limpiar filtros</button>
                    </td>
                  </tr>
                )}
                {virtualizarTabla && colchonSuperior > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={16} style={{ height: colchonSuperior, padding: 0, border: 0 }} />
                  </tr>
                )}
                {filasEnVentana.map(({ r, indice }, i) => {
                  const pos = inicioVentana + i;
                  const leyendo = readingId === r.id;
                  const editando = editingId === r.id;
                  const rowCls = leyendo
                    ? "bg-primary/10 outline outline-2 -outline-offset-2 outline-[var(--accent)] shadow-lg [&_td]:border-b-2 [&_td]:border-b-[var(--accent)]"
                    : editando
                      ? "bg-primary/10 outline outline-2 -outline-offset-2 outline-[var(--data-warning-500)]"
                      : lastAdded?.id === r.id ? "bg-[var(--data-success-50)]" : "";
                  // Medida fuera de rango: se AVISA, no se corrige — el dato es del operario.
                  const rara = avisarRaras && medidaSospechosa(r.espesor, r.ancho, r.largo);
                  const tipo = tipoDePieza(r);
                  const forzado = tipoEsManual(r);
                  // Vista previa del arrastre: la fila se pinta ANTES de soltar,
                  // así se ve hasta dónde va a llegar sin tener que adivinar.
                  const enRelleno = rellenoEspecie.objetivo.includes(pos) || rellenoTipo.objetivo.includes(pos) || rellenoApartado.objetivo.includes(pos) || rellenoDueno.objetivo.includes(pos) || rellenoCodigo.objetivo.includes(pos);
                  const numeroAp = asignados[r.id];
                  /* Agrupada por especie, una raya más marcada separa los bloques. Va
                     con `!`: `DataTable` pinta el borde de TODAS las filas con un
                     selector descendiente (`[&_tbody_tr]:border-t`), que le gana a
                     la clase de la fila por especificidad. */
                  const inicioBloque = ordenFilas === "especie" && empiezaBloque(r, filasVisibles[pos - 1]?.r);
                  return (
                  <tr
                    key={r.id}
                    id={`cub-row-${r.id}`}
                    ref={i === 0 ? primeraFilaRef : undefined}
                    /* El arrastre se extiende a nivel FILA y no celda por celda:
                       el asa se baja por cualquier parte de la fila, y repetir
                       el handler en once `<td>` sólo multiplicaba el trabajo. */
                    onMouseEnter={() => { rellenoEspecie.extender(pos); rellenoTipo.extender(pos); rellenoApartado.extender(pos); rellenoDueno.extender(pos); rellenoCodigo.extender(pos); }}
                    className={`${inicioBloque ? "border-t-2! border-t-[var(--rule-strong)]!" : "border-t border-[var(--rule-soft)]"} transition-colors ${enRelleno ? "bg-primary/10 outline-dashed outline-2 -outline-offset-2 outline-[var(--accent)]" : rowCls || (rara ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : "")}`}
                  >
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={marcadas.has(r.id)}
                        onChange={(e) => setMarcadas((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(r.id); else next.delete(r.id);
                          return next;
                        })}
                        aria-label={`Marcar la pieza ${r.espesor}×${r.ancho}×${r.largo}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    {colsVisibles.numero && <td className="px-2 py-2 text-center font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{numeroDeFila(indice, rows.length, ordenFilas)}</td>}
                    {colsVisibles.cant && (
                      <td {...sel.props(pos, TCOL.cant)} className={`px-3 py-2 ${sel.seleccionada(pos, TCOL.cant) ? CELDA_SELECCIONADA : ""}`}><Num v={r.cantidad} onV={(n) => editarCampo(r.id, "cantidad", n)} etiqueta={`Cantidad de la fila ${r.espesor}×${r.ancho}×${r.largo}`} fila={pos} col={COL_CANT} onKeyDown={teclasTabla} /></td>
                    )}
                    {colsVisibles.espesor && (
                      <td className="px-3 py-2"><Dim v={r.espesor} u={r.uEspesor} estandar={UNIDAD_ESTANDAR.espesor} onEstandar={() => aUnidadEstandar(r.id, "espesor")} onV={(n) => editarCampo(r.id, "espesor", n)} etiqueta="Espesor" fila={pos} col={COL_ESPESOR} onKeyDown={teclasTabla} /></td>
                    )}
                    {colsVisibles.ancho && (
                      <td className="px-3 py-2"><Dim v={r.ancho} u={r.uAncho} estandar={UNIDAD_ESTANDAR.ancho} onEstandar={() => aUnidadEstandar(r.id, "ancho")} onV={(n) => editarCampo(r.id, "ancho", n)} etiqueta="Ancho" fila={pos} col={COL_ANCHO} onKeyDown={teclasTabla} /></td>
                    )}
                    {colsVisibles.largo && (
                      <td className="px-3 py-2"><Dim v={r.largo} u={r.uLargo} estandar={UNIDAD_ESTANDAR.largo} onEstandar={() => aUnidadEstandar(r.id, "largo")} onV={(n) => editarCampo(r.id, "largo", n)} etiqueta="Largo" fila={pos} col={COL_LARGO} onKeyDown={teclasTabla} /></td>
                    )}
                    {colsVisibles.medida && (
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                        {r.espesor}×{r.ancho}×{r.largo}
                      </td>
                    )}
                    {/* Tipo editable: la medida propone, el operario dispone. */}
                    {colsVisibles.tipo && (
                      <td className="group/celda relative px-3 py-2">
                        <TipoSelect
                          tipo={tipo}
                          auto={clasificarTipo(r)}
                          manual={forzado}
                          opciones={ORDEN_TIPO}
                          onCambiar={(t) => editarTipo(r.id, t)}
                          etiqueta={`Tipo comercial de la pieza ${r.espesor}×${r.ancho}×${r.largo}`}
                        />
                        <AsaRelleno onTomar={() => rellenoTipo.iniciar(pos)} titulo="Arrastra hacia abajo para poner este tipo en las filas siguientes" />
                      </td>
                    )}
                    {/* Código de la troza (sólo «Producir sin lote»): texto libre,
                        como el dueño, con los códigos del patio de sugerencia. */}
                    {verCodigo && (
                      <td className="group/celda relative px-3 py-2">
                        <CodigoCell valor={r.codigo ?? ""} onCommit={(v) => editarCodigo(r.id, v)} />
                        <AsaRelleno onTomar={() => rellenoCodigo.iniciar(pos)} titulo="Arrastra hacia abajo para poner este código en las filas siguientes" />
                      </td>
                    )}
                    {colsVisibles.especie && (
                      <td className="group/celda relative px-3 py-2">
                        <select
                          value={r.especie ?? ""}
                          onChange={(e) => editarEspecie(r.id, e.target.value)}
                          aria-label="Especie de la pieza"
                          className="max-w-[110px] rounded-xl border border-[var(--rule-base)] bg-transparent px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                        >
                          <option value="">—</option>
                          {especiesOfrecidas.map((s) => <option key={s} value={s}>{s}</option>)}
                          {/* Una pieza cargada con una especie que el catálogo ya
                              no ofrece conserva la suya: sin esta opción el
                              <select> se vería vacío y el primer toque en la
                              fila la borraría sin que nadie lo pidiera. */}
                          {r.especie && !(especiesOfrecidas as readonly string[]).includes(r.especie) && (
                            <option value={r.especie}>{r.especie}</option>
                          )}
                        </select>
                        <AsaRelleno onTomar={() => rellenoEspecie.iniciar(pos)} titulo="Arrastra hacia abajo para poner esta especie en las filas siguientes" />
                      </td>
                    )}
                    {/* Dueño: sin catálogo cerrado (a diferencia de especie) — input +
                        datalist para poder escribir uno nuevo o elegir uno ya usado. */}
                    {colsVisibles.dueno && (
                      <td className="group/celda relative px-3 py-2">
                        <span className="inline-flex items-center gap-1">
                          <DuenoCell valor={r.dueno ?? ""} opciones={duenosParaElegir} onCommit={(v) => editarDueno(r.id, v)} />
                          {r.duenoParteId && <PrecioDelDueno pieza={r} ctx={precios.ctx} />}
                        </span>
                        <AsaRelleno onTomar={() => rellenoDueno.iniciar(pos)} titulo="Arrastra hacia abajo para poner este dueño en las filas siguientes" />
                      </td>
                    )}
                    {colsVisibles.observacion && (
                      <td className="px-3 py-2">
                        <ObservacionCell valor={r.observacion ?? ""} onCommit={(v) => editarObservacion(r.id, v)} />
                      </td>
                    )}
                    {/* Apartado: se asigna con "Cerrar apartado" (o arrastrando
                        el asa como especie/tipo) — acá sólo se ve y se copia. */}
                    {colsVisibles.apartado && (
                      <td className="group/celda relative px-3 py-2">
                        {numeroAp != null ? (
                          <span className={`font-mono text-sm font-bold ${colorClaseApartado(numeroAp)}`}>{etiquetaApartado(numeroAp, nombresApartado)}</span>
                        ) : (
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">—</span>
                        )}
                        <AsaRelleno onTomar={() => rellenoApartado.iniciar(pos)} titulo="Arrastra hacia abajo para poner este apartado en las filas siguientes" />
                      </td>
                    )}
                    {colsVisibles.m3 && (
                      <td {...sel.props(pos, TCOL.m3)} className={`px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)] ${sel.seleccionada(pos, TCOL.m3) ? CELDA_SELECCIONADA : ""}`}>{fmtM3(r.m3)}</td>
                    )}
                    {colsVisibles.pt && (
                      <td {...sel.props(pos, TCOL.pt)} className={`px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)] ${sel.seleccionada(pos, TCOL.pt) ? CELDA_SELECCIONADA : ""}`}>{fmtPt(r.pieTablar)}</td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {rara && (
                          <span title="Medida fuera de lo común — revisa que esté bien" className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                        )}
                        <button type="button" onClick={() => duplicar(r.id)} aria-label="Duplicar esta fila" title="Duplicar (misma medida otra vez)" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => startEdit(r.id)} aria-label={editando ? "Cancelar edición por voz" : "Editar esta fila por voz"} title={editando ? "Cancelar" : "Dictar nuevas medidas para esta fila"} className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${editando ? "animate-pulse border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}>
                          {editando ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        </button>
                        {/* Leer DESDE acá: en una tabla de 300, la lectura se
                            corta a mitad y no hay por qué escuchar de nuevo
                            todo lo anterior para retomar donde iba. */}
                        <button
                          type="button"
                          onClick={() => leerDesdeFila(r.id)}
                          aria-label="Leer en voz alta desde esta fila"
                          title="Leer en voz alta desde esta fila en adelante"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => borrar(r.id)} aria-label="Borrar" className="text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {virtualizarTabla && colchonInferior > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={16} style={{ height: colchonInferior, padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--rule-base)] bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <td className="px-3 py-2.5" colSpan={colSpanTotales}>{filtrando ? "Filtro" : "Total"} · {(filtrando ? totalesVisibles : totales).piezas} piezas</td>
                  {/*
                    Los `title` dicen la equivalencia entre las dos columnas
                    (Brandon, 2026-09-02: «30.738 × 424 me da 13032 pero en PT
                    sale 13026»). Ya no hay nada que reconciliar —el m³ SALE del
                    PT dividido por 424— pero el factor se dice igual: sin él,
                    quien cruce las columnas con la calculadora no tiene con qué
                    verificar que le está dando bien.
                  */}
                  {colsVisibles.m3 && (
                    <td
                      className="px-3 py-2.5 text-right font-mono text-base tabular-nums text-[var(--accent)]"
                      title={`${fmtM3((filtrando ? totalesVisibles : totales).m3)} m³ × ${PT_POR_M3} = ${fmtPt((filtrando ? totalesVisibles : totales).m3 * PT_POR_M3)} PT. El total suma cada fila ya redondeada, así que puede moverse unas centésimas del cociente exacto.`}
                    >
                      {fmtM3((filtrando ? totalesVisibles : totales).m3)}
                    </td>
                  )}
                  {colsVisibles.pt && (
                    <td
                      className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--accent)]"
                      title={`${fmtPt((filtrando ? totalesVisibles : totales).pt)} PT ÷ ${PT_POR_M3} = ${fmtM3((filtrando ? totalesVisibles : totales).pt / PT_POR_M3)} m³`}
                    >
                      {fmtPt((filtrando ? totalesVisibles : totales).pt)} PT
                    </td>
                  )}
                  <td />
                </tr>
              </tfoot>
            </DataTable>
          </>
        )}

      </div>

      {/* Acá vivía una SEGUNDA copia del panel de entrada, para no tener que
          volver a subir después de mirar la tabla. Se fue (Brandon, 2026-09-08):
          duplicaba la pantalla entera —micrófono, especie, dueño, fila de carga—
          y con el panel de arriba ahora plegable, la respuesta a «está lejos» es
          plegar lo que no se usa, no repetirlo. */}

      {/* Mientras lee, el control va con los ojos: pausar, seguir por la misma
          fila, volver a la primera o cortar. */}
      <ControlLecturaFlotante
        estado={lecturaVoz.estado}
        onPausar={lecturaVoz.pausar}
        onReanudar={lecturaVoz.reanudar}
        onReiniciar={lecturaVoz.reiniciar}
        onIrAFila={lecturaVoz.irAFila}
        onCerrar={lecturaVoz.detener}
        numerarDesdeAbajo={lecturaDeLaTabla && ordenFilas === "recientes"}
      />

      {showImportar && (
        <ImportarCubicacionModal
          filasActuales={rows.length}
          duenos={duenosParaElegir}
          onAgregar={(piezas) => { agregarVarias(piezas); setEnviado(false); }}
          onCerrar={() => setShowImportar(false)}
        />
      )}

      {showEspeciesModal && (
        <CtpEspeciesCatalogoModal
          open={showEspeciesModal}
          onClose={() => setShowEspeciesModal(false)}
          onCambio={() => void catalogoEspecies.recargar()}
        />
      )}

      {showDuenosModal && (
        <DuenosModal
          duenos={duenosConocidos}
          actual={dueno}
          onAgregar={recordarDueno}
          onQuitar={olvidarDueno}
          onElegir={(d) => { aplicarDueno(d); setShowDuenosModal(false); }}
          actualParteId={dueno ? duenoParteId : null}
          onElegirParte={(p) => { elegirDuenoDelDirectorio(p); setShowDuenosModal(false); }}
          fichaDe={fichaDe}
          onAtar={atarFichaDueno}
          onClose={() => setShowDuenosModal(false)}
        />
      )}

      {showLiquidacion && (
        <LiquidacionModal
          rows={rows}
          precioDe={precioDe}
          clienteInicial={form.cliente}
          notaInicial={form.notas}
          onCerrar={() => setShowLiquidacion(false)}
        />
      )}

      {showPdf && (
        <Anexo04Modal
          rows={rowsParaPapel}
          especieGlobal={especie || undefined}
          onPdfDetallado={() => descargarConAviso(
            exportarPDF(rowsParaPapel, { precioPt: precio, especieGlobal: especie || undefined, precioDe: precioVariable ? precioDe : undefined, asignados, nombresApartado }),
            "PDF detallado generado", "No se pudo generar el PDF.",
          )}
          onAviso={(msg, tono) => pushToast({ tono, msg })}
          onCerrar={() => setShowPdf(false)}
        />
      )}

      {showEnviarModal && (
        <EnviarLibroModal
          piezas={totales.piezas}
          pieTablar={totales.pt}
          m3={totales.m3}
          especie={(() => { const e = [...new Set(rows.map((r) => r.especie).filter(Boolean))] as string[]; return e.length === 1 ? e[0] : (especie || null); })()}
          enviando={enviando}
          onConfirmar={confirmarEnvio}
          onCerrar={() => setShowEnviarModal(false)}
        />
      )}

      {/* La cuenta de lo marcado, fija al pie como en una planilla: la tabla
          puede tener trescientas filas y la selección quedar fuera de pantalla. */}
      <BarraSeleccion rango={sel.rango} columnas={columnasSel} onLimpiar={sel.limpiar} />

      {/* Toasts flotantes de acción (agregar / eliminar / guardar / importar…) */}
      <ActionToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/**
 * Encabezado que marca su columna entera al hacer clic.
 *
 * Sólo lo llevan las columnas que aportan una cuenta: hacerlo clickeable en
 * «Medida» daría un gesto que no responde con nada, que es peor que no tenerlo.
 */
function ThCol({
  col,
  sel,
  filas,
  className = "",
  hint,
  children,
}: {
  col: number;
  sel: { marcarColumna: (col: number, filas: number) => void };
  filas: number;
  className?: string;
  /** Cómo se calcula la columna — se lee al pasar el mouse por el encabezado. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => sel.marcarColumna(col, filas)}
        title={hint ? `${hint} · Clic: marcar la columna entera` : "Marcar la columna entera y ver la cuenta"}
        className="inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-[var(--accent)]"
      >
        {children}
        <Sigma className="h-3 w-3 opacity-50" aria-hidden />
      </button>
    </th>
  );
}

/**
 * Al lado del dueño que salió del Directorio (ADR-430): su precio pactado para
 * ESTA pieza, o sólo la marca de «del Directorio» si el modo es a mano o su
 * trato no la cubre. El origen completo va en el `title` —el alto de la fila
 * no cambia: la tabla ventaneada lo mide una sola vez—.
 */
function PrecioDelDueno({ pieza, ctx }: { pieza: PiezaCubicada; ctx: ContextoPrecio }) {
  const p = precioDePieza(pieza, ctx);
  const delCliente = p.desde?.startsWith("cliente-") ?? false;
  const titulo = delCliente
    ? `Del Directorio · S/ ${formatNumber(p.precioPt, { min: 2, max: 4 })} por PT (${explicarPrecioDePieza(p, pieza)})`
    : ctx.modo === "manual"
      ? "Del Directorio · el precio va a mano (elige Aserrío o Venta en «Precio» para usar su trato)"
      : `Del Directorio · su trato no cubre esta pieza: ${explicarPrecioDePieza(p, pieza)}`;
  return (
    <span
      title={titulo}
      aria-label={titulo}
      className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-[length:var(--ts-2xs)] font-bold tabular-nums ${
        delCliente
          ? "bg-[var(--accent)]/12 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "text-[var(--text-tertiary)]"
      }`}
    >
      <UserCheck className="h-3 w-3" aria-hidden />
      {delCliente && formatNumber(p.precioPt, { min: 2, max: 4 })}
    </span>
  );
}

/**
 * Dueño de la pieza en la tabla — un `<select>` como la especie: se ELIGE de
 * los dueños guardados y de los que ya tiene el lote; se crean en el modal de
 * Dueños (Brandon 23-09). Antes era texto libre y cada nombre a medio escribir
 * quedaba guardado como dueño. La pieza que trae un dueño que no está en la
 * lista (pegado de un Excel, un lote viejo) lo conserva como opción.
 */
function DuenoCell({ valor, opciones, onCommit }: { valor: string; opciones: readonly string[]; onCommit: (v: string) => void }) {
  /* El valor de la pieza va PRIMERO: si la lista lo tiene escrito distinto
     («Wasaco» y «wasaco»), el `<select>` igual tiene que encontrarlo. */
  const lista = opcionesDeDueno([valor ? [valor] : [], opciones]);
  return (
    <select
      value={valor}
      onChange={(e) => { if (e.target.value !== valor) onCommit(e.target.value); }}
      aria-label="Dueño de la pieza"
      className="max-w-[130px] rounded-xl border border-[var(--rule-base)] bg-transparent px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
    >
      <option value="">—</option>
      {lista.map((d) => <option key={d} value={d}>{d}</option>)}
    </select>
  );
}

/**
 * Código de la troza editable en la tabla (sólo «Producir sin lote»). Mismo
 * buffer local que `DuenoCell`: comitea al perder el foco o con Enter, así
 * tipear «25» no deja primero un «2» escrito en la fila.
 */
function CodigoCell({ valor, onCommit }: { valor: string; onCommit: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const enfocado = useRef(false);
  useEffect(() => { if (!enfocado.current) setTexto(valor); }, [valor]);
  return (
    <input
      list="cub-codigos-datalist"
      value={texto}
      autoComplete="off"
      onFocus={() => { enfocado.current = true; }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { enfocado.current = false; if (texto !== valor) onCommit(texto); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      aria-label="Código de la troza de la pieza"
      placeholder="—"
      className="w-[80px] rounded-xl border border-[var(--rule-base)] bg-transparent px-1 py-0.5 font-mono text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
    />
  );
}

/** La observación de una fila: texto libre, se guarda al salir de la celda. */
function ObservacionCell({ valor, onCommit }: { valor: string; onCommit: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const enfocado = useRef(false);
  useEffect(() => { if (!enfocado.current) setTexto(valor); }, [valor]);
  return (
    <input
      value={texto}
      maxLength={OBSERVACION_MAX}
      autoComplete="off"
      onFocus={() => { enfocado.current = true; }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { enfocado.current = false; if (texto !== valor) onCommit(texto); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      aria-label="Observación de la pieza"
      title={valor || undefined}
      placeholder="—"
      className="w-[140px] rounded-xl border border-[var(--rule-base)] bg-transparent px-1.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
    />
  );
}

/**
 * Número editable en la tabla: se corrige a mano sin volver a dictar.
 *
 * `fila`/`col` lo enganchan a la navegación de teclado de la grilla (flechas para
 * moverse, Ctrl+D duplicar, Ctrl+Supr eliminar).
 *
 * Buffer de texto LOCAL, no `type="number"`: con el valor atado directo al
 * número del lote, seleccionar todo y borrar para tipear de nuevo hacía que
 * el campo VOLVIERA solo al valor viejo a mitad de tecleo — en cuanto el
 * cambio no daba un número válido (`n>0`) React forzaba `value={v}` otra
 * vez — y encima `type="number"` rechaza la coma decimal peruana. Acá el
 * buffer manda mientras la celda tiene el foco; recién se sincroniza con el
 * valor de afuera al perderlo (otra fila cambiando no debe pisar lo que se
 * está tipeando en ésta). De paso, `type="text"` hace que ← → naveguen el
 * CURSOR dentro del número cuando no está en el borde — igual que en
 * `celdas-excel.tsx` — en vez de saltar de celda con cada toque de flecha.
 */
function Num({ v, onV, etiqueta, ancho = "w-14", fila, col, onKeyDown }: {
  v: number; onV: (n: number) => void; etiqueta: string; ancho?: string;
  fila?: number; col?: number; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [texto, setTexto] = useState(String(v));
  const enfocado = useRef(false);
  useEffect(() => { if (!enfocado.current) setTexto(String(v)); }, [v]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      aria-label={etiqueta}
      data-fila={fila}
      data-col={col}
      onKeyDown={onKeyDown}
      onFocus={(e) => { enfocado.current = true; e.currentTarget.select(); }}
      onBlur={() => { enfocado.current = false; setTexto(String(v)); }}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
        setTexto(limpio);
        const n = Number(limpio);
        if (limpio !== "" && Number.isFinite(n) && n > 0) onV(n);
      }}
      className={`${ancho} rounded-xl border border-transparent bg-transparent px-1 py-0.5 font-mono font-bold tabular-nums text-[var(--text-primary)] outline-none hover:border-[var(--rule-base)] focus:border-[var(--accent)] focus:bg-[var(--surface-canvas)] focus:ring-2 focus:ring-[var(--accent)]/25`}
    />
  );
}

/**
 * Una medida de la tabla. La unidad ya no se elige (va en el título de la
 * columna); sólo se dibuja cuando la pieza vino en OTRA —un Excel con columna
 * de unidad—, en ámbar, para que no se lea como pulgadas o pies, y con un
 * toque la pasa a la estándar.
 */
function Dim({ v, u, estandar, onEstandar, onV, etiqueta, fila, col, onKeyDown }: {
  v: number; u: Unidad; estandar: Unidad; onEstandar: () => void; onV?: (n: number) => void; etiqueta?: string;
  fila?: number; col?: number; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const otra = u !== estandar;
  return (
    <span className="inline-flex items-center gap-1">
      {onV
        ? <Num v={v} onV={onV} etiqueta={`${etiqueta ?? "Medida"} (${u})`} fila={fila} col={col} onKeyDown={onKeyDown} />
        : <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{v}</span>}
      {otra && (
        <button
          type="button"
          onClick={onEstandar}
          title={`Esta pieza vino en ${u}. Toca para pasarla a ${estandar} (el volumen no cambia)`}
          aria-label={`${etiqueta ?? "Medida"} en ${u}: pasar a ${estandar}`}
          className="rounded-md bg-[var(--data-warning-50)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] transition hover:brightness-95 dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
        >
          {u} → {estandar}
        </button>
      )}
    </span>
  );
}
