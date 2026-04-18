"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * assistant-context — gestión del historial multi-producto del Asistente Buleje.
 *
 * Persiste en localStorage por productId. El componente BulejeAssistant puede
 * trabajar con su propio state local si este provider no está montado (fallback),
 * pero envolver la app permite reusar historiales entre PDPs y potencialmente
 * mostrar un hub global con últimas consultas.
 */

export interface AssistantHistoryMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  t: number;
}

export interface AssistantContextValue {
  /** Devuelve el historial de un producto (o lista vacía). */
  getHistory: (productId: number) => AssistantHistoryMessage[];
  /** Sobrescribe el historial de un producto. */
  setHistory: (productId: number, messages: AssistantHistoryMessage[]) => void;
  /** Limpia el historial de un producto. */
  clearHistory: (productId: number) => void;
  /** Todos los productos con historial guardado. */
  productsWithHistory: number[];
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

const STORAGE_KEY = "buleje-assistant-histories";

function readStorage(): Record<string, AssistantHistoryMessage[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AssistantHistoryMessage[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(value: Record<string, AssistantHistoryMessage[]>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* silent — quota may exceed */
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  // Inicializador lazy: lee localStorage solo en cliente (readStorage es SSR-safe).
  // Evita el warning react-hooks/set-state-in-effect porque no hay setState
  // sincrónico dentro de useEffect.
  const [histories, setHistories] = useState<Record<string, AssistantHistoryMessage[]>>(
    () => readStorage(),
  );

  // Persistir cuando cambia
  useEffect(() => {
    writeStorage(histories);
  }, [histories]);

  const getHistory = useCallback(
    (productId: number) => histories[String(productId)] ?? [],
    [histories],
  );

  const setHistory = useCallback(
    (productId: number, messages: AssistantHistoryMessage[]) => {
      setHistories((prev) => ({ ...prev, [String(productId)]: messages }));
    },
    [],
  );

  const clearHistory = useCallback((productId: number) => {
    setHistories((prev) => {
      const next = { ...prev };
      delete next[String(productId)];
      return next;
    });
  }, []);

  const productsWithHistory = useMemo(
    () => Object.keys(histories).map((id) => Number(id)).filter((n) => Number.isFinite(n)),
    [histories],
  );

  const value = useMemo<AssistantContextValue>(
    () => ({ getHistory, setHistory, clearHistory, productsWithHistory }),
    [getHistory, setHistory, clearHistory, productsWithHistory],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/**
 * Hook para consumir el contexto. Nunca lanza: si no hay provider, devuelve
 * un shim "no-op" para que BulejeAssistant siga funcionando con su state
 * local como fallback.
 */
export function useAssistantContext(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (ctx) return ctx;
  return {
    getHistory: () => [],
    setHistory: () => undefined,
    clearHistory: () => undefined,
    productsWithHistory: [],
  };
}
