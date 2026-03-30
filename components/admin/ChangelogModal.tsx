"use client";

import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const CHANGELOG = [
  {
    version: "2.5",
    fecha: "25/03/2026",
    items: [
      "Recetario publico con 20 recetas peruanas",
      "Microfono IA en el POS — dicta productos por voz",
      "Pago mixto — combina efectivo + Yape",
      "Analytics PRO con 11 secciones y Recharts",
      "Centro de notificaciones con alertas automaticas",
      "Modo nocturno automatico (7pm-6am)",
      "Conteo fisico guiado con escaner",
      "Ticket termico 80mm profesional",
      "Feed de actividad reciente en dashboard",
      "Metas semanales con barra de progreso",
      "Exportar modulo a PDF desde el panel",
      "Web Vitals dashboard para rendimiento",
      "Sitemap dinamico para SEO",
    ],
  },
  {
    version: "2.0",
    fecha: "24/03/2026",
    items: [
      "Modulo de Fiados con limite de credito",
      "Modulo de Turnos con cierre automatico",
      "Cotizaciones, Guias de Remision, Notas de Credito",
      "Onboarding wizard en 5 pasos",
      "Cierre del dia con resumen automatico",
    ],
  },
];

const CURRENT_VERSION = CHANGELOG[0].version;

export function useChangelogBadge() {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem("changelog-last-seen");
      if (lastSeen !== CURRENT_VERSION) {
        setHasNew(true);
      }
    } catch { /* ignore */ }
  }, []);

  const markSeen = () => {
    localStorage.setItem("changelog-last-seen", CURRENT_VERSION);
    setHasNew(false);
  };

  return { hasNew, markSeen };
}

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  useEffect(() => {
    if (open) {
      localStorage.setItem("changelog-last-seen", CURRENT_VERSION);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border w-full max-w-lg max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-card-border">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Novedades</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
            {CHANGELOG.map((release) => (
              <div key={release.version}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-extrabold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                    v{release.version}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-muted">
                    {release.fecha}
                  </span>
                  {release.version === CURRENT_VERSION && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full uppercase">
                      Actual
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {release.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                    >
                      <span className="text-primary mt-0.5 shrink-0">&#8226;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-card-border">
            <button
              onClick={onClose}
              className={cn(
                "w-full py-2.5 rounded-xl text-sm font-bold transition-colors",
                "bg-primary text-white hover:bg-primary/90"
              )}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
