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
import { Mic, MicOff, Table, Trash2, Plus, Volume2, Check, Square, Send, Copy, AlertTriangle, MessageCircle, Save, FileText, Loader2, X, FileSpreadsheet, Receipt, Search, Sigma, Layers, Columns3 } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  cubicarPieza, mejoresNumeros, detectarComando, ESPECIES_MADERA,
  esEco, leerDictado, medidaSospechosa, partirConFijas, numerosPorPieza, PT_POR_M3, recubicarPiezas, m3DesdePt,
  type PiezaCubicada, type Unidad, type MedidasFijas,
} from "@/lib/forestal/cubicacion";
import {
  loadConfig, saveConfig, CONFIG_DEFAULT,
  type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";
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

const UNIDADES: { v: Unidad; label: string }[] = [
  { v: "pulg", label: "pulg" }, { v: "cm", label: "cm" }, { v: "pies", label: "pies" }, { v: "m", label: "m" },
];
// Rangos para los dropdowns de carga manual (rápida, sin tipear).
/** Grillas con navegación de teclado (ver `celdas-excel.tsx`). */
const GRILLA_CARGA = "cub-carga";
/** Segunda copia del panel de entrada, al final de la tabla — grilla propia
 *  para que las flechas del teclado no salten al panel de arriba. */
const GRILLA_CARGA_FIN = "cub-carga-fin";
const GRILLA_TABLA = "cub-tabla";
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
type ColOpcional = "numero" | "cant" | "espesor" | "ancho" | "largo" | "medida" | "tipo" | "especie" | "dueno" | "apartado" | "pt" | "m3";
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
  { key: "especie", label: "Especie" },
  { key: "dueno", label: "Dueño" },
  { key: "apartado", label: "Apartado" },
  { key: "pt", label: "Pie tablar" },
  { key: "m3", label: "m³" },
];
const COLS_DEFAULT: Record<ColOpcional, boolean> = {
  numero: true, cant: true, espesor: true, ancho: true, largo: true,
  medida: true, tipo: true, especie: true, dueno: true, apartado: true, pt: true, m3: true,
};

// Especies de madera comunes en la Selva Central peruana (single-source en cubicacion.ts).
const ESPECIES = ESPECIES_MADERA;
// Solo los errores DUROS cortan el dictado; no-speech/network/aborted son
// transitorios en modo continuo y el reconocedor se reinicia solo.
const ERR_MSG: Record<string, string> = {
  "not-allowed": "Permiso de micrófono denegado. Tocá el candado 🔒 en la barra de direcciones, permití el micrófono y recargá la página.",
  "service-not-allowed": "El navegador bloqueó el micrófono. Revisá los permisos del sitio y recargá.",
  "audio-capture": "No se encontró micrófono. Conectá uno y reintentá.",
};

const fmtPt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtM3 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const storageKey = () => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-cubicacion-${slug}`;
};
const saveLocal = (next: PiezaCubicada[]) => { try { localStorage.setItem(storageKey(), JSON.stringify(next)); } catch { /* quota */ } };
/** Lee un derivado del lote (`-precio`, `-precios-especie`) sin explotar en SSR. */
const leerGuardado = (sufijo: string): string | null => {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(`${storageKey()}${sufijo}`); } catch { return null; }
};
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Cuánto tiempo el micrófono debe desconfiar de lo que escucha tras hablar. */
const MARGEN_ECO_MS = 700;
/** Números sueltos que esperan a completar un trío: caducan solos. */
const CARRY_TTL_MS = 25_000;

// Voz que repite lo dictado (SpeechSynthesis). cancel() antes de hablar: en
// dictado rápido gana el último, sin encolar audio viejo que quede atrás.
// `onEco` publica la ventana en que suena el parlante — el reconocedor la usa
// para no volver a guardar la pieza que él mismo acaba de cantar.
function decir(texto: string, rate = 1.5, voiceURI = "", onEco?: (hasta: number, texto: string) => void) {
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
      u.lang = "es-PE";
      u.rate = rate;
      if (voiceURI) { const v = synth.getVoices().find((x) => x.voiceURI === voiceURI); if (v) u.voice = v; }
      if (onEco) {
        // Estimación por si `onend` no llega (pasa si se cancela a mitad).
        const estimadoMs = Math.max(800, (texto.length / Math.max(0.6, rate)) * 90);
        onEco(Date.now() + estimadoMs + MARGEN_ECO_MS, texto);
        u.onend = () => onEco(Date.now() + MARGEN_ECO_MS, texto);
      }
      synth.speak(u);
    } catch { /* TTS no disponible */ }
  }, 0);
}

export default function CubicadorMadera({ onPresent }: { onPresent?: () => void }) {
  const [rows, setRows] = useState<PiezaCubicada[]>([]);
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
  /** Dueños ya usados en este dispositivo (no sólo en el lote actual): la
   *  lista crece sola con cada nombre nuevo, así el select/datalist ofrece
   *  el mismo dueño de ayer sin re-tipearlo. */
  const [duenosConocidos, setDuenosConocidos] = useState<string[]>(() => {
    try { return JSON.parse(leerGuardado("-duenos") ?? "[]") as string[]; } catch { return []; }
  });
  const recordarDueno = useCallback((nombre: string) => {
    const limpio = nombre.trim();
    if (!limpio) return;
    setDuenosConocidos((prev) => {
      if (prev.some((d) => d.toLowerCase() === limpio.toLowerCase())) return prev;
      const next = [...prev, limpio].slice(-50); // tope: no crece sin límite
      try { localStorage.setItem(`${storageKey()}-duenos`, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);
  /** Cambia el dueño actual Y lo recuerda para la próxima vez — el único
   *  camino que debería usar la UI (voz, selector, datalist de la tabla). */
  const aplicarDueno = useCallback((v: string) => { setDueno(v); recordarDueno(v); }, [recordarDueno]);
  /** Saca un dueño de la lista GUARDADA — no toca las piezas que ya lo usan
   *  (son texto libre, no una referencia): borrar del catálogo no reescribe
   *  el lote. */
  const olvidarDueno = useCallback((nombre: string) => {
    setDuenosConocidos((prev) => {
      const next = prev.filter((d) => d !== nombre);
      try { localStorage.setItem(`${storageKey()}-duenos`, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);
  const [showDuenosModal, setShowDuenosModal] = useState(false);
  const [config, setConfig] = useState<CubicadorConfig>(CONFIG_DEFAULT);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showAjustes, setShowAjustes] = useState(false);
  const avisarRaras = config.avisarRaras;
  const [editingId, setEditingId] = useState<string | null>(null); // fila que se edita por voz
  const [readingId, setReadingId] = useState<string | null>(null); // fila que se está leyendo
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
  /**
   * Los precios se leen en el INICIALIZADOR, no en un efecto de carga.
   *
   * Con la carga en un efecto, el efecto que persiste corría primero con el
   * estado vacío y escribía `{}` sobre lo guardado: al montar el cubicador se
   * perdían los precios por especie, y los Resúmenes liquidaban todo el lote al
   * precio general (medido: tres escrituras de `{}` antes de leer nada). Leer
   * acá no puede llegar tarde — y el componente es `ssr:false`, así que
   * localStorage existe.
   */
  const [precioPt, setPrecioPt] = useState(() => leerGuardado("-precio") ?? ""); // S/ por pie tablar → valor del lote
  const [preciosEspecie] = useState<Record<string, string>>(() => {
    const raw = leerGuardado("-precios-especie");
    if (!raw) return {};
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
    } catch { return {}; }
  }); // especie(lowercase) → S/ por PT
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
    () => (marcadas.size > 0 ? rows.filter((r) => marcadas.has(r.id)) : rows),
    [rows, marcadas],
  );
  /**
   * Apartados — función EXTRA: separar el lote en bloques (10, 14, los que
   * hagan falta) con su propio total. Vive en su PROPIA clave de localStorage
   * y afuera de `PiezaCubicada` a propósito — la cubicación continua y normal
   * sigue exactamente igual, esto es sólo una anotación de sesión encima.
   */
  const [asignados, setAsignados] = useState<ApartadosAsignados>(() => {
    const raw = leerGuardado("-apartados");
    if (!raw) return {};
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as ApartadosAsignados) : {};
    } catch { return {}; }
  });
  /** Nombre puesto a mano por apartado ("Camión A", "Cliente López"). */
  const [nombresApartado, setNombresApartado] = useState<NombresApartado>(() => {
    const raw = leerGuardado("-apartados-nombres");
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
    const raw = leerGuardado("-cols");
    if (!raw) return COLS_DEFAULT;
    try { return { ...COLS_DEFAULT, ...(JSON.parse(raw) as Partial<Record<ColOpcional, boolean>>) }; } catch { return COLS_DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-cols`, JSON.stringify(colsVisibles)); } catch { /* quota */ } }, [colsVisibles]);
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
  const readingRef = useRef(false);                    // lectura de la tabla en curso
  const rowsRef = useRef<PiezaCubicada[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const resetVoz = () => { carryRef.current = { nums: [], ts: 0 }; lastFinalRef.current = -1; ecoRef.current = { hasta: 0, texto: "" }; };
  useEffect(() => { especieRef.current = especie; }, [especie]);
  useEffect(() => { duenoRef.current = dueno; }, [dueno]);
  useEffect(() => { duenosConocidosRef.current = duenosConocidos; }, [duenosConocidos]);
  // Las fijas sobreviven al refresh: un lote de un mismo largo puede llevar
  // toda la mañana y recargar la página no debería soltar la medida.
  useEffect(() => { fijasRef.current = fijas; }, [fijas]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${storageKey()}-fijas`);
      if (raw) setFijas(JSON.parse(raw) as MedidasFijas);
    } catch { /* ignore */ }
  }, []);
  const aplicarFijas = useCallback((next: MedidasFijas) => {
    fijasRef.current = next;
    setFijas(next);
    try { localStorage.setItem(`${storageKey()}-fijas`, JSON.stringify(next)); } catch { /* quota */ }
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
    decir(texto, configRef.current.voiceRate, configRef.current.voiceURI, (hasta, dicho) => {
      ecoRef.current = { hasta, texto: dicho };
    });
  }, []);

  // Las filas sí se cargan por efecto: no hay ningún efecto que las persista
  // (se guardan a mano en `persist`), así que no compiten por el mismo lugar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey());
      /* Se RE-CUBICA al hidratar: un lote guardado antes de que el m³ saliera
         del pie tablar trae el volumen geométrico y el total lo arrastraría
         (13.026 PT mostraban 30,738 m³ en vez de 30,722). */
      if (raw) setRows(recubicarPiezas(JSON.parse(raw) as PiezaCubicada[]));
    } catch { /* ignore */ }
  }, []);

  const nuevoId = () => `p-${Date.now()}-${idRef.current++}`;

  const persist = useCallback((next: PiezaCubicada[]) => { setRows(next); saveLocal(next); }, []);

  // addPieza estable (functional update) — lo llama el closure del reconocedor
  // con las filas frescas, sin depender de `rows` (que estaría stale).
  const addPieza = useCallback((p: {
    cantidad: number; espesor: number; ancho: number; largo: number;
    uEspesor: Unidad; uAncho: Unidad; uLargo: Unidad; especie?: string; dueno?: string;
  }) => {
    const { pieTablar, m3 } = cubicarPieza(p);
    const row: PiezaCubicada = { id: nuevoId(), ...p, pieTablar, m3 };
    setRows((prev) => { const next = [...prev, row]; saveLocal(next); return next; });
    setLastAdded(row);
  }, []);

  /** Suma un lote entero de una (importación de Excel): las piezas ya vienen
   *  cubicadas; se les da id propio para no chocar con las de la sesión. */
  const agregarVarias = useCallback((nuevas: PiezaCubicada[]) => {
    if (nuevas.length === 0) return;
    // El Excel importado trae su propio pieTablar/m³: se re-cubica desde las
    // medidas para que ninguna planilla ajena imponga otra fórmula.
    const conId = recubicarPiezas(nuevas).map((p) => ({ ...p, id: nuevoId() }));
    setRows((prev) => { const next = [...prev, ...conId]; saveLocal(next); return next; });
    setLastAdded(conId[conId.length - 1]);
    const piezas = nuevas.reduce((a, p) => a + p.cantidad, 0);
    pushToast({ tono: "success", msg: `${conId.length} ${conId.length === 1 ? "fila importada" : "filas importadas"}`, detail: `${piezas} piezas al lote` });
  }, [pushToast]);

  // Borra la última fila (comando de voz "elimina el último"). Estable.
  const borrarUltimo = useCallback(() => {
    setRows((prev) => { if (!prev.length) return prev; const next = prev.slice(0, -1); saveLocal(next); return next; });
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
      saveLocal(next);
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
          const found = ESPECIES.find((s) => sinAcentos(s).startsWith(cmd.palabra));
          if (found) { setEspecie(found); hablar(found); }
          else setErrMsg(`No reconocí la especie "${cmd.palabra}".`);
        }
        else if (cmd.tipo === "dueno") {
          // Sin catálogo cerrado: si ya se usó un dueño parecido se reutiliza
          // (mismo criterio que la especie), si no SE CREA con lo dictado.
          const conocido = duenosConocidosRef.current.find((d) => sinAcentos(d).startsWith(cmd.palabra));
          const nombre = conocido ?? (cmd.palabra.charAt(0).toUpperCase() + cmd.palabra.slice(1));
          aplicarDueno(nombre);
          hablar(nombre);
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
        const nums = mejoresNumeros(alternativas);
        if (nums.length >= 3 && nums[0] > 0 && nums[1] > 0 && nums[2] > 0) {
          updateRow(modeRef.current.id, nums[0], nums[1], nums[2]);
          hablar(`${nums[0]}, ${nums[1]}, ${nums[2]}`);
          modeRef.current = { type: "add" };
          setEditingId(null); wantListeningRef.current = false;
          setListening(false); setLiveText("");
          try { rec.stop(); } catch { /* ignore */ }
        } else {
          setErrMsg("No entendí 3 números para la fila. Probá de nuevo.");
        }
        return;
      }

      if (pausedRef.current) return; // en pausa: ignora números

      // Cantidad dictada ("cinco piezas de 2 8 10") separada de las medidas.
      // Se pasan las fijas y cuántos números quedaron esperando: sin eso, un
      // "quince" suelto se leería como espesor (imposible) y se partiría en 1·5.
      const carryVigente = Date.now() - carryRef.current.ts < CARRY_TTL_MS ? carryRef.current.nums : [];
      const { cantidad: cantDictada, nums } = leerDictado(alternativas, fijasRef.current, carryVigente.length);

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
        hablar(
          added > 1 ? `${added} piezas`
            : raro ? `${ultima.espesor}, ${ultima.ancho}, ${ultima.largo}. Revisá`
              : `${cantDictada > 1 ? `${cantDictada} de ` : ""}${variables.join(", ")}`,
        );
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
  }, [addPieza, updateRow, borrarUltimo, hablar, aplicarFijas, aplicarDueno]);

  const stopLeer = useCallback(() => {
    readingRef.current = false; setReadingId(null);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

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
    if (!wantListeningRef.current) {
      wantListeningRef.current = true;
      try { rec.start(); setListening(true); } catch { /* ya corriendo */ }
    }
  }, [editingId, stopLeer]);

  /**
   * Motor compartido de lectura en voz: una fila por vez, resaltando y
   * siguiendo cada una. `obtenerLista` se llama de nuevo en CADA paso (no una
   * lista congelada al arrancar) — así una fila borrada mientras lee
   * desaparece sola, y "Leer tabla" sigue enterándose de piezas agregadas
   * a mano en el medio, como ya hacía antes de este refactor.
   */
  const leerSecuencia = useCallback((obtenerLista: () => PiezaCubicada[], texto: (r: PiezaCubicada) => string) => {
    if (readingRef.current) { stopLeer(); return; }
    if (!obtenerLista().length) return;
    // cortar cualquier escucha activa
    if (wantListeningRef.current) { wantListeningRef.current = false; try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); }
    modeRef.current = { type: "add" }; setEditingId(null);
    const synth = window.speechSynthesis;
    if (!synth) { setErrMsg("Este navegador no puede leer en voz alta."); return; }
    readingRef.current = true;
    let idx = 0;
    const step = () => {
      const list = obtenerLista();
      if (!readingRef.current || idx >= list.length) { stopLeer(); return; }
      const r = list[idx];
      setReadingId(r.id);
      try { document.getElementById(`cub-row-${r.id}`)?.scrollIntoView({ block: "center", behavior: "auto" }); } catch { /* ignore */ }
      const u = new SpeechSynthesisUtterance(texto(r));
      // Dictado = rápido a propósito (no "seguir el ritmo de escribir a
      // mano" como antes): un poco MÁS rápido que la voz de confirmación,
      // tope 3 para no volverse ininteligible.
      u.lang = "es-PE"; u.rate = Math.min(3, configRef.current.voiceRate + 0.3);
      if (configRef.current.voiceURI) { const v = synth.getVoices().find((x) => x.voiceURI === configRef.current.voiceURI); if (v) u.voice = v; }
      u.onend = () => { idx++; step(); };
      // Sin esto, un fallo de síntesis (voz no disponible, motor caído) deja
      // `readingRef` trabado en "leyendo" para siempre — nunca llega el
      // `onend` que lo destraba, y CADA botón de "leer/dictar" del cubicador
      // queda muerto hasta recargar la página, porque todos comparten esta
      // misma ref. Se corta la lectura entera (un fallo suele repetirse en
      // toda la tanda) en vez de reintentar fila por fila en silencio.
      u.onerror = () => { setErrMsg("No se pudo leer en voz alta — revisá el motor de voz del navegador."); stopLeer(); };
      synth.cancel();
      // Mismo bug de Chrome/SAPI que en `decir()`: un tick de por medio antes
      // de `speak()` para que el `cancel()` no se coma la voz siguiente.
      setTimeout(() => synth.speak(u), 0);
    };
    step();
  }, [stopLeer]);

  // Leer toda la tabla en voz alta, resaltando y siguiendo cada fila.
  const leerTabla = useCallback(() => {
    leerSecuencia(() => rowsRef.current, (r) => `${r.espesor}, ${r.ancho}, ${r.largo}${r.especie ? `, ${r.especie}` : ""}`);
  }, [leerSecuencia]);

  /**
   * Dicta SOLO espesor · ancho · largo de un grupo de filas (un apartado, o
   * lo pendiente) — sin especie ni totales, lo mínimo para copiar a mano o
   * al oído sin mirar la pantalla. `ids` filtra en vivo (no una foto
   * congelada): si el grupo cambia mientras lee, lee lo que hay ahora.
   */
  const leerMedidas = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    leerSecuencia(() => rowsRef.current.filter((r) => idSet.has(r.id)), (r) => `${r.espesor}, ${r.ancho}, ${r.largo}`);
  }, [leerSecuencia]);

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
    addPieza({ cantidad: c, espesor: e, ancho: a, largo: l, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: especieRef.current || undefined, dueno: duenoRef.current || undefined });
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
  }, [setManualSync, addPieza, pushToast, medidaTxt, hablar]);

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
    persist(rowsRef.current.map((r) => (r.id === id ? { ...r, dueno: duenoNuevo.trim() || undefined } : r)));
    recordarDueno(duenoNuevo);
  }, [persist, recordarDueno]);
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

  const cambiarUnidad = useCallback((id: string, campo: "uEspesor" | "uAncho" | "uLargo", u: Unidad) => {
    persist(rowsRef.current.map((r) => {
      if (r.id !== id) return r;
      const upd = { ...r, [campo]: u };
      const { pieTablar, m3 } = cubicarPieza(upd);
      return { ...upd, pieTablar, m3 };
    }));
  }, [persist]);
  const borrar = useCallback((id: string) => {
    const rowsNow = rowsRef.current;
    const victima = rowsNow.find((r) => r.id === id);
    persist(rowsNow.filter((r) => r.id !== id));
    setLastAdded((prev) => (prev?.id === id ? null : prev));
    if (victima) pushToast({ tono: "warning", msg: "Fila eliminada", detail: medidaTxt(victima), undo: () => persist(rowsNow) });
  }, [persist, pushToast, medidaTxt]);
  // Deshacer del flash de dictado: quita la última SIN toast (ya es una acción de deshacer).
  const deshacer = () => { if (lastAdded) { persist(rows.filter((r) => r.id !== lastAdded.id)); setLastAdded(null); } };
  const limpiar = () => {
    if (rows.length === 0) return;
    const prev = rows;
    persist([]); setLastAdded(null);
    pushToast({ tono: "warning", msg: "Lote vaciado", detail: `${prev.length} ${prev.length === 1 ? "fila" : "filas"}`, undo: () => persist(prev) });
  };

  // Persistir el precio por PT (por tenant) y los precios por especie.
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-precio`, precioPt); } catch { /* ignore */ } }, [precioPt]);
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-precios-especie`, JSON.stringify(preciosEspecie)); } catch { /* ignore */ } }, [preciosEspecie]);
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-apartados`, JSON.stringify(asignados)); } catch { /* ignore */ } }, [asignados]);
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-apartados-nombres`, JSON.stringify(nombresApartado)); } catch { /* ignore */ } }, [nombresApartado]);
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
  const precio = Number(precioPt) || 0;

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
  // Sugerencias del datalist de la celda: lo usado en ESTE lote + lo aprendido
  // en el dispositivo, sin duplicar.
  const duenosParaDatalist = useMemo(
    () => [...new Set([...duenosLote, ...duenosConocidos])],
    [duenosLote, duenosConocidos],
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
          const hay = norm(`${r.espesor}x${r.ancho}x${r.largo} ${r.especie ?? ""} ${r.dueno ?? ""} ${tipoDePieza(r)}`);
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
  const UMBRAL_VIRTUALIZACION = 150;
  const SOBREMONTAJE = 20; // filas de más montadas arriba/abajo del área visible
  const virtualizarTabla = filasVisibles.length > UMBRAL_VIRTUALIZACION;
  const [altoFila, setAltoFila] = useState(44);
  const [scrollTopTabla, setScrollTopTabla] = useState(0);
  const primeraFilaRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!virtualizarTabla) return;
    const h = primeraFilaRef.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - altoFila) > 1) setAltoFila(h);
  }, [virtualizarTabla, altoFila]);
  const altoContenedorTabla = virtualizarTabla ? Math.min(600, filasVisibles.length * altoFila) : null;
  const inicioVentana = virtualizarTabla
    ? Math.max(0, Math.floor(scrollTopTabla / altoFila) - SOBREMONTAJE)
    : 0;
  const finVentana = virtualizarTabla
    ? Math.min(filasVisibles.length, Math.ceil((scrollTopTabla + (altoContenedorTabla ?? 0)) / altoFila) + SOBREMONTAJE)
    : filasVisibles.length;
  const filasEnVentana = virtualizarTabla ? filasVisibles.slice(inicioVentana, finVentana) : filasVisibles;
  const colchonSuperior = virtualizarTabla ? inicioVentana * altoFila : 0;
  const colchonInferior = virtualizarTabla ? (filasVisibles.length - finVentana) * altoFila : 0;

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
  /** Cuántas columnas hay ANTES de Pie tablar/m³ ahora mismo — el rótulo del
   *  pie de tabla las abarca todas; con columnas ocultas, un colSpan fijo se
   *  quedaba corto o largo y desalineaba los totales. */
  const colSpanTotales = 1 // "Marcar" (el tilde del PDF) es la única fija de las de la izquierda
    + (colsVisibles.numero ? 1 : 0) + (colsVisibles.cant ? 1 : 0)
    + (colsVisibles.espesor ? 1 : 0) + (colsVisibles.ancho ? 1 : 0) + (colsVisibles.largo ? 1 : 0)
    + (colsVisibles.medida ? 1 : 0) + (colsVisibles.tipo ? 1 : 0)
    + (colsVisibles.especie ? 1 : 0) + (colsVisibles.dueno ? 1 : 0) + (colsVisibles.apartado ? 1 : 0);

  /**
   * Arrastre de relleno: se toma el asa de una celda y se baja.
   *
   * El valor sale SIEMPRE de la fila de origen, así que rellenar y después
   * corregir el origen no arrastra el cambio — es una copia, no un vínculo.
   */
  const rellenarCampo = useCallback(
    (campo: "especie" | "tipo" | "dueno") => (origen: number, posiciones: number[]) => {
      const base = filasVisibles[origen]?.r;
      if (!base) return;
      const ids = new Set(posiciones.map((p) => filasVisibles[p]?.r.id).filter(Boolean));
      if (ids.size === 0) return;
      const valor = campo === "especie" ? base.especie : campo === "dueno" ? base.dueno : base.tipo;
      persist(rows.map((r) => (ids.has(r.id) ? { ...r, [campo]: valor } : r)));
      if (campo === "dueno" && typeof valor === "string") recordarDueno(valor);
      const etiqueta = campo === "especie" ? (valor || "sin especie") : campo === "dueno" ? (valor || "sin dueño") : (valor ?? "automático");
      pushToast({
        tono: "success",
        msg: `${ids.size} ${ids.size === 1 ? "fila" : "filas"} → ${etiqueta}`,
        detail: "Arrastrá el cuadradito de la esquina para repetir un valor.",
      });
    },
    [filasVisibles, rows, persist, pushToast, recordarDueno],
  );
  const rellenoEspecie = useRellenoArrastre(useMemo(() => rellenarCampo("especie"), [rellenarCampo]));
  const rellenoTipo = useRellenoArrastre(useMemo(() => rellenarCampo("tipo"), [rellenarCampo]));
  const rellenoDueno = useRellenoArrastre(useMemo(() => rellenarCampo("dueno"), [rellenarCampo]));
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
      detail: "Arrastrá el cuadradito de la esquina para repetir un valor.",
    });
  }, [filasVisibles, asignados, pushToast]);
  const rellenoApartado = useRellenoArrastre(rellenarApartado);
  // Precio por PT de una pieza: el de su especie si está seteado (>0), si no el global.
  const precioDe = useCallback((r: PiezaCubicada) => {
    const esp = r.especie?.trim().toLowerCase();
    const pe = esp ? Number(preciosEspecie[esp]) : 0;
    return pe > 0 ? pe : precio;
  }, [preciosEspecie, precio]);
  // ¿Hay algún precio por especie distinto del global? Cambia el rótulo de la liquidación.
  const hayPreciosEspecie = useMemo(
    () => especiesLote.some((e) => Number(preciosEspecie[e.toLowerCase()]) > 0),
    [especiesLote, preciosEspecie],
  );
  const conValor = precio > 0 || hayPreciosEspecie;
  const valorLote = useMemo(() => rows.reduce((a, r) => a + r.pieTablar * precioDe(r), 0), [rows, precioDe]);
  const soles = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    const nums = mejoresNumeros([liveText], fijas);
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
    const porMedida = agruparPor(rows, "medida").grupos;
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
            piezas: rowsRef.current,
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
          piezas: rows.map((p) => ({
            id: p.id, cantidad: p.cantidad, espesor: p.espesor, ancho: p.ancho, largo: p.largo,
            uEspesor: p.uEspesor, uAncho: p.uAncho, uLargo: p.uLargo, especie: p.especie ?? null,
          })),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(
          j?.error === "specialization_disabled" ? (j.message as string)
            : j?.error === "validation_error" ? "Revisá los datos de la cubicación."
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
  const abrirCubicacion = (c: CubicacionRegistro) => {
    if (rows.length > 0 && !cubicacionActual && !window.confirm("Vas a reemplazar el lote que tenés en pantalla y no está guardado. ¿Seguir?")) return;
    persist(recubicarPiezas(c.piezas));
    setEspecie(c.especie ?? "");
    setPrecioPt(c.precioPt ? String(c.precioPt) : "");
    setForm({ nombre: c.nombre, fecha: c.fecha, cliente: c.cliente ?? "", notas: c.notas ?? "" });
    setCubicacionActual(c.id ? { id: c.id, nombre: c.nombre } : null);
    setShowHistorial(false);
    setLastAdded(null);
    setEnviado(false);
  };

  /** Arranca un lote en blanco (lo guardado queda en el historial). */
  const nuevaCubicacion = () => {
    if (rows.length > 0 && !cubicacionActual && !window.confirm("El lote actual no está guardado y se va a borrar. ¿Seguir?")) return;
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
      conValor ? `\n*Total: S/ ${soles(valorLote)}*${hayPreciosEspecie ? " (precio por especie)" : ` (S/ ${soles(precio)} por PT)`}` : "",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  };

  const exportarCSV = () => {
    const head = ["Cantidad", "Espesor", "uEsp", "Ancho", "uAnc", "Largo", "uLar", "Especie", "PieTablar", "m3", "ValorS/"];
    const lines = rows.map((r) => [r.cantidad, r.espesor, r.uEspesor, r.ancho, r.uAncho, r.largo, r.uLargo, r.especie ?? "", r.pieTablar, r.m3, (r.pieTablar * precioDe(r)).toFixed(2)].join(","));
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
      {/* Panel de voz */}
      <PanelEntradaVoz
        grillaId={GRILLA_CARGA}
        onPresent={onPresent}
        onImportar={() => setShowImportar(true)}
        showAjustes={showAjustes}
        onToggleAjustes={() => setShowAjustes((v) => !v)}
        config={config}
        onUpdateConfig={updateConfig}
        voices={voices}
        onProbarVoz={() => decir("dos, seis, ocho", config.voiceRate, config.voiceURI)}
        supported={supported}
        listening={listening}
        onToggleListen={toggleListen}
        paused={paused}
        fijas={fijas}
        onAplicarFijas={aplicarFijas}
        especie={especie}
        onEspecieChange={setEspecie}
        dueno={dueno}
        onDuenoChange={aplicarDueno}
        duenosConocidos={duenosParaDatalist}
        onAbrirDuenos={() => setShowDuenosModal(true)}
        liveGroups={liveGroups}
        errMsg={errMsg}
        lastAdded={lastAdded}
        addedFlash={addedFlash}
        onDeshacer={deshacer}
        fmtPt={fmtPt}
        fmtM3={fmtM3}
        manual={manual}
        onManualChange={setManualSync}
        onConfirmarCarga={confirmarCarga}
        apartadoEnCurso={totalCandidatasAp}
        proximoApartado={siguienteApartado(asignados)}
        onCerrarApartado={cerrarApartado}
        onEscucharApartado={leerMedidas}
      />

      {/* Tabla acumulada */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Table className="h-4 w-4 text-[var(--accent)]" /> {cubicacionActual ? cubicacionActual.nombre : "Lote cubicado"} ({rows.length})
            </CardTitle>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {cubicacionActual ? "Guardada — al tocar «Guardar» se actualiza esta misma cubicación." : "Sin guardar — vive sólo en este dispositivo hasta que la guardes."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowHistorial((v) => !v)} title="Ver las cubicaciones guardadas" className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${showHistorial ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              <FileText className="h-3.5 w-3.5" /> Guardadas
            </button>
            {rows.length > 0 && (
              <>
                <button type="button" onClick={() => { setForm((f) => ({ ...f, nombre: f.nombre || nombreSugerido(especie || undefined, { piezas: totales.piezas, pieTablar: totales.pt, m3: totales.m3 }) })); setShowGuardar((v) => !v); }} title="Guardar esta cubicación con nombre y fecha" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-primary/10 px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:brightness-95">
                  <Save className="h-3.5 w-3.5" /> {cubicacionActual ? "Actualizar" : "Guardar"}
                </button>
                <button type="button" onClick={nuevaCubicacion} title="Empezar un lote nuevo (lo guardado no se pierde)" className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <Plus className="h-3.5 w-3.5" /> Nueva
                </button>
              </>
            )}
          </div>
          {rows.length > 0 && (
            <div className="flex w-full flex-wrap gap-2">
              <button type="button" onClick={() => void enviarAlLibro()} disabled={enviando} title="Registrar este lote como producción en el Libro CTP" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-primary/10 px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:brightness-95 disabled:opacity-50">
                <Send className="h-3.5 w-3.5" /> {enviando ? "Registrando…" : "Enviar al Libro"}
              </button>
              <button type="button" onClick={() => setShowResumen((v) => !v)} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${showResumen ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                <Table className="h-3.5 w-3.5" /> Resumen
              </button>
              <button type="button" onClick={() => setShowApartados((v) => !v)} title="Separar el lote en bloques (apartados) con su propio total" className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${showApartados ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                <Layers className="h-3.5 w-3.5" /> Apartados{resumenAp.length > 0 ? ` · ${resumenAp.length}` : ""}
              </button>
              <button type="button" onClick={leerTabla} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${readingId ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {readingId ? <><Square className="h-3.5 w-3.5" /> Detener lectura</> : <><Volume2 className="h-3.5 w-3.5" /> Leer tabla</>}
              </button>
              <button type="button" onClick={() => setShowLiquidacion(true)} title="Comprobante de liquidación por especie para el comprador" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-primary/10 px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:brightness-95">
                <Receipt className="h-3.5 w-3.5" /> Liquidación
              </button>
              <button type="button" onClick={compartirWhatsApp} title="Mandar el resumen por WhatsApp" className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </button>
              {/* Con piezas tildadas el papel sale SÓLO con ésas — y el botón lo
                  dice, porque un PDF que trae otra cosa que lo que se ve
                  marcado se descubre recién cuando ya está impreso. */}
              <button
                type="button"
                onClick={() => setShowPdf(true)}
                title={marcadas.size > 0 ? `Vista previa del ANEXO N° 04 con las ${marcadas.size} piezas marcadas` : "Vista previa del ANEXO N° 04 (SERFOR) antes de descargar"}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${marcadas.size > 0 ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                <FileText className="h-3.5 w-3.5" /> Anexo 04{marcadas.size > 0 ? ` · ${marcadas.size}` : ""}
              </button>
              <button
                type="button"
                onClick={() => descargarConAviso(exportarExcel(rowsParaPapel, { precioPt: precio, especieGlobal: especie || undefined, precioDe: hayPreciosEspecie ? precioDe : undefined, asignados, nombresApartado }), "Excel generado", "No se pudo generar el Excel.")}
                title={marcadas.size > 0 ? `Excel con las ${marcadas.size} piezas marcadas` : "Excel del lote entero"}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${marcadas.size > 0 ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                Excel{marcadas.size > 0 ? ` · ${marcadas.size}` : ""}
              </button>
              {marcadas.size > 0 && (
                <button type="button" onClick={() => setMarcadas(new Set())} className="rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]">
                  Quitar marcas
                </button>
              )}
              <button type="button" onClick={exportarCSV} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">CSV</button>
              <button type="button" onClick={limpiar} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)]">Vaciar</button>
            </div>
          )}
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
                  className="mt-1 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Fecha del trabajo</span>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value || hoyISO() })}
                  className="mt-1 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Cliente o destino (opcional)</span>
                <input
                  value={form.cliente}
                  onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                  placeholder="Maderera del Centro"
                  maxLength={120}
                  className="mt-1 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Notas (opcional)</span>
                <input
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Entregado en camión, falta el saldo"
                  maxLength={600}
                  className="mt-1 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void guardarCubicacion()} disabled={guardando}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {guardando ? "Guardando…" : cubicacionActual ? "Actualizar" : "Guardar"}
              </button>
              <button type="button" onClick={() => setShowGuardar(false)} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
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
              <Check className="h-4 w-4" /> {loteCreado ? <>Registrado como lote <b>{loteCreado}</b>. El certificado + QR está en Lotes; atribuí las guías desde el Libro.</> : <>Registrado en el Libro CTP como producción. Atribuí la materia prima (guías) desde el Libro.</>}
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
                    <th className="px-3 py-2 text-right">Piezas</th>
                    <th className="px-3 py-2 text-right" title={FORMULA_PT}>Pie tablar</th>
                    <th className="px-3 py-2 text-right" title={FORMULA_M3}>m³</th>
                    <th className="px-3 py-2">Peso del lote</th>
                    {conValor && <th className="px-3 py-2 text-right">Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {resumen.grupos.map((g) => (
                    <tr key={g.clave} className="border-t border-[var(--accent)]/15">
                      <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{g.label}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{g.cantidad}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(g.pieTablar)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtM3(g.m3)}</td>
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
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">{fmtPt(resumen.total.pieTablar)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtM3(resumen.total.m3)}</td>
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
            <Mic className="h-4 w-4 animate-pulse" /> Dictá los 3 números para reemplazar esa fila (espesor · ancho · largo)…
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no cubicaste nada. Dictá o cargá una pieza para empezar.</p>
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
                  className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-base)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
                />
              </div>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as TipoComercial | "")}
                aria-label="Filtrar por tipo"
                className="h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Todos los tipos</option>
                {tiposLote.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={filtroEspecie}
                onChange={(e) => setFiltroEspecie(e.target.value)}
                aria-label="Filtrar por especie"
                className="h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Todas las especies</option>
                {especiesLote.map((e) => <option key={e} value={e}>{e}</option>)}
                {haySinEspecie && <option value="__sin__">Sin especie</option>}
              </select>
              {duenosLote.length > 0 && (
                <select
                  value={filtroDueno}
                  onChange={(e) => setFiltroDueno(e.target.value)}
                  aria-label="Filtrar por dueño"
                  className="h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
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
                  <button type="button" onClick={limpiarFiltros} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
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
                  className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition ${colsMenuOpen ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
                >
                  <Columns3 className="h-4 w-4" /> Columnas
                </button>
                {colsMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full z-20 mt-1 min-w-[190px] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
                  >
                    <p className="px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Columnas visibles</p>
                    {COLS_OPCIONALES.map(({ key, label }) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                        <input
                          type="checkbox"
                          checked={colsVisibles[key]}
                          onChange={(e) => setColsVisibles((c) => ({ ...c, [key]: e.target.checked }))}
                          className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--color-primary)]"
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
            <div
              data-grilla={GRILLA_TABLA}
              className="overflow-x-auto rounded-xl border border-[var(--rule-base)]"
              style={virtualizarTabla ? { maxHeight: altoContenedorTabla ?? undefined, overflowY: "auto" } : undefined}
              onScroll={virtualizarTabla ? (e) => setScrollTopTabla(e.currentTarget.scrollTop) : undefined}
            >
            <datalist id="cub-duenos-datalist">
              {duenosParaDatalist.map((d) => <option key={d} value={d} />)}
            </datalist>
            <DataTable className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className={`bg-[var(--surface-sunken)] text-left text-[length:var(--ts-xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] ${virtualizarTabla ? "sticky top-0 z-10" : ""}`}>
                  {/* El tilde manda: lo marcado es lo que se lleva el papel. */}
                  <th className="w-10 px-2 py-2 text-center" title="Marcá las piezas que van al PDF y al Anexo 04">
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
                  {colsVisibles.espesor && <th className="px-3 py-2">Espesor</th>}
                  {colsVisibles.ancho && <th className="px-3 py-2">Ancho</th>}
                  {colsVisibles.largo && <th className="px-3 py-2">Largo</th>}
                  {colsVisibles.medida && <th className="px-3 py-2">Medida</th>}
                  {colsVisibles.tipo && <th className="px-3 py-2">Tipo</th>}
                  {colsVisibles.especie && <th className="px-3 py-2">Especie</th>}
                  {colsVisibles.dueno && <th className="px-3 py-2">Dueño</th>}
                  {colsVisibles.apartado && <th className="px-3 py-2">Apartado</th>}
                  {colsVisibles.pt && <ThCol col={TCOL.pt} sel={sel} filas={filasVisibles.length} className="text-right" hint={FORMULA_PT}>Pie tablar</ThCol>}
                  {colsVisibles.m3 && <ThCol col={TCOL.m3} sel={sel} filas={filasVisibles.length} className="text-right" hint={FORMULA_M3}>m³</ThCol>}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filasVisibles.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
                      Ninguna pieza coincide con el filtro.{" "}
                      <button type="button" onClick={limpiarFiltros} className="font-bold text-[var(--accent)] underline">Limpiar filtros</button>
                    </td>
                  </tr>
                )}
                {virtualizarTabla && colchonSuperior > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={14} style={{ height: colchonSuperior, padding: 0, border: 0 }} />
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
                  const enRelleno = rellenoEspecie.objetivo.includes(pos) || rellenoTipo.objetivo.includes(pos) || rellenoApartado.objetivo.includes(pos) || rellenoDueno.objetivo.includes(pos);
                  const numeroAp = asignados[r.id];
                  return (
                  <tr
                    key={r.id}
                    id={`cub-row-${r.id}`}
                    ref={i === 0 ? primeraFilaRef : undefined}
                    /* El arrastre se extiende a nivel FILA y no celda por celda:
                       el asa se baja por cualquier parte de la fila, y repetir
                       el handler en once `<td>` sólo multiplicaba el trabajo. */
                    onMouseEnter={() => { rellenoEspecie.extender(pos); rellenoTipo.extender(pos); rellenoApartado.extender(pos); rellenoDueno.extender(pos); }}
                    className={`border-t border-[var(--rule-soft)] transition-colors ${enRelleno ? "bg-primary/10 outline-dashed outline-2 -outline-offset-2 outline-[var(--accent)]" : rowCls || (rara ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : "")}`}
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
                    {colsVisibles.numero && <td className="px-2 py-2 text-center font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{indice + 1}</td>}
                    {colsVisibles.cant && (
                      <td {...sel.props(pos, TCOL.cant)} className={`px-3 py-2 ${sel.seleccionada(pos, TCOL.cant) ? CELDA_SELECCIONADA : ""}`}><Num v={r.cantidad} onV={(n) => editarCampo(r.id, "cantidad", n)} etiqueta={`Cantidad de la fila ${r.espesor}×${r.ancho}×${r.largo}`} fila={pos} col={COL_CANT} onKeyDown={teclasTabla} /></td>
                    )}
                    {colsVisibles.espesor && (
                      <td className="px-3 py-2"><Dim v={r.espesor} u={r.uEspesor} onU={(u) => cambiarUnidad(r.id, "uEspesor", u)} onV={(n) => editarCampo(r.id, "espesor", n)} etiqueta="Espesor" fila={pos} col={COL_ESPESOR} onKeyDown={teclasTabla} /></td>
                    )}
                    {colsVisibles.ancho && (
                      <td className="px-3 py-2"><Dim v={r.ancho} u={r.uAncho} onU={(u) => cambiarUnidad(r.id, "uAncho", u)} onV={(n) => editarCampo(r.id, "ancho", n)} etiqueta="Ancho" fila={pos} col={COL_ANCHO} onKeyDown={teclasTabla} /></td>
                    )}
                    {colsVisibles.largo && (
                      <td className="px-3 py-2"><Dim v={r.largo} u={r.uLargo} onU={(u) => cambiarUnidad(r.id, "uLargo", u)} onV={(n) => editarCampo(r.id, "largo", n)} etiqueta="Largo" fila={pos} col={COL_LARGO} onKeyDown={teclasTabla} /></td>
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
                        <AsaRelleno onTomar={() => rellenoTipo.iniciar(pos)} titulo="Arrastrá hacia abajo para poner este tipo en las filas siguientes" />
                      </td>
                    )}
                    {colsVisibles.especie && (
                      <td className="group/celda relative px-3 py-2">
                        <select
                          value={r.especie ?? ""}
                          onChange={(e) => editarEspecie(r.id, e.target.value)}
                          aria-label="Especie de la pieza"
                          className="max-w-[110px] rounded-md border border-[var(--rule-base)] bg-transparent px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                        >
                          <option value="">—</option>
                          {ESPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <AsaRelleno onTomar={() => rellenoEspecie.iniciar(pos)} titulo="Arrastrá hacia abajo para poner esta especie en las filas siguientes" />
                      </td>
                    )}
                    {/* Dueño: sin catálogo cerrado (a diferencia de especie) — input +
                        datalist para poder escribir uno nuevo o elegir uno ya usado. */}
                    {colsVisibles.dueno && (
                      <td className="group/celda relative px-3 py-2">
                        <DuenoCell valor={r.dueno ?? ""} onCommit={(v) => editarDueno(r.id, v)} />
                        <AsaRelleno onTomar={() => rellenoDueno.iniciar(pos)} titulo="Arrastrá hacia abajo para poner este dueño en las filas siguientes" />
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
                        <AsaRelleno onTomar={() => rellenoApartado.iniciar(pos)} titulo="Arrastrá hacia abajo para poner este apartado en las filas siguientes" />
                      </td>
                    )}
                    {colsVisibles.pt && (
                      <td {...sel.props(pos, TCOL.pt)} className={`px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)] ${sel.seleccionada(pos, TCOL.pt) ? CELDA_SELECCIONADA : ""}`}>{fmtPt(r.pieTablar)}</td>
                    )}
                    {colsVisibles.m3 && (
                      <td {...sel.props(pos, TCOL.m3)} className={`px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)] ${sel.seleccionada(pos, TCOL.m3) ? CELDA_SELECCIONADA : ""}`}>{fmtM3(r.m3)}</td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {rara && (
                          <span title="Medida fuera de lo común — revisá que esté bien" className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                        )}
                        <button type="button" onClick={() => duplicar(r.id)} aria-label="Duplicar esta fila" title="Duplicar (misma medida otra vez)" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => startEdit(r.id)} aria-label={editando ? "Cancelar edición por voz" : "Editar esta fila por voz"} title={editando ? "Cancelar" : "Dictar nuevas medidas para esta fila"} className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${editando ? "animate-pulse border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}>
                          {editando ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        </button>
                        <button type="button" onClick={() => borrar(r.id)} aria-label="Borrar" className="text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {virtualizarTabla && colchonInferior > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={14} style={{ height: colchonInferior, padding: 0, border: 0 }} />
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
                  {colsVisibles.pt && (
                    <td
                      className="px-3 py-2.5 text-right font-mono text-base tabular-nums text-[var(--accent)]"
                      title={`${fmtPt((filtrando ? totalesVisibles : totales).pt)} PT ÷ ${PT_POR_M3} = ${fmtM3((filtrando ? totalesVisibles : totales).pt / PT_POR_M3)} m³`}
                    >
                      {fmtPt((filtrando ? totalesVisibles : totales).pt)} PT
                    </td>
                  )}
                  {colsVisibles.m3 && (
                    <td
                      className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--accent)]"
                      title={`${fmtM3((filtrando ? totalesVisibles : totales).m3)} m³ × ${PT_POR_M3} = ${fmtPt((filtrando ? totalesVisibles : totales).m3 * PT_POR_M3)} PT. El total suma cada fila ya redondeada, así que puede moverse unas centésimas del cociente exacto.`}
                    >
                      {fmtM3((filtrando ? totalesVisibles : totales).m3)}
                    </td>
                  )}
                  <td />
                </tr>
              </tfoot>
            </DataTable>
          </div>
          </>
        )}

      </div>

      {/* Mismo panel de entrada, repetido al final — para no volver a subir
          después de mirar la tabla. Comparte todo el estado con el de arriba;
          sólo la grilla de navegación por teclado es propia. */}
      <PanelEntradaVoz
        grillaId={GRILLA_CARGA_FIN}
        onPresent={onPresent}
        onImportar={() => setShowImportar(true)}
        showAjustes={showAjustes}
        onToggleAjustes={() => setShowAjustes((v) => !v)}
        config={config}
        onUpdateConfig={updateConfig}
        voices={voices}
        onProbarVoz={() => decir("dos, seis, ocho", config.voiceRate, config.voiceURI)}
        supported={supported}
        listening={listening}
        onToggleListen={toggleListen}
        paused={paused}
        fijas={fijas}
        onAplicarFijas={aplicarFijas}
        especie={especie}
        onEspecieChange={setEspecie}
        dueno={dueno}
        onDuenoChange={aplicarDueno}
        duenosConocidos={duenosParaDatalist}
        onAbrirDuenos={() => setShowDuenosModal(true)}
        liveGroups={liveGroups}
        errMsg={errMsg}
        lastAdded={lastAdded}
        addedFlash={addedFlash}
        onDeshacer={deshacer}
        fmtPt={fmtPt}
        fmtM3={fmtM3}
        manual={manual}
        onManualChange={setManualSync}
        onConfirmarCarga={confirmarCarga}
        apartadoEnCurso={totalCandidatasAp}
        proximoApartado={siguienteApartado(asignados)}
        onCerrarApartado={cerrarApartado}
        onEscucharApartado={leerMedidas}
      />

      {showImportar && (
        <ImportarCubicacionModal
          filasActuales={rows.length}
          onAgregar={(piezas) => { agregarVarias(piezas); setEnviado(false); }}
          onCerrar={() => setShowImportar(false)}
        />
      )}

      {showDuenosModal && (
        <DuenosModal
          duenos={duenosConocidos}
          actual={dueno}
          onAgregar={recordarDueno}
          onQuitar={olvidarDueno}
          onElegir={(d) => { aplicarDueno(d); setShowDuenosModal(false); }}
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
            exportarPDF(rowsParaPapel, { precioPt: precio, especieGlobal: especie || undefined, precioDe: hayPreciosEspecie ? precioDe : undefined, asignados, nombresApartado }),
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
 * Dueño editable en la tabla — texto libre (con datalist), no un `<select>`
 * como especie: no hay catálogo cerrado, cualquier nombre nuevo es válido.
 *
 * Mismo buffer LOCAL que `Num` de acá abajo: comitea recién al perder el
 * foco (o Enter), para no disparar `recordarDueno` con cada letra tipeada
 * (guardaría "J", "Ju", "Jua"… como dueños "conocidos" a medio escribir) y
 * para no pisar lo que se está tipeando si otra fila cambia mientras tanto.
 */
function DuenoCell({ valor, onCommit }: { valor: string; onCommit: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const enfocado = useRef(false);
  useEffect(() => { if (!enfocado.current) setTexto(valor); }, [valor]);
  return (
    <input
      list="cub-duenos-datalist"
      value={texto}
      onFocus={() => { enfocado.current = true; }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { enfocado.current = false; if (texto !== valor) onCommit(texto); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      aria-label="Dueño de la pieza"
      placeholder="—"
      className="w-[110px] rounded-md border border-[var(--rule-base)] bg-transparent px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
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
      className={`${ancho} rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono font-bold tabular-nums text-[var(--text-primary)] outline-none hover:border-[var(--rule-base)] focus:border-[var(--accent)] focus:bg-[var(--surface-canvas)] focus:ring-2 focus:ring-[var(--accent)]/25`}
    />
  );
}

function Dim({ v, u, onU, onV, etiqueta, fila, col, onKeyDown }: {
  v: number; u: Unidad; onU: (u: Unidad) => void; onV?: (n: number) => void; etiqueta?: string;
  fila?: number; col?: number; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {onV
        ? <Num v={v} onV={onV} etiqueta={`${etiqueta ?? "Medida"} (${u})`} fila={fila} col={col} onKeyDown={onKeyDown} />
        : <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{v}</span>}
      <select value={u} onChange={(e) => onU(e.target.value as Unidad)} aria-label={`Unidad de ${etiqueta ?? "la medida"}`} className="rounded-md border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none">
        {UNIDADES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
      </select>
    </span>
  );
}
