"use client";

/**
 * La foto de la huella de quien recibe la plata (ADR-491), dentro del mismo
 * formulario: sin modal encima (la pantalla Entregar ya es un modal) y sin
 * subir nada — el padre la manda junto con la firma, a la carpeta PRIVADA.
 *
 * Por qué un `<input type="file" capture="environment">` y no un video en vivo:
 * abre la cámara trasera nativa del celular, que enfoca de cerca (una huella
 * con el video del navegador sale borrosa) y no pide permiso de cámara aparte.
 * En la PC abre el selector de archivos.
 *
 * La foto se achica a JPEG de 1600 px como máximo: firma + huella tienen que
 * entrar en los 4,5 MB de una petición de Vercel. La casilla de consentimiento
 * es obligatoria para guardarla (Ley 29733: la huella es un dato sensible).
 */

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Camera, RotateCcw, Stamp, Trash2 } from "@buleje/design-system/icons";
import { MAX_BYTES_HUELLA, TEXTO_CONSENTIMIENTO_HUELLA } from "@/lib/adelantos/entregar-tipos";
import { logger } from "@/lib/logger";

const LADO_MAXIMO = 1600;

const BOTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--text-secondary)] disabled:opacity-50";

/** La foto como JPEG de ≤1600 px por lado. `null` si el navegador no la pudo leer. */
async function achicarFoto(archivo: File): Promise<Blob | null> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("no se pudo leer la foto"));
      i.src = url;
    });
    const lado = Math.max(img.naturalWidth, img.naturalHeight);
    if (!lado) return null;
    const escala = Math.min(1, LADO_MAXIMO / lado);
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const aJpeg = (calidad: number) => new Promise<Blob | null>((r) => lienzo.toBlob((b) => r(b), "image/jpeg", calidad));
    const foto = await aJpeg(0.85);
    return foto && foto.size > MAX_BYTES_HUELLA ? aJpeg(0.6) : foto;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

export default function CapturaHuella({
  valor,
  onCambio,
  consentido,
  onConsentir,
  obligatoria = false,
  deshabilitado = false,
}: {
  valor: Blob | null;
  onCambio: (foto: Blob | null) => void;
  consentido: boolean;
  onConsentir: (v: boolean) => void;
  /** El enlace la pide: sin la foto no se puede firmar. */
  obligatoria?: boolean;
  deshabilitado?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const idCasilla = useId();
  const [vista, setVista] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!valor) return setVista(null);
    const url = URL.createObjectURL(valor);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [valor]);

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError(null);
    if (!archivo.type.startsWith("image/")) {
      setError("Eso no es una foto: toma la foto de la huella con la cámara.");
      return;
    }
    setLeyendo(true);
    try {
      const foto = await achicarFoto(archivo);
      if (!foto) throw new Error("sin foto");
      if (foto.size > MAX_BYTES_HUELLA) {
        setError("La foto pesa demasiado: tómala otra vez, más de cerca.");
        return;
      }
      onCambio(foto);
    } catch (e) {
      logger.warn("[adelantos] la foto de la huella no se pudo leer", { error: String(e) });
      setError("No pude leer esa foto: tómala otra vez.");
    } finally {
      setLeyendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const tomar = () => inputRef.current?.click();

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-[var(--rule-base)] p-3" data-captura-huella>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void elegir(e.target.files?.[0])}
        data-huella-input
      />
      {valor && vista ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- es un blob local, no una imagen del sitio */}
          <img src={vista} alt="Foto de la huella" className="h-28 w-24 shrink-0 rounded-xl bg-[var(--surface-sunken)] object-cover" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Huella lista <span className="font-normal text-[var(--text-tertiary)]">· {kb(valor.size)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={tomar} disabled={deshabilitado || leyendo} className={BOTON}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Tomar otra
              </button>
              <button
                type="button"
                onClick={() => {
                  onCambio(null);
                  onConsentir(false);
                }}
                disabled={deshabilitado || leyendo}
                className={BOTON}
                aria-label="Quitar la foto de la huella"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Quitar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <button type="button" onClick={tomar} disabled={deshabilitado || leyendo} className={`${BOTON} w-full`} data-agregar-huella>
            {leyendo ? <Stamp className="h-5 w-5 animate-pulse" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
            {leyendo ? "Leyendo la foto…" : obligatoria ? "Tomar la foto de la huella" : "Agregar huella (opcional)"}
          </button>
          <p className="text-sm text-[var(--text-tertiary)]">De cerca y con luz: el dedo, o su huella entintada en un papel.</p>
        </div>
      )}

      {valor && (
        <label htmlFor={idCasilla} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-3">
          <input
            id={idCasilla}
            type="checkbox"
            checked={consentido}
            onChange={(e) => onConsentir(e.target.checked)}
            disabled={deshabilitado}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            data-consentimiento-huella
          />
          <span className="text-sm text-[var(--text-primary)]">{TEXTO_CONSENTIMIENTO_HUELLA}</span>
        </label>
      )}
      {valor && !consentido && (
        <p role="status" className="text-sm font-semibold text-[var(--data-warning-ink)]">
          Sin marcar la casilla, la huella no se guarda.
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-[var(--data-error)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
