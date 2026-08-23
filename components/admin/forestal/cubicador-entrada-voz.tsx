"use client";

/**
 * PanelEntradaVoz — el panel de dictado por voz + carga manual del cubicador
 * de madera. Extraído para poder mostrarlo DOS veces en la misma pantalla
 * (arriba y al final de la tabla, mismo pedido de Brandon 2026-08-17): sin
 * esto, duplicar el JSX a mano habría duplicado también sus bugs.
 *
 * Todo el estado (voz, fijas, especie, carga manual) vive en el padre y se
 * comparte entre las dos instancias — es EL MISMO lote, sólo dos vistas de
 * entrada a la misma cosa. Lo único que cambia por instancia es `grillaId`:
 * la navegación por teclado (`useTecladoGrilla`) y el `<datalist>` de
 * sugerencias se scopean por ese id — con el mismo id en las dos copias, las
 * flechas del teclado saltarían a la copia equivocada.
 */
import {
  Calculator, FileSpreadsheet, Settings, Mic, MicOff, Volume2, VolumeX,
  AlertTriangle, Lock, Unlock, X, Check, RotateCcw, Plus, Layers,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import {
  numerosPorPieza, DIMENSIONES, ESPECIES_MADERA,
  type PiezaCubicada, type MedidasFijas,
} from "@/lib/forestal/cubicacion";
import {
  frasesToText, textToFrases, CONFIG_DEFAULT,
  type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";
import type { TotalPiezas } from "@/lib/forestal/cubicacion-apartados";
import { CeldaNum, useTecladoGrilla } from "./celdas-excel";
import CacaoChartPresent from "@/components/admin/cacao/CacaoChartPresent";

const ESPECIES = ESPECIES_MADERA;
const COL_CANT = 0, COL_ESPESOR = 1, COL_ANCHO = 2, COL_LARGO = 3;
/** La fila de carga es SIEMPRE una sola fila (0) con estas 4 columnas — ver
 *  `totalFilas`/`columnas` en `celdas-excel.tsx`. */
const CARGA_COLUMNAS = [COL_CANT, COL_ESPESOR, COL_ANCHO, COL_LARGO] as const;

export type Manual = { cantidad: string; espesor: string; ancho: string; largo: string };

interface PanelEntradaVozProps {
  grillaId: string;
  onPresent?: () => void;
  onImportar: () => void;
  showAjustes: boolean;
  onToggleAjustes: () => void;
  config: CubicadorConfig;
  onUpdateConfig: (patch: Partial<CubicadorConfig>) => void;
  voices: SpeechSynthesisVoice[];
  onProbarVoz: () => void;
  supported: boolean;
  listening: boolean;
  onToggleListen: () => void;
  paused: boolean;
  fijas: MedidasFijas;
  onAplicarFijas: (next: MedidasFijas) => void;
  especie: string;
  onEspecieChange: (v: string) => void;
  liveGroups: { triples: number[][]; resto: number[] } | null;
  errMsg: string | null;
  lastAdded: PiezaCubicada | null;
  addedFlash: number;
  onDeshacer: () => void;
  fmtPt: (v: number) => string;
  fmtM3: (v: number) => string;
  manual: Manual;
  onManualChange: (v: Manual) => void;
  onConfirmarCarga: (grillaId: string) => void;
  /** Lo que entraría al próximo apartado si se cierra ahora (marcado si hay
   *  algo marcado, si no todo lo pendiente) — mismo dato que ve el panel de
   *  Apartados, mostrado acá para no tener que ir y volver mientras se dicta. */
  apartadoEnCurso: TotalPiezas;
  proximoApartado: number;
  onCerrarApartado: () => void;
  onEscucharApartado: (ids: string[]) => void;
}

export default function PanelEntradaVoz({
  grillaId, onPresent, onImportar, showAjustes, onToggleAjustes,
  config, onUpdateConfig, voices, onProbarVoz,
  supported, listening, onToggleListen, paused,
  fijas, onAplicarFijas, especie, onEspecieChange,
  liveGroups, errMsg, lastAdded, addedFlash, onDeshacer, fmtPt, fmtM3,
  manual, onManualChange, onConfirmarCarga,
  apartadoEnCurso, proximoApartado, onCerrarApartado, onEscucharApartado,
}: PanelEntradaVozProps) {
  const speakOn = config.speak;
  const teclasCarga = useTecladoGrilla({
    grilla: grillaId,
    onConfirmar: () => onConfirmarCarga(grillaId),
    enterSiempreConfirma: true,
    totalFilas: 1,
    columnas: CARGA_COLUMNAS,
  });
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Calculator className="h-4 w-4 text-[var(--accent)]" /> Cubicador de madera por voz
        </CardTitle>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onImportar} title="Importar un Excel/CSV de piezas al lote" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Importar Excel
          </button>
          <button type="button" onClick={onToggleAjustes} aria-pressed={showAjustes} title="Ajustes de voz y comandos" className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${showAjustes ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
            <Settings className="h-3.5 w-3.5" /> Ajustes
          </button>
          {onPresent && <CacaoChartPresent title="Cubicador de madera" onClick={onPresent} />}
        </div>
      </div>

      {/* Apartado en curso — sin abrir el panel de Apartados, para no perder
          el hilo mientras se dicta rápido. Sólo aparece si hay algo pendiente. */}
      {apartadoEnCurso.piezas > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-primary/10 px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Apartado {proximoApartado} sin guardar</div>
            <div className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {apartadoEnCurso.piezas} {apartadoEnCurso.piezas === 1 ? "pieza" : "piezas"} · {fmtPt(apartadoEnCurso.pieTablar)} PT · {fmtM3(apartadoEnCurso.m3)} m³
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEscucharApartado(apartadoEnCurso.ids)}
              title="Dicta en voz espesor · ancho · largo de estas piezas, una por una"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Volume2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCerrarApartado}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white transition hover:brightness-95"
            >
              <Layers className="h-3.5 w-3.5" /> Cerrar apartado {proximoApartado}
            </button>
          </div>
        </div>
      )}

      {/* Panel de AJUSTES — voz (velocidad/tono/qué dicta) + comandos editables */}
      {showAjustes && (
        <div className="mb-4 grid gap-4 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-canvas)] p-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Voz</div>
            <label className="block">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Velocidad: {config.voiceRate.toFixed(1)}×</span>
              <input type="range" min={0.6} max={3} step={0.1} value={config.voiceRate} onChange={(e) => onUpdateConfig({ voiceRate: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Tono / voz</span>
              <select value={config.voiceURI} onChange={(e) => onUpdateConfig({ voiceURI: e.target.value })} className="mt-1 h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
                <option value="">Voz por defecto</option>
                {voices.filter((v) => v.lang.toLowerCase().startsWith("es")).map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onUpdateConfig({ speak: !config.speak })} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${config.speak ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}>
                {config.speak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} El sistema repite {config.speak ? "SÍ" : "NO"}
              </button>
              <button type="button" onClick={onProbarVoz} className="rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Probar voz</button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ avisarRaras: !config.avisarRaras })}
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
              <button type="button" onClick={() => onUpdateConfig({ voiceRate: CONFIG_DEFAULT.voiceRate, voiceURI: "", speak: true, comandos: CONFIG_DEFAULT.comandos })} className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]">Restablecer</button>
            </div>
            <CmdField label="Pausar" value={frasesToText(config.comandos.pausar)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, pausar: textToFrases(v) } })} />
            <CmdField label="Continuar" value={frasesToText(config.comandos.continuar)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, continuar: textToFrases(v) } })} />
            <CmdField label="Borrar último" value={frasesToText(config.comandos.borrarUltimo)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, borrarUltimo: textToFrases(v) } })} />
            <CmdField label="Especie (prefijos)" value={frasesToText(config.comandos.especie)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, especie: textToFrases(v) } })} />
            <CmdField label="Fijar medida" value={frasesToText(config.comandos.fijar)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, fijar: textToFrases(v) } })} />
            <CmdField label="Soltar lo fijo" value={frasesToText(config.comandos.desfijar)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, desfijar: textToFrases(v) } })} />
          </div>
        </div>
      )}

      {supported ? (
        <>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={onToggleListen}
              aria-pressed={listening}
              className={`inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 transition ${listening ? "animate-pulse border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:brightness-95"}`}
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
                  onClick={() => onUpdateConfig({ speak: !config.speak })}
                  aria-pressed={speakOn}
                  title={speakOn ? "La voz repite lo dictado — tocá para silenciar" : "Activar voz que repite lo dictado"}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition ${speakOn ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}
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
                    <span key={d} className="inline-flex items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2 py-1 text-xs font-bold text-[var(--accent)]">
                      <Lock className="h-3 w-3" aria-hidden />
                      {d} fijo: {valor} {unidad}
                      <button
                        type="button"
                        onClick={() => { const n = { ...fijas }; delete n[d]; onAplicarFijas(n); }}
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
                <select value={especie} onChange={(ev) => onEspecieChange(ev.target.value)} className="bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none">
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
              <button type="button" onClick={onDeshacer} className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95">
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

      {/* Carga manual tipo planilla: se tipea, se pasa con → y se cierra con Enter.
          Grid fijo de 2 columnas en celular (predecible, no depende del ancho
          del texto de cada etiqueta como pasaba con flex-wrap) y fila normal
          desde tablet — `sm:` es el mismo corte que usa el resto del DS. */}
      <div data-grilla={grillaId} className="mt-4 border-t border-[var(--rule-soft)] pt-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <CeldaCarga
            label="Cant." col={COL_CANT} valor={manual.cantidad}
            onValor={(v) => onManualChange({ ...manual, cantidad: v })}
            onKeyDown={teclasCarga} ancho="w-full sm:w-16" etiqueta="Cantidad de piezas"
          />
          <CeldaCarga
            label="Espesor (pulg)" col={COL_ESPESOR}
            valor={fijas.espesor != null ? String(fijas.espesor) : manual.espesor}
            onValor={(v) => onManualChange({ ...manual, espesor: v })}
            onKeyDown={teclasCarga} etiqueta="Espesor en pulgadas"
            ancho="w-full sm:w-20"
            fijo={fijas.espesor != null}
            onFijar={() => onAplicarFijas(fijas.espesor != null ? (() => { const n = { ...fijas }; delete n.espesor; return n; })() : { ...fijas, espesor: Number(manual.espesor) || 0 })}
          />
          <CeldaCarga
            label="Ancho (pulg)" col={COL_ANCHO}
            valor={fijas.ancho != null ? String(fijas.ancho) : manual.ancho}
            onValor={(v) => onManualChange({ ...manual, ancho: v })}
            onKeyDown={teclasCarga} etiqueta="Ancho en pulgadas"
            ancho="w-full sm:w-20"
            fijo={fijas.ancho != null}
            onFijar={() => onAplicarFijas(fijas.ancho != null ? (() => { const n = { ...fijas }; delete n.ancho; return n; })() : { ...fijas, ancho: Number(manual.ancho) || 0 })}
          />
          <CeldaCarga
            label="Largo (pies)" col={COL_LARGO}
            valor={fijas.largo != null ? String(fijas.largo) : manual.largo}
            onValor={(v) => onManualChange({ ...manual, largo: v })}
            onKeyDown={teclasCarga} etiqueta="Largo en pies"
            ancho="w-full sm:w-20"
            fijo={fijas.largo != null}
            onFijar={() => onAplicarFijas(fijas.largo != null ? (() => { const n = { ...fijas }; delete n.largo; return n; })() : { ...fijas, largo: Number(manual.largo) || 0 })}
          />
          <button type="button" onClick={() => onConfirmarCarga(grillaId)} className="col-span-2 inline-flex h-11 items-center justify-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] sm:col-auto sm:h-10"><Plus className="h-4 w-4" /> Agregar a mano</button>
          {/* Mismo toggle que arriba, repetido acá: cargando a mano la vista
              suele estar scrolleada lejos del botón del micrófono — apagar la
              voz (más rápido para cargar seguido) tiene que estar a mano
              donde están los ojos, no arriba del todo. */}
          <button
            type="button"
            onClick={() => onUpdateConfig({ speak: !speakOn })}
            aria-pressed={speakOn}
            title={speakOn ? "Apagar la voz que repite cada pieza (más rápido para cargar)" : "Prender la voz que repite cada pieza"}
            className={`col-span-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-xs font-bold transition sm:col-auto sm:h-10 ${speakOn ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
          >
            {speakOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} Voz {speakOn ? "on" : "off"}
          </button>
        </div>
        {/* Sólo tiene sentido con teclado físico — en celular es ruido. */}
        <p className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] sm:flex">
          <span><Tecla>→</Tecla> <Tecla>←</Tecla> cambian de campo</span>
          <span><Tecla>Enter</Tecla> registra la pieza y vuelve al espesor</span>
          <span>el candado deja la medida fija</span>
        </p>
      </div>
    </div>
  );
}

/** Tecla dibujada para las ayudas de teclado. */
export function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}

/**
 * Celda de la fila de carga manual. Se tipea el número directo (antes era un
 * `<select>`, que obligaba a soltar el teclado en cada pieza) — sin el menú
 * flotante de sugerencias (`<datalist>`) que traía antes: en carga rápida
 * era ruido en pantalla, no ayuda.
 *
 * El candado fija esa medida: queda puesta acá y deja de pedirse en el dictado
 * (es el mismo estado que usa el comando de voz).
 */
function CeldaCarga({ label, col, valor, onValor, onKeyDown, etiqueta, ancho, fijo, onFijar }: {
  label: string; col: number; valor: string; onValor: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  etiqueta: string; ancho?: string;
  fijo?: boolean; onFijar?: () => void;
}) {
  return (
    <label className="flex w-full flex-col gap-0.5 sm:w-auto">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <span className="flex items-center gap-1">
        <CeldaNum
          valor={valor}
          onValor={onValor}
          fila={0}
          col={col}
          onKeyDown={onKeyDown}
          etiqueta={etiqueta}
          ancho={ancho ?? "w-full sm:w-20"}
          alto="h-11 sm:h-10"
          className={fijo ? "border-[var(--accent)]" : ""}
        />
        {onFijar && (
          <button
            type="button"
            onClick={onFijar}
            disabled={!fijo && !valor}
            aria-pressed={!!fijo}
            aria-label={fijo ? `Soltar ${label}` : `Fijar ${label}`}
            title={fijo ? "Soltar esta medida" : "Fijar esta medida (no se dicta más)"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition disabled:opacity-30 sm:h-10 sm:w-8 ${fijo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
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
