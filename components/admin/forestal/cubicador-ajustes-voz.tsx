"use client";

/**
 * AjustesDeVoz — el panel «Ajustes» del cubicador (Brandon, 2026-09-23: «más
 * opciones de personalización y mejora»).
 *
 * Ordenado por la pregunta que se hace quien dicta con las manos en la pila:
 *   1. ¿Cómo suena? — voz, velocidad, tono, volumen.
 *   2. ¿Qué dice? — el largo fijo al leer, el tip al guardar, las medidas raras.
 *   3. ¿Con qué palabras le hablo? — los comandos.
 * Antes eran dos columnas («Voz» con un botón de medidas raras adentro, y los
 * comandos), y «Restablecer» vivía en la de comandos aunque también tocaba la
 * voz: ahora es un botón del panel entero y devuelve TODO.
 *
 * Salió de `cubicador-entrada-voz.tsx` (771 líneas) para no engordarlo más.
 */
import { useId } from "react";
import { formatNumber } from "@/lib/format";
import {
  CONFIG_DEFAULT, LIMITES_VOZ, esVozDeWindows, frasesToText, textToFrases, velocidadEnWindows,
  type CubicadorConfig,
} from "@/lib/forestal/cubicador-config";

const LEYENDA = "mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent-ink)] dark:text-[var(--accent)]";
const ROTULO = "text-xs font-bold text-[var(--text-secondary)]";
const DESLIZADOR = "mt-1 h-6 w-full cursor-pointer accent-[var(--accent)]";

interface AjustesDeVozProps {
  id: string;
  config: CubicadorConfig;
  onUpdateConfig: (patch: Partial<CubicadorConfig>) => void;
  voices: SpeechSynthesisVoice[];
}

export default function AjustesDeVoz({ id, config, onUpdateConfig, voices }: AjustesDeVozProps) {
  const rate = Number(config.voiceRate) || 1;
  const vozElegida = voices.find((v) => v.voiceURI === config.voiceURI) ?? voices.find((v) => v.default);
  const deWindows = esVozDeWindows(vozElegida, typeof navigator === "undefined" ? "" : navigator.userAgent);
  const cmd = (clave: keyof CubicadorConfig["comandos"]) => ({
    value: frasesToText(config.comandos[clave] ?? []),
    onChange: (v: string) => onUpdateConfig({ comandos: { ...config.comandos, [clave]: textToFrases(v) } }),
  });

  return (
    <div id={id} className="mt-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-4">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-5">
          {/* ── 1. Cómo suena ── */}
          <fieldset className="min-w-0 space-y-3">
            <legend className={LEYENDA}>Cómo suena</legend>
            <label className="block">
              <span className={ROTULO}>Voz</span>
              <select
                value={config.voiceURI}
                onChange={(e) => onUpdateConfig({ voiceURI: e.target.value })}
                className="mt-1 h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Voz por defecto</option>
                {voices.filter((v) => v.lang.toLowerCase().startsWith("es")).map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={ROTULO}>Velocidad: {formatNumber(rate, 1)}×</span>
              <input
                type="range"
                min={LIMITES_VOZ.rate.min}
                max={LIMITES_VOZ.rate.max}
                step={LIMITES_VOZ.rate.paso}
                value={rate}
                aria-valuetext={`${formatNumber(rate, 1)} veces`}
                onChange={(e) => onUpdateConfig({ voiceRate: Number(e.target.value) })}
                className={DESLIZADOR}
              />
              {/* El número del control NO es un multiplicador en Windows: sin
                  esta línea, «3,0×» parecía el triple y el tope real quedaba
                  escondido (ver `velocidadEnWindows`). */}
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                {deWindows
                  ? <>En esta voz de Windows, {formatNumber(rate, 1)}× suena a unas <b className="text-[var(--text-secondary)]">{formatNumber(velocidadEnWindows(rate), 1)} veces</b> lo normal: el motor recién da su tope (unas 3 veces) en 10×.</>
                  : <>Cada motor de voz acelera distinto: escucha el cambio con «Probar voz».</>}
              </span>
            </label>
            <label className="block">
              <span className={ROTULO}>Tono: {formatNumber(config.voicePitch, 1)}</span>
              <input
                type="range"
                min={LIMITES_VOZ.pitch.min}
                max={LIMITES_VOZ.pitch.max}
                step={LIMITES_VOZ.pitch.paso}
                value={config.voicePitch}
                aria-valuetext={config.voicePitch < 1 ? "más grave" : config.voicePitch > 1 ? "más agudo" : "el de la voz"}
                onChange={(e) => onUpdateConfig({ voicePitch: Number(e.target.value) })}
                className={DESLIZADOR}
              />
              <span aria-hidden className="flex justify-between text-xs text-[var(--text-tertiary)]">
                <span>Más grave</span><span>Más agudo</span>
              </span>
            </label>
            <label className="block">
              <span className={ROTULO}>Volumen: {Math.round(config.voiceVolume * 100)} %</span>
              <input
                type="range"
                min={LIMITES_VOZ.volume.min}
                max={LIMITES_VOZ.volume.max}
                step={LIMITES_VOZ.volume.paso}
                value={config.voiceVolume}
                aria-valuetext={`${Math.round(config.voiceVolume * 100)} por ciento`}
                onChange={(e) => onUpdateConfig({ voiceVolume: Number(e.target.value) })}
                className={DESLIZADOR}
              />
            </label>
          </fieldset>

          {/* ── 2. Qué dice ── */}
          <fieldset className="min-w-0 space-y-1">
            <legend className={LEYENDA}>Qué dice</legend>
            <Interruptor
              activo={config.largoFijoAlLeer}
              onCambiar={(v) => onUpdateConfig({ largoFijoAlLeer: v })}
              titulo="Largo fijo al leer"
              detalle="Si el mismo largo se repite 5 piezas o más, lo dice una vez («largo fijo 7 pies») y después lee sólo espesor y ancho."
            />
            <Interruptor
              activo={config.pitidoAlGuardar}
              onCambiar={(v) => onUpdateConfig({ pitidoAlGuardar: v })}
              titulo="Tip al guardar por voz"
              detalle="Con «Repite: no», un sonido corto confirma cada pieza dictada (grave si tiene medidas raras). Al cargar a mano no suena."
            />
            <Interruptor
              activo={config.avisarRaras}
              onCambiar={(v) => onUpdateConfig({ avisarRaras: v })}
              titulo="Avisar medidas raras"
              detalle="Resalta las piezas con medidas fuera de lo común. No las cambia."
            />
          </fieldset>
        </div>

        {/* ── 3. Comandos ── */}
        <fieldset className="min-w-0 space-y-3">
          <legend className={LEYENDA}>Comandos de voz (separados por coma)</legend>
          <CmdField label="Pausar" {...cmd("pausar")} />
          <CmdField label="Continuar" {...cmd("continuar")} />
          <CmdField label="Borrar último" {...cmd("borrarUltimo")} />
          <CmdField label="Especie (prefijos)" {...cmd("especie")} />
          <CmdField label="Dueño (prefijos)" {...cmd("dueno")} />
          <CmdField label="Fijar medida" {...cmd("fijar")} />
          <CmdField label="Soltar lo fijo" {...cmd("desfijar")} />
        </fieldset>
      </div>

      <div className="mt-4 flex justify-end border-t border-[var(--rule-soft)] pt-3">
        <button
          type="button"
          onClick={() => onUpdateConfig({ ...CONFIG_DEFAULT })}
          title="Vuelve la voz, lo que dice y los comandos a como vienen de fábrica"
          className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-bold text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
        >
          Restablecer todo
        </button>
      </div>
    </div>
  );
}

/**
 * Un interruptor con su explicación. El nombre accesible es el título y la
 * explicación va como descripción: un lector de pantalla dice «Largo fijo al
 * leer, interruptor, activado» y después el detalle, no un párrafo de nombre.
 */
function Interruptor({ activo, onCambiar, titulo, detalle }: {
  activo: boolean;
  onCambiar: (v: boolean) => void;
  titulo: string;
  detalle: string;
}) {
  const idTitulo = useId();
  const idDetalle = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-labelledby={idTitulo}
      aria-describedby={idDetalle}
      onClick={() => onCambiar(!activo)}
      className="flex min-h-11 w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--surface-sunken)]"
    >
      {/* Apagado, la pista va en gris medio (no en el gris de las rayas): en
          oscuro el botón blanco-sobre-raya se perdía y no se sabía de qué lado
          estaba. */}
      <span
        aria-hidden
        className={`mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${activo ? "bg-[var(--accent)]" : "bg-[var(--text-tertiary)]"}`}
      >
        <span className={`h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-transform ${activo ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
      </span>
      <span className="min-w-0">
        <span id={idTitulo} className="block text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        <span id={idDetalle} className="block text-xs leading-snug text-[var(--text-tertiary)]">{detalle}</span>
      </span>
    </button>
  );
}

function CmdField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className={ROTULO}>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-9 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
    </label>
  );
}
