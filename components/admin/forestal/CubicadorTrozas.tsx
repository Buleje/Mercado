"use client";

/**
 * CubicadorTrozas — cubica madera ROLLIZA en patio, por voz o a mano, y
 * compara contra lo que declara la GTF antes de firmar el ingreso.
 *
 * Dictado continuo en tríos «D1 · D2 · largo» (40 45 3.5 = diámetros en cm,
 * largo en m); Smalian por troza (lib/forestal/cubicacion-trozas). Una troza
 * con medidas raras (largo >15 m, diámetro <10 cm) entra RESALTADA, nunca se
 * corrige sola. Persiste por tenant en localStorage; sin DB — el ingreso
 * legal se registra en el Libro CTP con su GTF.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check, Mic, MicOff, Plus, RotateCcw, Ruler, Scale, Table, Trash2, AlertTriangle, Upload,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { detectarComando, ESPECIES_MADERA, mejoresNumeros, PT_POR_M3 } from "@/lib/forestal/cubicacion";
import {
  compararConGtf, cubicarTroza, partirEnTrozas, totalesTrozas, type TrozaCubicada,
} from "@/lib/forestal/cubicacion-trozas";
import type { TrozaImportada } from "@/lib/forestal/cubicacion-trozas-import";
import { loadConfig } from "@/lib/forestal/cubicador-config";
import { useVozContinua } from "./hooks/useVozContinua";
import ImportarTrozasModal from "./ImportarTrozasModal";

interface Fila extends TrozaCubicada {
  sospechosa?: boolean;
}

const fmtM3 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const storageKey = () => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-cubicacion-trozas-${slug}`;
};
const saveLocal = (rows: Fila[]) => { try { localStorage.setItem(storageKey(), JSON.stringify(rows)); } catch { /* quota */ } };

/** Repite en voz lo dictado, con la MISMA config del cubicador de aserrada. */
function hablar(texto: string) {
  try {
    const cfg = loadConfig();
    if (!cfg.speak) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-PE";
    u.rate = cfg.voiceRate;
    if (cfg.voiceURI) { const v = synth.getVoices().find((x) => x.voiceURI === cfg.voiceURI); if (v) u.voice = v; }
    synth.speak(u);
  } catch { /* TTS no disponible */ }
}

export default function CubicadorTrozas() {
  const [rows, setRows] = useState<Fila[]>([]);
  const [especie, setEspecie] = useState("");
  const [lastAdded, setLastAdded] = useState<Fila | null>(null);
  const [manual, setManual] = useState({ d1: "", d2: "", largo: "" });
  const [gtfM3, setGtfM3] = useState("");
  const [paused, setPaused] = useState(false);
  const [importando, setImportando] = useState(false);
  const idRef = useRef(0);
  const carryRef = useRef<number[]>([]);
  const pausedRef = useRef(false);
  const especieRef = useRef(especie);
  useEffect(() => { especieRef.current = especie; }, [especie]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) setRows(JSON.parse(raw) as Fila[]);
      const g = localStorage.getItem(`${storageKey()}-gtf`);
      if (g) setGtfM3(g);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-gtf`, gtfM3); } catch { /* ignore */ } }, [gtfM3]);

  const addTroza = (d1: number, d2: number, largo: number, sospechosa?: boolean) => {
    const fila: Fila = {
      id: `t-${Date.now()}-${idRef.current++}`,
      d1, d2, largo,
      especie: especieRef.current || undefined,
      m3: cubicarTroza(d1, largo, d2),
      sospechosa,
    };
    setRows((prev) => { const next = [...prev, fila]; saveLocal(next); return next; });
    setLastAdded(fila);
    return fila;
  };

  const voz = useVozContinua((texto) => {
    // Comandos compartidos con el cubicador de aserrada (misma config).
    const cmd = detectarComando(texto, loadConfig().comandos);
    if (cmd) {
      if (cmd.tipo === "pausar") { pausedRef.current = true; setPaused(true); carryRef.current = []; hablar("en pausa"); }
      else if (cmd.tipo === "continuar") { pausedRef.current = false; setPaused(false); carryRef.current = []; hablar("sigo"); }
      else if (cmd.tipo === "borrar-ultimo") {
        setRows((prev) => { if (!prev.length) return prev; const next = prev.slice(0, -1); saveLocal(next); return next; });
        setLastAdded(null); carryRef.current = []; hablar("borrado");
      } else if (cmd.tipo === "especie") {
        const found = ESPECIES_MADERA.find((s) => sinAcentos(s).startsWith(cmd.palabra));
        if (found) { setEspecie(found); hablar(found); }
      }
      return;
    }
    if (pausedRef.current) return;
    const nums = mejoresNumeros([texto]);
    const { trozas, resto } = partirEnTrozas([...carryRef.current, ...nums]);
    carryRef.current = resto;
    let ultima: Fila | null = null;
    for (const t of trozas) ultima = addTroza(t.d1, t.d2, t.largo, t.sospechosa);
    if (ultima) {
      hablar(trozas.length === 1 ? `${ultima.d1}, ${ultima.d2}, ${ultima.largo}` : `${trozas.length} trozas`);
    }
  });

  const persist = (next: Fila[]) => { setRows(next); saveLocal(next); };
  const borrar = (id: string) => { persist(rows.filter((r) => r.id !== id)); if (lastAdded?.id === id) setLastAdded(null); };
  const deshacer = () => { if (lastAdded) borrar(lastAdded.id); };
  const limpiar = () => { persist([]); setLastAdded(null); carryRef.current = []; };
  /** El import SUMA al patio, nunca reemplaza (mismo criterio que la aserrada). */
  const agregarImportadas = (nuevas: TrozaImportada[]) => {
    persist([...rows, ...nuevas.map(({ filaOrigen: _filaOrigen, ...t }) => t)]);
  };

  const editar = (id: string, campo: "d1" | "d2" | "largo", valor: number) => {
    persist(rows.map((r) => {
      if (r.id !== id) return r;
      const upd = { ...r, [campo]: valor };
      return { ...upd, m3: cubicarTroza(upd.d1, upd.largo, upd.d2), sospechosa: undefined };
    }));
  };

  const addManual = () => {
    const d1 = Number(manual.d1), l = Number(manual.largo);
    const d2 = Number(manual.d2) || d1;
    if (!(d1 > 0 && l > 0)) return;
    addTroza(d1, d2, l);
    setManual({ d1: "", d2: "", largo: "" });
  };

  const totales = useMemo(() => totalesTrozas(rows), [rows]);
  const cmpGtf = useMemo(() => compararConGtf(totales.m3, Number(gtfM3) || 0), [totales.m3, gtfM3]);
  const sospechosas = rows.filter((r) => r.sospechosa).length;
  const especiesActuales = useMemo(
    () => [...new Set(rows.map((r) => r.especie?.trim()).filter((e): e is string => !!e))],
    [rows],
  );

  // Caption en vivo agrupado en tríos, como el cubicador de aserrada.
  const liveGroups = useMemo(() => {
    if (!voz.listening || !voz.liveText) return null;
    const nums = mejoresNumeros([voz.liveText]);
    const triples: number[][] = [];
    let i = 0;
    for (; i + 3 <= nums.length; i += 3) triples.push(nums.slice(i, i + 3));
    return { triples, resto: nums.slice(i) };
  }, [voz.listening, voz.liveText]);

  const exportarCSV = () => {
    const head = ["D1cm", "D2cm", "LargoM", "Especie", "m3"];
    const lines = rows.map((r) => [r.d1, r.d2, r.largo, r.especie ?? "", r.m3].join(","));
    const csv = "﻿" + [head.join(","), ...lines, ["TOTAL", "", "", "", Number(totales.m3).toFixed(4)].join(",")].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `trozas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Panel de voz */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle as="h3" className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Ruler className="h-4 w-4 text-[var(--accent)]" /> Cubicador de trozas (rolliza · Smalian)
        </CardTitle>
        {voz.supported ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={voz.toggle}
              aria-pressed={voz.listening}
              className={`inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 transition ${voz.listening ? "animate-pulse border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]" : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:brightness-95"}`}
            >
              {voz.listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
            </button>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {paused ? "⏸ En pausa — decí «continúa» para seguir" : voz.listening ? "Escuchando… dictá cada troza y una micro-pausa la guarda" : "Tocá el micrófono y dictá las trozas"}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                Tres números por troza: <span className="font-semibold text-[var(--text-secondary)]">&ldquo;cuarenta cuarenta y cinco tres punto cinco&rdquo;</span> = Ø menor 40 cm · Ø mayor 45 cm · largo 3.5 m. Con una sola medida de diámetro, repetila.
              </p>
              <label className="mt-2 inline-flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Especie</span>
                <select value={especie} onChange={(ev) => setEspecie(ev.target.value)} className="bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none">
                  <option value="">Sin especie</option>
                  {ESPECIES_MADERA.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {voz.listening && (
                <div className="mt-2 min-h-[2.75rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                  {liveGroups && (liveGroups.triples.length > 0 || liveGroups.resto.length > 0) ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {liveGroups.triples.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-md bg-[var(--data-success-100)] px-2 py-0.5 font-mono text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
                          {t.join(" · ")}
                        </span>
                      ))}
                      {liveGroups.resto.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--data-warning-500)] px-2 py-0.5 font-mono text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                          {liveGroups.resto.join(" · ")}<span className="ml-1 opacity-60">· falta{liveGroups.resto.length === 2 ? " 1" : "n 2"}</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--text-tertiary)]">escuchando…</div>
                  )}
                </div>
              )}
              {voz.errMsg && (
                <p className="mt-2 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                  {voz.errMsg}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            Este navegador no soporta dictado por voz (usá Chrome). Podés cargar las trozas a mano abajo.
          </p>
        )}

        {lastAdded && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2 dark:bg-[var(--data-success-500)]/12">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <Check className="h-4 w-4" />
              Agregada: Ø{lastAdded.d1}/{lastAdded.d2} cm × {lastAdded.largo} m{lastAdded.especie ? ` · ${lastAdded.especie}` : ""}
              <span className="font-mono">= {fmtM3(lastAdded.m3)} m³</span>
            </span>
            <button type="button" onClick={deshacer} className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95 dark:text-[var(--data-success-500)]">
              <RotateCcw className="h-3.5 w-3.5" /> Deshacer
            </button>
          </div>
        )}

        {/* Carga manual */}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--rule-soft)] pt-3">
          <CampoNum label="Ø menor (cm)" value={manual.d1} onChange={(v) => setManual({ ...manual, d1: v })} />
          <CampoNum label="Ø mayor (cm)" value={manual.d2} onChange={(v) => setManual({ ...manual, d2: v })} placeholder="= menor" />
          <CampoNum label="Largo (m)" value={manual.largo} onChange={(v) => setManual({ ...manual, largo: v })} />
          <button type="button" onClick={addManual} className="inline-flex h-10 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Plus className="h-4 w-4" /> Agregar a mano
          </button>
        </div>
      </div>

      {/* Tabla + comparación con la GTF */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Table className="h-4 w-4 text-[var(--accent)]" /> Trozas del patio ({rows.length})
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setImportando(true)} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]">
              <Upload className="h-3.5 w-3.5" /> Importar
            </button>
            {rows.length > 0 && (
              <>
                <button type="button" onClick={exportarCSV} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">CSV</button>
                <button type="button" onClick={limpiar} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/12">Vaciar</button>
              </>
            )}
          </div>
        </div>

        {sospechosas > 0 && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-3.5 w-3.5" />
            {sospechosas === 1 ? "Hay una troza con medidas raras" : `Hay ${sospechosas} trozas con medidas raras`} (largo &gt;15 m o Ø &lt;10 cm): revisá las filas resaltadas — corregí el valor y la marca se va.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no cubicaste trozas. Dictá o cargá la primera.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="px-3 py-2">#</th><th className="px-3 py-2">Ø menor (cm)</th><th className="px-3 py-2">Ø mayor (cm)</th>
                  <th className="px-3 py-2">Largo (m)</th><th className="px-3 py-2">Especie</th><th className="px-3 py-2 text-right">m³</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={`border-t border-[var(--rule-soft)] ${r.sospechosa ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : lastAdded?.id === r.id ? "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10" : ""}`}>
                    <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{i + 1}</td>
                    <td className="px-3 py-2"><CeldaNum value={r.d1} onChange={(v) => editar(r.id, "d1", v)} /></td>
                    <td className="px-3 py-2"><CeldaNum value={r.d2} onChange={(v) => editar(r.id, "d2", v)} /></td>
                    <td className="px-3 py-2"><CeldaNum value={r.largo} onChange={(v) => editar(r.id, "largo", v)} paso={0.1} /></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.especie ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(r.m3)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => borrar(r.id)} aria-label={`Borrar troza ${i + 1}`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--rule-base)] bg-primary/10 font-bold text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])]">
                  <td className="px-3 py-2.5" colSpan={5}>Total · {totales.trozas} {totales.trozas === 1 ? "troza" : "trozas"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-base tabular-nums text-[var(--accent)]">{fmtM3(totales.m3)} m³</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Contra la guía: ¿lo que llegó coincide con lo declarado? */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3">
          <label className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">Según la GTF</span>
            <input type="number" inputMode="decimal" value={gtfM3} onChange={(e) => setGtfM3(e.target.value)} placeholder="0.000" className="h-9 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            <span className="text-sm text-[var(--text-tertiary)]">m³ declarados</span>
          </label>
          {cmpGtf ? (
            <div className="text-right">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Patio vs. guía</div>
              <div className={`font-mono text-xl font-extrabold tabular-nums ${Math.abs(cmpGtf.deltaPct) <= 2 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : Math.abs(cmpGtf.deltaPct) <= 5 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>
                {cmpGtf.deltaM3 >= 0 ? "+" : ""}{fmtM3(cmpGtf.deltaM3)} m³ ({cmpGtf.deltaPct >= 0 ? "+" : ""}{cmpGtf.deltaPct}%)
              </div>
              <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{cmpGtf.deltaM3 < 0 ? "llegó menos de lo declarado" : "llegó más de lo declarado"}</div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">Poné los m³ de la guía para comparar con lo cubicado.</p>
          )}
        </div>

        {/* Referencias */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Ref label="Total rolliza" value={`${fmtM3(totales.m3)} m³`} />
          <Ref label="Equivalente volumétrico" value={`${(totales.m3 * PT_POR_M3).toLocaleString("es-PE", { maximumFractionDigits: 0 })} PT`} hint="1 m³ = 423.78 PT" />
          <Ref label="Fórmula" value="Smalian" hint="promedio de áreas × largo" />
        </div>
      </div>

      {importando && (
        <ImportarTrozasModal
          filasActuales={rows.length}
          especiesActuales={especiesActuales}
          onAgregar={agregarImportadas}
          onCerrar={() => setImportando(false)}
        />
      )}
    </div>
  );
}

function CampoNum({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-28 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
    </label>
  );
}

function CeldaNum({ value, onChange, paso = 1 }: { value: number; onChange: (v: number) => void; paso?: number }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={paso}
      value={value}
      onChange={(e) => { const n = Number(e.target.value); if (n > 0) onChange(n); }}
      className="h-8 w-20 rounded-lg border border-[var(--rule-base)] bg-transparent px-2 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
    />
  );
}

function Ref({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{value}</div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
