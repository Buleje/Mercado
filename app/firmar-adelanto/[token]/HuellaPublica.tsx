"use client";

/**
 * Huella del trabajador, sacada con la cámara de SU celular. Es un dato biométrico
 * (Ley 29733): no se envía nada sin la casilla de consentimiento y la foto se
 * achica aquí a JPEG ≤1600 px para que firma + huella entren en un solo POST.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "@buleje/design-system/icons";
import { MAX_BYTES_HUELLA, TEXTO_CONSENTIMIENTO_HUELLA } from "@/lib/adelantos/entregar-tipos";

const LADO_MAXIMO = 1600;

/** Reduce y recomprime hasta quedar bajo `MAX_BYTES_HUELLA`. null = no se pudo leer como imagen. */
export async function comprimirHuella(archivo: File): Promise<Blob | null> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(archivo);
  } catch {
    return null;
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * escala));
  c.height = Math.max(1, Math.round(bmp.height * escala));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  for (const calidad of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", calidad));
    if (blob && blob.size <= MAX_BYTES_HUELLA) return blob;
  }
  return null;
}

export default function HuellaPublica({
  obligatoria,
  huella,
  onHuella,
  consiente,
  onConsiente,
  deshabilitado,
}: {
  obligatoria: boolean;
  huella: Blob | null;
  onHuella: (b: Blob | null) => void;
  consiente: boolean;
  onConsiente: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [vista, setVista] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!huella) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(huella);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [huella]);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setAviso(null);
    setProcesando(true);
    const blob = await comprimirHuella(f);
    setProcesando(false);
    if (!blob) {
      setAviso("No pudimos leer esa foto. Prueba sacando otra, con buena luz.");
      return;
    }
    onHuella(blob);
  }

  return (
    <section aria-labelledby="huella-titulo" className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <h2 id="huella-titulo" className="text-lg font-bold text-[var(--text-primary)]">
        Tu huella {obligatoria ? "(obligatoria)" : "(opcional)"}
      </h2>
      <p className="text-base text-[var(--text-secondary)]">Pon tu dedo con tinta en un papel y sácale una foto, o mánchalo y fotografía tu dedo de cerca.</p>
      <input ref={entrada} type="file" accept="image/*" capture="environment" className="sr-only" onChange={alElegir} disabled={deshabilitado} aria-label="Foto de tu huella" />
      {vista && (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por el optimizador
        <img src={vista} alt="Foto de tu huella" className="max-h-56 w-full rounded-xl border border-[var(--rule-base)] object-contain bg-[var(--surface-sunken)]" />
      )}
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={deshabilitado || procesando}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] disabled:opacity-60"
      >
        {huella ? <RefreshCw className="h-5 w-5" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
        {procesando ? "Preparando la foto…" : huella ? "Sacar otra foto" : "Sacar foto de mi huella"}
      </button>
      {aviso && (
        <p role="alert" className="text-base font-medium text-[var(--data-error-ink,var(--data-error-700))]">
          {aviso}
        </p>
      )}
      {huella && (
        <label className="flex items-start gap-3 text-base text-[var(--text-primary)]">
          <input type="checkbox" checked={consiente} onChange={(e) => onConsiente(e.target.checked)} disabled={deshabilitado} className="mt-1 h-6 w-6 shrink-0 accent-[var(--accent)]" />
          <span>{TEXTO_CONSENTIMIENTO_HUELLA}</span>
        </label>
      )}
    </section>
  );
}
