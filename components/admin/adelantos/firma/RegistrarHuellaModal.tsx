"use client";

/**
 * «Registrar huella» desde la tabla de adelantos (23-10), de tres formas:
 *
 * - Escanear con la cámara: la yema dentro del marco, realzada como huella, y
 *   se guarda como HUELLA (imagen) en el registro de firmas.
 * - Con su celular: el QR (o WhatsApp) abre el enlace de firma en el celular
 *   de la persona, que firma y toma la foto de su huella ahí.
 *
 * - Con la huella de su celular (ADR-513): el mismo enlace; en su teléfono toca
 *   «Confirmar con mi huella» y el sensor con que lo desbloquea firma el recibo
 *   (passkey). Prueba que es el dueño de ESE celular y la web nunca recibe la
 *   imagen de la huella: el ⓘ lo dice.
 */

import { useState } from "react";
import { Fingerprint, ScanLine, Smartphone } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Casilla } from "@/components/ui-system/Casilla";
import { button } from "@/components/ui-system/button-variants";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { TEXTO_CONSENTIMIENTO_HUELLA } from "@/lib/adelantos/entregar-tipos";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { fmtMon } from "../shared";
import EnviarEnlaceFirma from "./EnviarEnlaceFirma";
import EscanerHuella from "./EscanerHuella";
import { useGuardarHuella } from "./use-guardar-huella";

type Forma = "camara" | "celular" | "passkey";

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function RegistrarHuellaModal({ adelanto: a, onCerrar, onGuardada }: { adelanto: DbAdelanto; onCerrar: () => void; onGuardada: () => void }) {
  const [forma, setForma] = useState<Forma>("camara");
  const g = useGuardarHuella(a, onGuardada);
  const persona = a.beneficiario?.nombre ?? "—";
  const monto = fmtMon(a.montoAdelantado, a.moneda);

  return (
    <AdminModal
      open
      onClose={g.guardando ? () => undefined : onCerrar}
      title="Registrar huella"
      description={`${persona} · ${monto}${a.codigoOperacion ? ` · ${a.codigoOperacion}` : ""}`}
      icon={Fingerprint}
      size="lg"
      aboveModals
      claveVentana="adelanto-huella"
      footer={
        <ModalFooter error={forma === "camara" ? g.error : null}>
          <button type="button" onClick={onCerrar} disabled={g.guardando} className={button({ variant: "secondary" })}>
            Cerrar
          </button>
          {forma === "camara" && (
            <button type="button" onClick={() => void g.guardar()} disabled={g.guardando || !g.huella} className={button({ variant: "primary" })} data-guardar-huella>
              {g.guardando ? "Guardando…" : "Guardar huella"}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<Forma>
            value={forma}
            onChange={setForma}
            size="xl"
            label="Cómo registrar la huella"
            options={[
              { value: "camara", label: "Escanear con la cámara", icon: <ScanLine className="h-4 w-4" aria-hidden />, dataQa: "huella-forma-camara" },
              { value: "celular", label: "Con su celular", icon: <Smartphone className="h-4 w-4" aria-hidden />, dataQa: "huella-forma-celular" },
              { value: "passkey", label: "Con la huella de su celular", icon: <Fingerprint className="h-4 w-4" aria-hidden />, dataQa: "huella-forma-passkey" },
            ]}
          />
          <InfoTip
            title="Las tres formas"
            what="Cámara: la foto de la yema del dedo, realzada para que se vean las crestas; queda como imagen en el registro del adelanto. Con su celular: le muestras el QR o se lo mandas por WhatsApp; en SU teléfono firma y toma la foto de su huella. Con la huella de su celular: mismo enlace, pero toca «Confirmar con mi huella» y pone el dedo donde desbloquea el teléfono."
            affects="Ninguna se compara con RENIEC. Con la huella de su celular, lo confirma el aparato registrado para esta persona (quien tuvo el enlace y su DNI pudo registrarlo) y queda atado a este monto; la página nunca recibe la imagen de esa huella. El enlace registra un solo celular: si cambia de celular, revoca el anterior desde su ficha (eso es tu aprobación) y recién ahí registra el nuevo."
            example="Juan está en el mostrador: escaneas su dedo con la cámara. Está en el monte: le mandas el enlace y confirma con la huella de su celular; el recibo dirá «Lo confirmó el aparato registrado para esta persona (passkey)» y si la llave se registró con ese mismo enlace."
          />
        </div>

        {forma === "camara" ? (
          <>
            <EscanerHuella onCambio={g.setHuella} deshabilitado={g.guardando} />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <label className="block space-y-1">
                <span className="text-sm font-bold text-[var(--text-secondary)]">Nombre de quien pone la huella</span>
                <input value={g.nombre} onChange={(e) => g.setNombre(e.target.value)} disabled={g.guardando} autoComplete="off" className={INPUT} data-huella-nombre />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-bold text-[var(--text-secondary)]">DNI</span>
                <input
                  value={g.documento}
                  onChange={(e) => g.setDocumento(e.target.value)}
                  disabled={g.guardando}
                  autoComplete="off"
                  maxLength={16}
                  placeholder="8 números"
                  className={`${INPUT} font-mono tabular-nums`}
                  data-huella-dni
                />
              </label>
            </div>
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-3">
              <Casilla checked={g.consentido} onChange={(e) => g.setConsentido(e.target.checked)} disabled={g.guardando} className="mt-0.5" data-consentimiento-huella />
              <span className="text-sm text-[var(--text-primary)]">{TEXTO_CONSENTIMIENTO_HUELLA}</span>
            </label>
          </>
        ) : (
          <EnviarEnlaceFirma adelantoId={a.id} persona={persona} codigo={a.codigoOperacion ?? null} montoTexto={monto} pideHuellaInicial onFirmado={onGuardada} />
        )}
      </div>
    </AdminModal>
  );
}
