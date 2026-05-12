"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Upload, Check, Copy, Smartphone, Loader2, X, Zap } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { BTN } from "@/lib/copy";
import { PrimaryButton, IconBadge } from "@buleje/design-system";

/**
 * YapeQRCheckout — Yape QR embebido + upload captura de pago.
 *
 * Perú context (research): 73% pagos bodegas Lima son Yape+Plin.
 * UX: mostramos QR grande, número copiable, monto exacto. Usuario paga
 * desde su app, sube captura, el backend valida con vision LLM.
 *
 * Estados:
 *   - idle: muestra QR + instrucciones
 *   - uploading: uploadeando captura
 *   - validating: backend verificando con vision LLM
 *   - success: pago verificado, continua
 *   - error: captura inválida, reintentar
 *
 * @example
 * <YapeQRCheckout
 *   orderId="BUL-1234"
 *   amount={47.5}
 *   qrImageUrl="data:image/png..."
 *   recipientName="Buleje San Martín"
 *   recipientPhone="929340532"
 *   onVerified={() => {...}}
 * />
 */

interface Props {
  orderId: string;
  amount: number;
  /** URL de la imagen QR (o dataURL base64) */
  qrImageUrl: string;
  /** Nombre del receptor que aparece en Yape */
  recipientName: string;
  /** Número de celular Yape (formato 9XXXXXXXX) */
  recipientPhone: string;
  /** Endpoint que valida la captura con vision LLM */
  validateEndpoint?: string;
  onVerified?: () => void;
  onCancel?: () => void;
}

type Status = "idle" | "uploading" | "validating" | "success" | "error";

export function YapeQRCheckout({
  orderId,
  amount,
  qrImageUrl,
  recipientName,
  recipientPhone,
  validateEndpoint = "/api/payments/yape/verify",
  onVerified,
  onCancel,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"phone" | "amount" | null>(null);

  const copyToClipboard = useCallback(async (text: string, field: "phone" | "amount") => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  const handleFile = async (file: File) => {
    setStatus("uploading");
    setErrorMsg(null);

    const form = new FormData();
    form.append("capture", file);
    form.append("orderId", orderId);
    form.append("amount", String(amount));

    try {
      setStatus("validating");
      const res = await fetch(validateEndpoint, {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (data.verified === true) {
        setStatus("success");
        setTimeout(() => {
          onVerified?.();
        }, 1200);
      } else {
        setStatus("error");
        setErrorMsg(data.error ?? "No pudimos validar tu pago. Toma otra captura o revisa el monto.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Error de conexión. Intentá de nuevo.");
    }
  };

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden max-w-lg mx-auto">
      {/* Header */}
      <div className="p-5 border-b border-[var(--rule-soft)] flex items-start justify-between gap-3">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
            Pago con Yape
          </p>
          <h3 className="text-lg font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Pedido #{orderId}
          </h3>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-sunken)] transition-colors"
            aria-label="Cancelar"
          >
            <X className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* QR + details */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5 border-b border-[var(--rule-soft)]">
        {/* QR code */}
        <div className="flex items-center justify-center">
          <div className="relative rounded-xl border-2 border-[var(--text-primary)] p-2 bg-white">
            <Image
              src={qrImageUrl}
              alt="Código QR Yape"
              width={180}
              height={180}
              className="h-44 w-44 object-contain"
            />
          </div>
        </div>

        {/* Data rows */}
        <div className="space-y-3">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              Nombre
            </p>
            <p className="text-sm font-extrabold text-[var(--text-primary)]">{recipientName}</p>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              Celular Yape
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard(recipientPhone, "phone")}
              className="inline-flex items-center gap-2 text-sm font-extrabold tabular-nums text-[var(--text-primary)] hover:opacity-70 transition-opacity"
            >
              {recipientPhone}
              {copiedField === "phone" ? (
                <Check className="h-3.5 w-3.5 text-[var(--data-success-500)]" strokeWidth={2.5} />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.75} />
              )}
            </button>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              Monto exacto
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard(amount.toFixed(2), "amount")}
              className="inline-flex items-center gap-2 text-2xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] hover:opacity-70 transition-opacity"
            >
              S/ {amount.toFixed(2)}
              {copiedField === "amount" ? (
                <Check className="h-4 w-4 text-[var(--data-success-500)]" strokeWidth={2.5} />
              ) : (
                <Copy className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Deeplink 1-tap — abre app Yape directo con monto pre-llenado */}
      <div className="p-5 border-b border-[var(--rule-soft)]">
        <a
          href={`yape://payment?phone=${encodeURIComponent(recipientPhone)}&amount=${amount.toFixed(2)}`}
          className="flex items-center justify-center gap-2 w-full rounded-full bg-[#722D82] text-white font-bold py-4 text-base hover:bg-[#5d2470] transition-colors md:hidden"
          aria-label="Abrir Yape con el monto exacto"
        >
          <Zap className="h-5 w-5" strokeWidth={2} aria-hidden />
          Abrir Yape — Pagar S/ {amount.toFixed(2)}
        </a>
        <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center md:hidden">
          Se abre tu app con el monto listo. Si no tenés Yape, usá el QR abajo.
        </p>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center hidden md:block">
          En móvil aparece un botón para abrir Yape directo. En desktop escaneá el QR.
        </p>
      </div>

      {/* Steps */}
      <div className="p-5 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
          Cómo pagar
        </p>
        <ol className="space-y-2 text-sm text-[var(--text-secondary)]">
          <li className="flex items-start gap-2">
            <IconBadge size="xs" className="mt-0.5">1</IconBadge>
            Abre tu app de Yape y tocá &ldquo;Pagar con QR&rdquo; o &ldquo;Yapear&rdquo;
          </li>
          <li className="flex items-start gap-2">
            <IconBadge size="xs" className="mt-0.5">2</IconBadge>
            Escaneá el código o ingresá el celular <span className="font-semibold tabular-nums">{recipientPhone}</span>
          </li>
          <li className="flex items-start gap-2">
            <IconBadge size="xs" className="mt-0.5">3</IconBadge>
            Paga exacto <span className="font-semibold tabular-nums">S/ {amount.toFixed(2)}</span> y toma captura
          </li>
          <li className="flex items-start gap-2">
            <IconBadge size="xs" className="mt-0.5">4</IconBadge>
            Sube la captura abajo — validamos en 5 segundos
          </li>
        </ol>
      </div>

      {/* Upload zone */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          {status === "idle" && (
            <m.label
              key="idle"
              htmlFor="yape-capture-upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--rule-base)] hover:border-[var(--rule-strong)] bg-[var(--surface-sunken)] p-6 cursor-pointer transition-colors"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]">
                <Upload className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div className="text-center">
                <p className="text-sm font-extrabold text-[var(--text-primary)]">
                  {BTN.uploadCapture}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  PNG o JPG · Validamos automáticamente
                </p>
              </div>
              <input
                id="yape-capture-upload"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </m.label>
          )}

          {(status === "uploading" || status === "validating") && (
            <m.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-8"
            >
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-primary)]" strokeWidth={1.75} />
              <div className="text-center">
                <p className="text-sm font-extrabold text-[var(--text-primary)]">
                  {status === "uploading" ? "Subiendo captura…" : "Validando con IA…"}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Un momento por favor</p>
              </div>
            </m.div>
          )}

          {status === "success" && (
            <m.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--data-success-500)] bg-emerald-50 dark:bg-emerald-950/30 p-8"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white">
                <Check className="h-6 w-6" strokeWidth={2.5} />
              </span>
              <div className="text-center">
                <p className="text-base font-extrabold text-[var(--text-primary)]">
                  ¡Pago verificado!
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Ya podemos preparar tu pedido
                </p>
              </div>
            </m.div>
          )}

          {status === "error" && (
            <m.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <div className="rounded-xl border border-[var(--data-error-500)] bg-red-50 dark:bg-red-950/20 p-4">
                <p className="text-sm font-extrabold text-[var(--data-error-500)] mb-1">
                  No pudimos validar
                </p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <PrimaryButton
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setErrorMsg(null);
                }}
                size="lg"
                className="w-full rounded-full"
                leftIcon={<Upload className="h-4 w-4" strokeWidth={1.75} />}
              >
                Probar otra captura
              </PrimaryButton>
            </m.div>
          )}
        </AnimatePresence>

        {/* Footer note */}
        <p className="mt-4 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] text-center leading-relaxed">
          <Smartphone className="inline h-3 w-3 -mt-0.5" strokeWidth={1.75} aria-hidden />{" "}
          Si tienes problemas, escríbenos por WhatsApp y te ayudamos con el pago
        </p>
      </div>
    </div>
  );
}
