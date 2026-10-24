"use client";

/**
 * Anular un adelanto — con la pregunta que el `confirm()` de antes no hacía.
 *
 * El backend (`PATCH /api/adelantos/[id]`) ya aceptaba `devolucionCaja` desde
 * el ADR-118: por qué vía volvió la plata al cajón, para que el arqueo del día
 * cuadre. Ausente = no toca la caja. La única pantalla que anulaba (el detalle)
 * mandaba `{ cancelar: true }` a secas con un `window.confirm()* — el campo
 * vivía en el backend y nunca se preguntaba.
 *
 * Anular NO es lo mismo que "la plata volvió": puede ser un error de tipeo
 * (nunca salió nada) o una pérdida que se da por perdida (no vuelve). Por eso
 * la pregunta es explícita y el default es "no volvió nada" — jamás se anota
 * un ingreso de caja que no pasó.
 */

import { useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { Ban } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { fmtMon } from "../shared";

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

const VIAS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "yape", label: "Yape" },
  { id: "plin", label: "Plin" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "transferencia", label: "Transferencia" },
] as const;

export default function AnularAdelantoModal({
  adelantoId,
  persona,
  monto,
  moneda,
  recibido = false,
  onClose,
  onAnulado,
}: {
  adelantoId: string;
  persona: string;
  monto: number;
  moneda: string;
  /**
   * La plata la RECIBISTE (ADR-448): anular con devolución SALE de tu caja
   * (el servidor anota un egreso). Sin esto el modal decía «se anota un
   * ingreso» mientras el servidor hacía lo contrario.
   */
  recibido?: boolean;
  onClose: () => void;
  onAnulado: () => void;
}) {
  const [via, setVia] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const anular = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/adelantos/${adelantoId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ cancelar: true, devolucionCaja: via }),
      });
      if (res.ok) {
        onAnulado();
        return;
      }
      const j = await leerJson<{ error?: string; message?: string }>(res);
      setErr(
        res.status === 403
          ? "Esto lo registra el dueño o un administrador."
          : (j?.message ?? j?.error ?? "No se pudo anular el adelanto."),
      );
    } catch (e) {
      logger.error("[adelantos] no se pudo anular", { error: String(e) });
      setErr("No se pudo anular. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    /* Se abre desde la lista y desde el detalle del adelanto (otro modal): va encima. */
    <AdminModal
      open
      onClose={onClose}
      title="¿Anular este adelanto?"
      icon={Ban}
      aboveModals
      claveVentana="adelanto-anular"
      footer={
        <ModalFooter error={err}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Volver
          </button>
          <button
            type="button"
            onClick={() => void anular()}
            disabled={saving}
            className={button({ variant: "danger" })}
          >
            {saving ? "Anulando…" : "Anular adelanto"}
          </button>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{persona}</strong> —{" "}
          {fmtMon(monto, moneda)}. No se borra el historial, queda marcado como cancelado.
        </p>

        <div
          className="space-y-1.5 rounded-xl bg-[var(--surface-sunken)] p-3.5"
          role="group"
          aria-label={recibido ? "¿Le devolviste la plata?" : "¿Volvió la plata a caja?"}
        >
          <p className="text-sm font-bold text-[var(--text-secondary)]">
            {recibido ? "¿Le devolviste la plata?" : "¿La plata volvió a caja?"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setVia(null)}
              aria-pressed={via === null}
              className={`h-12 rounded-lg px-3 text-sm font-bold transition-colors ${
                via === null
                  ? "bg-primary/12 text-[var(--accent-ink)] ring-2 ring-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
              }`}
            >
              {recibido ? "No le devolví nada" : "No volvió nada"}
            </button>
            {VIAS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVia(v.id)}
                aria-pressed={via === v.id}
                className={`h-12 rounded-lg px-3 text-sm font-bold transition-colors ${
                  via === v.id
                    ? "bg-primary/12 text-[var(--accent-ink)] ring-2 ring-primary"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p
            className={`text-sm font-semibold ${via ? (recibido ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]") : "text-[var(--text-tertiary)]"}`}
          >
            {via
              ? recibido
                ? "Sale de tu caja por esa vía: se anota un egreso por lo que le devolviste."
                : "Entra a tu caja por esa vía: se anota un ingreso, para que el arqueo cuadre."
              : "Se anula sin tocar la caja — es un error de carga o una pérdida que se da por perdida."}
          </p>
        </div>
      </div>
    </AdminModal>
  );
}
