"use client";

/**
 * CacaoBitacoraModal — bitácora diaria de fermentación de un beneficio (ADR-128 v4).
 * Registra temperatura, volteo y pH por día. Al guardar, el backend re-sincroniza
 * los agregados del beneficio (n° de volteos y temp. máx.) — de ahí `onChanged`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Thermometer, Loader2, X, Plus, RotateCw, Check } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";

interface Registro {
  id: string;
  dia: number;
  fecha: string;
  tempC: string | null;
  volteo: boolean;
  phMasa: string | null;
  notas: string | null;
}
interface Props {
  beneficioId: string;
  loteCode: string | null;
  onClose: () => void;
  onChanged?: () => void;
}
const I =
  "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-tertiary)]";
const fdate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
};

export default function CacaoBitacoraModal({ beneficioId, loteCode, onClose, onChanged }: Props) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tempC, setTempC] = useState("");
  const [volteo, setVolteo] = useState(false);
  const [phMasa, setPh] = useState("");
  const [notas, setNotas] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/cacao?view=ferm-registros&beneficioId=${encodeURIComponent(beneficioId)}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setRegistros((await r.json()).registros ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [beneficioId]);
  useEffect(() => {
    load();
  }, [load]);

  const proximoDia = useMemo(
    () => (registros.length ? Math.max(...registros.map((r) => r.dia)) + 1 : 1),
    [registros],
  );
  const volteos = registros.filter((r) => r.volteo).length;
  const tempMax = useMemo(() => {
    const t = registros
      .map((r) => (r.tempC == null ? null : Number(r.tempC)))
      .filter((x): x is number => x != null);
    return t.length ? Math.max(...t) : null;
  }, [registros]);
  const canSave = tempC !== "" || volteo || phMasa !== "" || notas.trim() !== "";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        beneficioId,
        dia: proximoDia,
        tempC: tempC === "" ? null : Number(tempC),
        volteo,
        phMasa: phMasa === "" ? null : Number(phMasa),
        notas: notas.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=ferm-registro", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setTempC("");
      setVolteo(false);
      setPh("");
      setNotas("");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open onClose={onClose} variant="centered-sm" hideCloseButton
      footer={
        <div className="flex items-center justify-end px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Cerrar
          </button>
        </div>
      }
    >
      <div className="flex max-h-[88vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <Thermometer className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">
                Bitácora de fermentación
              </CardTitle>
              <p className="text-xs text-[var(--text-tertiary)]">
                Lote <span className="font-mono">{loteCode ?? "s/código"}</span> · temperatura y
                volteos por día
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

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && (
            <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Días
              </div>
              <div className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {registros.length}
              </div>
            </div>
            <div className="flex-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Volteos
              </div>
              <div className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {volteos}
              </div>
            </div>
            <div className="flex-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Temp. máx.
              </div>
              <div className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {tempMax != null ? `${tempMax.toFixed(0)}°` : "—"}
              </div>
            </div>
          </div>

          {/* Historial */}
          <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : registros.length === 0 ? (
              <p className="p-4 text-center text-sm text-[var(--text-tertiary)]">
                Sin registros. Anotá el día 1 abajo (temperatura de la masa al voltear).
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] text-left text-xs text-[var(--text-tertiary)]">
                  <tr>
                    <th className="px-3 py-2 font-bold">Día</th>
                    <th className="px-3 py-2 font-bold">Fecha</th>
                    <th className="px-3 py-2 text-right font-bold">Temp</th>
                    <th className="px-3 py-2 text-center font-bold">Volteo</th>
                    <th className="px-3 py-2 text-right font-bold">pH</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--rule-soft)]">
                      <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                        {r.dia}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-tertiary)]">{fdate(r.fecha)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {r.tempC != null ? `${Number(r.tempC).toFixed(0)}°C` : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.volteo ? (
                          <RotateCw className="mx-auto h-3.5 w-3.5 text-[var(--accent)]" />
                        ) : (
                          <span className="text-[var(--text-tertiary)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {r.phMasa != null ? Number(r.phMasa).toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Alta del día */}
          <form
            onSubmit={add}
            className="rounded-xl border-2 border-[var(--accent)]/30 bg-primary/10/30 p-3"
          >
            <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">
              Registrar día {proximoDia}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Temp (°C)
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={tempC}
                  onChange={(e) => setTempC(e.target.value)}
                  placeholder="45"
                  className={`${I} font-mono tabular-nums`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  pH masa
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={phMasa}
                  onChange={(e) => setPh(e.target.value)}
                  placeholder="5.2"
                  className={`${I} font-mono tabular-nums`}
                />
              </label>
              <button
                type="button"
                onClick={() => setVolteo((v) => !v)}
                className={`mt-[22px] inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border-2 text-sm font-bold transition ${volteo ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
              >
                {volteo ? <Check className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}Volteo
              </button>
            </div>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Nota del día (opcional)…"
              className={`${I} mt-2 h-10`}
            />
            <button
              type="submit"
              disabled={saving || !canSave}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Agregar día {proximoDia}
                </>
              )}
            </button>
          </form>
        </div>

      </div>
    </AdminModal>
  );
}
