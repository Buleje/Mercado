"use client";

/**
 * PaymentProofModal
 *
 * Modal de comprobante de pago para checkout marketplace. Se abre cuando
 * el cliente elige Yape / Plin / Transferencia para UNA tienda del carrito.
 * Muestra QR/banco + titular + monto, sube la captura via
 * /api/marketplace/checkout/payment-proof y emite { proofUrl, proofToken }.
 *
 * CUMPLE checkout-flow.instructions.md:
 *  - NO calcula totales (solo muestra el monto que recibe del backend).
 *  - NO crea Order (eso sucede en /checkout/confirmar — idempotency intacta).
 *  - NO toca reservas de stock ni cupones.
 *  - "transfer" es payment provider manual igual que yape/plin/efectivo
 *    (no externo Stripe/Culqi). ADR-082 documenta la decisión.
 */

import { useEffect, useRef, useState } from "react";
import {
  X,
  Copy,
  Check,
  Upload,
  Image as ImageIcon,
  Camera,
  Smartphone,
  Landmark,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

export type PaymentProofMethod = "yape" | "plin" | "transfer";

export interface PaymentProofModalConfig {
  yape?: { image?: string; name?: string; phone?: string };
  plin?: { image?: string; name?: string; phone?: string };
  transfer?: {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  };
}

interface PaymentProofModalProps {
  open: boolean;
  storeSlug: string;
  storeName: string;
  method: PaymentProofMethod;
  amount: number;
  config: PaymentProofModalConfig;
  initialProofUrl?: string;
  initialReference?: string;
  onConfirm: (result: {
    proofUrl: string;
    proofToken: string;
    reference?: string;
  }) => void;
  onClose: () => void;
}

const METHOD_LABEL: Record<PaymentProofMethod, string> = {
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia bancaria",
};

const METHOD_BRAND: Record<
  PaymentProofMethod,
  { bg: string; text: string; accent: string }
> = {
  yape: {
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    accent: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  plin: {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    text: "text-sky-700 dark:text-sky-300",
    accent: "bg-sky-600 hover:bg-sky-700 text-white",
  },
  transfer: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    accent: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
};

function fmt(n: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

export function PaymentProofModal({
  open,
  storeSlug,
  storeName,
  method,
  amount,
  config,
  initialProofUrl,
  initialReference,
  onConfirm,
  onClose,
}: PaymentProofModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialProofUrl ?? null,
  );
  const [reference, setReference] = useState(initialReference ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(
    initialProofUrl ?? null,
  );
  const [uploadedToken, setUploadedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<"amount" | "phone" | "account" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      setUploading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setUploadedUrl(null);
    setUploadedToken(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open) return null;

  const brand = METHOD_BRAND[method];
  const yape = config.yape;
  const plin = config.plin;
  const transfer = config.transfer;
  const account =
    method === "yape" ? yape : method === "plin" ? plin : undefined;

  const copyText = async (text: string, kind: typeof copied) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard denied — el usuario copia manualmente */
    }
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("La imagen no debe pesar más de 5 MB");
      return;
    }
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(f.type)
    ) {
      setError("Formato no soportado. Usa JPG, PNG o WebP.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const upload = async () => {
    if (!file) {
      setError("Selecciona la captura de tu pago primero");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("storeSlug", storeSlug);
      fd.append("method", method);
      fd.append("amountPEN", String(amount.toFixed(2)));
      if (reference) fd.append("reference", reference);
      const res = await fetch("/api/marketplace/checkout/payment-proof", {
        method: "POST",
        headers: csrfHeaders(),
        body: fd,
      });
      if (!res.ok) {
        let msg = "No pudimos subir tu comprobante";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* sin body json */
        }
        if (res.status === 401) {
          msg = "Necesitas iniciar sesión para subir tu comprobante";
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as {
        proofUrl: string;
        proofToken: string;
      };
      setUploadedUrl(data.proofUrl);
      setUploadedToken(data.proofToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo imagen");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = () => {
    if (!uploadedUrl || !uploadedToken) {
      setError("Sube la captura antes de continuar");
      return;
    }
    onConfirm({
      proofUrl: uploadedUrl,
      proofToken: uploadedToken,
      reference: reference || undefined,
    });
  };

  const canConfirm = Boolean(uploadedUrl && uploadedToken);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-modal-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-[var(--surface-raised)] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[var(--rule-soft)] max-h-[95vh] overflow-y-auto">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--rule-soft)] sticky top-0 z-10 bg-[var(--surface-raised)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={cn(
                  "shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl",
                  brand.bg,
                )}
              >
                {method === "transfer" ? (
                  <Landmark
                    className={cn("h-5 w-5", brand.text)}
                    strokeWidth={2.25}
                  />
                ) : (
                  <Smartphone
                    className={cn("h-5 w-5", brand.text)}
                    strokeWidth={2.25}
                  />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Pago a {storeName}
                </p>
                <h2
                  id="proof-modal-title"
                  className="text-lg sm:text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] truncate"
                >
                  {METHOD_LABEL[method]}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <button
            type="button"
            onClick={() => copyText(amount.toFixed(2), "amount")}
            className={cn(
              "w-full rounded-2xl border-2 p-5 text-center transition-all group",
              brand.bg,
              "border-[var(--rule-base)] hover:border-[var(--accent)]",
            )}
          >
            <p
              className={cn(
                "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]",
                brand.text,
              )}
            >
              Monto exacto a pagar
            </p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <p className="text-3xl sm:text-4xl font-black text-[var(--text-primary)]">
                {fmt(amount)}
              </p>
              {copied === "amount" ? (
                <Check
                  className="h-5 w-5 text-[var(--data-success-500)]"
                  strokeWidth={2.5}
                />
              ) : (
                <Copy
                  className="h-5 w-5 text-[var(--text-tertiary)] group-hover:text-[var(--accent)]"
                  strokeWidth={2}
                />
              )}
            </div>
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
              {copied === "amount" ? "¡Copiado!" : "Toca para copiar"}
            </p>
          </button>

          {(method === "yape" || method === "plin") && account && (
            <div className="rounded-2xl border-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 space-y-4">
              {account.image && (
                <div className="flex justify-center">
                  <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden border-2 border-[var(--rule-base)] bg-white shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={account.image}
                      alt={`QR ${METHOD_LABEL[method]} de ${account.name ?? storeName}`}
                      className="w-full h-full object-contain p-2"
                    />
                  </div>
                </div>
              )}
              {!account.image && (
                <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-8 px-4 text-center">
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Esta tienda no subió su QR aún. Usa el número:
                  </p>
                </div>
              )}
              <div className="space-y-2 text-center">
                {account.name && (
                  <p className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                    {account.name}
                  </p>
                )}
                {account.phone && (
                  <button
                    type="button"
                    onClick={() => copyText(account.phone!, "phone")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] hover:border-[var(--accent)] transition-colors"
                  >
                    <span className="font-mono text-base font-bold text-[var(--text-primary)]">
                      {account.phone}
                    </span>
                    {copied === "phone" ? (
                      <Check
                        className="h-4 w-4 text-[var(--data-success-500)]"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <Copy
                        className="h-4 w-4 text-[var(--text-tertiary)]"
                        strokeWidth={2}
                      />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {method === "transfer" && transfer && (
            <div className="rounded-2xl border-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 space-y-3">
              <div className="text-center">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                  Banco
                </p>
                <p className="text-lg font-black text-[var(--text-primary)]">
                  {transfer.bankName ?? "—"}
                </p>
              </div>
              <div className="text-center pt-2 border-t-2 border-dashed border-[var(--rule-soft)]">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                  Titular
                </p>
                <p className="text-base font-bold text-[var(--text-primary)]">
                  {transfer.accountHolder ?? "—"}
                </p>
              </div>
              <div className="text-center pt-2 border-t-2 border-dashed border-[var(--rule-soft)]">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                  Número de cuenta
                </p>
                {transfer.accountNumber ? (
                  <button
                    type="button"
                    onClick={() =>
                      copyText(transfer.accountNumber!, "account")
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] hover:border-[var(--accent)] transition-colors"
                  >
                    <span className="font-mono text-base font-bold text-[var(--text-primary)]">
                      {transfer.accountNumber}
                    </span>
                    {copied === "account" ? (
                      <Check
                        className="h-4 w-4 text-[var(--data-success-500)]"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <Copy
                        className="h-4 w-4 text-[var(--text-tertiary)]"
                        strokeWidth={2}
                      />
                    )}
                  </button>
                ) : (
                  <p className="text-base text-[var(--text-tertiary)]">—</p>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
              Captura del pago *
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              // Audit 2026-05-17 07-P1-2: capture="environment" abre cámara
              // trasera directamente en Android/iOS. Sin esto, mobile abre
              // file picker y el usuario navega galería — fricción alta para
              // foto de comprobante Yape inmediata. En desktop es no-op.
              // Cambio UX-only — no afecta totales, idempotency ni providers.
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {!previewUrl ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "w-full rounded-2xl border-2 border-dashed p-8 text-center transition-all",
                  dragOver
                    ? "border-[var(--accent)] bg-primary/10"
                    : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-[var(--accent)] hover:bg-primary/10",
                )}
              >
                <Upload
                  className="h-8 w-8 mx-auto mb-3 text-[var(--text-tertiary)]"
                  strokeWidth={1.75}
                />
                <p className="text-base font-bold text-[var(--text-primary)]">
                  Arrastra la captura aquí
                </p>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">
                  o tocá para elegir desde tu galería
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2">
                  JPG · PNG · WebP · HEIC · máx 5 MB
                </p>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Captura del pago"
                    className="w-full max-h-72 object-contain"
                  />
                  {uploadedUrl && (
                    <div className="absolute top-2 right-2 inline-flex items-center gap-1.5 bg-[var(--data-success-500)] text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        strokeWidth={2.5}
                      />
                      Subida
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setPreviewUrl(null);
                      setUploadedUrl(null);
                      setUploadedToken(null);
                    }}
                    className="flex-1 h-11 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <ImageIcon className="h-4 w-4" strokeWidth={2} />
                    Cambiar
                  </button>
                  {!uploadedUrl && (
                    <button
                      type="button"
                      onClick={upload}
                      disabled={uploading}
                      className={cn(
                        "flex-1 h-11 rounded-2xl text-sm font-black inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        brand.accent,
                      )}
                    >
                      {uploading ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            strokeWidth={2.5}
                          />
                          Subiendo…
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" strokeWidth={2.5} />
                          Subir captura
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {(method === "yape" || method === "plin") && (
            <div>
              <label
                htmlFor="proof-ref"
                className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2"
              >
                Número de operación (opcional)
              </label>
              <input
                id="proof-ref"
                value={reference}
                onChange={(e) =>
                  setReference(e.target.value.replace(/\D/g, "").slice(0, 20))
                }
                placeholder="Ej: 123456789"
                inputMode="numeric"
                className="w-full h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 p-3">
              <AlertCircle
                className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5"
                strokeWidth={2}
              />
              <p className="text-sm font-semibold text-[var(--data-error-700)]">
                {error}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] sticky bottom-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "flex-1 h-12 rounded-2xl text-base font-black inline-flex items-center justify-center gap-2 transition-all",
              canConfirm
                ? brand.accent + " shadow-lg hover:shadow-xl"
                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
            )}
          >
            {canConfirm ? (
              <>
                <Camera className="h-5 w-5" strokeWidth={2.5} />
                Confirmar pago
              </>
            ) : (
              "Sube la captura primero"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
