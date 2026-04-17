"use client";

import { useState, useEffect } from "react";
import { Bot, X } from "lucide-react";
import { m, AnimatePresence } from "@/components/admin/providers";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const AIAssistant = dynamic(() => import("@/components/admin/AIAssistant"), { ssr: false });

interface Props {
  moduleContext?: string;
  onNavigate?: (tab: string) => void;
}

export default function AIFloatingButton({ moduleContext, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  // Listen for notification count from AIAssistant via CustomEvent
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.alertCount !== undefined) setAlertCount(detail.alertCount);
      if (detail?.healthScore !== undefined) setHealthScore(detail.healthScore);
    };
    window.addEventListener("buleje-ai-alerts", handler);
    return () => window.removeEventListener("buleje-ai-alerts", handler);
  }, []);

  // Pulse for unread
  useEffect(() => {
    if (alertCount > 0 && !open) setHasUnread(true);
    if (open) setHasUnread(false);
  }, [alertCount, open]);

  // Keyboard shortcut: Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const healthColor = healthScore !== null
    ? healthScore > 70 ? "bg-emerald-500" : healthScore > 40 ? "bg-amber-500" : "bg-red-500"
    : "bg-emerald-500";

  return (
    <>
      {/* Enhanced floating button with health indicator */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-xl",
          "flex items-center justify-center transition-all duration-[var(--dur-base)]",
          "bg-[var(--text-primary)] hover:opacity-90 text-[var(--surface-canvas)]",
          "hover:scale-105",
          open && "rounded-xl",
          hasUnread && !open && "animate-bounce"
        )}
        aria-label={open ? "Cerrar asistente" : "Abrir asistente IA"}
        title="Asistente IA (Ctrl+K)"
      >
        <m.div
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {open ? <X className="w-6 h-6" /> : <Bot className="w-7 h-7" />}
        </m.div>

        {/* Alert badge */}
        {alertCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 bg-red-500 rounded-full border-2 border-white dark:border-card text-[length:var(--ts-2xs)] font-bold flex items-center justify-center text-white px-1 ">
            {alertCount}
          </span>
        )}

        {/* Health indicator dot */}
        {alertCount === 0 && !open && (
          <span className={cn(
            "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-card",
            healthColor,
            healthScore !== null && healthScore <= 40 && "animate-pulse"
          )} />
        )}

        {/* Mini health label */}
        {healthScore !== null && !open && alertCount === 0 && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[length:var(--ts-2xs)] font-bold bg-white dark:bg-card text-gray-700 dark:text-gray-300 px-1.5 rounded-full border border-[var(--rule-base)] dark:border-card-border ">
            {healthScore}%
          </span>
        )}
      </button>

      {/* Chat popup */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-24 right-6 z-50 w-105 h-140 max-h-[80vh] rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden bg-white dark:bg-card"
          >
            <AIAssistant
              embedded
              moduleContext={moduleContext}
              onNavigate={onNavigate}
            />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}