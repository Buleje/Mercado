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
  AlertTriangle, Lock, Unlock, X, Check, RotateCcw, Plus, Settings2, Trees,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ChevronUp } from "@buleje/design-system/icons";
import {
  numerosPorPieza, DIMENSIONES, ESPECIES_MADERA,
  type PiezaCubicada, type MedidasFijas,
} from "@/lib/forestal/cubicacion";
import {
  frasesToText, textToFrases, CONFIG_DEFAULT,
  type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";
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
  /** Pliega el panel entero. Sin esto, el botón «Ocultar» no se dibuja. */
  onPlegar?: () => void;
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
  /**
   * Las especies que se ofrecen — el catálogo del aserradero (ADR-410). Por
   * defecto las de fábrica, para que un llamador que todavía no lo pasa siga
   * viendo la lista de siempre.
   */
  especies?: readonly string[];
  /** Abre el gestor del catálogo: crear, renombrar, quitar. */
  onAbrirEspecies?: () => void;
  /** De quién es lo que se va a dictar — se aplica a lo que sigue, igual que especie. */
  dueno: string;
  onDuenoChange: (v: string) => void;
  /** Dueños ya usados (lote actual + aprendidos), para el datalist del combobox. */
  duenosConocidos: string[];
  /** Abre el modal de gestión: crear/guardar/borrar/elegir un dueño de la lista. */
  onAbrirDuenos: () => void;
  liveGroups: { triples: number[][]; resto: number[] } | null;
  errMsg: string | null;
  lastAdded: PiezaCubicada | null;
  addedFlash: number;
  onDeshacer: () => void;
  fmtPt: (v: number) => string;
  manual: Manual;
  onManualChange: (v: Manual) => void;
  onConfirmarCarga: (grillaId: string) => void;
}

export default function PanelEntradaVoz({
  grillaId, onPresent, onPlegar, onImportar, showAjustes, onToggleAjustes,
  config, onUpdateConfig, voices, onProbarVoz,
  supported, listening, onToggleListen, paused,
  fijas, onAplicarFijas, especie, onEspecieChange, especies = ESPECIES, onAbrirEspecies,
  dueno, onDuenoChange, duenosConocidos, onAbrirDuenos,
  liveGroups, errMsg, lastAdded, addedFlash, onDeshacer, fmtPt,
  manual, onManualChange, onConfirmarCarga,
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
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Calculator className="h-4 w-4 text-[var(--accent)]" /> Cargar piezas
        </CardTitle>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onImportar} title="Importar un Excel/CSV de piezas al lote" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Importar Excel
          </button>
          {/* El catálogo, con nombre y todo, en la barra: el engranaje pegado al
              selector se ve recién cuando se busca la especie — y la pregunta
              «¿dónde doy de alta una madera nueva?» llega antes que eso. */}
          {onAbrirEspecies && (
            <button type="button" onClick={onAbrirEspecies} title="Especies del aserradero: crear, renombrar, quitar" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]">
              <Trees className="h-3.5 w-3.5" /> Especies
            </button>
          )}
          <button type="button" onClick={onToggleAjustes} aria-pressed={showAjustes} title="Ajustes de voz y comandos" className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${showAjustes ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
            <Settings className="h-3.5 w-3.5" /> Ajustes
          </button>
          {onPresent && <CacaoChartPresent title="Cubicador de madera" onClick={onPresent} />}
          {/* Plegar el panel entero: cargando desde la tabla —o revisando un
              lote ya medido— el micrófono y la fila de carga ocupan media
              pantalla sin usarse. */}
          {onPlegar && (
            <button
              type="button"
              onClick={onPlegar}
              title="Ocultar el panel de carga"
              aria-label="Ocultar el panel de carga"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Ocultar
            </button>
          )}
        </div>
      </div>

      {/* El apartado en curso vivía acá. Se mudó a la fila de acciones del lote
          (Brandon, 2026-09-08): repetía los mismos tres números que el resumen
          de arriba y partía en dos el lugar donde se decide sobre el lote —
          «Cerrar apartado» es una acción del lote, como Guardar o Enviar. */}

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
              <select value={config.voiceURI} onChange={(e) => onUpdateConfig({ voiceURI: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
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
            <CmdField label="Dueño (prefijos)" value={frasesToText(config.comandos.dueno ?? [])} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, dueno: textToFrases(v) } })} />
            <CmdField label="Fijar medida" value={frasesToText(config.comandos.fijar)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, fijar: textToFrases(v) } })} />
            <CmdField label="Soltar lo fijo" value={frasesToText(config.comandos.desfijar)} onChange={(v) => onUpdateConfig({ comandos: { ...config.comandos, desfijar: textToFrases(v) } })} />
          </div>
        </div>
      )}

      {supported ? (
        <>
          {/* ── 1. DICTAR ──────────────────────────────────────────────────
              La caja entera se tiñe mientras escucha. El estado del micrófono
              es lo único que hay que ver de lejos, con las manos ocupadas y el
              celular apoyado: un borde de color a media pantalla se lee, un
              botón chico que cambia de ícono no. */}
          <section
            className={`rounded-2xl border-2 p-4 transition-colors ${
              listening
                ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10"
                : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onToggleListen}
                aria-pressed={listening}
                aria-label={listening ? "Detener el dictado" : "Empezar a dictar"}
                className={`inline-flex h-16 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 px-5 text-sm font-extrabold transition sm:h-20 sm:w-20 sm:px-0 ${
                  listening
                    ? "animate-pulse border-[var(--data-error-500)] bg-[var(--surface-raised)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                    : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] hover:brightness-95 dark:text-[var(--accent)]"
                }`}
              >
                {listening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
                <span className="sm:hidden">{listening ? "Detener" : "Dictar"}</span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-extrabold text-[var(--text-primary)]">
                    {paused
                      ? "En pausa — decí «continúa» para seguir"
                      : listening
                        ? "Escuchando…"
                        : "Tocá el micrófono y dictá"}
                  </p>
                  <InfoTip
                    side="bottom"
                    icono="ayuda"
                    ancho="w-96"
                    title="Cómo se dicta"
                    ariaLabel="Cómo se dicta: comandos por voz y atajos"
                    body={<AyudaDeVoz />}
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({ speak: !config.speak })}
                    aria-pressed={speakOn}
                    title={speakOn ? "La voz repite lo dictado — tocá para silenciar" : "Activar voz que repite lo dictado"}
                    className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[length:var(--ts-2xs)] font-bold transition ${
                      speakOn
                        ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                        : "border-[var(--rule-base)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {speakOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    Voz {speakOn ? "on" : "off"}
                  </button>
                </div>
                <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                  {numerosPorPieza(fijas) === 3 ? (
                    <>Solo los números: <span className="font-bold text-[var(--text-secondary)]">&ldquo;dos seis ocho&rdquo;</span> = 2&Prime; × 6&Prime; × 8 pies.</>
                  ) : (
                    <>Con lo fijo puesto, dictá <b className="text-[var(--text-secondary)]">{numerosPorPieza(fijas) === 1 ? "un número" : `${numerosPorPieza(fijas)} números`}</b> por pieza ({DIMENSIONES.filter((d) => fijas[d] == null).join(" · ")}). Para soltarlo decí <b className="text-[var(--text-secondary)]">&ldquo;quitá el fijo&rdquo;</b>.</>
                  )}
                </p>
              </div>
            </div>

            {/* El caption vive DENTRO de la caja de dictado: es lo que el
                micrófono está entendiendo, no un bloque aparte. */}
            {listening && (
              <div className="mt-3 min-h-[2.75rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
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
                <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  Cada bloque verde = una pieza (espesor · ancho · largo). Si un cuadrado quedó mal, pausá y editá esa fila con su micrófono.
                </p>
              </div>
            )}

            {errMsg && (
              <p className="mt-3 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                {errMsg}
              </p>
            )}
          </section>

          {/* ── 2. CON QUÉ ENTRA ───────────────────────────────────────────
              Especie, dueño y medidas fijas eran tres controles de formas y
              alturas distintas apilados en una columna. Son la misma cosa —lo
              que se le pega a cada pieza que entra— así que van juntos, en
              línea y del mismo alto. */}
          <section className="mt-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
            <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Lo que se le pega a cada pieza
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-[14rem]">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Especie</span>
                <span className="flex h-11 items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pr-1">
                  <select
                    value={especie}
                    onChange={(ev) => onEspecieChange(ev.target.value)}
                    className="h-full min-w-0 flex-1 rounded-xl bg-transparent px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Sin especie</option>
                    {especies.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {/* El catálogo se edita DONDE se usa: mandar a otra pantalla a
                      dar de alta una especie en medio de una carga es perderla. */}
                  {onAbrirEspecies && (
                    <button
                      type="button"
                      onClick={onAbrirEspecies}
                      aria-label="Especies del aserradero: crear, renombrar, quitar"
                      title="Especies del aserradero: crear, renombrar, quitar"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                    >
                      <Settings2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </span>
              </label>

              <label className="flex min-w-[11rem] flex-1 flex-col gap-1 sm:max-w-[16rem]">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Dueño</span>
                <span className="flex h-11 items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5">
                  <input
                    type="text"
                    list="cub-duenos-datalist"
                    value={dueno}
                    onChange={(ev) => onDuenoChange(ev.target.value)}
                    placeholder="Sin dueño"
                    aria-label="Dueño de lo que se va a cubicar"
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)]"
                  />
                  {dueno && (
                    <button
                      type="button"
                      onClick={() => onDuenoChange("")}
                      aria-label="Quitar el dueño"
                      className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onAbrirDuenos}
                    title="Crear, guardar o borrar dueños de la lista"
                    aria-label="Gestionar dueños guardados"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </span>
              </label>

              {/* Las medidas fijas SÓLO ocupan lugar cuando hay alguna: un
                  rótulo «Fijas» vacío enseña a no mirar esa zona. */}
              {Object.keys(fijas).length > 0 && (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Fijas</span>
                  <div className="flex h-11 flex-wrap items-center gap-1.5">
                    {DIMENSIONES.map((d) => {
                      const valor = fijas[d];
                      const unidad = d === "largo" ? "pies" : "pulg";
                      return valor ? (
                        <span key={d} className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          <Lock className="h-3 w-3" aria-hidden />
                          {d} {valor} {unidad}
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
                  </div>
                </div>
              )}
            </div>

            {duenosConocidos.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {duenosConocidos.slice(0, 6).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDuenoChange(d)}
                    aria-pressed={dueno === d}
                    className={`rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition ${
                      dueno === d
                        ? "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </section>

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
        <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          Este navegador no soporta dictado por voz (usá Chrome). Podés cargar las medidas a mano abajo.
        </p>
      )}

      {/* Carga manual tipo planilla: se tipea, se pasa con → y se cierra con Enter.
          Grid fijo de 2 columnas en celular (predecible, no depende del ancho
          del texto de cada etiqueta como pasaba con flex-wrap) y fila normal
          desde tablet — `sm:` es el mismo corte que usa el resto del DS. */}
      <div data-grilla={grillaId} className="mt-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
        <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          O cargala a mano
        </p>
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
          <button type="button" onClick={() => onConfirmarCarga(grillaId)} className="col-span-2 inline-flex h-11 items-center justify-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] sm:col-auto sm:h-10"><Plus className="h-4 w-4" /> Agregar a mano</button>
          {/* Precarga la medida típica del Comercial mínimo (2×8×10, Brandon
              2026-09-01) — NO agrega nada sola: sólo llena los campos para que
              el operario confirme la cantidad real que sacó y la agregue con
              "Agregar a mano", como cualquier otra pieza medida de verdad. Un
              piso automático sin pieza real detrás falsearía el Anexo 04. */}
          <button
            type="button"
            onClick={() => onManualChange({ cantidad: "1", espesor: "2", ancho: "8", largo: "10" })}
            title="Precarga 2×8×10 (Comercial) — confirmá la cantidad real que sacaste y tocá «Agregar a mano»"
            className="col-span-2 inline-flex h-11 items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] sm:col-auto sm:h-10"
          >
            <Plus className="h-4 w-4" /> Comercial mínimo
          </button>
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
        {/* Sólo tiene sentido con teclado físico — en celular es ruido. Y
            plegado: se aprende en el primer minuto y después ocupa una línea
            entera abajo de la fila de carga, todos los días. */}
        {/* `div` y no `p`: el popover del «?» trae una lista, y un `<ul>` dentro
            de un `<p>` es anidado inválido — React lo rompe en hidratación. */}
        <div className="mt-2 hidden items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] sm:flex">
          Se carga con el teclado
          <InfoTip
            side="bottom"
            icono="ayuda"
            title="Cargar con el teclado"
            ariaLabel="Atajos de teclado de la fila de carga"
            body={
              <ul className="space-y-1.5 text-xs font-normal leading-snug text-[var(--text-secondary)]">
                <li><Tecla>→</Tecla> <Tecla>←</Tecla> cambian de campo</li>
                <li><Tecla>Enter</Tecla> registra la pieza y vuelve al espesor</li>
                <li>El candado de cada campo deja esa medida fija: no se vuelve a escribir hasta que lo sueltes.</li>
              </ul>
            }
          />
        </div>
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
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-30 sm:h-10 sm:w-8 ${fijo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
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
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
    </label>
  );
}


/**
 * Lo que antes eran cinco líneas de instrucciones permanentes en el panel de
 * voz. Se leen una vez y después estorban entre el micrófono y la pieza que se
 * está dictando, así que viven detrás del «?» del título.
 *
 * El orden es el del aprendizaje: primero cómo se dicta una pieza, después cómo
 * se dicta MENOS (las medidas fijas), y al final la chuleta de comandos.
 */
function AyudaDeVoz() {
  return (
    <div className="space-y-2.5 text-xs font-normal leading-snug text-[var(--text-secondary)]">
      <p>
        Solo los números: <b className="text-[var(--text-primary)]">&ldquo;dos seis ocho&rdquo;</b>{" "}
        = espesor 2&Prime; · ancho 6&Prime; · largo 8 pies. Decí los 3 y una{" "}
        <b className="text-[var(--text-primary)]">micro-pausa</b> los guarda al toque — seguí con la
        siguiente sin esperar.
      </p>
      <p>
        Si una medida se repite toda la jornada, fijala: decí{" "}
        <Cmd>&ldquo;pon fijo el largo a cuatro&rdquo;</Cmd> y después dictá sólo espesor y ancho.
      </p>
      <div>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
          Comandos por voz
        </p>
        <ul className="mt-1 space-y-1">
          <li><Cmd>&laquo;pausá&raquo;</Cmd> / <Cmd>&laquo;continuá&raquo;</Cmd> — el micrófono deja de anotar y retoma.</li>
          <li><Cmd>&laquo;eliminá el último&raquo;</Cmd> — borra la pieza recién dictada.</li>
          <li><Cmd>&laquo;especie tornillo&raquo;</Cmd> — de acá en adelante todo entra con esa especie.</li>
          <li><Cmd>&laquo;dueño Juan&raquo;</Cmd> — lo mismo con el dueño de la madera.</li>
          <li><Cmd>&laquo;pon fijo el largo a cuatro&raquo;</Cmd> / <Cmd>&laquo;quitá el fijo&raquo;</Cmd></li>
        </ul>
      </div>
    </div>
  );
}

/** Un comando dictado, en la misma tipografía en todos lados. */
function Cmd({ children }: { children: React.ReactNode }) {
  return <b className="font-mono text-[var(--text-primary)]">{children}</b>;
}
