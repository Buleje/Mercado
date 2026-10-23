"use client";

/**
 * «Enviar recibo por WhatsApp» desde la fila (23-10). El celular sale de la
 * ficha de la persona y se puede cambiar; si la ficha estaba vacía, se anota
 * al mandar. El PDF (con el DNI tapado) queda privado en el Archivo, en la
 * carpeta de la persona, y el mensaje lleva un enlace que vence a las 72 h.
 */

import { useId } from "react";
import { CheckCircle2, Lock, MessageCircle, Share2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { MOTIVO_RECIBO_SOLO_DUENO, celularLegible, fechaCortaLima } from "@/lib/adelantos/recibo-whatsapp";
import { fmtMon, inputCls } from "../shared";
import { useEnviarRecibo } from "./use-enviar-recibo";

export default function EnviarReciboWhatsApp({ adelanto: a, onClose, onEnviado }: { adelanto: DbAdelanto; onClose: () => void; onEnviado: () => void }) {
  const r = useEnviarRecibo(a, onEnviado);
  const persona = a.beneficiario?.nombre ?? "la persona";
  const otroNumero = !r.fichaVacia && !r.fichaNoEsCelular && r.nueve && !r.telefonoFicha.replace(/\D/g, "").endsWith(r.nueve);
  const idCelular = useId();

  return (
    <AdminModal
      open
      onClose={r.preparando ? () => undefined : onClose}
      title="Recibo por WhatsApp"
      description={`${persona} · ${a.codigoOperacion ?? "sin código"} · ${fmtMon(a.montoAdelantado, a.moneda)}`}
      icon={MessageCircle}
      aboveModals
      claveVentana="adelanto-recibo-whatsapp"
      footer={
        <ModalFooter error={r.error}>
          <button type="button" onClick={onClose} disabled={r.preparando} className={button({ variant: "secondary" })}>
            {r.enviado ? "Listo" : "Cancelar"}
          </button>
          {r.preparado ? (
            <>
              {r.puedeCompartir && (
                <button type="button" onClick={() => void r.compartir()} className={button({ variant: "secondary" })}>
                  <Share2 className="h-4 w-4" aria-hidden /> Compartir el PDF
                </button>
              )}
              {r.enlaceWhatsApp ? (
                <a
                  href={r.enlaceWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={r.abrirWhatsApp}
                  className={button({ variant: "primary" })}
                  data-abrir-whatsapp
                >
                  <MessageCircle className="h-4 w-4" aria-hidden /> Abrir WhatsApp
                </a>
              ) : (
                <button type="button" disabled className={button({ variant: "primary" })}>
                  Abrir WhatsApp
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void r.preparar()}
              disabled={r.preparando || !r.nueve || r.sinPermiso}
              className={button({ variant: "primary" })}
              data-preparar-recibo
            >
              {r.preparando ? "Armando el PDF…" : "Preparar el recibo"}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        {r.sinPermiso && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm font-semibold text-[var(--text-secondary)]" data-recibo-sin-permiso>
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{MOTIVO_RECIBO_SOLO_DUENO}</span>
          </p>
        )}
        <div className="space-y-1.5">
          {/* El ⓘ va al lado de la etiqueta, no dentro: un botón dentro de un
              <label> se lleva el clic del campo (`infotip-no-anidado`). */}
          <div className="flex items-center gap-1.5">
            <label htmlFor={idCelular} className="text-sm font-bold text-[var(--text-primary)]">
              Celular de {persona.split(/\s+/)[0]}
            </label>
            <InfoTip
              what="«Enviado» quiere decir que se abrió el chat de WhatsApp con el recibo (o que compartiste el PDF desde el celular). WhatsApp no avisa si llegó ni si lo leyó."
              affects="El PDF queda privado en el Archivo, en la carpeta de la persona, con el DNI tapado. El enlace del mensaje vence a las 72 horas y se corta si anulas el adelanto."
              example="Si al final no lo mandaste en el chat, vuelve a enviarlo: la tabla muestra el último envío."
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">+51</span>
            <input
              id={idCelular}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={r.celular}
              onChange={(e) => r.setCelular(e.target.value)}
              placeholder="987 654 321"
              aria-invalid={!!r.errorCelular}
              disabled={r.preparando || r.sinPermiso}
              className={`${inputCls} h-12 text-base tabular-nums`}
              data-recibo-celular
            />
          </div>
          {r.errorCelular ? (
            <p className="text-sm font-semibold text-[var(--data-error-ink)]">{r.errorCelular}</p>
          ) : r.enviado ? null : r.fichaVacia ? (
            <p className="text-sm text-[var(--text-secondary)]">Su ficha no tiene celular: lo anotamos al enviar.</p>
          ) : r.fichaNoEsCelular ? (
            <p className="text-sm text-[var(--text-secondary)]">Su ficha tiene el {r.telefonoFicha}, que no es celular: se queda así.</p>
          ) : otroNumero ? (
            <p className="text-sm text-[var(--text-secondary)]">Se manda a este número; su ficha sigue con el {r.telefonoFicha}.</p>
          ) : null}
        </div>

        {r.preparado && !r.enviado && (
          <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]" data-recibo-listo>
            Recibo listo{r.preparado.venceEn ? `; el enlace vence el ${fechaCortaLima(r.preparado.venceEn)}` : ""}. Toca «Abrir WhatsApp» y envía el mensaje en el chat.
          </p>
        )}
        {r.enviado && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--data-success)]/12 px-3 py-2.5 text-sm font-semibold text-[var(--data-success-ink)]" data-recibo-anotado>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {r.enviado.via === "compartido" ? "Compartido desde el celular para el" : "Enviado por WhatsApp al"} {celularLegible(r.enviado.nueve)} ·{" "}
              {fechaCortaLima(r.enviado.en)}
              {r.enviado.celularAnotado && <span className="block font-normal">Anotamos el celular en su ficha.</span>}
            </span>
          </p>
        )}
      </div>
    </AdminModal>
  );
}
