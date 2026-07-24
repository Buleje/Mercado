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
import { Mic, MicOff, Calculator, Table, Trash2, Plus, Scale, Volume2, VolumeX, Check, RotateCcw, Square, Coins, Settings, Send, Copy, AlertTriangle, MessageCircle, Save, FileText, Loader2, Lock, Unlock, X, FileSpreadsheet, Receipt } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  cubicarPieza, mejoresNumeros, detectarComando, PT_POR_M3, ESPECIES_MADERA,
  esEco, leerDictado, medidaSospechosa, partirConFijas, numerosPorPieza, DIMENSIONES,
  type PiezaCubicada, type Unidad, type MedidasFijas,
} from "@/lib/forestal/cubicacion";
import {
  loadConfig, saveConfig, CONFIG_DEFAULT, frasesToText, textToFrases,
  type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";
import { exportarPDF, exportarExcel } from "@/lib/forestal/cubicador-export";
import { hoyISO, nombreSugerido, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { agruparPor, resumenACsv, DIMENSIONES_RESUMEN, ETIQUETA_DIMENSION, type DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import CubicacionesGuardadas from "./CubicacionesGuardadas";
import ImportarCubicacionModal from "./ImportarCubicacionModal";
import LiquidacionModal from "./LiquidacionModal";
import EnviarLibroModal from "./EnviarLibroModal";
import { clasificarTipo } from "@/lib/forestal/cubicacion-tipo";
import { TipoBadge, tipoBadgeCls } from "./tipo-badge";
import CacaoChartPresent from "@/components/admin/cacao/CacaoChartPresent";

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
const RANGO_ESPESOR = Array.from({ length: 10 }, (_, i) => i + 1);   // 1 a 10
const RANGO_ANCHO = Array.from({ length: 30 }, (_, i) => i + 1);     // 1 a 30
const RANGO_LARGO = Array.from({ length: 39 }, (_, i) => i + 2);     // 2 a 40
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
}

/** Leyenda de los tipos comerciales por medida (SERFOR mide esp·anc·largo). */
const TIPO_LEYENDA: { label: string; tono: "success" | "info" | "warning" | "neutral"; regla: string }[] = [
  { label: "Comercial", tono: "success", regla: "esp ≥ 2\" · anc ≥ 6\" · largo ≥ 6 pies" },
  { label: "Com. corta", tono: "success", regla: "esp ≥ 2\" · anc ≥ 6\" · largo < 6" },
  { label: "Tabla", tono: "info", regla: "esp = 1\" · anc ≥ 3\" · largo ≥ 6" },
  { label: "Paq. larga", tono: "neutral", regla: "6\"×6\" exacto · largo ≥ 6" },
  { label: "Paq. corta", tono: "neutral", regla: "6\"×6\" exacto · largo < 6" },
  { label: "L. angosta", tono: "warning", regla: "esp ≤ 5\" · anc ≤ 5\" · largo ≥ 6" },
];

export default function CubicadorMadera({ onPresent }: { onPresent?: () => void }) {
  const [rows, setRows] = useState<PiezaCubicada[]>([]);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");        // caption en vivo (interim)
  const [lastAdded, setLastAdded] = useState<PiezaCubicada | null>(null);
  const [addedFlash, setAddedFlash] = useState(0);     // cuántas piezas entró la última frase
  const [supported, setSupported] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [especie, setEspecie] = useState("");
  const [config, setConfig] = useState<CubicadorConfig>(CONFIG_DEFAULT);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showAjustes, setShowAjustes] = useState(false);
  const speakOn = config.speak;
  const avisarRaras = config.avisarRaras;
  const [editingId, setEditingId] = useState<string | null>(null); // fila que se edita por voz
  const [readingId, setReadingId] = useState<string | null>(null); // fila que se está leyendo
  const [manual, setManual] = useState({ cantidad: "1", espesor: "", ancho: "", largo: "" });
  const [precioPt, setPrecioPt] = useState(""); // S/ por pie tablar → valor del lote
  const [preciosEspecie, setPreciosEspecie] = useState<Record<string, string>>({}); // especie(lowercase) → S/ por PT
  const [showResumen, setShowResumen] = useState(false);
  const [showPreciosEsp, setShowPreciosEsp] = useState(false);
  const [dimResumen, setDimResumen] = useState<DimensionResumen>("especie");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false); // ya quedó registrado en el Libro CTP
  /** Cubicación guardada que se está editando (null = lote nuevo sin guardar). */
  const [cubicacionActual, setCubicacionActual] = useState<{ id: string; nombre: string } | null>(null);
  const [showGuardar, setShowGuardar] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [showImportar, setShowImportar] = useState(false);
  const [showLiquidacion, setShowLiquidacion] = useState(false);
  const [showEnviarModal, setShowEnviarModal] = useState(false);
  const [loteCreado, setLoteCreado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState<string | null>(null);
  const [historialToken, setHistorialToken] = useState(0);
  const [form, setForm] = useState({ nombre: "", fecha: hoyISO(), cliente: "", notas: "" });
  const [paused, setPaused] = useState(false); // "pausar" por voz → ignora números hasta "continúa"
  /** Medidas que quedan fijas ("pon fijo el largo a 4"): no se dictan más. */
  const [fijas, setFijas] = useState<MedidasFijas>({});
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const idRef = useRef(0);
  const especieRef = useRef(especie);
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) setRows(JSON.parse(raw) as PiezaCubicada[]);
      const pr = localStorage.getItem(`${storageKey()}-precio`);
      if (pr) setPrecioPt(pr);
      const pe = localStorage.getItem(`${storageKey()}-precios-especie`);
      if (pe) setPreciosEspecie(JSON.parse(pe) as Record<string, string>);
    } catch { /* ignore */ }
  }, []);

  const nuevoId = () => `p-${Date.now()}-${idRef.current++}`;

  const persist = useCallback((next: PiezaCubicada[]) => { setRows(next); saveLocal(next); }, []);

  // addPieza estable (functional update) — lo llama el closure del reconocedor
  // con las filas frescas, sin depender de `rows` (que estaría stale).
  const addPieza = useCallback((p: {
    cantidad: number; espesor: number; ancho: number; largo: number;
    uEspesor: Unidad; uAncho: Unidad; uLargo: Unidad; especie?: string;
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
    const conId = nuevas.map((p) => ({ ...p, id: nuevoId() }));
    setRows((prev) => { const next = [...prev, ...conId]; saveLocal(next); return next; });
    setLastAdded(conId[conId.length - 1]);
  }, []);

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
        });
        ultima = { espesor, ancho, largo }; added++;
      }
      carryRef.current = { nums: resto, ts: resto.length > 0 ? Date.now() : 0 };
      setLiveText("");
      if (added && ultima) {
        setAddedFlash(added); setErrMsg(null);
        const raro = medidaSospechosa(ultima.espesor, ultima.ancho, ultima.largo);
        hablar(
          added > 1 ? `${added} piezas`
            : raro ? `${ultima.espesor}, ${ultima.ancho}, ${ultima.largo}. Revisá`
              : `${cantDictada > 1 ? `${cantDictada} de ` : ""}${ultima.espesor}, ${ultima.ancho}, ${ultima.largo}`,
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
  }, [addPieza, updateRow, borrarUltimo, hablar, aplicarFijas]);

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

  // Leer toda la tabla en voz alta, resaltando y siguiendo cada fila.
  const leerTabla = useCallback(() => {
    if (readingRef.current) { stopLeer(); return; }
    if (!rowsRef.current.length) return;
    // cortar cualquier escucha activa
    if (wantListeningRef.current) { wantListeningRef.current = false; try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); }
    modeRef.current = { type: "add" }; setEditingId(null);
    const synth = window.speechSynthesis;
    if (!synth) { setErrMsg("Este navegador no puede leer en voz alta."); return; }
    readingRef.current = true;
    let idx = 0;
    const step = () => {
      const list = rowsRef.current;
      if (!readingRef.current || idx >= list.length) { stopLeer(); return; }
      const r = list[idx];
      setReadingId(r.id);
      try { document.getElementById(`cub-row-${r.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* ignore */ }
      const u = new SpeechSynthesisUtterance(`${r.espesor}, ${r.ancho}, ${r.largo}${r.especie ? `, ${r.especie}` : ""}`);
      u.lang = "es-PE"; u.rate = Math.max(0.8, configRef.current.voiceRate - 0.3); // un poco más pausado para seguir
      if (configRef.current.voiceURI) { const v = synth.getVoices().find((x) => x.voiceURI === configRef.current.voiceURI); if (v) u.voice = v; }
      u.onend = () => { idx++; step(); };
      synth.cancel(); synth.speak(u);
    };
    step();
  }, [stopLeer]);

  const addManual = () => {
    const c = Math.max(1, Math.round(Number(manual.cantidad) || 1));
    const e = Number(manual.espesor), a = Number(manual.ancho), l = Number(manual.largo);
    if (!(e > 0 && a > 0 && l > 0)) return;
    addPieza({ cantidad: c, espesor: e, ancho: a, largo: l, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: especie || undefined });
    setManual({ cantidad: "1", espesor: "", ancho: "", largo: "" });
  };

  /** Edición a mano de una fila (cantidad/medidas/especie) — sin pasar por voz. */
  const editarCampo = (id: string, campo: "cantidad" | "espesor" | "ancho" | "largo", valor: number) => {
    if (!(valor > 0)) return;
    persist(rows.map((r) => {
      if (r.id !== id) return r;
      const upd = { ...r, [campo]: campo === "cantidad" ? Math.round(valor) : valor };
      const { pieTablar, m3 } = cubicarPieza(upd);
      return { ...upd, pieTablar, m3 };
    }));
  };
  const editarEspecie = (id: string, especieNueva: string) => {
    persist(rows.map((r) => (r.id === id ? { ...r, especie: especieNueva || undefined } : r)));
  };
  /** Duplica la fila justo debajo: el mismo tipo de pieza se repite todo el día. */
  const duplicar = (id: string) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return;
    const copia: PiezaCubicada = { ...rows[i], id: nuevoId() };
    const next = [...rows.slice(0, i + 1), copia, ...rows.slice(i + 1)];
    persist(next);
    setLastAdded(copia);
  };

  const cambiarUnidad = (id: string, campo: "uEspesor" | "uAncho" | "uLargo", u: Unidad) => {
    persist(rows.map((r) => {
      if (r.id !== id) return r;
      const upd = { ...r, [campo]: u };
      const { pieTablar, m3 } = cubicarPieza(upd);
      return { ...upd, pieTablar, m3 };
    }));
  };
  const borrar = (id: string) => { persist(rows.filter((r) => r.id !== id)); if (lastAdded?.id === id) setLastAdded(null); };
  const deshacer = () => { if (lastAdded) { borrar(lastAdded.id); setLastAdded(null); } };
  const limpiar = () => { persist([]); setLastAdded(null); };

  // Persistir el precio por PT (por tenant) y los precios por especie.
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-precio`, precioPt); } catch { /* ignore */ } }, [precioPt]);
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-precios-especie`, JSON.stringify(preciosEspecie)); } catch { /* ignore */ } }, [preciosEspecie]);

  const totales = useMemo(() => ({
    piezas: rows.reduce((a, r) => a + r.cantidad, 0),
    pt: rows.reduce((a, r) => a + r.pieTablar, 0),
    m3: rows.reduce((a, r) => a + r.m3, 0),
  }), [rows]);
  const precio = Number(precioPt) || 0;

  // Especies presentes en el lote (para el editor de precio por especie).
  const especiesLote = useMemo(
    () => [...new Set(rows.map((r) => r.especie?.trim()).filter((e): e is string => !!e))],
    [rows],
  );
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
        setLoteCreado(jl?.lote?.codigo ?? "creado");
      }
      setEnviado(true);
      setShowEnviarModal(false);
    } catch (e) {
      setErrMsg(`No se pudo registrar en el Libro: ${e instanceof Error ? e.message : String(e)}`);
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
    } catch (e) {
      setErrMsg(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGuardando(false);
    }
  };

  /** Carga una cubicación guardada en la tabla para seguir o re-exportar. */
  const abrirCubicacion = (c: CubicacionRegistro) => {
    if (rows.length > 0 && !cubicacionActual && !window.confirm("Vas a reemplazar el lote que tenés en pantalla y no está guardado. ¿Seguir?")) return;
    persist(c.piezas);
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
  };

  return (
    <div className="group relative space-y-4">
      {/* Panel de voz */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Calculator className="h-4 w-4 text-[var(--accent)]" /> Cubicador de madera por voz
          </h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowImportar(true)} title="Importar un Excel/CSV de piezas al lote" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Importar Excel
            </button>
            <button type="button" onClick={() => setShowAjustes((v) => !v)} aria-pressed={showAjustes} title="Ajustes de voz y comandos" className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${showAjustes ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
              <Settings className="h-3.5 w-3.5" /> Ajustes
            </button>
            {onPresent && <CacaoChartPresent title="Cubicador de madera" onClick={onPresent} />}
          </div>
        </div>

        {/* Panel de AJUSTES — voz (velocidad/tono/qué dicta) + comandos editables */}
        {showAjustes && (
          <div className="mb-4 grid gap-4 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-canvas)] p-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Voz</div>
              <label className="block">
                <span className="text-xs font-bold text-[var(--text-secondary)]">Velocidad: {config.voiceRate.toFixed(1)}×</span>
                <input type="range" min={0.6} max={2} step={0.1} value={config.voiceRate} onChange={(e) => updateConfig({ voiceRate: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[var(--text-secondary)]">Tono / voz</span>
                <select value={config.voiceURI} onChange={(e) => updateConfig({ voiceURI: e.target.value })} className="mt-1 h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
                  <option value="">Voz por defecto</option>
                  {voices.filter((v) => v.lang.toLowerCase().startsWith("es")).map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => updateConfig({ speak: !config.speak })} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${config.speak ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}>
                  {config.speak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} El sistema repite {config.speak ? "SÍ" : "NO"}
                </button>
                <button type="button" onClick={() => decir("dos, seis, ocho", config.voiceRate, config.voiceURI)} className="rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Probar voz</button>
                <button
                  type="button"
                  onClick={() => updateConfig({ avisarRaras: !config.avisarRaras })}
                  title="Resalta las piezas con medidas fuera de lo común (no las cambia)"
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${config.avisarRaras ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Avisar medidas raras {config.avisarRaras ? "SÍ" : "NO"}
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Comandos de voz (separados por coma)</div>
                <button type="button" onClick={() => updateConfig({ voiceRate: CONFIG_DEFAULT.voiceRate, voiceURI: "", speak: true, comandos: CONFIG_DEFAULT.comandos })} className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]">Restablecer</button>
              </div>
              <CmdField label="Pausar" value={frasesToText(config.comandos.pausar)} onChange={(v) => updateConfig({ comandos: { ...config.comandos, pausar: textToFrases(v) } })} />
              <CmdField label="Continuar" value={frasesToText(config.comandos.continuar)} onChange={(v) => updateConfig({ comandos: { ...config.comandos, continuar: textToFrases(v) } })} />
              <CmdField label="Borrar último" value={frasesToText(config.comandos.borrarUltimo)} onChange={(v) => updateConfig({ comandos: { ...config.comandos, borrarUltimo: textToFrases(v) } })} />
              <CmdField label="Especie (prefijos)" value={frasesToText(config.comandos.especie)} onChange={(v) => updateConfig({ comandos: { ...config.comandos, especie: textToFrases(v) } })} />
              <CmdField label="Fijar medida" value={frasesToText(config.comandos.fijar)} onChange={(v) => updateConfig({ comandos: { ...config.comandos, fijar: textToFrases(v) } })} />
              <CmdField label="Soltar lo fijo" value={frasesToText(config.comandos.desfijar)} onChange={(v) => updateConfig({ comandos: { ...config.comandos, desfijar: textToFrases(v) } })} />
            </div>
          </div>
        )}

        {supported ? (
          <>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={toggleListen}
                aria-pressed={listening}
                className={`inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 transition ${listening ? "animate-pulse border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-95"}`}
              >
                {listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </button>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {paused ? "⏸ En pausa — decí «continúa» para seguir" : listening ? "Escuchando… dictá cada medida y pausá un instante" : "Tocá el micrófono y dictá los números"}
                  </p>
                  {/* Toggle de voz que repite */}
                  <button
                    type="button"
                    onClick={() => updateConfig({ speak: !config.speak })}
                    aria-pressed={speakOn}
                    title={speakOn ? "La voz repite lo dictado — tocá para silenciar" : "Activar voz que repite lo dictado"}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition ${speakOn ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}
                  >
                    {speakOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    Voz {speakOn ? "on" : "off"}
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  {numerosPorPieza(fijas) === 3 ? (
                    <>Solo los números: <span className="font-semibold text-[var(--text-secondary)]">&ldquo;dos seis ocho&rdquo;</span> = espesor 2&Prime; · ancho 6&Prime; · largo 8 pies. Decí los 3 y una <b>micro-pausa</b> los guarda al toque — seguí con la siguiente sin esperar.</>
                  ) : (
                    <>Con lo fijo puesto, dictá <b className="text-[var(--text-secondary)]">{numerosPorPieza(fijas) === 1 ? "un número" : `${numerosPorPieza(fijas)} números`}</b> por pieza ({DIMENSIONES.filter((d) => fijas[d] == null).join(" · ")}). Para soltarlo decí <b className="text-[var(--text-secondary)]">&ldquo;quitá el fijo&rdquo;</b>.</>
                  )}
                </p>

                {/* Medidas fijas: lo que no hace falta volver a dictar */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {DIMENSIONES.map((d) => {
                    const valor = fijas[d];
                    const unidad = d === "largo" ? "pies" : "pulg";
                    return valor ? (
                      <span key={d} className="inline-flex items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent)]">
                        <Lock className="h-3 w-3" aria-hidden />
                        {d} fijo: {valor} {unidad}
                        <button
                          type="button"
                          onClick={() => { const n = { ...fijas }; delete n[d]; aplicarFijas(n); }}
                          aria-label={`Soltar el ${d} fijo`}
                          title={`Soltar el ${d}`}
                          className="ml-0.5 rounded p-0.5 hover:bg-[var(--surface-raised)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : null;
                  })}
                  {Object.keys(fijas).length === 0 && (
                    <span className="text-[length:var(--ts-2xs)] italic text-[var(--text-tertiary)]">
                      Tip: decí <b className="not-italic text-[var(--text-secondary)]">&ldquo;pon fijo el largo a cuatro&rdquo;</b> y después dictá solo espesor y ancho.
                    </span>
                  )}
                </div>
                {/* Especie: menú que se aplica a lo que dictes */}
                <label className="mt-2 inline-flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Especie</span>
                  <select value={especie} onChange={(ev) => setEspecie(ev.target.value)} className="bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none">
                    <option value="">Sin especie</option>
                    {ESPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>

                {/* Comandos de voz disponibles */}
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  <span>Comandos por voz:</span>
                  <span><b className="text-[var(--text-secondary)]">«pausá»</b> / <b className="text-[var(--text-secondary)]">«continuá»</b></span>
                  <span><b className="text-[var(--text-secondary)]">«eliminá el último»</b></span>
                  <span><b className="text-[var(--text-secondary)]">«especie tornillo»</b></span>
                  <span><b className="text-[var(--text-secondary)]">«pon fijo el largo a cuatro»</b> / <b className="text-[var(--text-secondary)]">«quitá el fijo»</b></span>
                </p>

                {/* Caption en vivo AGRUPADO — cada bloque verde = una pieza, para
                    ver el cuadrado mientras dictás rápido (no una barra continua). */}
                {listening && (
                  <div className="mt-2 min-h-[2.75rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                    {liveGroups && (liveGroups.triples.length > 0 || liveGroups.resto.length > 0) ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {liveGroups.triples.map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-md bg-[var(--data-success-100)] px-2 py-0.5 font-mono text-sm font-bold text-[var(--data-success-700)]">
                            {t.join(" · ")}
                          </span>
                        ))}
                        {liveGroups.resto.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--data-warning-500)] px-2 py-0.5 font-mono text-sm text-[var(--data-warning-700)]">
                            {liveGroups.resto.join(" · ")}<span className="ml-1 opacity-60">· falta{liveGroups.resto.length === 2 ? " 1" : "n 2"}</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]"><Volume2 className="h-3.5 w-3.5" /> escuchando…</div>
                    )}
                    <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Cada bloque verde = una pieza (espesor · ancho · largo). Si un cuadrado quedó mal, pausá y editá esa fila con su 🎤.</p>
                  </div>
                )}
                {errMsg && (
                  <p className="mt-2 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)]">
                    {errMsg}
                  </p>
                )}
              </div>
            </div>

            {/* Última agregada + deshacer (feedback del auto-add) */}
            {lastAdded && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)]">
                  <Check className="h-4 w-4" />
                  {addedFlash > 1 ? `${addedFlash} piezas · última: ` : "Agregada: "}
                  {lastAdded.espesor}&Prime; × {lastAdded.ancho}&Prime; × {lastAdded.largo} pies{lastAdded.especie ? ` · ${lastAdded.especie}` : ""}
                  <span className="font-mono">= {fmtPt(lastAdded.pieTablar)} PT</span>
                </span>
                <button type="button" onClick={deshacer} className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95">
                  <RotateCcw className="h-3.5 w-3.5" /> Deshacer
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)]">
            Este navegador no soporta dictado por voz (usá Chrome). Podés cargar las medidas a mano abajo.
          </p>
        )}

        {/* Carga manual rápida — dropdowns (sin tipear). Usa la especie de arriba. */}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--rule-soft)] pt-3">
          <ManualField label="Cant." value={manual.cantidad} onChange={(v) => setManual({ ...manual, cantidad: v })} w="w-16" />
          <ManualSelect label="Espesor (pulg)" value={fijas.espesor ? String(fijas.espesor) : manual.espesor} onChange={(v) => setManual({ ...manual, espesor: v })} opts={RANGO_ESPESOR} fijo={fijas.espesor != null} onFijar={() => aplicarFijas(fijas.espesor != null ? (() => { const n = { ...fijas }; delete n.espesor; return n; })() : { ...fijas, espesor: Number(manual.espesor) || 0 })} />
          <ManualSelect label="Ancho (pulg)" value={fijas.ancho ? String(fijas.ancho) : manual.ancho} onChange={(v) => setManual({ ...manual, ancho: v })} opts={RANGO_ANCHO} fijo={fijas.ancho != null} onFijar={() => aplicarFijas(fijas.ancho != null ? (() => { const n = { ...fijas }; delete n.ancho; return n; })() : { ...fijas, ancho: Number(manual.ancho) || 0 })} />
          <ManualSelect label="Largo (pies)" value={fijas.largo ? String(fijas.largo) : manual.largo} onChange={(v) => setManual({ ...manual, largo: v })} opts={RANGO_LARGO} fijo={fijas.largo != null} onFijar={() => aplicarFijas(fijas.largo != null ? (() => { const n = { ...fijas }; delete n.largo; return n; })() : { ...fijas, largo: Number(manual.largo) || 0 })} />
          <button type="button" onClick={addManual} className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Plus className="h-4 w-4" /> Agregar a mano</button>
        </div>
      </div>

      {/* Tabla acumulada */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Table className="h-4 w-4 text-[var(--accent)]" /> {cubicacionActual ? cubicacionActual.nombre : "Lote cubicado"} ({rows.length})
            </h3>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {cubicacionActual ? "Guardada — al tocar «Guardar» se actualiza esta misma cubicación." : "Sin guardar — vive sólo en este dispositivo hasta que la guardes."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowHistorial((v) => !v)} title="Ver las cubicaciones guardadas" className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${showHistorial ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              <FileText className="h-3.5 w-3.5" /> Guardadas
            </button>
            {rows.length > 0 && (
              <>
                <button type="button" onClick={() => { setForm((f) => ({ ...f, nombre: f.nombre || nombreSugerido(especie || undefined, { piezas: totales.piezas, pieTablar: totales.pt, m3: totales.m3 }) })); setShowGuardar((v) => !v); }} title="Guardar esta cubicación con nombre y fecha" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:brightness-95">
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
              <button type="button" onClick={() => void enviarAlLibro()} disabled={enviando} title="Registrar este lote como producción en el Libro CTP" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:brightness-95 disabled:opacity-50">
                <Send className="h-3.5 w-3.5" /> {enviando ? "Registrando…" : "Enviar al Libro"}
              </button>
              <button type="button" onClick={() => setShowResumen((v) => !v)} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${showResumen ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                <Table className="h-3.5 w-3.5" /> Resumen
              </button>
              <button type="button" onClick={leerTabla} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${readingId ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {readingId ? <><Square className="h-3.5 w-3.5" /> Detener lectura</> : <><Volume2 className="h-3.5 w-3.5" /> Leer tabla</>}
              </button>
              <button type="button" onClick={() => setShowLiquidacion(true)} title="Comprobante de liquidación por especie para el comprador" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:brightness-95">
                <Receipt className="h-3.5 w-3.5" /> Liquidación
              </button>
              <button type="button" onClick={compartirWhatsApp} title="Mandar el resumen por WhatsApp" className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </button>
              <button type="button" onClick={() => exportarPDF(rowsRef.current, { precioPt: precio, especieGlobal: especie || undefined, precioDe: hayPreciosEspecie ? precioDe : undefined }).catch(() => setErrMsg("No se pudo generar el PDF."))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">PDF</button>
              <button type="button" onClick={() => exportarExcel(rowsRef.current, { precioPt: precio, especieGlobal: especie || undefined, precioDe: hayPreciosEspecie ? precioDe : undefined }).catch(() => setErrMsg("No se pudo generar el Excel."))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Excel</button>
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

        {/* Resúmenes del lote — la misma madera leída por especie, largo, sección… */}
        {showResumen && rows.length > 0 && (
          <div className="mb-3 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)]/40 p-3">
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
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    <th className="px-3 py-2">{ETIQUETA_DIMENSION[dimResumen].replace("Por ", "")}</th>
                    <th className="px-3 py-2 text-right">Piezas</th>
                    <th className="px-3 py-2 text-right">Pie tablar</th>
                    <th className="px-3 py-2 text-right">m³</th>
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
              </table>
            </div>
          </div>
        )}
        {editingId && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-[var(--accent)]">
            <Mic className="h-4 w-4 animate-pulse" /> Dictá los 3 números para reemplazar esa fila (espesor · ancho · largo)…
          </div>
        )}

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no cubicaste nada. Dictá o cargá una pieza para empezar.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="px-2 py-2 text-center">N°</th>
                  <th className="px-3 py-2">Cant.</th><th className="px-3 py-2">Espesor</th><th className="px-3 py-2">Ancho</th><th className="px-3 py-2">Largo</th>
                  <th className="px-3 py-2">Medida</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Especie</th><th className="px-3 py-2 text-right">Pie tablar</th><th className="px-3 py-2 text-right">m³</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, indice) => {
                  const leyendo = readingId === r.id;
                  const editando = editingId === r.id;
                  const rowCls = leyendo
                    ? "bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--accent)] shadow-lg [&_td]:border-b-2 [&_td]:border-b-[var(--accent)]"
                    : editando
                      ? "bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--data-warning-500)]"
                      : lastAdded?.id === r.id ? "bg-[var(--data-success-50)]" : "";
                  // Medida fuera de rango: se AVISA, no se corrige — el dato es del operario.
                  const rara = avisarRaras && medidaSospechosa(r.espesor, r.ancho, r.largo);
                  const tipo = clasificarTipo(r);
                  return (
                  <tr key={r.id} id={`cub-row-${r.id}`} className={`border-t border-[var(--rule-soft)] transition-colors ${rowCls || (rara ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : "")}`}>
                    <td className="px-2 py-2 text-center font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{indice + 1}</td>
                    <td className="px-3 py-2"><Num v={r.cantidad} onV={(n) => editarCampo(r.id, "cantidad", n)} etiqueta={`Cantidad de la fila ${r.espesor}×${r.ancho}×${r.largo}`} /></td>
                    <td className="px-3 py-2"><Dim v={r.espesor} u={r.uEspesor} onU={(u) => cambiarUnidad(r.id, "uEspesor", u)} onV={(n) => editarCampo(r.id, "espesor", n)} etiqueta="Espesor" /></td>
                    <td className="px-3 py-2"><Dim v={r.ancho} u={r.uAncho} onU={(u) => cambiarUnidad(r.id, "uAncho", u)} onV={(n) => editarCampo(r.id, "ancho", n)} etiqueta="Ancho" /></td>
                    <td className="px-3 py-2"><Dim v={r.largo} u={r.uLargo} onU={(u) => cambiarUnidad(r.id, "uLargo", u)} onV={(n) => editarCampo(r.id, "largo", n)} etiqueta="Largo" /></td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                      {r.espesor}×{r.ancho}×{r.largo}
                    </td>
                    <td className="px-3 py-2">
                      <TipoBadge tipo={tipo} />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.especie ?? ""}
                        onChange={(e) => editarEspecie(r.id, e.target.value)}
                        aria-label="Especie de la pieza"
                        className="max-w-[110px] rounded-md border border-[var(--rule-base)] bg-transparent px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">—</option>
                        {ESPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(r.pieTablar)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(r.m3)}</td>
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
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--accent-soft)] font-bold text-[var(--text-primary)]">
                  <td className="px-3 py-2.5" colSpan={8}>Total · {totales.piezas} piezas</td>
                  <td className="px-3 py-2.5 text-right font-mono text-base tabular-nums text-[var(--accent)]">{fmtPt(totales.pt)} PT</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--accent)]">{fmtM3(totales.m3)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Leyenda del Tipo — cómo se clasifica cada pieza por su medida (SERFOR: esp·anc·largo) */}
        {rows.length > 0 && (
          <div className="mt-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Tipo por medida (espesor · ancho · largo)</span>
            <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {TIPO_LEYENDA.map((t) => (
                <span key={t.label} className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                  <span className={`inline-block shrink-0 rounded-full px-1.5 py-0.5 font-bold ${tipoBadgeCls(t.tono)}`}>{t.label}</span>
                  <span className="text-[var(--text-tertiary)]">{t.regla}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Precio → valor del lote (plata) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3">
          <label className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">Precio</span>
            <span className="text-sm text-[var(--text-tertiary)]">S/</span>
            <input type="number" inputMode="decimal" value={precioPt} onChange={(e) => setPrecioPt(e.target.value)} placeholder="0.00" className="h-9 w-24 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            <span className="text-sm text-[var(--text-tertiary)]">por pie tablar</span>
            {especiesLote.length > 0 && (
              <button type="button" onClick={() => setShowPreciosEsp((v) => !v)} aria-expanded={showPreciosEsp} className="ml-1 inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <Coins className="h-3.5 w-3.5" /> Por especie
                {hayPreciosEspecie && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
              </button>
            )}
          </label>
          <div className="text-right">
            <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Valor del lote</div>
            <div className="font-mono text-2xl font-extrabold tabular-nums text-[var(--accent)]">S/ {soles(valorLote)}</div>
          </div>
        </div>

        {/* Precio por especie — Tornillo, Cedro, Caoba valen distinto. Vacío = usa el global. */}
        {showPreciosEsp && especiesLote.length > 0 && (
          <div className="mt-2 rounded-xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Precio por especie (S/ por pie tablar)</span>
              {hayPreciosEspecie && (
                <button type="button" onClick={() => setPreciosEspecie({})} className="text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]">Limpiar</button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {especiesLote.map((esp) => {
                const k = esp.toLowerCase();
                return (
                  <label key={k} className="flex items-center gap-2 rounded-lg bg-[var(--surface-raised)] px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]" title={esp}>{esp}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">S/</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={preciosEspecie[k] ?? ""}
                      onChange={(e) => setPreciosEspecie((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder={precio > 0 ? soles(precio) : "0.00"}
                      className="h-9 w-20 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Vacío = usa el precio general. Se aplica al resumen, WhatsApp, PDF y Excel.</p>
          </div>
        )}

        {/* Conversiones */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Conv label="Total pie tablar" value={`${fmtPt(totales.pt)} PT`} />
          <Conv label="Total m³" value={`${fmtM3(totales.m3)} m³`} />
          <Conv label="Equivale a" value={`${fmtPt(totales.m3 * PT_POR_M3)} PT`} hint="desde m³" />
          <Conv label="Referencia" value={`1 m³ = ${PT_POR_M3} PT`} hint={<><Scale className="mr-1 inline h-3 w-3" />pie tablar</>} />
        </div>
      </div>

      {showImportar && (
        <ImportarCubicacionModal
          onAgregar={(piezas) => { agregarVarias(piezas); setEnviado(false); }}
          onCerrar={() => setShowImportar(false)}
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
    </div>
  );
}

/** Número editable en la tabla: se corrige a mano sin volver a dictar. */
function Num({ v, onV, etiqueta, ancho = "w-14" }: { v: number; onV: (n: number) => void; etiqueta: string; ancho?: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      value={v}
      aria-label={etiqueta}
      onChange={(e) => { const n = Number(e.target.value); if (n > 0) onV(n); }}
      className={`${ancho} rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono font-bold tabular-nums text-[var(--text-primary)] outline-none hover:border-[var(--rule-base)] focus:border-[var(--accent)]`}
    />
  );
}

function Dim({ v, u, onU, onV, etiqueta }: { v: number; u: Unidad; onU: (u: Unidad) => void; onV?: (n: number) => void; etiqueta?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {onV
        ? <Num v={v} onV={onV} etiqueta={`${etiqueta ?? "Medida"} (${u})`} />
        : <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{v}</span>}
      <select value={u} onChange={(e) => onU(e.target.value as Unidad)} aria-label={`Unidad de ${etiqueta ?? "la medida"}`} className="rounded-md border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none">
        {UNIDADES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
      </select>
    </span>
  );
}

function ManualField({ label, value, onChange, w = "w-20" }: { label: string; value: string; onChange: (v: string) => void; w?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={`${w} h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]`} />
    </label>
  );
}

/**
 * Select de la carga manual. El candado fija esa medida: queda puesta acá y
 * deja de pedirse en el dictado (es el mismo estado que el comando de voz).
 */
function ManualSelect({ label, value, onChange, opts, fijo, onFijar }: {
  label: string; value: string; onChange: (v: string) => void; opts: number[];
  fijo?: boolean; onFijar?: () => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <span className="flex items-center gap-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-10 w-20 rounded-xl border-2 bg-[var(--surface-canvas)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] ${fijo ? "border-[var(--accent)]" : "border-[var(--rule-base)]"}`}
        >
          <option value="">—</option>
          {opts.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {onFijar && (
          <button
            type="button"
            onClick={onFijar}
            disabled={!fijo && !value}
            aria-pressed={!!fijo}
            aria-label={fijo ? `Soltar ${label}` : `Fijar ${label}`}
            title={fijo ? "Soltar esta medida" : "Fijar esta medida (no se dicta más)"}
            className={`flex h-10 w-8 items-center justify-center rounded-lg border transition disabled:opacity-30 ${fijo ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
          >
            {fijo ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
        )}
      </span>
    </label>
  );
}

function CmdField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[var(--text-secondary)]">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
    </label>
  );
}

function Conv({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{value}</div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
