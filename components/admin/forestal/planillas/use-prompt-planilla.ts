"use client";

/**
 * El prompt de UNA planilla en su ventana: el vigente (el del negocio si lo
 * guardó, si no el de fábrica), editarlo, guardarlo como el del negocio,
 * volver al de fábrica y copiarlo para pegarlo en otra IA.
 *
 * Sólo se edita lo que se le cuenta a la IA de la hoja (`parteEditable`); el
 * bloque «Qué devolver» lo arma el sistema con las columnas y se pega al final
 * siempre (`bloqueDeSalida`), así una columna nueva no deja viejo al del negocio.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { bloqueDeSalida, parteEditable } from "@/lib/forestal/planillas/catalogo";
import type { PlanillaCampo, PromptGuardado } from "@/lib/forestal/planillas/tipos";
import { borrarPrompt, guardarPrompt } from "./planillas-api";
import { promptDesactualizado } from "./use-planillas";

export function usePromptPlanilla(
  planilla: PlanillaCampo,
  guardado: PromptGuardado | null,
  onCambio: (g: PromptGuardado | null) => void,
) {
  const vigente = parteEditable(guardado?.texto ?? planilla.prompt);
  const deFabrica = useMemo(() => parteEditable(planilla.prompt), [planilla.prompt]);
  const bloqueFijo = useMemo(() => bloqueDeSalida(planilla), [planilla]);
  const [texto, setTexto] = useState(vigente);
  const [ocupado, setOcupado] = useState<"guardar" | "fabrica" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const avisar = (m: string) => {
    setAviso(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAviso(null), 2500);
  };

  const cambiado = texto.trim() !== vigente.trim();
  const vacio = texto.trim().length === 0;

  const guardar = async () => {
    if (!cambiado || vacio) return;
    setOcupado("guardar");
    setError(null);
    try {
      const g = await guardarPrompt(planilla.id, texto.trim());
      onCambio(g);
      setTexto(g ? parteEditable(g.texto) : deFabrica);
      avisar(g ? "Guardado: la IA leerá esta hoja con tu prompt." : "Es igual al de fábrica: se usa el de fábrica.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const volverAFabrica = async () => {
    setError(null);
    if (!guardado) {
      setTexto(deFabrica);
      return;
    }
    setOcupado("fabrica");
    try {
      await borrarPrompt(planilla.id);
      onCambio(null);
      setTexto(deFabrica);
      avisar("Listo: vuelve a usarse el prompt de fábrica.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${texto.trim()}\n\n${bloqueFijo}`);
      avisar("Copiado entero, con «Qué devolver».");
    } catch {
      setError("No se pudo copiar: selecciona el texto y cópialo a mano.");
    }
  };

  return {
    texto,
    setTexto,
    /** Lo editable del de fábrica (para mirarlo al lado del propio). */
    deFabrica,
    /** «Qué devolver»: lo arma el sistema, no se edita. */
    bloqueFijo,
    origen: guardado ? ("negocio" as const) : ("fabrica" as const),
    desactualizado: promptDesactualizado(planilla, guardado),
    cambiado,
    vacio,
    ocupado,
    error,
    aviso,
    guardar,
    volverAFabrica,
    copiar,
    /** Descarta lo escrito y vuelve al vigente. */
    deshacer: () => setTexto(vigente),
  };
}
