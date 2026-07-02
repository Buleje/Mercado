"use client";

/**
 * CacaoAjusteModal — ajuste manual de inventario de cacao seco (ADR-128 v4).
 * Mermas físicas, muestras, pérdidas o correcciones que NO salen de una venta.
 * El tipo determina si el kg entra (+) o sale (−) del stock disponible.
 */
import { useState } from "react";
import { SlidersHorizontal, Loader2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  CACAO_AJUSTE_TIPOS,
  CACAO_AJUSTE_LABEL,
  CACAO_VARIEDADES,
  cacaoAjusteSigno,
  type CacaoAjusteTipo,
} from "@/lib/cacao/cacao-quality";

interface Props {
  variedades?: (string | null)[];
  onClose: () => void;
  onSaved: () => void;
}
const I =
  "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";

const TIPO_HINT: Record<CacaoAjusteTipo, string> = {
  merma: "Peso perdido por manipuleo/secado extra (sale).",
  muestra: "Cacao apartado para muestra/calidad (sale).",
  perdida: "Robo, plaga, humedad, deterioro (sale).",
  ajuste_pos: "Corrección que suma stock (entra).",
  ajuste_neg: "Corrección que resta stock (sale).",
};

export default function CacaoAjusteModal({ variedades, onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<CacaoAjusteTipo>("merma");
  const [cantidadKg, setCantidad] = useState("");
  const [variedad, setVariedad] = useState("");
  const [grado, setGrado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");

  const opciones = Array.from(
    new Set([
      ...(variedades ?? []).filter((v): v is string => !!v && v !== "—"),
      ...CACAO_VARIEDADES,
    ]),
  );
  const sale = cacaoAjusteSigno(tipo) < 0;
  const isValid = Number(cantidadKg) > 0 && motivo.trim().length >= 3;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !isValid) {
      if (!isValid) setError("Ingresá la cantidad (kg) y un motivo (mín. 3 caracteres).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        tipo,
        cantidadKg: Number(cantidadKg),
        variedad: variedad || null,
        grado: grado || null,
        motivo: motivo.trim(),
        observaciones: obs.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=ajuste", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <AdminModal open onClose={onClose} variant="centered-sm" hideCloseButton>
      <form onSubmit={submit} className="bg-[var(--surface-raised)]">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <SlidersHorizontal className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">
                Ajustar stock
              </CardTitle>
              <p className="text-xs text-[var(--text-tertiary)]">
                Mermas, muestras, pérdidas o correcciones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {error && (
            <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
              {error}
            </div>
          )}

          <Field label="Tipo de ajuste" required>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CACAO_AJUSTE_TIPOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition ${tipo === t ? (cacaoAjusteSigno(t) < 0 ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-900)]") : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                >
                  {CACAO_AJUSTE_LABEL[t]}
                </button>
              ))}
            </div>
            <span className="mt-1.5 block text-xs text-[var(--text-tertiary)]">
              {TIPO_HINT[tipo]}
            </span>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label={`Cantidad (kg) ${sale ? "sale" : "entra"}`} required>
              <input
                type="number"
                step="0.01"
                value={cantidadKg}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0.00"
                className={`${I} font-mono tabular-nums ${sale ? "border-[var(--data-error-300)]" : "border-[var(--data-success-300)]"}`}
              />
            </Field>
            <Field label="Variedad">
              <select value={variedad} onChange={(e) => setVariedad(e.target.value)} className={I}>
                <option value="">Todas</option>
                {opciones.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grado">
              <select value={grado} onChange={(e) => setGrado(e.target.value)} className={I}>
                <option value="">—</option>
                <option value="I">Grado I</option>
                <option value="II">Grado II</option>
              </select>
            </Field>
          </div>

          <Field label="Motivo" required>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: muestra para cliente, merma de re-secado…"
              className={I}
            />
          </Field>
          <Field label="Observaciones">
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              placeholder="Detalle opcional…"
              className={`${I} h-auto resize-none py-2.5`}
            />
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando
              </>
            ) : (
              "Registrar ajuste"
            )}
          </button>
        </footer>
      </form>
    </AdminModal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        {label}
        {required && <span className="text-[var(--data-error-600)]">*</span>}
      </span>
      {children}
    </label>
  );
}
