"use client";

/**
 * Lo que ya está registrado en la columna «Recibo» (23-10): tocar un ícono
 * lleno abre esto. Firma y huella = el registro de firmas del adelanto (cada
 * una con su hora, quién y por dónde) + rehacer: la nueva queda vigente y la
 * anterior se queda en el registro como «Reemplazada» (reemplazar una vigente
 * sólo lo puede el dueño o un administrador: lo dice el servidor). La foto es
 * una por adelanto y no se cambia. Anulado: sólo se mira.
 */

import { Camera, Fingerprint, PenLine, RotateCcw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { fechaHoraLima } from "@/lib/adelantos/recibo-firmado";
import { momentoDeLaFoto } from "@/lib/adelantos/recibo-whatsapp";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import RegistroFirmas from "../detalle/RegistroFirmas";
import type { TipoRecibo } from "./CeldaRecibo";

const TITULO: Record<TipoRecibo, string> = { firma: "Firma del recibo", huella: "Huella del recibo", foto: "Foto del adelanto" };
const ICONO = { firma: PenLine, huella: Fingerprint, foto: Camera } as const;

export default function VerRegistrado({
  adelanto: a,
  tipo,
  onCerrar,
  onRehacer,
}: {
  adelanto: DbAdelanto;
  tipo: TipoRecibo;
  onCerrar: () => void;
  /** Firmar de nuevo o registrar otra huella (abre su ventana). */
  onRehacer: (tipo: "firma" | "huella") => void;
}) {
  const anulado = a.status === "CANCELADO";
  const momentoFoto = tipo === "foto" ? momentoDeLaFoto(a.comprobanteUrl) : null;
  const rehacer = tipo !== "foto" && !anulado ? tipo : null;
  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={TITULO[tipo]}
      description={`${a.beneficiario?.nombre ?? "—"}${a.codigoOperacion ? ` · ${a.codigoOperacion}` : ""}`}
      icon={ICONO[tipo]}
      aboveModals
      claveVentana="adelanto-ver-registrado"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>
            Cerrar
          </button>
          {rehacer && (
            <button type="button" onClick={() => onRehacer(rehacer)} className={button({ variant: "primary" })} data-rehacer={rehacer}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {rehacer === "firma" ? "Firmar de nuevo" : "Registrar otra huella"}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-3`}>
        {tipo === "foto" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API, con sesión */}
            <img
              src={`/api/adelantos/${encodeURIComponent(a.id)}/comprobante`}
              alt="Foto del adelanto"
              className="mx-auto max-h-[60vh] w-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] object-contain"
            />
            <p className="text-sm text-[var(--text-secondary)]">
              {momentoFoto ? `Tomada el ${fechaHoraLima(momentoFoto)}. ` : ""}Una foto por adelanto: no se cambia.
            </p>
          </>
        ) : (
          <>
            <RegistroFirmas adelantoId={a.id} monto={a.montoAdelantado} moneda={a.moneda} />
            {rehacer && (
              <p className="text-sm text-[var(--text-tertiary)]">
                Si la rehaces, la nueva queda vigente y la anterior se queda en el registro como «Reemplazada». Reemplazar sólo lo puede el dueño o un administrador.
              </p>
            )}
          </>
        )}
      </div>
    </AdminModal>
  );
}
