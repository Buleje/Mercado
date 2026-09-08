"use client";

/**
 * Leer lo que se pega: una imagen (OCR en el navegador) o un texto (ADR-397/398).
 *
 * Es la parte común de «Traer del SNIFFS» en sus tres puertas —el paso 1 del
 * lote, el formulario de paquetes y la importación de programaciones—: el
 * Ctrl+V global, el arrastrar, el «Elegir imagen», el progreso del OCR y el
 * error. Qué se interpreta y qué se hace con lo leído lo decide cada puerta.
 *
 * Ctrl+V: una imagen se lee siempre (ningún campo la recibe). Un texto sólo si
 * `parece()` la pantalla esperada y, con el foco en un campo, sólo si además es
 * una tabla (tabs o varias líneas) — pegar una palabra en una observación no
 * dispara nada.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { leerTextoDeImagen, liberarOcr, type ProgresoOcr } from "@/lib/ocr/ocr-navegador";

export type FuenteLectura = "captura" | "texto";

export interface LecturaPegada {
  leyendo: boolean;
  progreso: ProgresoOcr | null;
  /** Object URL de la imagen leída, para mostrarla en chico. */
  miniatura: string | null;
  error: string | null;
  procesarImagen: (archivo: Blob) => Promise<void>;
  procesarTexto: (texto: string, fuente: FuenteLectura) => void;
  /** Vuelve al estado inicial: sin miniatura ni error. */
  limpiar: () => void;
}

export function useLecturaPegada<T>(opts: {
  interpretar: (texto: string) => T;
  /** Un mensaje = lo leído no sirve, y eso se dice. `null` = sirve. */
  validar: (leido: T, fuente: FuenteLectura) => string | null;
  parece: (texto: string) => boolean;
  onLeido: (leido: T, fuente: FuenteLectura) => void;
  /** `false` apaga el Ctrl+V global (otra puerta abierta encima). */
  escuchar?: boolean;
}): LecturaPegada {
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoOcr | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Las opciones cambian en cada render; el listener no tiene por qué. */
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => () => { if (miniatura) URL.revokeObjectURL(miniatura); }, [miniatura]);
  /* El worker del OCR pesa ~50 MB: se suelta con quien lo usó. */
  useEffect(() => () => { void liberarOcr(); }, []);

  const procesarTexto = useCallback((texto: string, fuente: FuenteLectura) => {
    const leido = ref.current.interpretar(texto);
    const motivo = ref.current.validar(leido, fuente);
    if (motivo) {
      setError(motivo);
      return;
    }
    setError(null);
    ref.current.onLeido(leido, fuente);
  }, []);

  const procesarImagen = useCallback(
    async (archivo: Blob) => {
      setError(null);
      setMiniatura(URL.createObjectURL(archivo));
      setLeyendo(true);
      setProgreso({ etapa: "Preparando la imagen", progreso: 0 });
      try {
        const { texto } = await leerTextoDeImagen(archivo, setProgreso);
        procesarTexto(texto, "captura");
      } catch (e) {
        setError(
          `No pude leer la captura (${e instanceof Error ? e.message : String(e)}). ` +
            "Copiá el texto de la tabla en el SNIFFS (seleccionarla y Ctrl+C) y pegalo acá.",
        );
      } finally {
        setLeyendo(false);
        setProgreso(null);
      }
    },
    [procesarTexto],
  );

  const escuchar = opts.escuchar ?? true;
  useEffect(() => {
    if (!escuchar) return;
    const alPegar = (e: ClipboardEvent) => {
      if (leyendo) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const imagen = Array.from(dt.items)
        .find((it) => it.kind === "file" && it.type.startsWith("image/"))
        ?.getAsFile();
      if (imagen) {
        e.preventDefault();
        void procesarImagen(imagen);
        return;
      }
      const texto = dt.getData("text/plain");
      if (!texto || !ref.current.parece(texto)) return;
      const t = e.target as HTMLElement | null;
      const enCampo =
        t != null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (enCampo && !/[\t\n]/.test(texto.trim())) return;
      e.preventDefault();
      procesarTexto(texto, "texto");
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [escuchar, leyendo, procesarImagen, procesarTexto]);

  const limpiar = useCallback(() => {
    setError(null);
    setMiniatura(null);
  }, []);

  return { leyendo, progreso, miniatura, error, procesarImagen, procesarTexto, limpiar };
}
