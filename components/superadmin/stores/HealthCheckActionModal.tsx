"use client";

/**
 * HealthCheckActionModal — Modal contextual al hacer click en un check de Salud.
 *
 * Muestra el dato actual + permite editarlo/subirlo según el tipo de check:
 *   - logo / banner       → upload de imagen (drag&drop, paste, click)
 *   - yape                → toggle activar + número
 *   - address             → input texto + lat/lng opcional
 *   - razonSocial / ruc / businessName / hours / deliveryZone / description
 *                         → input simple texto
 *   - published           → toggle store.isPublished
 *   - ownerPhone / businessPhone → input teléfono
 *
 * Backend: PATCH /api/superadmin/tenants/[slug]/health-field
 * (endpoint nuevo que mapea check.id → tabla/campo correcto).
 */

import { useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  X,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Trash2,
} from "@buleje/design-system/icons";

interface HealthCheckActionModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  checkId: string;
  checkLabel: string;
  /** Valor actual mostrado en el modal cuando se abre (si está disponible) */
  currentValue?: string | null;
  /** Llamado cuando el usuario guardó algo — para refrescar la lista de Salud */
  onSaved?: () => void;
}

type FieldType = "image" | "text" | "phone" | "yape" | "boolean";

function fieldTypeFor(checkId: string): FieldType {
  if (checkId === "logo" || checkId === "banner") return "image";
  if (checkId === "yape") return "yape";
  if (checkId === "ownerPhone" || checkId === "businessPhone") return "phone";
  if (checkId === "published") return "boolean";
  return "text";
}

export default function HealthCheckActionModal({
  open,
  onClose,
  tenantId,
  tenantSlug,
  tenantName,
  checkId,
  checkLabel,
  currentValue,
  onSaved,
}: HealthCheckActionModalProps) {
  const fieldType = fieldTypeFor(checkId);
  const [value, setValue] = useState<string>(currentValue ?? "");
  const [yapeEnabled, setYapeEnabled] = useState(false);
  const [yapePhone, setYapePhone] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(currentValue ?? null);
  const [status, setStatus] = useState<"idle" | "uploading" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedPct, setSavedPct] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setValue(currentValue ?? "");
    setImageUrl(currentValue ?? null);
    setStatus("idle");
    setErrorMsg(null);
    setSavedPct(null);
  }, [open, currentValue]);

  // Paste handler global mientras el modal está abierto
  useEffect(() => {
    if (!open || fieldType !== "image") return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadImage(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fieldType]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function uploadImage(file: File) {
    setStatus("uploading");
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", `tenant-${tenantSlug}-${checkId}`);
      fd.append("mode", checkId === "banner" ? "wide" : "square");
      const res = await fetch("/api/superadmin/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "upload_failed");
      }
      const json = (await res.json()) as { url: string; savedPct: number };
      setImageUrl(json.url);
      setSavedPct(json.savedPct);
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message ?? "Error subiendo");
    }
  }

  async function save() {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const body: Record<string, unknown> = {
        tenantId,
        checkId,
      };
      if (fieldType === "image") body.value = imageUrl ?? "";
      else if (fieldType === "yape") {
        body.value = JSON.stringify({ enabled: yapeEnabled, phone: yapePhone });
      } else {
        body.value = value;
      }
      const res = await fetch("/api/superadmin/stores/health-field", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "save_failed");
      }
      setStatus("saved");
      onSaved?.();
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message ?? "Error guardando");
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar ${checkLabel}`}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[var(--surface-canvas)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--rule-base)]">
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {tenantName}
            </p>
            <p className="text-lg font-black text-[var(--text-primary)] mt-0.5">
              {checkLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* ── IMAGE FIELD — slot compacto, no full size ─────── */}
          {fieldType === "image" && (
            <div className="max-w-[240px]">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void uploadImage(file);
                }}
                className={`relative w-full ${
                  checkId === "banner" ? "aspect-[16/7]" : "aspect-[4/3]"
                } rounded-lg overflow-hidden border-2 transition-all ${
                  isDragging
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                    : "border-dashed border-[var(--rule-base)] hover:border-[var(--accent)]/50"
                }`}
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={checkLabel}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[var(--text-tertiary)] bg-[var(--surface-sunken)]">
                    <Upload className="h-4 w-4" strokeWidth={1.75} />
                    <p className="text-[length:var(--ts-xs)] font-bold">Click, arrastrar o Ctrl+V</p>
                  </div>
                )}
                {status === "uploading" && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-1 text-white">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span className="text-[length:var(--ts-xs)] font-bold">Optimizando...</span>
                  </div>
                )}
                {savedPct != null && savedPct > 0 && (
                  <span className="absolute top-1 right-1 inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur text-white px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider">
                    -{savedPct}%
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadImage(file);
                  e.target.value = "";
                }}
              />
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="mt-1.5 text-[length:var(--ts-xs)] font-bold text-[var(--data-error-500)] inline-flex items-center gap-1 hover:underline"
                >
                  <Trash2 className="h-3 w-3" />
                  Quitar imagen
                </button>
              )}
            </div>
          )}

          {/* ── YAPE FIELD ────────────────────────────────── */}
          {fieldType === "yape" && (
            <>
              <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={yapeEnabled}
                  onChange={(e) => setYapeEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                Activar Yape como método de pago
              </label>
              <input
                type="tel"
                value={yapePhone}
                onChange={(e) => setYapePhone(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Número Yape (9 dígitos)"
                disabled={!yapeEnabled}
                className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-bold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none disabled:opacity-60"
              />
            </>
          )}

          {/* ── PHONE FIELD ───────────────────────────────── */}
          {fieldType === "phone" && (
            <input
              type="tel"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9+\s-]/g, ""))}
              placeholder="Número de teléfono"
              className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-bold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
            />
          )}

          {/* ── BOOLEAN FIELD ─────────────────────────────── */}
          {fieldType === "boolean" && (
            <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={value === "true" || value === "1"}
                onChange={(e) => setValue(e.target.checked ? "true" : "false")}
                className="h-4 w-4"
              />
              Publicar tienda en marketplace
            </label>
          )}

          {/* ── TEXT FIELD ────────────────────────────────── */}
          {fieldType === "text" && (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={checkId === "description" ? 3 : 2}
              placeholder={`Escribir ${checkLabel.toLowerCase()}...`}
              className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
            />
          )}

          {/* Errores */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-[var(--data-error-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Link rápido al panel del tenant */}
          <a
            href={`/superadmin/tenants/${tenantSlug}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--accent)]"
          >
            <ExternalLink className="h-3 w-3" />
            Ver detalles del tenant
          </a>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-raised)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={status === "uploading" || status === "saving"}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
              status === "saved"
                ? "bg-[var(--data-success-500)] text-white"
                : "bg-[var(--accent-600,var(--accent))] text-white hover:opacity-90 disabled:opacity-50"
            }`}
          >
            {status === "saved" ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Guardado
              </>
            ) : status === "saving" ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar cambios"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
