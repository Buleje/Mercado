"use client";

import dynamic from "next/dynamic";
import { Smartphone } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { fmt, isValidRuc } from "@/components/admin/pos/pago/pago-shared";
import { tieneQR } from "@/components/admin/pos/pago/useBilleteraNegocio";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

const YapeQRPayment = dynamic(() => import("@/components/admin/YapeQRPayment"), { ssr: false });

/**
 * QR de Yape/Plin en grande, encima del cobro. Se abre solo al elegir Yape o Plin si el negocio
 * subió su QR en Ajustes › Cobros; «Ya pagó» confirma la venta con el mismo cobro (descuento,
 * cliente y comprobante incluidos).
 */
export default function PagoQRGrande({ p }: { p: PagoModal }) {
  const { qrAbierto, setQrAbierto, billeteras, total, processing, handleConfirm, pendiente, comprobanteTipo, comprobanteRuc } = p;
  const negocio = qrAbierto ? billeteras?.[qrAbierto] : undefined;
  if (!qrAbierto || !tieneQR(negocio)) return null;

  const aviso =
    comprobanteTipo === "factura" && !isValidRuc(comprobanteRuc)
      ? "Falta el RUC de la factura: complétalo en Comprobante."
      : pendiente > 0.01
        ? `Falta cobrar ${fmt(pendiente)}.`
        : null;

  return (
    <AdminModal
      open
      aboveModals
      variant="centered-sm"
      icon={Smartphone}
      title={`Cobra con ${qrAbierto === "yape" ? "Yape" : "Plin"}`}
      onClose={() => setQrAbierto(null)}
    >
      <div className={MODAL_BODY}>
      <YapeQRPayment
        provider={qrAbierto}
        qrImage={negocio.qr}
        titular={negocio.titular}
        numero={negocio.numero}
        amount={total}
        processing={processing}
        aviso={aviso}
        onConfirm={() => {
          setQrAbierto(null);
          handleConfirm();
        }}
        onCancel={() => setQrAbierto(null)}
      />
      </div>
    </AdminModal>
  );
}
