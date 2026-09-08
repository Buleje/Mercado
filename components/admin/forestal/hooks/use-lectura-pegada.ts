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
  /**
   * Volver a leer la MISMA imagen con el modelo de visión (ADR-398).
   *
   * `null` cuando no aplica: no hay imagen guardada, o quien usa el hook no
   * ofrece ese camino. Sube la foto a la nube y cuesta por imagen, así que es
   * un segundo intento explícito y nunca el primero.
   */
  reintentarConIA: (() => Promise<void>) | null;
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
  /** Leer la imagen con el modelo de visión, cuando el OCR local no alcanzó. */
  interpretarConIA?: (imagen: Blob) => Promise<T>;
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
  /** La última imagen leída, para poder reintentarla con el modelo. */
  const ultimaImagen = useRef<Blob | null>(null);
  const [hayImagen, setHayImagen] = useState(false);
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
      ultimaImagen.current = archivo;
      setHayImagen(true);
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

  /**
   * Segundo intento con el modelo de visión, sobre la misma foto.
   *
   * Su resultado pasa por el MISMO `validar`: que lo haya leído un modelo no lo
   * exime de tener que servir.
   */
  const reintentarConIA = useCallback(async () => {
    const imagen = ultimaImagen.current;
    const leer = ref.current.interpretarConIA;
    if (!imagen || !leer) return;
    setError(null);
    setLeyendo(true);
    setProgreso({ etapa: "Leyendo la foto con el modelo", progreso: 0.5 });
    try {
      const leido = await leer(imagen);
      const motivo = ref.current.validar(leido, "captura");
      if (motivo) {
        setError(motivo);
        return;
      }
      ref.current.onLeido(leido, "captura");
    } catch (e) {
      setError(`Tampoco pude leerla con el modelo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLeyendo(false);
      setProgreso(null);
    }
  }, []);

  const limpiar = useCallback(() => {
    setError(null);
    setMiniatura(null);
    ultimaImagen.current = null;
    setHayImagen(false);
  }, []);

  return {
    leyendo,
    progreso,
    miniatura,
    error,
    procesarImagen,
    procesarTexto,
    limpiar,
    reintentarConIA: hayImagen && opts.interpretarConIA ? reintentarConIA : null,
  };
}
