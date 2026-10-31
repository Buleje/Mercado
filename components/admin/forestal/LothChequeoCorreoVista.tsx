"use client";

/**
 * «Ver el correo que te llegaría» (26-10): la vista previa del correo diario
 * del chequeo del Libro TH (cron `loth-chequeo-correo`, 07:00 de Lima). Dice a
 * qué correo llega (enmascarado, como Avisos por correo) o por qué no sale, y
 * muestra el correo en un `<iframe srcDoc>` sin scripts: es HTML de correo, no
 * del panel. No envía nada ni marca nada como avisado.
 */

import { Bell, Mail } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { cn } from "@/lib/utils";
import { useLothChequeoCorreo, type VistaCorreoChequeo } from "./hooks/use-loth-chequeo-correo";

export default function LothChequeoCorreoVista({ onCerrar }: { onCerrar: () => void }) {
  const { vista, error, cargando, recargar } = useLothChequeoCorreo();
  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="El correo del chequeo"
      size="lg"
      ayuda={
        <InfoTip
          icono="ayuda"
          title="El correo del chequeo"
          what="Cada mañana a las 7:00 revisa tu Libro TH y te avisa sólo si aparece algo nuevo que puede multarte: una multa, o un plazo que vence en 7 días o menos. Llega a la campana del panel, por WhatsApp y por correo. Lo que ya te avisó no se repite, salvo el último día del plazo: ese día te lo recuerda otra vez."
          example="«Libro TH: 1 cosa que puede multarte — GTF 19-000003 a 5 días del plazo» y, el día que vence, «Hoy es el último día para pasar la GTF 19-000003 al libro». El vencimiento del plan no va acá: te llega en su propio aviso."
        />
      }
      footer={
        <ModalFooter error={error}>
          {error && (
            <button type="button" onClick={recargar} className={button({ variant: "secondary" })}>
              Reintentar
            </button>
          )}
          <button type="button" onClick={onCerrar} className={button({ variant: "accent" })}>
            Listo
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-3")}>
        {cargando && !vista ? (
          <div className="flex items-center gap-3 py-10 text-sm text-[var(--text-secondary)]">
            <LoadingSpinner size={24} />
            Revisando tu libro para armar el correo…
          </div>
        ) : vista ? (
          <>
            <Destino vista={vista} />
            <p className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <Bell className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
              {!vista.celular
                ? "También va a la campana del panel (sin celular del dueño no va por WhatsApp)."
                : vista.whatsappListo
                  ? `También va a la campana del panel y por WhatsApp al ${vista.celular}.`
                  : "También va a la campana del panel (el WhatsApp del negocio no está configurado)."}
            </p>
            <p className="text-sm text-[var(--text-primary)]">
              <span className="font-semibold">Asunto:</span> {vista.asunto}
            </p>
            <iframe
              title="Vista previa del correo"
              srcDoc={vista.html}
              // Sin permisos: es un correo para leer, no una página.
              sandbox=""
              className="h-[55vh] w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]"
            />
          </>
        ) : null}
      </div>
    </AdminModal>
  );
}

/** A quién le llega, o por qué no sale y dónde se arregla. */
function Destino({ vista }: { vista: VistaCorreoChequeo }) {
  const sinCorreo = !vista.destino;
  const apagado = vista.motivo === "los avisos forestales por correo están apagados";
  const arreglo = sinCorreo || apagado;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Mail className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
      {sinCorreo ? (
        <span className="font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">No sale: falta el correo del negocio.</span>
      ) : (
        <span className="text-[var(--text-primary)]">
          Llega a <span className="font-semibold">{vista.destino}</span>
          {vista.sale
            ? ` · mañana a las 7:00 con ${vista.nuevos === 1 ? "1 cosa nueva" : `${vista.nuevos} cosas nuevas`}`
            : apagado
              ? ""
              : ` · mañana no sale: ${vista.motivo ?? "nada nuevo"}`}
        </span>
      )}
      {apagado && (
        <span className="font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">No sale: los avisos forestales por correo están apagados.</span>
      )}
      {arreglo && (
        <a href={vista.urlAvisos} className="font-semibold text-[var(--accent-dark)] underline underline-offset-2 dark:text-[var(--accent)]">
          Configuración › Datos del negocio › Avisos por correo
        </a>
      )}
    </div>
  );
}
