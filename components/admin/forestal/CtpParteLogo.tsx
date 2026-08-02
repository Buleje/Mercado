"use client";

/**
 * CtpParteLogo — el logo del titular, listo para entrar en el papel.
 *
 * El logo no es adorno: la guía y sus anexos salen con el membrete de quien los
 * emite, y hasta ahora todos los documentos del libro llevaban el mismo
 * monograma genérico. Con el logo cargado, el papel que se presenta se reconoce
 * de lejos como del titular.
 *
 * ── Por qué se redimensiona ACÁ y no en el servidor ──────────────────────────
 * Porque el logo viaja como data URL dentro de la fila (ver `directorio.ts`): si
 * se guardara el archivo original, un PNG de cámara de 4 MB entraría a la base y
 * después a cada PDF. Se reduce a `LOGO_MAX_LADO` en un canvas antes de salir
 * del navegador — el archivo pesado nunca se sube.
 *
 * Se conserva la transparencia (PNG) cuando la imagen la trae: un logo con fondo
 * blanco pegado sobre el membrete se nota, y es justo lo que no se quiere.
 */

import { useCallback, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "@buleje/design-system/icons";
import { LOGO_MAX_BYTES, LOGO_MAX_LADO, motivoLogoInvalido } from "@/lib/forestal/directorio";

/** Reduce la imagen y la devuelve como data URL, o tira el motivo si no se pudo. */
async function aDataUrlChico(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LOGO_MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));

  const lienzo = document.createElement("canvas");
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo preparar la imagen.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // PNG primero (conserva el fondo transparente). Si pesa de más, JPEG con
  // fondo blanco: un logo de 200 KB en cada PDF es peor que perder el alfa.
  const png = lienzo.toDataURL("image/png");
  if (png.length <= LOGO_MAX_BYTES) return png;

  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  for (const calidad of [0.9, 0.8, 0.7]) {
    const jpg = lienzo.toDataURL("image/jpeg", calidad);
    if (jpg.length <= LOGO_MAX_BYTES) return jpg;
  }
  throw new Error("La imagen es muy grande incluso reducida. Probá con una más simple.");
}

export default function CtpParteLogo({
  logo,
  onCambio,
}: {
  /** Data URL actual, o vacío. */
  logo: string;
  onCambio: (dataUrl: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegir = useCallback(
    async (archivo: File | undefined) => {
      if (!archivo) return;
      setError(null);
      setCargando(true);
      try {
        const dataUrl = await aDataUrlChico(archivo);
        const motivo = motivoLogoInvalido(dataUrl);
        if (motivo) throw new Error(motivo);
        onCambio(dataUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo leer la imagen.");
      } finally {
        setCargando(false);
        if (input.current) input.current.value = ""; // permite reelegir el mismo archivo
      }
    },
    [onCambio],
  );

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)]">
        {logo ? (
          // Es una data URL propia, no una imagen remota: `next/image` no aporta
          // nada acá y obligaría a permitir el origen.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="Logo del titular" className="max-h-20 max-w-32 object-contain" />
        ) : (
          <span className="px-2 text-center text-xs text-[var(--text-tertiary)]">Sin logo</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={cargando}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-60"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            {logo ? "Cambiar logo" : "Subir logo"}
          </button>
          {logo && (
            <button
              type="button"
              onClick={() => onCambio("")}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--data-error-500)] px-4 text-base font-bold text-[var(--data-error-700)] transition-colors hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-transparent"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Quitar
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          PNG con fondo transparente se ve mejor en el membrete. Se reduce a {LOGO_MAX_LADO} px antes de guardarse.
        </p>
        {error && (
          <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void elegir(e.target.files?.[0])}
      />
    </div>
  );
}
