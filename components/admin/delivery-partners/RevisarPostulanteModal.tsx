"use client";

/**
 * Revisar a un postulante (17-10, P23). Antes «Aprobar» y «Rechazar» actuaban
 * con un clic, sin motivo, y la tarjeta revisada decía sólo «Revisado». Ahora
 * la decisión la toma una persona en esta ventana: ve lo que le falta, escribe
 * la razón (obligatoria al rechazar) y lee el alcance antes de confirmar. La
 * razón queda en la postulación con su nombre y la fecha (`reviewNotes`).
 * Ningún puntaje decide solo: los documentos completos sólo habilitan «Aprobar».
 */
import { useState, type FormEvent } from "react";
import { Loader2, ThumbsDown, ThumbsUp } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { BOTON, CLASE_AREA } from "@/components/admin/rrhh/rrhh-form";
import { cn } from "@/lib/utils";

const FORM_ID = "form-revisar-postulante";
const MINIMO_MOTIVO = 5;
const MAXIMO_MOTIVO = 500;

export type DecisionPostulante = "approve" | "reject";

const ALCANCE: Record<DecisionPostulante, string[]> = {
  approve: [
    "Queda activo en tu equipo y empieza a recibir pedidos.",
    "Le llega un WhatsApp de bienvenida.",
    "Puedes pausarlo después desde Repartidores; su historial se conserva.",
  ],
  reject: [
    "No entra a tu equipo ni recibe pedidos.",
    "Le llega un WhatsApp con el motivo que escribas.",
    "Puede volver a postular cuando reúna los requisitos.",
  ],
};

export function RevisarPostulanteModal({
  nombre,
  decision,
  faltan,
  onClose,
  onConfirmar,
}: {
  nombre: string;
  decision: DecisionPostulante;
  /** Lo que le falta para aprobar (vacío = documentos completos). */
  faltan: string[];
  onClose: () => void;
  /** Lanza un Error con el mensaje si el servidor no aceptó. */
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rechazar = decision === "reject";
  const bloqueado = !rechazar && faltan.length > 0;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const texto = motivo.trim();
    if (rechazar && texto.length < MINIMO_MOTIVO) {
      setError("Escribe el motivo (al menos 5 letras): le llega al postulante y queda en su postulación.");
      return;
    }
    if (bloqueado) return;
    setEnviando(true);
    setError(null);
    try {
      await onConfirmar(texto);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title={rechazar ? `Rechazar a ${nombre}` : `Aprobar a ${nombre}`}
      icon={rechazar ? ThumbsDown : ThumbsUp}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={enviando || bloqueado}
            className={rechazar ? BOTON.peligro : BOTON.primario}
            data-qa="confirmar-revision-postulante"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {rechazar ? "Rechazar postulación" : "Aprobar y activar"}
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={enviar} noValidate className={cn(MODAL_BODY, "space-y-4")}>
        {faltan.length > 0 && (
          <div className="rounded-xl bg-[var(--data-warning-100)] px-3 py-2 text-sm text-[var(--data-warning-700)]">
            <p className="font-bold">Le falta: {faltan.join(" · ")}</p>
            {!rechazar && <p>No se puede aprobar hasta que lo complete.</p>}
          </div>
        )}
        <Field
          label={rechazar ? "Motivo del rechazo" : "Nota de la revisión (opcional)"}
          required={rechazar}
          hint="Queda en la postulación con tu nombre y la fecha."
        >
          {(id) => (
            <textarea
              id={id}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MAXIMO_MOTIVO}
              rows={3}
              placeholder={rechazar ? "Ej. El SOAT está vencido; vuelve a postular con el nuevo." : "Ej. Revisé su DNI y licencia en persona."}
              className={CLASE_AREA}
              data-qa="motivo-revision-postulante"
            />
          )}
        </Field>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Qué pasa al confirmar</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--text-secondary)]">
            {ALCANCE[decision].map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </form>
    </AdminModal>
  );
}
