"use client";

/**
 * Donde se escribe en Buleje IA: texto, fotos (cámara en el celular o galería,
 * hasta 4, con miniatura y «quitar»), dictado y Enter para mandar
 * (Shift+Enter = otra línea). Las fotos se achican al mandar (`fotos.ts`).
 */
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Mic, MicOff, Send, X } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { useVozContinua } from "@/hooks/use-voz-continua";
import { COMANDO_CANCELAR, COMANDOS_ENVIAR, juntar, normalizarComando } from "@/components/admin/chat-ia/dictado";
import { FOTOS_POR_MENSAJE } from "@/lib/ia-proveedores/tipos";
import { revisarAntesDeSumar } from "./fotos";

interface FotoElegida {
  file: File;
  url: string;
}

export function CompositorIa({
  ocupado,
  leeFotos,
  borrador,
  onBorradorUsado,
  onEnviar,
}: {
  ocupado: boolean;
  /** false = el modelo que contesta no lee fotos (se avisa antes de mandar). */
  leeFotos: boolean | null;
  /** Un ejemplo tocado en el chat vacío: entra al campo para completarlo. */
  borrador: string | null;
  onBorradorUsado: () => void;
  onEnviar: (texto: string, fotos: File[]) => Promise<string | null>;
}) {
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<FotoElegida[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  // El dictado se cablea una vez: lee el texto y el envío frescos por refs.
  const textoRef = useRef("");
  textoRef.current = texto;
  const enviarRef = useRef<() => void>(() => {});

  const voz = useVozContinua((dicho) => {
    const limpio = dicho.trim();
    if (!limpio) return;
    const comando = normalizarComando(limpio);
    if (COMANDO_CANCELAR.has(comando)) return setTexto("");
    if (COMANDOS_ENVIAR.has(comando)) return enviarRef.current();
    setTexto((prev) => juntar(prev, limpio));
  });

  useEffect(() => {
    if (borrador === null) return;
    setTexto(borrador);
    onBorradorUsado();
    // Deja marcado el «…» para que lo que escribas lo reemplace.
    requestAnimationFrame(() => {
      const el = campoRef.current;
      if (!el) return;
      el.focus();
      const i = borrador.indexOf("…");
      if (i >= 0) el.setSelectionRange(i, i + 1);
      else el.setSelectionRange(borrador.length, borrador.length);
    });
  }, [borrador, onBorradorUsado]);

  // El campo crece con el texto, hasta ~6 líneas.
  useEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [texto]);

  // Las miniaturas son `blob:`: se sueltan al desmontar.
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const sumar = (lista: FileList | null) => {
    if (!lista) return;
    let hay = fotos.length;
    const nuevas: FotoElegida[] = [];
    for (const file of Array.from(lista)) {
      const motivo = revisarAntesDeSumar(file, hay);
      if (motivo) {
        setAviso(motivo);
        break;
      }
      nuevas.push({ file, url: URL.createObjectURL(file) });
      hay++;
    }
    if (nuevas.length) setFotos((f) => [...f, ...nuevas]);
  };

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    sumar(e.target.files);
    e.target.value = ""; // elegir la misma foto otra vez vuelve a disparar el cambio
  };

  const quitar = (url: string) => {
    URL.revokeObjectURL(url);
    setFotos((f) => f.filter((x) => x.url !== url));
  };

  const enviar = async () => {
    const t = textoRef.current.trim();
    if ((!t && fotos.length === 0) || ocupado || preparando) return;
    voz.detener();
    setAviso(null);
    setPreparando(true);
    const error = await onEnviar(t, fotos.map((f) => f.file));
    setPreparando(false);
    if (error) return setAviso(error);
    fotos.forEach((f) => URL.revokeObjectURL(f.url));
    setFotos([]);
    setTexto("");
    campoRef.current?.focus();
  };
  enviarRef.current = () => void enviar();

  const puedeMandar = (texto.trim().length > 0 || fotos.length > 0) && !ocupado && !preparando;

  return (
    <div className="shrink-0 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-5">
      <div className="mx-auto w-full max-w-3xl space-y-2">
        {fotos.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Fotos para mandar">
            {fotos.map((f) => (
              <li key={f.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura blob: local */}
                <img src={f.url} alt={f.file.name} className="h-16 w-16 rounded-lg border border-[var(--rule-base)] object-cover" />
                <Button
                  variant="secondary"
                  size="xs"
                  aria-label={`Quitar ${f.file.name}`}
                  onClick={() => quitar(f.url)}
                  className="absolute -right-2 -top-2 h-7 w-7 p-0 after:absolute after:-inset-2 after:content-['']"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {fotos.length > 0 && leeFotos === false && (
          <p className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Tu modelo no lee fotos: se guardan en Documentos, pero la IA no las va a leer. Elige uno que sí en Modelos.
          </p>
        )}
        {voz.listening && voz.liveText && <p className="text-sm italic text-[var(--text-secondary)]">{voz.liveText}</p>}
        {(aviso || voz.errMsg) && (
          <p role="alert" className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {aviso ?? voz.errMsg}
          </p>
        )}

        <div className="flex items-end gap-1.5">
          <Button variant="ghost" size="icon" aria-label="Sacar una foto" onClick={() => camaraRef.current?.click()} disabled={fotos.length >= FOTOS_POR_MENSAJE} className="sm:hidden">
            <Camera className="h-5 w-5" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Adjuntar fotos" onClick={() => galeriaRef.current?.click()} disabled={fotos.length >= FOTOS_POR_MENSAJE}>
            <ImagePlus className="h-5 w-5" aria-hidden />
          </Button>
          <label htmlFor="buleje-ia-mensaje" className="sr-only">
            Escribe tu mensaje
          </label>
          <textarea
            id="buleje-ia-mensaje"
            ref={campoRef}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder={voz.listening ? "Te escucho… di «listo» para mandar" : "Escribe o dicta lo que quieres anotar o saber"}
            className="min-h-12 flex-1 resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
          {voz.supported && (
            <Button
              variant={voz.listening ? "danger" : "ghost"}
              size="icon"
              aria-label={voz.listening ? "Dejar de dictar" : "Dictar"}
              aria-pressed={voz.listening}
              onClick={voz.toggle}
            >
              {voz.listening ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
            </Button>
          )}
          <Button variant="accent" size="icon" aria-label="Mandar" onClick={() => void enviar()} disabled={!puedeMandar}>
            {preparando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
          </Button>
        </div>
        <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={alElegir} />
        <input ref={galeriaRef} type="file" accept="image/*" multiple className="hidden" onChange={alElegir} />
      </div>
    </div>
  );
}
