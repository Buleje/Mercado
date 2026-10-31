"use client";

/**
 * «Ver el aviso de esta semana» (⋯ del Resumen, 25-10): el mismo texto que el
 * lunes a las 7:00 le llega al dueño por WhatsApp, correo y la campana
 * (`/api/cron/adelantos-hoy-toca`). Lo arma la misma función pura
 * (`avisoSemanal`), así lo que se ve acá es lo que sale.
 *
 * Sirve para verlo HOY: el aviso automático sólo corre en el panel publicado.
 */

import { useState } from "react";
import { BellRing, Copy, MessageCircle } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { avisoSemanal, type TareaHoy } from "@/lib/adelantos/hoy-toca";
import { logger } from "@/lib/logger";

export default function AvisoSemanalModal({ tareas, onClose }: { tareas: readonly TareaHoy[]; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const aviso = avisoSemanal(tareas, { base });

  const copiar = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(aviso.texto);
      setCopiado(true);
    } catch (err) {
      logger.warn("[adelantos/aviso-semanal] copiar falló", { error: String(err) });
      setError("No se pudo copiar: selecciona el texto y cópialo a mano.");
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="El aviso de esta semana"
      icon={BellRing}
      claveVentana="adelantos-aviso-semanal"
      footer={
        <ModalFooter
          error={error}
          aviso={copiado ? "Copiado" : undefined}
          nota={
            process.env.NODE_ENV !== "production"
              ? "Sale solo cada lunes a las 7:00 cuando se publique esta versión del panel."
              : "Sale solo cada lunes a las 7:00."
          }
        >
          <button type="button" onClick={() => void copiar()} className={button({ variant: "secondary" })}>
            <Copy className="h-4 w-4" aria-hidden /> Copiar
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(aviso.texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={button({ variant: "primary" })}
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Mandar por WhatsApp
          </a>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <p className="text-sm text-[var(--text-secondary)]">
          Esto te llega cada lunes por WhatsApp, correo y la campana del panel:
        </p>
        <div className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-sunken)] p-4 text-sm text-[var(--text-primary)] ring-1 ring-[var(--rule-soft)]">
          {aviso.texto}
        </div>
      </div>
    </AdminModal>
  );
}
