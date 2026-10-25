"use client";

/**
 * Enviar documentos por WhatsApp — EL ARCHIVO, no un enlace.
 *
 * Antes esto abría wa.me con un mensaje y un link `/d/{token}`. Un enlace no es
 * un documento: el que lo recibe tiene que tocarlo, esperar el navegador y
 * confiar; no le queda el archivo en el chat, no lo puede reenviar a su
 * contador y a los 30 días vence. Brandon lo pidió claro: que llegue el PDF, el
 * Excel, el Word o la foto.
 *
 * Tres vías, en orden de preferencia:
 *
 *  1. ARCHIVO (WhatsApp del negocio conectado) — el binario sale del servidor
 *     directo a Meta y llega como adjunto real, con su nombre, y queda en el
 *     inbox del panel. Es la única forma de mandar un archivo sin que el dueño
 *     toque el celular.
 *  2. DESDE ESTE EQUIPO — `navigator.share` con los archivos: abre el menú de
 *     compartir del sistema (WhatsApp incluido) con los documentos adjuntos.
 *     Es la salida natural en el celular y no necesita nada configurado.
 *  3. ENLACE — el camino viejo, como último recurso: sirve para lo que no se
 *     puede adjuntar (archivos enormes) y para pedir una firma, que ES un link.
 */

import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import {
  PenLine,
  MessageCircle,
  Loader2,
  Send,
  Paperclip,
  FileWarning,
} from "@buleje/design-system/icons";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { ResultadoEnvio } from "./enviar-whatsapp/ResultadoEnvio";
import ViaSelector from "./enviar-whatsapp/ViaSelector";
import AvisoProblemas from "./enviar-whatsapp/AvisoProblemas";
import EnlaceConClave from "./enviar-whatsapp/EnlaceConClave";
import EnlacesDeLote from "./enviar-whatsapp/EnlacesDeLote";
import EnlaceUnico from "./enviar-whatsapp/EnlaceUnico";
import CampoNumero from "./enviar-whatsapp/CampoNumero";
import ListaContactos from "./enviar-whatsapp/ListaContactos";
import CampoMensaje from "./enviar-whatsapp/CampoMensaje";
import type { PropsEnviarWhatsApp } from "./enviar-whatsapp/compartido";
import { useEnviarWhatsApp } from "./enviar-whatsapp/use-enviar-whatsapp";

export function SendWhatsAppModal(props: PropsEnviarWhatsApp) {
  const arch = useEnviarWhatsApp(props);
  const {
    onClose,
    isSign,
    multi,
    docs,
    doc,
    blocked,
    resultado,
    accion,
    deshabilitado,
    enviando,
    via,
    textoBoton,
  } = arch;

  return (
    <AdminModal
      open
      onClose={onClose}
      title={
        isSign
          ? "Solicitar firma"
          : multi
            ? `Enviar ${docs.length} documentos por WhatsApp`
            : "Enviar por WhatsApp"
      }
      description={multi ? docs.map((d) => d.name).join(" · ") : doc?.name}
      icon={isSign ? PenLine : MessageCircle}
      size="md"
      aboveModals
      claveVentana="send-whatsapp"
      footer={
        <ModalFooter>
          <button onClick={onClose} className={button({ variant: "secondary" })}>
            {blocked || resultado ? "Cerrar" : "Cancelar"}
          </button>
          {!blocked && !resultado && (
            <button
              onClick={accion}
              disabled={deshabilitado}
              className={button({ variant: "primary" })}
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : via === "enlace" ? (
                <Send className="h-4 w-4" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
              {enviando ? "Mandando…" : textoBoton}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {blocked ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
              <FileWarning className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Solo se pueden firmar PDFs
            </p>
            <p className="max-w-xs text-xs text-[var(--text-secondary)]">
              Este documento no es un PDF, así que no se puede solicitar la firma. Sube una versión
              en PDF y vuelve a intentarlo.
            </p>
          </div>
        ) : resultado ? (
          <ResultadoEnvio resultado={resultado} />
        ) : (
          <>
            <ViaSelector arch={arch} />

            <AvisoProblemas arch={arch} />

            <EnlaceConClave arch={arch} />

            <EnlacesDeLote arch={arch} />

            <EnlaceUnico arch={arch} />

            <CampoNumero arch={arch} />

            <ListaContactos arch={arch} />

            <CampoMensaje arch={arch} />
          </>
        )}
      </div>
    </AdminModal>
  );
}
