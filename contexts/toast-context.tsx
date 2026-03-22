"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, X } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Toast = {
  id: number;
  name: string;
  image: string;
  exiting?: boolean;
};

type ToastCtx = {
  showToast: (name: string, image: string) => void;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerMap = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const t = timerMap.current.get(id);
    if (t) { clearTimeout(t); timerMap.current.delete(id); }
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const showToast = useCallback((name: string, image: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-3), { id, name, image }]);

    const t = setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
      timerMap.current.delete(id);
    }, 2800);

    timerMap.current.set(id, t);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
