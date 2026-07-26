"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  FileText,
  X,
  Loader2,
  Check,
  ChevronRight,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbDocumentTemplate, TemplateField } from "@/lib/types/documents";

interface Props {
  onClose: () => void;
  onGenerated: () => void;
}

const FIELD =
  "w-full h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]";

const TEXTAREA =
  "w-full text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 py-3 bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none";

export default function DocumentTemplatesModal({ onClose, onGenerated }: Props) {
  const [templates, setTemplates] = useState<DbDocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DbDocumentTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/superadmin/documents/templates", {
          headers: csrfHeaders({}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { templates: DbDocumentTemplate[] };
        setTemplates(data.templates);
      } catch (err) {
        console.error("[sa-templates] fetch templates failed", err);
        setFetchError("No se pudieron cargar las plantillas.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectTemplate = (t: DbDocumentTemplate) => {
    setSelected(t);
    setValues({});
    setFieldError(null);
    setSuccess(false);
  };

  const setValue = (name: string, val: string) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    setFieldError(null);
  };

  const handleGenerate = async () => {
    if (!selected) return;
    const missing = selected.fields.filter(
      (f) => f.required && !values[f.name]?.trim(),
    );
    if (missing.length > 0) {
      setFieldError(
        `Completá los campos obligatorios: ${missing.map((f) => f.label).join(", ")}`,
      );
      return;
    }
    setFieldError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/superadmin/documents/templates/generate", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          templateKey: selected.key,
          values,
          filename: `${selected.key}-${Date.now()}.pdf`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      setSuccess(true);
      onGenerated();
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      console.error("[sa-templates] generate failed", err);
      setFieldError(
        err instanceof Error ? err.message : "Error al generar el documento.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const renderField = (f: TemplateField) => {
    const val = values[f.name] ?? "";
    const labelEl = (
      <span className="text-sm font-semibold text-[var(--text-secondary)]">
        {f.label}
        {f.required && (
          <span className="text-[var(--data-error-500)] ml-0.5">*</span>
        )}
      </span>
    );

    if (f.type === "textarea") {
      return (
        <label key={f.name} className="block space-y-1">
          {labelEl}
          <textarea
            value={val}
            onChange={(e) => setValue(f.name, e.target.value)}
            placeholder={f.placeholder}
            rows={3}
            className={TEXTAREA}
          />
        </label>
      );
    }

    const inputType =
      f.type === "date"
        ? "date"
        : f.type === "number" || f.type === "currency"
          ? "number"
          : "text";

    return (
      <label key={f.name} className="block space-y-1">
        {labelEl}
        <input
          type={inputType}
          step={
            f.type === "currency" || f.type === "number" ? "0.01" : undefined
          }
          value={val}
          onChange={(e) => setValue(f.name, e.target.value)}
          placeholder={f.placeholder}
          className={FIELD}
        />
      </label>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Generar documento desde plantilla"
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-lg)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--text-secondary)]" />
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Generar documento desde plantilla
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body: list + form */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Template list */}
          <div className="w-56 shrink-0 border-r border-[var(--rule-soft)] overflow-y-auto bg-[var(--surface-sunken)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
              </div>
            ) : fetchError ? (
              <p className="p-4 text-sm text-[var(--data-error-500)]">
                {fetchError}
              </p>
            ) : templates.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-tertiary)]">
                Sin plantillas disponibles.
              </p>
            ) : (
              <ul className="p-2 space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => selectTemplate(t)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        selected?.id === t.id
                          ? "bg-primary/10 text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])]"
                          : "hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                      }`}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{t.name}</span>
                      {selected?.id === t.id && (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Form panel */}
          <div className="flex-1 overflow-y-auto p-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-tertiary)]">
                <FileText className="h-10 w-10" />
                <p className="text-sm">Elegí una plantilla para continuar.</p>
              </div>
            ) : success ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="h-12 w-12 rounded-full flex items-center justify-center bg-[var(--data-success-500)]/15">
                  <Check className="h-6 w-6 text-[var(--data-success-500)]" />
                </div>
                <p className="text-base font-semibold text-[var(--data-success-500)]">
                  Documento generado correctamente
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {selected.description && (
                  <p className="text-sm text-[var(--text-secondary)]">
                    {selected.description}
                  </p>
                )}

                {selected.fields.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Esta plantilla no requiere campos adicionales.
                  </p>
                ) : (
                  selected.fields.map(renderField)
                )}

                {fieldError && (
                  <p
                    role="alert"
                    className="text-sm font-medium text-[var(--data-error-500)]"
                  >
                    {fieldError}
                  </p>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 disabled:opacity-50"
                  >
                    {generating ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                    Generar documento
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
