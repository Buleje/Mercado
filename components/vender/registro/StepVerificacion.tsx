"use client";

/**
 * StepVerificacion — wizard step 3: foto RUC + foto fachada + términos.
 * Inputs de upload son mock (sólo toggle visual). Producción: S3/UploadThing.
 */

import { useCallback } from "react";
import type { VerificacionForm } from "@/lib/validators/vendor-registration";
import {
  Upload,
  ShieldCheck,
  Store,
  FileText,
  Check,
} from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

interface StepVerificacionProps {
  value: VerificacionForm;
  errors: Partial<Record<keyof VerificacionForm, string>>;
  onChange: (patch: Partial<VerificacionForm>) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-[var(--data-error)]" role="alert">
      {message}
    </p>
  );
}

interface UploadTileProps {
  Icon: typeof FileText;
  title: string;
  hint: string;
  uploaded: boolean;
  error?: string;
  onToggle: () => void;
}

function UploadTile({ Icon, title, hint, uploaded, error, onToggle }: UploadTileProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-[var(--surface-canvas)] p-6 text-center transition-colors",
          uploaded
            ? "border-[var(--data-success)] bg-[var(--data-success)]/5"
            : error
              ? "border-[var(--data-error)]"
              : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]",
        )}
        aria-pressed={uploaded}
      >
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            uploaded
              ? "bg-[var(--data-success)] text-white"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
          )}
          aria-hidden="true"
        >
          {uploaded ? (
            <Check className="h-5 w-5" strokeWidth={2.5} />
          ) : (
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          )}
        </span>
        <span>
          <span className="block text-sm font-bold text-[var(--text-primary)]">
            {uploaded ? `${title} subida` : title}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
            {uploaded ? "Tocá para reemplazar" : hint}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
          <Upload className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {uploaded ? "Cambiar foto" : "Subir foto"}
        </span>
      </button>
      <FieldError message={error} />
    </div>
  );
}

export default function StepVerificacion({
  value,
  errors,
  onChange,
}: StepVerificacionProps) {
  const toggleRuc = useCallback(() => {
    onChange({ fotoRucSubida: !value.fotoRucSubida });
  }, [value.fotoRucSubida, onChange]);

  const toggleFachada = useCallback(() => {
    onChange({ fotoFachadaSubida: !value.fotoFachadaSubida });
  }, [value.fotoFachadaSubida, onChange]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <ShieldCheck className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={1.5} aria-hidden="true" />
          Verifiquemos tu identidad
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Esto mantiene limpio el marketplace. A los clientes les da tranquilidad saber que sos un negocio real.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UploadTile
          Icon={FileText}
          title="Foto de tu RUC"
          hint="PDF o imagen del certificado SUNAT"
          uploaded={value.fotoRucSubida}
          error={errors.fotoRucSubida}
          onToggle={toggleRuc}
        />
        <UploadTile
          Icon={Store}
          title="Foto de tu fachada"
          hint="Frente del local con cartel visible"
          uploaded={value.fotoFachadaSubida}
          error={errors.fotoFachadaSubida}
          onToggle={toggleFachada}
        />
      </div>

      {/* Términos */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={value.aceptoTerminos}
            onChange={(e) => onChange({ aceptoTerminos: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--text-primary)]"
          />
          <span className="text-xs leading-relaxed text-[var(--text-secondary)]">
            Acepto los{" "}
            <a
              href="/terminos"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--text-primary)] underline"
            >
              términos y condiciones de vendedor
            </a>{" "}
            y la{" "}
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--text-primary)] underline"
            >
              política de privacidad
            </a>
            . Entiendo que Buleje puede verificar mis datos con SUNAT.
          </span>
        </label>
        <FieldError message={errors.aceptoTerminos} />
      </div>
    </div>
  );
}
