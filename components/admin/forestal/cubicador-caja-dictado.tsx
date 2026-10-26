"use client";

/**
 * La caja de dictado del cubicador: el micrófono, su estado y las maneras de
 * ENTRAR piezas (importar un Excel, la voz que repite, sus ajustes). Salió de
 * `cubicador-entrada-voz.tsx` (Brandon 24-10, «Cargar compacta»: con las
 * Últimas al lado, el panel pasó de 444 a 840 px a 1280).
 *
 * Lo que cambió al compactarla: el micrófono es un cuadrado de 56 px con el
 * estado al lado, y las cuatro herramientas son íconos con su tooltip en una
 * sola fila (antes, botones con texto que se partían en dos renglones). Los
 * grupos «Entrada» y «Voz» siguen con su rótulo: el ícono solo no dice a qué
 * familia pertenece.
 *
 * La caja entera se tiñe mientras escucha (Brandon 2026-09-14): el estado del
 * micrófono es lo único que hay que ver de lejos, con las manos ocupadas. Sin
 * dictado (cualquier navegador que no sea Chrome) la caja sigue en pie sin el
 * micrófono: importar un Excel y la voz que repite no dependen de él.
 */
import { useId } from "react";
import { ClipboardPaste, FileSpreadsheet, Mic, MicOff, Pause, Play, Settings, Volume2, VolumeX } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { IconAction } from "@/components/admin/shared/module-primitives";
import { numerosPorPieza, DIMENSIONES, type MedidasFijas } from "@/lib/forestal/cubicacion";
import type { CubicadorConfig } from "@/lib/forestal/cubicador-config";
import AjustesDeVoz from "./cubicador-ajustes-voz";

export interface CajaDictadoProps {
  supported: boolean;
  listening: boolean;
  onToggleListen: () => void;
  paused: boolean;
  /** Mismo efecto que la voz «pausa»/«continúa»; el botón sólo se dibuja mientras escucha. */
  onTogglePausa: () => void;
  fijas: MedidasFijas;
  onImportar: () => void;
  /** Abre la tabla para pegar columnas copiadas de un Excel. */
  onPegarExcel: () => void;
  config: CubicadorConfig;
  onUpdateConfig: (patch: Partial<CubicadorConfig>) => void;
  voices: SpeechSynthesisVoice[];
  onProbarVoz: () => void;
  showAjustes: boolean;
  onToggleAjustes: () => void;
  liveGroups: { triples: number[][]; resto: number[] } | null;
  errMsg: string | null;
}

export default function CajaDictado({
  supported, listening, onToggleListen, paused, onTogglePausa, fijas, onImportar, onPegarExcel,
  config, onUpdateConfig, voices, onProbarVoz, showAjustes, onToggleAjustes, liveGroups, errMsg,
}: CajaDictadoProps) {
  const speakOn = config.speak;
  const ajustesId = useId();
  const porPieza = numerosPorPieza(fijas);
  return (
    <section
      aria-label="Dictar o importar piezas"
      className={`rounded-2xl border-2 p-3 transition-colors ${
        listening
          ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10"
          : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {supported && (
          <button
            type="button"
            onClick={onToggleListen}
            aria-pressed={listening}
            aria-label={listening ? "Detener el dictado" : "Empezar a dictar"}
            title={listening ? "Detener el dictado" : "Empezar a dictar"}
            className={`inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 px-5 text-sm font-extrabold transition sm:w-14 sm:px-0 ${
              listening
                ? "animate-pulse border-[var(--data-error-500)] bg-[var(--surface-raised)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] hover:brightness-95 dark:text-[var(--accent)]"
            }`}
          >
            {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            <span className="sm:hidden">{listening ? "Detener" : "Dictar"}</span>
          </button>
        )}

        <div className="min-w-0 flex-1">
          {supported ? (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-base font-extrabold text-[var(--text-primary)]">
                  {paused ? "En pausa — Espacio o di «continúa» para seguir" : listening ? "Escuchando…" : "Toca el micrófono y dicta"}
                </p>
                <InfoTip
                  side="bottom"
                  icono="ayuda"
                  ancho="w-96"
                  title="Cómo se dicta"
                  ariaLabel="Cómo se dicta: comandos por voz y atajos"
                  body={<AyudaDeVoz />}
                />
                {/* Mismo botón que la voz «pausa»/«continúa» (Brandon 2026-09-23).
                    Sólo mientras escucha: pausado no hay nada que pausar dos veces. */}
                {listening && (
                  <button
                    type="button"
                    onClick={onTogglePausa}
                    aria-pressed={paused}
                    title={paused ? "Reanudar el dictado (Espacio)" : "Pausar el dictado (Espacio)"}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
                      paused
                        ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                    {paused ? "Reanudar" : "Pausar"} · <Tecla>Espacio</Tecla>
                  </button>
                )}
              </div>
              <p className="text-sm text-[var(--text-tertiary)]">
                {porPieza === 3 ? (
                  <>Solo los números: <span className="font-bold text-[var(--text-secondary)]">&ldquo;dos seis ocho&rdquo;</span> = 2&Prime;×6&Prime;×8 pies.</>
                ) : (
                  <>Con lo fijo puesto, dicta <b className="text-[var(--text-secondary)]">{porPieza === 1 ? "un número" : `${porPieza} números`}</b> por pieza ({DIMENSIONES.filter((d) => fijas[d] == null).join(" · ")}). Para soltarlo di <b className="text-[var(--text-secondary)]">&ldquo;quita el fijo&rdquo;</b>.</>
                )}
              </p>
            </>
          ) : (
            <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
              Este navegador no soporta dictado por voz (usa Chrome). Puedes importar un Excel o cargar las medidas a mano abajo.
            </p>
          )}

          {/* Las herramientas de entrada: íconos con su tooltip, en dos grupos
              rotulados. Cada grupo se envuelve entero en un celular. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div role="group" aria-label="Entrada" className="flex items-center gap-1.5">
              <Kicker aria-hidden className="font-bold">Entrada</Kicker>
              <IconAction icon={FileSpreadsheet} label="Importar Excel" title="Importar Excel: un Excel/CSV de piezas al lote" onClick={onImportar} />
              {/* Con texto: es la forma más rápida de traer un Excel (Brandon 25-10). */}
              <button
                type="button"
                onClick={onPegarExcel}
                title="Pegar de Excel: copia una o varias columnas de tu Excel y pégalas en una tabla. También sirve Ctrl+V acá, fuera de un campo."
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
              >
                <ClipboardPaste className="h-4 w-4" /> Pegar de Excel
              </button>
            </div>
            <div role="group" aria-label="Voz" className="flex items-center gap-1.5 border-l border-[var(--rule-soft)] pl-3">
              <Kicker aria-hidden className="font-bold">Voz</Kicker>
              <IconAction
                icon={speakOn ? Volume2 : VolumeX}
                label={`Repite: ${speakOn ? "sí" : "no"}`}
                title={speakOn ? "Repite: sí — la voz repite lo dictado. Toca para silenciarla" : "Repite: no — toca para que la voz repita lo dictado"}
                tone={speakOn ? "accent" : "muted"}
                aria-pressed={speakOn}
                onClick={() => onUpdateConfig({ speak: !speakOn })}
              />
              <IconAction icon={Play} label="Probar voz" title="Probar voz: escucha cómo suena con la velocidad y el tono elegidos" onClick={onProbarVoz} />
              <IconAction
                icon={Settings}
                label="Ajustes de voz"
                title="Ajustes de voz y comandos"
                tone={showAjustes ? "accent" : "muted"}
                aria-pressed={showAjustes}
                aria-controls={showAjustes ? ajustesId : undefined}
                onClick={onToggleAjustes}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Velocidad, tono, qué avisa y comandos editables: debajo de la barra
          que lo abre, dentro de la misma caja. */}
      {showAjustes && <AjustesDeVoz id={ajustesId} config={config} onUpdateConfig={onUpdateConfig} voices={voices} />}

      {/* Lo que el micrófono está entendiendo, dentro de la caja de dictado. */}
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
            Cada bloque verde = una pieza (espesor · ancho · largo). Si un cuadrado quedó mal, pausa y edita esa fila con su micrófono.
          </p>
        </div>
      )}

      {errMsg && (
        <p className="mt-3 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          {errMsg}
        </p>
      )}
    </section>
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
 * Lo que antes eran cinco líneas de instrucciones permanentes en el panel de
 * voz: viven detrás del «?» del título. El orden es el del aprendizaje: cómo se
 * dicta una pieza, cómo se dicta MENOS (las medidas fijas) y la chuleta.
 */
function AyudaDeVoz() {
  return (
    <div className="space-y-2.5 text-xs font-normal leading-snug text-[var(--text-secondary)]">
      <p>
        Solo los números: <b className="text-[var(--text-primary)]">&ldquo;dos seis ocho&rdquo;</b>{" "}
        = espesor 2&Prime; · ancho 6&Prime; · largo 8 pies. Di los 3 y una{" "}
        <b className="text-[var(--text-primary)]">micro-pausa</b> los guarda al toque — sigue con la
        siguiente sin esperar.
      </p>
      <p>
        Si una medida se repite toda la jornada, fíjala: di{" "}
        <Cmd>&ldquo;pon fijo el largo a cuatro&rdquo;</Cmd> y después dicta sólo espesor y ancho.
      </p>
      <p>
        Al leer la tabla en voz alta, cada tramo de una especie se anuncia una vez —{" "}
        <Cmd>&ldquo;Continúa con panguana&rdquo;</Cmd>— y después sólo las medidas. Si el mismo
        largo se repite 5 piezas o más, lo dice una vez —<Cmd>&ldquo;largo fijo 7 pies&rdquo;</Cmd>— y
        lee sólo espesor y ancho (se apaga en Ajustes).
      </p>
      <div>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
          Comandos por voz
        </p>
        <ul className="mt-1 space-y-1">
          <li><Cmd>&laquo;pausa&raquo;</Cmd> / <Cmd>&laquo;continúa&raquo;</Cmd> — el micrófono deja de anotar y retoma.</li>
          <li><Tecla>Espacio</Tecla> hace lo mismo sin hablar — y <Tecla>Ctrl</Tecla>+<Tecla>Espacio</Tecla> alterna aunque el cursor esté escribiendo en Observación o Código.</li>
          <li><Cmd>&laquo;elimina el último&raquo;</Cmd> — borra la pieza recién dictada.</li>
          <li><Cmd>&laquo;especie tornillo&raquo;</Cmd> — de acá en adelante todo entra con esa especie.</li>
          <li>
            <Cmd>&laquo;panguana&raquo;</Cmd> — la especie sola también la cambia, para dictar por bloques;{" "}
            <Cmd>&laquo;panguana dos cuatro diez&raquo;</Cmd> la cambia y anota la pieza de una vez.
          </li>
          <li><Cmd>&laquo;dueño Juan&raquo;</Cmd> — lo mismo con el dueño de la madera.</li>
          <li><Cmd>&laquo;pon fijo el largo a cuatro&raquo;</Cmd> / <Cmd>&laquo;quita el fijo&raquo;</Cmd></li>
        </ul>
      </div>
    </div>
  );
}

/** Un comando dictado, en la misma tipografía en todos lados. */
function Cmd({ children }: { children: React.ReactNode }) {
  return <b className="font-mono text-[var(--text-primary)]">{children}</b>;
}
