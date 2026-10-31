"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { Loader2, Mic, MicOff, Paperclip, Send } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useVozContinua } from "@/hooks/use-voz-continua";
import { AvisoCampo } from "./AvisoCampo";
import { COMANDO_CANCELAR, COMANDOS_ENVIAR, juntar, normalizarComando } from "./dictado";
import { useAudioAdjunto } from "./use-audio-adjunto";
import { button } from "@/components/ui-system/button-variants";

/** Botón cuadrado de 48 px dentro del campo de texto. */
const BOTON_CAMPO =
  "absolute bottom-1 flex h-12 w-12 items-center justify-center rounded-xl transition-all";
const BOTON_CAMPO_NEUTRO =
  button({ variant: "secondary" });

/** Lo que el chat puede pedirle al campo desde afuera. */
export interface CompositorHandle {
  /** Escribe `texto` en el campo SIN mandarlo y deja el cursor al final. */
  poner: (texto: string) => void;
}

/**
 * El campo de escribir: texto, dictado continuo, audio adjunto (Whisper) y
 * enviar/detener. `onEnviar` devuelve `false` si no salió (vacío o ya hay una
 * respuesta en curso): sólo entonces NO se vacía el campo.
 */
export function Compositor({
  streaming,
  onEnviar,
  onDetener,
  ref,
}: {
  streaming: boolean;
  onEnviar: (texto: string) => boolean;
  onDetener: () => void;
  ref?: Ref<CompositorHandle>;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  /* Los ejemplos de «Anota» traen datos de muestra (Juan Pérez, 300 soles):
     mandarlos al tocar armaba una aprobación ficticia. Van al campo para que
     cambies los datos y mandes tú. */
  useImperativeHandle(
    ref,
    () => ({
      poner: (texto: string) => {
        setInput(texto);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(texto.length, texto.length);
        });
      },
    }),
    [],
  );

  const enviar = useCallback(
    (texto: string) => {
      if (onEnviar(texto)) setInput("");
    },
    [onEnviar],
  );

  /**
   * Dictado. El texto reconocido se ACUMULA en el mismo campo que se tipea:
   * así se puede empezar hablando, corregir con el teclado y mandar — que es
   * como se dicta de verdad, con el celular en el bolsillo del pantalón.
   *
   * `inputRef` existe porque el callback del reconocedor se cablea una sola vez
   * y no ve el `input` fresco de cada render: sin él, decir «listo» mandaba
   * siempre la primera frase dictada.
   */
  const inputRef = useRef("");
  const enviarRef = useRef<(t: string) => void>(() => {});
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const voz = useVozContinua((texto) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const comando = normalizarComando(limpio);
    if (COMANDO_CANCELAR.has(comando)) {
      setInput("");
      return;
    }
    if (COMANDOS_ENVIAR.has(comando)) {
      const pendiente = inputRef.current.trim();
      if (pendiente) enviarRef.current(pendiente);
      return;
    }
    setInput((prev) => juntar(prev, limpio));
  });

  /* El puente entre el reconocedor —que se cablea una sola vez— y el envío,
     que se recrea en cada render. */
  useEffect(() => {
    enviarRef.current = (t: string) => {
      voz.detener();
      enviar(t);
    };
  }, [enviar, voz]);

  const alTranscribir = useCallback((texto: string) => {
    setInput((prev) => juntar(prev, texto));
    textareaRef.current?.focus();
  }, []);
  const audio = useAudioAdjunto(alTranscribir);

  // Auto-resize del campo
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    enviar(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía, Shift+Enter nueva línea
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar(input);
    }
  };

  const ocupadoAudio = streaming || audio.transcribiendo;

  return (
    <div className="shrink-0 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <div className="mx-auto max-w-3xl px-3 py-3 sm:px-8">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={streaming}
            aria-label="Escribe o dicta tu mensaje"
            placeholder={
              // Corto a propósito: a 400 px quedan ~150 px entre los tres botones.
              // Los ejemplos de qué decir están en los chips de «Anota».
              streaming
                ? "Esperando respuesta…"
                : voz.listening
                  ? "Escuchando…"
                  : "Pregunta o dicta…"
            }
            className={cn(
              "w-full resize-none rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]",
              "py-4 pl-4 text-base leading-relaxed sm:pl-5",
              voz.supported ? "pr-42" : "pr-28",
              "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
              "transition-all focus:border-[var(--text-primary)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/20",
              streaming && "cursor-wait opacity-60",
            )}
          />
          <input
            ref={archivoRef}
            type="file"
            accept="audio/*,.ogg,.oga,.m4a,.mp3,.wav,.webm"
            // `hidden` y no `sr-only`: con sr-only el input queda en el orden
            // de tabulación y el lector de pantalla anuncia DOS controles para
            // la misma acción. El botón de al lado ya lleva la etiqueta.
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void audio.subirAudio(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => archivoRef.current?.click()}
            disabled={ocupadoAudio}
            title="Subir un audio (el de WhatsApp, una nota de voz)"
            aria-label="Subir un audio"
            className={cn(
              BOTON_CAMPO,
              BOTON_CAMPO_NEUTRO,
              voz.supported ? "right-27" : "right-14",
              ocupadoAudio && "cursor-not-allowed opacity-50",
            )}
          >
            {audio.transcribiendo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>
          {/* Micrófono. Sigue visible mientras el asistente responde —cortar el
              dictado porque el modelo está escribiendo obliga a esperarlo con la
              frase en la cabeza— pero se deshabilita, porque el campo también. */}
          {voz.supported && (
            <button
              type="button"
              onClick={voz.toggle}
              disabled={streaming}
              title={voz.listening ? "Dejar de dictar" : "Dictar (español)"}
              aria-label={voz.listening ? "Dejar de dictar" : "Dictar"}
              aria-pressed={voz.listening}
              className={cn(
                BOTON_CAMPO,
                "right-14",
                voz.listening
                  ? "animate-pulse bg-[var(--data-error-500)] text-white"
                  : BOTON_CAMPO_NEUTRO,
                streaming && "cursor-not-allowed opacity-50",
              )}
            >
              {voz.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          {streaming ? (
            <button
              type="button"
              onClick={onDetener}
              title="Detener la respuesta"
              aria-label="Detener"
              className={cn(
                BOTON_CAMPO,
                "right-1 bg-[var(--data-error-500)] text-white hover:bg-[var(--data-error-500)]/90",
              )}
            >
              <span className="block h-3 w-3 rounded-sm bg-[var(--surface-raised)]" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              title="Enviar (Enter) · Shift+Enter para otra línea"
              aria-label="Enviar"
              className={cn(
                BOTON_CAMPO,
                "right-1",
                // `text-white` sobre `--text-primary` desaparece en oscuro (el
                // fondo se vuelve casi blanco): el token del lienzo invierte con
                // el tema, que es lo que hace el `PrimaryButton` del DS.
                input.trim()
                  ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90"
                  : "cursor-not-allowed bg-[var(--rule-soft)] text-[var(--text-tertiary)]",
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
        {/* Lo que el reconocedor está escuchando AHORA. Sin esto el dictado es a
            ciegas: no se sabe si entendió «veinticinco» o «venticinco» hasta que
            el texto ya está en el campo. */}
        {voz.listening && (
          <p className="mt-2 truncate text-sm text-[var(--text-tertiary)]" aria-live="polite">
            {voz.liveText ? <span className="italic">«{voz.liveText}» · </span> : null}
            Di «listo» para mandarlo o «cancelar» para borrarlo
          </p>
        )}
        {audio.transcribiendo && (
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Transcribiendo el audio…</p>
        )}
        {audio.errorAudio && (
          <AvisoCampo texto={audio.errorAudio} onCerrar={() => audio.setErrorAudio(null)} />
        )}
        {voz.errMsg && <AvisoCampo texto={voz.errMsg} onCerrar={() => voz.setErrMsg(null)} />}
      </div>
    </div>
  );
}
