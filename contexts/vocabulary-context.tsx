"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { vocab, type VocabularyMode } from "@/lib/vocabulary";

interface VocabularyContextValue {
  mode: VocabularyMode;
  setMode: (mode: VocabularyMode) => void;
  t: (key: string) => string;
}

const VocabularyContext = createContext<VocabularyContextValue>({
  mode: "simple",
  setMode: () => {},
  t: (key: string) => key,
});

const STORAGE_KEY = "buleje-vocabulary-mode";

function getInitialMode(): VocabularyMode {
  if (typeof window === "undefined") return "simple";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "simple" || saved === "technical") return saved;
  } catch {}
  return "simple";
}

export function VocabularyProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<VocabularyMode>(getInitialMode);

  const setMode = useCallback((newMode: VocabularyMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string) => vocab(key, mode),
    [mode],
  );

  return (
    <VocabularyContext.Provider value={{ mode, setMode, t }}>
      {children}
    </VocabularyContext.Provider>
  );
}

export function useVocabulary() {
  return useContext(VocabularyContext);
}
