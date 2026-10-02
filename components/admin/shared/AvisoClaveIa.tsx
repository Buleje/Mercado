"use client";

/**
 * «La lectura con IA no está» — UN aviso para todo lo que usa la IA de la
 * plataforma: la placa del tocón, la constancia del registro, las planillas,
 * la GTF (alta de guía e ingreso), la factura del punto de compra y el
 * asistente del Libro CTP.
 *
 * Una línea, en tono neutro: no es un error de la persona ni de la foto. El
 * texto lo decide el SERVIDOR (auditoría de seguridad 2026-10-02): quien
 * administra la plataforma lee dónde va la clave; el admin de un negocio,
 * «avisa al administrador». Las instrucciones del ⓘ sólo van con el primero.
 */

import { KeyRound } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AVISO_IA_NO_DISPONIBLE } from "@/lib/ai/aviso-clave-ia";

export default function AvisoClaveIa({
  mensaje = AVISO_IA_NO_DISPONIBLE,
  conInstrucciones = false,
  className = "",
}: {
  /** El aviso tal como lo mandó la ruta. */
  mensaje?: string;
  /** El servidor respondió `codigo: "sin_lector"`: quien mira administra la clave. */
  conInstrucciones?: boolean;
  className?: string;
}) {
  return (
    <p className={`flex items-start gap-1.5 text-sm text-[var(--text-secondary)] ${className}`} role="status">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden="true" />
      <span className="min-w-0">{mensaje}</span>
      {conInstrucciones ? (
        <InfoTip
          title="Lectura con IA"
          what="Lee la foto de la placa, la constancia, la guía (GTF), la factura y las planillas, y completa los campos por ti; también responde preguntas sobre el libro. Usa tu cuenta de Claude: cada uso cuesta centavos (una placa ≈ US$ 0,01; una guía o una factura ≈ US$ 0,02; una constancia ≈ US$ 0,04)."
          affects="Sin la clave no se bloquea nada: todo se sigue cargando a mano."
          example="En console.anthropic.com → API Keys creas la clave; en .env.local escribes ANTHROPIC_API_KEY=sk-ant-… y reinicias el servidor."
          className="shrink-0"
        />
      ) : (
        <InfoTip
          title="Lectura con IA"
          what="Lee fotos y documentos y completa los campos por ti; también responde preguntas sobre el libro."
          affects="Sin la lectura no se bloquea nada: todo se sigue cargando a mano."
          className="shrink-0"
        />
      )}
    </p>
  );
}
