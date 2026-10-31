"use client";

/**
 * useDictadoTrozas — el dictado por voz del Cubicador de trozas, sacado del
 * componente (que pasaba de 400 líneas). Mismo comportamiento que antes:
 *
 *   · comandos compartidos con el cubicador de aserrada (pausar, continuar,
 *     borrar último, especie) con la MISMA config;
 *   · la especie sola cambia la de lo que sigue («panguana» o «panguana
 *     treinta cuarenta ocho»), y si ya era la especie en curso no se anuncia
 *     (sin filtro de eco, repetirla armaba un lazo con el parlante);
 *   · pares «Ø largo» con un diámetro, tríos «Ø Ø largo» con dos; lo que
 *     sobra de una frase espera a la siguiente (`carryRef`).
 *
 * Todo lo que el reconocedor lee en medio de una frase va por REF: con el
 * valor capturado en el closure, un cambio de fórmula o una especie recién
 * creada no se verían hasta el próximo render.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { detectarComando, numerosDeTroza } from "@/lib/forestal/cubicacion";
import { medidasEnVoz, partirEnMedidas, type DiametrosPorTroza, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { aplicarAjustesDeVoz, loadConfig } from "@/lib/forestal/cubicador-config";
import { especieAlInicio } from "@/lib/forestal/cubicador-bloques-especie";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { pitido } from "@/lib/forestal/pitido";
import { useVozContinua } from "@/hooks/use-voz-continua";
import type { FilaTroza } from "../cubicador-trozas-tabla";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Repite en voz lo dictado, con la MISMA config del cubicador de aserrada. */
export function hablar(texto: string) {
  try {
    const cfg = loadConfig();
    if (!cfg.speak) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    aplicarAjustesDeVoz(u, cfg, synth.getVoices());
    synth.speak(u);
  } catch { /* TTS no disponible */ }
}

/** El tip de «guardada» con «Repite: no» (2026-09-23). Grave si la troza entró con medidas raras. */
function tipSiNoRepite(veces: number, rara: boolean) {
  const cfg = loadConfig();
  if (cfg.speak || !cfg.pitidoAlGuardar) return;
  pitido({ veces, tono: rara ? "revisa" : "guardado", volumen: cfg.voiceVolume });
}

export function useDictadoTrozas(o: {
  formulaRef: RefObject<FormulaTrozas>;
  diametrosRef: RefObject<DiametrosPorTroza>;
  rowsRef: RefObject<FilaTroza[]>;
  especieRef: RefObject<string>;
  setEspecie: (e: string) => void;
  especiesCatalogo: readonly string[];
  addTroza: (d1: number, d2: number, largo: number, sospechosa?: boolean) => FilaTroza;
  /** «Borrar último»: la última ANOTADA (agrupado por especie no es la última fila). */
  borrarUltima: () => void;
}) {
  const { formulaRef, diametrosRef, rowsRef, especieRef, setEspecie, addTroza, borrarUltima } = o;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const carryRef = useRef<number[]>([]);
  /* El catálogo de la planta (ADR-410). Por REF: con la lista capturada en el
     closure del reconocedor, una especie recién creada no se reconocería. */
  const especiesRef = useRef<readonly string[]>(o.especiesCatalogo);
  useEffect(() => { especiesRef.current = o.especiesCatalogo; }, [o.especiesCatalogo]);

  const voz = useVozContinua((texto) => {
    // Comandos compartidos con el cubicador de aserrada (misma config).
    const cmd = detectarComando(texto, loadConfig().comandos);
    if (cmd) {
      if (cmd.tipo === "pausar") { pausedRef.current = true; setPaused(true); carryRef.current = []; hablar("en pausa"); }
      else if (cmd.tipo === "continuar") { pausedRef.current = false; setPaused(false); carryRef.current = []; hablar("sigo"); }
      else if (cmd.tipo === "borrar-ultimo") { borrarUltima(); carryRef.current = []; hablar("borrado"); }
      else if (cmd.tipo === "especie") {
        const found = especiesRef.current.find((s) => sinAcentos(s).startsWith(cmd.palabra));
        if (found) { especieRef.current = found; setEspecie(found); hablar(found); }
      }
      return;
    }
    /* La especie sola cambia la de lo que sigue: «panguana» o «panguana treinta cuarenta ocho». */
    if (pausedRef.current) return; // en pausa, ni números ni especie sola: es charla
    let dictado = texto;
    let anuncio = "";
    const conocidas = [...especiesRef.current, ...rowsRef.current.map((r) => r.especie?.trim() ?? "").filter(Boolean)];
    const detectada = especieAlInicio(texto, conocidas);
    if (detectada) {
      dictado = detectada.resto;
      /* Ya era la especie en curso: no se anuncia, y sin medidas es el eco del
         parlante (acá no hay filtro de eco) — repetirla armaba un lazo. */
      if (claveEspecie(detectada.especie) === claveEspecie(especieRef.current)) {
        if (!dictado.trim()) return;
      } else {
        especieRef.current = detectada.especie; // la troza de esta misma frase ya entra con ella
        setEspecie(detectada.especie);
        anuncio = detectada.especie;
        if (!dictado.trim()) { hablar(detectada.especie); return; }
      }
    }
    /* Pares «Ø largo» con un diámetro, tríos «Ø Ø largo» con dos. */
    const { trozas, resto } = partirEnMedidas([...carryRef.current, ...numerosDeTroza(dictado)], diametrosRef.current, formulaRef.current);
    carryRef.current = resto;
    let ultima: FilaTroza | null = null;
    for (const t of trozas) ultima = addTroza(t.d1, t.d2, t.largo, t.sospechosa);
    if (ultima) {
      const confirmacion = trozas.length === 1 ? medidasEnVoz(ultima, diametrosRef.current) : `${trozas.length} trozas`;
      hablar(anuncio ? `${anuncio}. ${confirmacion}` : confirmacion);
      tipSiNoRepite(trozas.length, trozas.some((t) => t.sospechosa));
    } else if (anuncio) {
      hablar(anuncio);
    }
  });

  /** Un sobrante de pares no sirve después de vaciar, cambiar de fórmula o de Ø por troza. */
  const olvidarSobrante = useCallback(() => { carryRef.current = []; }, []);

  return { voz, paused, olvidarSobrante };
}
