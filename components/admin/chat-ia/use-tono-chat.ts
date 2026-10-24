"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tono } from "./tipos";

/**
 * Misma clave que usaba el panel de Configuración del chat. Ese panel guardaba
 * también modelo, largo, fuentes y auto-leer, pero el servidor nunca los usó:
 * sólo el tono cambia la respuesta. Se lee el tono y, al escribir, se conserva
 * lo demás que hubiera (nadie lo lee, pero tampoco se pisa a ciegas).
 */
const STORAGE_KEY = "chat-ia-settings";
const TONOS: readonly Tono[] = ["feynman", "ejecutivo", "tecnico"];

function leerGuardado(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function useTonoChat(): { tono: Tono; setTono: (t: Tono) => void } {
  const [tono, setEstado] = useState<Tono>("feynman");

  useEffect(() => {
    const guardado = leerGuardado().tone;
    if (TONOS.includes(guardado as Tono)) setEstado(guardado as Tono);
  }, []);

  const setTono = useCallback((t: Tono) => {
    setEstado(t);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...leerGuardado(), tone: t }));
    } catch {
      /* modo privado: el tono vale para esta visita */
    }
  }, []);

  return { tono, setTono };
}
