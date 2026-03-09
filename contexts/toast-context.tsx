"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2 } from "lucide-react";
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
};

const ToastContext = createContext<ToastCtx | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerMap = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-100 flex flex-col items-center gap-2 pointer-events-none w-full max-w-xs px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "relative flex items-center gap-3 bg-primary-dark dark:bg-card text-white rounded-2xl px-4 py-3 shadow-2xl shadow-black/30 w-full overflow-hidden border border-transparent dark:border-card-border",
              toast.exiting
                ? "animate-[toastOut_0.3s_ease-in_forwards]"
                : "animate-[toastIn_0.3s_ease-out]"
            )}
          >
            <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-white/10">
              <Image
                src={toast.image}
                alt={toast.name}
                fill
                sizes="40px"
                className="object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 dark:text-muted font-medium">Agregado al carrito</p>
              <p className="text-sm font-bold leading-tight truncate dark:text-foreground">{toast.name}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
              <div className="h-full bg-emerald-400 animate-[shrink_2.8s_linear_forwards]" />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
