"use client";

import { useEffect, useRef, useState } from "react";
import { PenTool, FileText, X, Loader2, Check } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { csrfHeaders } from "@/lib/csrf-client";
import { fmtDate } from "./shared";

interface Props {
  doc: DbDocument;
  onClose: () => void;
  onSigned?: () => void;
}

const FIELD =
  "w-full h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]";

interface SignResult {
  version: { versionNumber: number } | null;
  originalSha256: string;
  signedAt: string;
}

export default function DocumentSignModal({ doc, onClose, onSigned }: Props) {
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [signing, setSigning] = useState(false);
  const [result, setResult] = useState<SignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isPdf = doc.mimeType === "application/pdf";
  const canSign = signerName.trim().length >= 2;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-close after success
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      onSigned?.();
      onClose();
    }, 1200);
    return () => clearTimeout(t);
  }, [result, onSigned, onClose]);

  const handleSign = async () => {
    if (!canSign || signing) return;
    setSigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/documents/${doc.id}/sign`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerRole: signerRole.trim() || undefined,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const code =
          data && typeof data === "object" && "error" in data
            ? (data as Record<string, unknown>).error
            : null;
        if (code === "only_pdf_signable") {
          setError("Solo PDFs pueden ser firmados.");
        } else {
          setError("No se pudo firmar el documento.");
        }
        console.error("[sa-sign] sign failed", { status: res.status, data });
        return;
      }
      setResult(data as SignResult);
    } catch (err) {
      setError("No se pudo firmar el documento.");
      console.error("[sa-sign] fetch error", err);
    } finally {
      setSigning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Firmar documento"
        className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-lg)] p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Firmar documento</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success state */}
        {result && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-full"
              style={{ background: "var(--data-success-500)" }}
            >
              <Check className="h-6 w-6 text-white" />
            </div>
            <p className="text-base font-bold text-[var(--text-primary)]">
              Documento firmado{result.version ? ` · v${result.version.versionNumber}` : ""}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">{fmtDate(result.signedAt)}</p>
          </div>
        )}

        {/* Non-PDF gate */}
        {!result && !isPdf && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-full"
              style={{ background: "var(--accent-soft)" }}
            >
              <FileText className="h-6 w-6 text-[var(--text-primary)]" />
            </div>
            <p className="text-base font-semibold text-[var(--text-primary)]">
              Solo se pueden firmar documentos PDF.
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Este archivo es <span className="font-mono">{doc.mimeType}</span> y no admite firma
              digital.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 h-12 px-6 rounded-2xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* PDF form */}
        {!result && isPdf && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">
                Nombre de quien firma <span aria-hidden="true">*</span>
              </span>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Nombre de quien firma"
                maxLength={120}
                className={FIELD}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">
                Cargo o rol
              </span>
              <input
                value={signerRole}
                onChange={(e) => setSignerRole(e.target.value)}
                placeholder="Cargo o rol (opcional)"
                maxLength={120}
                className={FIELD}
              />
            </label>

            <p
              className="text-sm rounded-xl px-3 py-2"
              style={{ background: "var(--accent-soft)", color: "var(--text-secondary)" }}
            >
              Se agrega una versión firmada del PDF; la original queda en el historial.
            </p>

            {error && (
              <p
                className="text-sm font-semibold px-3 py-2 rounded-xl"
                style={{ color: "var(--data-error-500)", background: "var(--accent-soft)" }}
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSign}
                disabled={!canSign || signing}
                className="flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 disabled:opacity-50"
              >
                {signing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <PenTool className="h-5 w-5" />
                )}
                Firmar documento
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
