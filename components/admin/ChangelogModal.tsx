"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";

const CHANGELOG = [
  {
    version: "2.5",
    fecha: "25/03/2026",
    items: [
      "Recetario público con 20 recetas peruanas",
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

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Novedades"
      icon={Sparkles}
      variant="default"
      footer={
        <button
          onClick={onClose}
          className={cn(
            "w-full min-h-11 rounded-xl text-sm font-semibold transition-colors",
            "bg-primary text-white hover:bg-primary/90"
          )}
        >
          Entendido
        </button>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-6")}>
        {CHANGELOG.map((release) => (
          <div key={release.version}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 px-2.5 py-1 rounded-full">
                v{release.version}
              </span>
              <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                {release.fecha}
              </span>
              {release.version === CURRENT_VERSION && (
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 dark:bg-primary/15 px-2 py-0.5 rounded-full uppercase">
                  Actual
                </span>
              )}
            </div>
            <ul className="space-y-1.5">
              {release.items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
                >
                  <span className="text-primary mt-0.5 shrink-0">&#8226;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AdminModal>
  );
}
