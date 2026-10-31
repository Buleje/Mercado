"use client";

import { ArrowLeft, Check, Loader2 } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";

type QRProvider = "yape" | "plin";

const ETIQUETA: Record<QRProvider, string> = { yape: "Yape", plin: "Plin" };

interface YapeQRPaymentProps {
  provider: QRProvider;
  /** Imagen del QR que el negocio subió en Ajustes › Cobros (Settings.yapeImage / plinImage). */
  qrImage: string;
  titular?: string;
  numero?: string;
  amount: number;
  onConfirm: () => void;
  onCancel: () => void;
  processing?: boolean;
  /** Por qué todavía no se puede confirmar (falta el RUC, falta cobrar parte…). */
  aviso?: string | null;
}

/** «9XX XXX XXX» para leerlo en voz alta si el cliente no puede escanear. */
function numeroLegible(n: string): string {
  const d = n.replace(/\D/g, "");
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : n;
}

/**
 * QR de Yape/Plin en grande para mostrárselo al cliente desde el cobro del POS.
 * Antes dibujaba un QR inventado (patrón pseudoaleatorio con un temporizador de 5 min) que ningún
 * celular podía pagar; ahora muestra el QR real del negocio y sólo se ofrece si está subido.
 */
export default function YapeQRPayment({ provider, qrImage, titular, numero, amount, onConfirm, onCancel, processing = false, aviso }: YapeQRPaymentProps) {
  const etiqueta = ETIQUETA[provider];
  return (
    <div className="space-y-4" data-pos-qr-grande={provider}>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Monto a cobrar</p>
        <p className="text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(amount)}</p>
      </div>

      <div className="flex justify-center">
        {/* El QR necesita fondo blanco para que la cámara lo lea, también en oscuro. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen subida por el negocio (URL de su almacenamiento) */}
        <img
          src={qrImage}
          alt={`QR ${etiqueta} del negocio`}
          width={288}
          height={288}
          className="w-72 max-w-[80vw] aspect-square rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] dark:bg-white p-2 object-contain"
        />
      </div>

      <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Escanea con {etiqueta} y paga {formatCurrency(amount)}</p>
        {(titular || numero) && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {titular}
            {titular && numero ? " · " : ""}
            {numero && <span className="tabular-nums">{numeroLegible(numero)}</span>}
          </p>
        )}
      </div>

      {aviso && (
        <p role="status" className="text-center text-sm font-semibold text-[var(--data-error-500)]">
          {aviso}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 min-h-12 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] font-semibold text-sm hover:bg-[var(--surface-sunken)] transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver al cobro
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={processing || !!aviso}
          className="flex-[1.4] min-h-12 rounded-xl bg-primary text-white font-semibold text-sm hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          {processing ? "Registrando…" : "Ya pagó · Confirmar venta"}
        </button>
      </div>
    </div>
  );
}
