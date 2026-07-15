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
import { Mic, MicOff, Calculator, Table, Trash2, Plus, Scale, Volume2, VolumeX, Check, RotateCcw, Square, Coins, Settings } from "@buleje/design-system/icons";
import {
  cubicarPieza, mejoresNumeros, detectarComando, PT_POR_M3,
  type PiezaCubicada, type Unidad,
} from "@/lib/forestal/cubicacion";
import {
  loadConfig, saveConfig, CONFIG_DEFAULT, frasesToText, textToFrases,
  type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";
import { exportarPDF, exportarExcel } from "@/lib/forestal/cubicador-export";
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
// Especies de madera comunes en la Selva Central peruana (menú de la cubicación).
const ESPECIES = [
  "Tornillo", "Cedro", "Capirona", "Shihuahuaco", "Cumala", "Moena",
  "Estoraque", "Lupuna", "Bolaina", "Catahua", "Copaiba", "Ishpingo", "Caoba", "Marupá",
];
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
// Voz que repite lo dictado (SpeechSynthesis). cancel() antes de hablar: en
// dictado rápido gana el último, sin encolar audio viejo que quede atrás.
function decir(texto: string, rate = 1.5, voiceURI = "") {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-PE";
    u.rate = rate;
    if (voiceURI) { const v = synth.getVoices().find((x) => x.voiceURI === voiceURI); if (v) u.voice = v; }
    synth.speak(u);
  } catch { /* TTS no disponible */ }
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
  const [config, setConfig] = useState<CubicadorConfig>(CONFIG_DEFAULT);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showAjustes, setShowAjustes] = useState(false);
  const speakOn = config.speak;
  const [editingId, setEditingId] = useState<string | null>(null); // fila que se edita por voz
  const [readingId, setReadingId] = useState<string | null>(null); // fila que se está leyendo
  const [manual, setManual] = useState({ cantidad: "1", espesor: "", ancho: "", largo: "" });
  const [precioPt, setPrecioPt] = useState(""); // S/ por pie tablar → valor del lote
  const [showResumen, setShowResumen] = useState(false);
  const [paused, setPaused] = useState(false); // "pausar" por voz → ignora números hasta "continúa"
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const idRef = useRef(0);
  const especieRef = useRef(especie);
  const configRef = useRef(config);
  const wantListeningRef = useRef(false);
  const carryRef = useRef<number[]>([]);               // números sueltos entre frases
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
  const resetVoz = () => { carryRef.current = []; lastFinalRef.current = -1; };
  useEffect(() => { especieRef.current = especie; }, [especie]);
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
    decir(texto, configRef.current.voiceRate, configRef.current.voiceURI);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) setRows(JSON.parse(raw) as PiezaCubicada[]);
      const pr = localStorage.getItem(`${storageKey()}-precio`);
      if (pr) setPrecioPt(pr);
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

  // Borra la última fila (comando de voz "elimina el último"). Estable.
  const borrarUltimo = useCallback(() => {
    setRows((prev) => { if (!prev.length) return prev; const next = prev.slice(0, -1); saveLocal(next); return next; });
    setLastAdded(null);
    carryRef.current = [];
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
    rec.maxAlternatives = 1; // confiamos en la hipótesis #1

    // Procesa SOLO resultados FINALES (estables) → sin duplicados ni valores
    // erráticos. El interim solo alimenta el caption. Cada final se procesa una
    // vez (lastFinalRef). Primero mira si es un COMANDO de voz; si no, números.
    const procesarFinal = (idx: number, texto: string) => {
      lastFinalRef.current = idx;

      // ── COMANDOS DE VOZ ──
      const cmd = detectarComando(texto, configRef.current.comandos);
      if (cmd) {
        if (cmd.tipo === "pausar") { pausedRef.current = true; setPaused(true); carryRef.current = []; setLiveText(""); hablar("en pausa"); }
        else if (cmd.tipo === "continuar") { pausedRef.current = false; setPaused(false); carryRef.current = []; setLiveText(""); hablar("sigo"); }
        else if (cmd.tipo === "borrar-ultimo") { borrarUltimo(); hablar("borrado"); }
        else if (cmd.tipo === "especie") {
          const found = ESPECIES.find((s) => sinAcentos(s).startsWith(cmd.palabra));
          if (found) { setEspecie(found); hablar(found); }
          else setErrMsg(`No reconocí la especie "${cmd.palabra}".`);
        }
        return;
      }

      const nums = mejoresNumeros([texto]);

      // ── MODO EDICIÓN: 3 números reemplazan la fila y sale ──
      if (modeRef.current.type === "edit") {
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

      // ── MODO AGREGAR: chunk en tríos, arrastra el sobrante a la próxima frase ──
      const all = [...carryRef.current, ...nums];
      const totalPiezas = Math.floor(all.length / 3);
      let added = 0;
      let ultima: { espesor: number; ancho: number; largo: number } | null = null;
      for (let k = 0; k < totalPiezas; k++) {
        const [espesor, ancho, largo] = all.slice(k * 3, k * 3 + 3);
        if (espesor > 0 && ancho > 0 && largo > 0) {
          addPieza({ cantidad: 1, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: especieRef.current || undefined });
          ultima = { espesor, ancho, largo }; added++;
        }
      }
      carryRef.current = all.slice(totalPiezas * 3);
      setLiveText("");
      if (added && ultima) {
        setAddedFlash(added); setErrMsg(null);
        hablar(added === 1 ? `${ultima.espesor}, ${ultima.ancho}, ${ultima.largo}` : `${added} piezas`);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) { interim += (res[0]?.transcript ?? "") + " "; continue; }
        if (i <= lastFinalRef.current) continue; // ya procesado este final
        procesarFinal(i, res[0]?.transcript ?? "");
      }
      if (interim.trim()) setLiveText(interim.trim()); // caption (no guarda)
    };
    rec.onend = () => {
      // Chrome corta tras silencios/timeout → reiniciar. La nueva sesión reinicia
      // los índices a 0 → reseteamos lastFinalRef; el carry se conserva.
      if (!wantListeningRef.current) { setListening(false); return; }
      lastFinalRef.current = -1;
      try { rec.start(); } catch { wantListeningRef.current = false; setListening(false); }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const code = e?.error ?? "";
      if (code in ERR_MSG) { wantListeningRef.current = false; setListening(false); setErrMsg(ERR_MSG[code]); }
      // no-speech / network / aborted: transitorio → onend reintenta, sin ruido.
    };
    recRef.current = rec;
    return () => { wantListeningRef.current = false; try { rec.stop(); } catch { /* ignore */ } };
  }, [addPieza, updateRow, borrarUltimo, hablar]);

  const stopLeer = useCallback(() => {
    readingRef.current = false; setReadingId(null);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  const toggleListen = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    stopLeer();
    modeRef.current = { type: "add" }; setEditingId(null);
    pausedRef.current = false; setPaused(false);
    if (wantListeningRef.current) {
      wantListeningRef.current = false; rec.stop(); setListening(false);
      resetVoz(); setLiveText("");
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      return;
    }
    wantListeningRef.current = true;
    resetVoz(); setLiveText(""); setErrMsg(null);
    try { rec.start(); setListening(true); } catch { /* ya corriendo */ }
  }, [stopLeer]);

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

  // Persistir el precio por PT (por tenant).
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-precio`, precioPt); } catch { /* ignore */ } }, [precioPt]);

  const totales = useMemo(() => ({
    piezas: rows.reduce((a, r) => a + r.cantidad, 0),
    pt: rows.reduce((a, r) => a + r.pieTablar, 0),
    m3: rows.reduce((a, r) => a + r.m3, 0),
  }), [rows]);
  const precio = Number(precioPt) || 0;
  const valorLote = totales.pt * precio;
  const soles = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Resumen: agrupa medidas idénticas (espesor×ancho×largo + unidades) con su
  // cantidad, pie tablar y valor — para liquidar/vender por tipo de pieza.
  const resumen = useMemo(() => {
    const map = new Map<string, { label: string; cantidad: number; pt: number; m3: number }>();
    for (const r of rows) {
      const key = `${r.espesor}${r.uEspesor}x${r.ancho}${r.uAncho}x${r.largo}${r.uLargo}${r.especie ?? ""}`;
      const label = `${r.espesor}×${r.ancho}×${r.largo}${r.especie ? ` · ${r.especie}` : ""}`;
      const cur = map.get(key) ?? { label, cantidad: 0, pt: 0, m3: 0 };
      cur.cantidad += r.cantidad; cur.pt += r.pieTablar; cur.m3 += r.m3;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.pt - a.pt);
  }, [rows]);

  // Números del dictado en curso, AGRUPADOS en tríos (espesor·ancho·largo) para
  // que se vea cómo se cuadran las piezas en vivo — y no una barra continua que
  // confunde en el dictado rápido.
  const liveGroups = useMemo(() => {
    if (!listening || !liveText) return null;
    const nums = mejoresNumeros([liveText]);
    const triples: number[][] = [];
    let i = 0;
    for (; i + 3 <= nums.length; i += 3) triples.push(nums.slice(i, i + 3));
    return { triples, resto: nums.slice(i) };
  }, [listening, liveText]);

  const exportarCSV = () => {
    const head = ["Cantidad", "Espesor", "uEsp", "Ancho", "uAnc", "Largo", "uLar", "Especie", "PieTablar", "m3", "ValorS/"];
    const lines = rows.map((r) => [r.cantidad, r.espesor, r.uEspesor, r.ancho, r.uAncho, r.largo, r.uLargo, r.especie ?? "", r.pieTablar, r.m3, (r.pieTablar * precio).toFixed(2)].join(","));
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
                  Solo los números: <span className="font-semibold text-[var(--text-secondary)]">&ldquo;dos seis ocho&rdquo;</span> = espesor 2&Prime; · ancho 6&Prime; · largo 8 pies. Decí los 3 y una <b>micro-pausa</b> los guarda al toque — seguí con la siguiente sin esperar.
                </p>
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
          <ManualSelect label="Espesor (pulg)" value={manual.espesor} onChange={(v) => setManual({ ...manual, espesor: v })} opts={RANGO_ESPESOR} />
          <ManualSelect label="Ancho (pulg)" value={manual.ancho} onChange={(v) => setManual({ ...manual, ancho: v })} opts={RANGO_ANCHO} />
          <ManualSelect label="Largo (pies)" value={manual.largo} onChange={(v) => setManual({ ...manual, largo: v })} opts={RANGO_LARGO} />
          <button type="button" onClick={addManual} className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Plus className="h-4 w-4" /> Agregar a mano</button>
        </div>
      </div>

      {/* Tabla acumulada */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Table className="h-4 w-4 text-[var(--accent)]" /> Lote cubicado ({rows.length})</h3>
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowResumen((v) => !v)} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${showResumen ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                <Table className="h-3.5 w-3.5" /> Resumen
              </button>
              <button type="button" onClick={leerTabla} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${readingId ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {readingId ? <><Square className="h-3.5 w-3.5" /> Detener lectura</> : <><Volume2 className="h-3.5 w-3.5" /> Leer tabla</>}
              </button>
              <button type="button" onClick={() => exportarPDF(rowsRef.current, { precioPt: precio, especieGlobal: especie || undefined }).catch(() => setErrMsg("No se pudo generar el PDF."))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">PDF</button>
              <button type="button" onClick={() => exportarExcel(rowsRef.current, { precioPt: precio, especieGlobal: especie || undefined }).catch(() => setErrMsg("No se pudo generar el Excel."))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Excel</button>
              <button type="button" onClick={exportarCSV} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">CSV</button>
              <button type="button" onClick={limpiar} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)]">Vaciar</button>
            </div>
          )}
        </div>

        {/* Resumen por medida — agrupado, para liquidar por tipo de pieza */}
        {showResumen && rows.length > 0 && (
          <div className="mb-3 overflow-x-auto rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)]/40">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="px-3 py-2">Medida (esp × anc × lar)</th><th className="px-3 py-2 text-right">Piezas</th><th className="px-3 py-2 text-right">Pie tablar</th>{precio > 0 && <th className="px-3 py-2 text-right">Valor</th>}
                </tr>
              </thead>
              <tbody>
                {resumen.map((g) => (
                  <tr key={g.label} className="border-t border-[var(--accent)]/20">
                    <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{g.label}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{g.cantidad}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(g.pt)}</td>
                    {precio > 0 && <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--accent)]">S/ {soles(g.pt * precio)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
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
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="px-3 py-2">Cant.</th><th className="px-3 py-2">Espesor</th><th className="px-3 py-2">Ancho</th><th className="px-3 py-2">Largo</th>
                  <th className="px-3 py-2">Especie</th><th className="px-3 py-2 text-right">Pie tablar</th><th className="px-3 py-2 text-right">m³</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const leyendo = readingId === r.id;
                  const editando = editingId === r.id;
                  const rowCls = leyendo
                    ? "bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--accent)] shadow-lg [&_td]:border-b-2 [&_td]:border-b-[var(--accent)]"
                    : editando
                      ? "bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--data-warning-500)]"
                      : lastAdded?.id === r.id ? "bg-[var(--data-success-50)]" : "";
                  return (
                  <tr key={r.id} id={`cub-row-${r.id}`} className={`border-t border-[var(--rule-soft)] transition-colors ${rowCls}`}>
                    <td className="px-3 py-2 font-mono font-bold tabular-nums text-[var(--text-primary)]">{r.cantidad}</td>
                    <td className="px-3 py-2"><Dim v={r.espesor} u={r.uEspesor} onU={(u) => cambiarUnidad(r.id, "uEspesor", u)} /></td>
                    <td className="px-3 py-2"><Dim v={r.ancho} u={r.uAncho} onU={(u) => cambiarUnidad(r.id, "uAncho", u)} /></td>
                    <td className="px-3 py-2"><Dim v={r.largo} u={r.uLargo} onU={(u) => cambiarUnidad(r.id, "uLargo", u)} /></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.especie ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(r.pieTablar)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(r.m3)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
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
                  <td className="px-3 py-2.5" colSpan={5}>Total · {totales.piezas} piezas</td>
                  <td className="px-3 py-2.5 text-right font-mono text-base tabular-nums text-[var(--accent)]">{fmtPt(totales.pt)} PT</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--accent)]">{fmtM3(totales.m3)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
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
          </label>
          <div className="text-right">
            <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Valor del lote</div>
            <div className="font-mono text-2xl font-extrabold tabular-nums text-[var(--accent)]">S/ {soles(valorLote)}</div>
          </div>
        </div>

        {/* Conversiones */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Conv label="Total pie tablar" value={`${fmtPt(totales.pt)} PT`} />
          <Conv label="Total m³" value={`${fmtM3(totales.m3)} m³`} />
          <Conv label="Equivale a" value={`${fmtPt(totales.m3 * PT_POR_M3)} PT`} hint="desde m³" />
          <Conv label="Referencia" value={`1 m³ = ${PT_POR_M3} PT`} hint={<><Scale className="mr-1 inline h-3 w-3" />pie tablar</>} />
        </div>
      </div>
    </div>
  );
}

function Dim({ v, u, onU }: { v: number; u: Unidad; onU: (u: Unidad) => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{v}</span>
      <select value={u} onChange={(e) => onU(e.target.value as Unidad)} className="rounded-md border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1 py-0.5 text-xs font-bold text-[var(--text-secondary)] outline-none">
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

function ManualSelect({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: number[] }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-20 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
        <option value="">—</option>
        {opts.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
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
