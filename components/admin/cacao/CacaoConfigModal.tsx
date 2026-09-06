"use client";

/**
 * CacaoConfigModal — umbrales de alertas del módulo Cacao por tenant (ADR-128 v4).
 * Precio objetivo (S//kg), stock mínimo, días de fermentación y humedad meta.
 * Alimenta el panel de alertas en vivo y el cron de recordatorios.
 */
import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";

interface Cfg {
  precioAlertaPenKg: number | null;
  stockMinimoKg: number | null;
  fermDiasAlerta: number;
  humedadMaxPct: number;
}
interface Props {
  onClose: () => void;
  onSaved?: () => void;
}
const I =
  "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-mono tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function CacaoConfigModal({ onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [precio, setPrecio] = useState("");
  const [stock, setStock] = useState("");
  const [fermDias, setFermDias] = useState("7");
  const [humedad, setHumedad] = useState("7.5");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/cacao?view=config", { credentials: "include" });
        if (r.ok) {
          const c: Cfg = (await r.json()).config;
          setPrecio(c.precioAlertaPenKg != null ? String(c.precioAlertaPenKg) : "");
          setStock(c.stockMinimoKg != null ? String(c.stockMinimoKg) : "");
          setFermDias(String(c.fermDiasAlerta ?? 7));
          setHumedad(String(c.humedadMaxPct ?? 7.5));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const config = {
        precioAlertaPenKg: precio === "" ? null : Number(precio),
        stockMinimoKg: stock === "" ? null : Number(stock),
        fermDiasAlerta: fermDias === "" ? 7 : Number(fermDias),
        humedadMaxPct: humedad === "" ? 7.5 : Number(humedad),
      };
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "save_config", config }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open onClose={onClose} variant="centered-sm" hideCloseButton
      footer={
        <div className="flex items-center justify-end gap-2 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={save}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando
              </>
            ) : (
              "Guardar"
            )}
          </button>
        </div>
      }
    >
      <div className="bg-[var(--surface-raised)]">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <Bell className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">
                Alertas del módulo
              </CardTitle>
              <p className="text-xs text-[var(--text-tertiary)]">
                Configurá los umbrales que disparan avisos
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
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              <Field
                label="Precio objetivo de venta (S//kg)"
                hint="Avisar cuando la referencia de mercado supere este valor. Vacío = sin alerta."
              >
                <input
                  type="number"
                  step="0.01"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  placeholder="ej: 14.00"
                  className={I}
                />
              </Field>
              <Field
                label="Stock mínimo (kg seco)"
                hint="Avisar cuando el disponible baje de esto. Vacío = sin alerta."
              >
                <input
                  type="number"
                  step="1"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="ej: 100"
                  className={I}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Días de fermentación" hint="Atención al superarlos.">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="60"
                    value={fermDias}
                    onChange={(e) => setFermDias(e.target.value)}
                    className={I}
                  />
                </Field>
                <Field label="Humedad máx. (%)" hint="Fuera de norma sobre esto.">
                  <input
                    type="number"
                    step="0.1"
                    value={humedad}
                    onChange={(e) => setHumedad(e.target.value)}
                    className={I}
                  />
                </Field>
              </div>
            </>
          )}
        </div>

      </div>
    </AdminModal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}
