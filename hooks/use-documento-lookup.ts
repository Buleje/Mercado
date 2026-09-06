"use client";

/**
 * Un número, los datos — DNI a RENIEC y RUC a SUNAT (ADR-367).
 *
 * El endpoint `/api/documento/lookup` ya existía (admin-only y con rate limit,
 * porque los padrones cobran por consulta) y **ninguna pantalla lo usaba**. Este
 * hook es su puerta: se le pasa el número mientras se tipea y consulta solo
 * cuando el número ya es consultable — 8 dígitos o un RUC de 11 que empieza como
 * corresponde—, una sola vez por número.
 *
 * No decide qué hacer con el resultado: eso es del formulario, que sabe cuáles
 * de sus campos están vacíos y cuáles escribió una persona.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizarNumero, tipoDeDocumento, type ResultadoDocumento } from "@/lib/documento/tipos";

export interface EstadoPadron {
  consultando: boolean;
  resultado: ResultadoDocumento | null;
  /** El número que produjo `resultado` — para no re-aplicar el de otro. */
  numeroConsultado: string;
  /** Fuerza la consulta (el botón «traer de SUNAT», cuando ya se consultó). */
  consultar: (numero: string) => void;
  limpiar: () => void;
}

/** Lo que tarda alguien en terminar de tipear un RUC. */
const ESPERA_MS = 500;

export function useDocumentoLookup(numero: string, opts: { auto?: boolean } = {}): EstadoPadron {
  const auto = opts.auto ?? true;
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDocumento | null>(null);
  const [numeroConsultado, setNumeroConsultado] = useState("");
  /** Números ya consultados en esta sesión del formulario: el padrón cobra. */
  const pedidos = useRef(new Map<string, ResultadoDocumento>());
  /**
   * ⚠️ Se vuelve a poner en `true` al montar, no sólo en `false` al desmontar.
   *
   * En desarrollo React monta, limpia y re-monta cada efecto: con un cleanup que
   * sólo apaga la bandera, la segunda vida del componente nacía «muerta» y
   * **descartaba todas las respuestas del padrón** — el fetch salía, volvía 200 y
   * el formulario no mostraba nada. Medido en el navegador con captura de red.
   */
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const consultar = useCallback(async (crudo: string) => {
    const n = normalizarNumero(crudo);
    if (!tipoDeDocumento(n)) return;
    const cacheado = pedidos.current.get(n);
    if (cacheado) {
      setResultado(cacheado);
      setNumeroConsultado(n);
      return;
    }
    setConsultando(true);
    try {
      const r = await fetch(`/api/documento/lookup?numero=${encodeURIComponent(n)}`, { credentials: "include" });
      /* Un cuerpo ilegible se trata como «no encontrado» con motivo: el
         endpoint responde 200 incluso al fallar, así que acá sólo queda el caso
         de que ni siquiera sea JSON. */
      const j = (await r.json().catch((err: unknown) => {
        console.warn("[documento-lookup] respuesta ilegible", err);
        return null;
      })) as ResultadoDocumento | null;
      const valor: ResultadoDocumento = j ?? {
        encontrado: false,
        numero: n,
        motivo: "No se pudo consultar el padrón. Cargá los datos a mano.",
      };
      pedidos.current.set(n, valor);
      if (!vivo.current) return;
      setResultado(valor);
      setNumeroConsultado(n);
    } catch (e) {
      if (!vivo.current) return;
      setResultado({
        encontrado: false,
        numero: n,
        motivo: `No se pudo consultar el padrón (${e instanceof Error ? e.message : String(e)}). Cargá los datos a mano.`,
      });
      setNumeroConsultado(n);
    } finally {
      if (vivo.current) setConsultando(false);
    }
  }, []);

  /* Mientras se tipea: se espera medio segundo y se consulta una sola vez por
     número. Un `useEffect` sin la espera dispararía una consulta por tecla. */
  useEffect(() => {
    if (!auto) return;
    const n = normalizarNumero(numero);
    if (!tipoDeDocumento(n) || n === numeroConsultado) return;
    const t = setTimeout(() => void consultar(n), ESPERA_MS);
    return () => clearTimeout(t);
  }, [numero, auto, consultar, numeroConsultado]);

  const limpiar = useCallback(() => {
    setResultado(null);
    setNumeroConsultado("");
  }, []);

  return { consultando, resultado, numeroConsultado, consultar: (n) => void consultar(n), limpiar };
}
