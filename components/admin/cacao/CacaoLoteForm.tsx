"use client";

/**
 * CacaoLoteForm — alta de lote de acopio de cacao (ADR-128, v2 rediseñado).
 * Layout 2 columnas: formulario seccionado + ficha VIVA del lote (grado,
 * índice, humedad, prueba de corte apilada y liquidación) que se actualiza al
 * tipear. Picker de productor data-driven · calidad NTP-ISO 1114/2451/2291.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Leaf,
  Loader2,
  X,
  Search,
  Check,
  Coins,
  Beaker,
  Users,
  Droplets,
  AlertTriangle,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  CACAO_VARIEDADES,
  cacaoGrade,
  cacaoFermentationIndex,
  cacaoLiquidacion,
  cumpleHumedad,
  GRADO_LABEL,
} from "@/lib/cacao/cacao-quality";

interface Producer {
  id: string;
  codigo: string | null;
  nombre: string;
  variedad: string | null;
  sector: string | null;
}
interface Props {
  onClose: () => void;
  onSaved: (o?: { keepOpen?: boolean }) => void;
}

const I =
  "w-full h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";

export default function CacaoLoteForm({ onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [productorId, setProductorId] = useState<string | null>(null);
  const [productorNombre, setProductorNombre] = useState("");
  const [variedad, setVariedad] = useState<string>("");
  const [tipoGrano, setTipoGrano] = useState<"humedo" | "seco">("seco");
  const [pesoKg, setPesoKg] = useState("");
  const [humedadPct, setHumedadPct] = useState("");
  const [precioPorKg, setPrecioPorKg] = useState("");
  const [premioPorKg, setPremioPorKg] = useState("");
  const [cutGranos, setCutGranos] = useState("");
  const [pctBienFermentado, setBien] = useState("");
  const [pctVioleta, setVioleta] = useState("");
  const [pctPizarroso, setPizarroso] = useState("");
  const [pctMohoso, setMohoso] = useState("");
  const [observaciones, setObs] = useState("");

  const [producers, setProducers] = useState<Producer[]>([]);
  const [pq, setPq] = useState("");
  const [loadingP, setLoadingP] = useState(false);

  const loadProducers = useCallback(async () => {
    setLoadingP(true);
    try {
      const r = await fetch("/api/admin/cacao?view=producers", { credentials: "include" });
      setProducers(r.ok ? ((await r.json()).producers ?? []) : []);
    } catch {
      setProducers([]);
    } finally {
      setLoadingP(false);
    }
  }, []);
  useEffect(() => {
    loadProducers();
  }, [loadProducers]);

  const filtered = useMemo(() => {
    const q = pq.trim().toLowerCase();
    return (
      q
        ? producers.filter(
            (p) => p.nombre.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q),
          )
        : producers
    ).slice(0, 40);
  }, [producers, pq]);

  function pick(p: Producer) {
    setProductorId(p.id);
    setProductorNombre(p.nombre);
    if (p.variedad && !variedad) setVariedad(p.variedad);
  }

  // Cálculos en vivo
  const cut = {
    pctBienFermentado: pctBienFermentado ? Number(pctBienFermentado) : null,
    pctVioleta: pctVioleta ? Number(pctVioleta) : null,
    pctPizarroso: pctPizarroso ? Number(pctPizarroso) : null,
    pctMohoso: pctMohoso ? Number(pctMohoso) : null,
    humedadPct: humedadPct ? Number(humedadPct) : null,
  };
  const grado = cacaoGrade(cut);
  const indice = cacaoFermentationIndex(cut);
  const liquidacion = cacaoLiquidacion(
    pesoKg ? Number(pesoKg) : 0,
    precioPorKg ? Number(precioPorKg) : 0,
    premioPorKg ? Number(premioPorKg) : 0,
  );
  const humOk = humedadPct ? cumpleHumedad(Number(humedadPct)) : null;
  const cutSum =
    (Number(pctBienFermentado) || 0) +
    (Number(pctVioleta) || 0) +
    (Number(pctPizarroso) || 0) +
    (Number(pctMohoso) || 0);
  const hasCut = !!(pctBienFermentado || pctVioleta || pctPizarroso || pctMohoso);

  const isValid = Number(pesoKg) > 0;

  async function submit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (submitting || !isValid) {
      if (!isValid) setError("Ingresá el peso en kg.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        fecha: new Date(fecha).toISOString(),
        productorId,
        productorNombre: productorNombre.trim() || null,
        variedad: variedad || null,
        tipoGrano,
        pesoKg: Number(pesoKg),
        humedadPct: humedadPct ? Number(humedadPct) : null,
        precioPorKg: precioPorKg ? Number(precioPorKg) : null,
        premioPorKg: premioPorKg ? Number(premioPorKg) : null,
        cutGranos: cutGranos ? Number(cutGranos) : null,
        pctBienFermentado: cut.pctBienFermentado,
        pctVioleta: cut.pctVioleta,
        pctPizarroso: cut.pctPizarroso,
        pctMohoso: cut.pctMohoso,
        observaciones: observaciones.trim() || null,
      };
      const r = await fetch("/api/admin/cacao?type=lote", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      if (keepOpen) {
        setPesoKg("");
        setHumedadPct("");
        setBien("");
        setVioleta("");
        setPizarroso("");
        setMohoso("");
        setCutGranos("");
        setObs("");
        setSubmitting(false);
        onSaved({ keepOpen: true });
      } else onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="!max-w-[940px]">
      <div className="flex h-full max-h-[90vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Leaf className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <CardTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">
                Nuevo lote de acopio
              </CardTitle>
              <p className="text-xs text-[var(--text-tertiary)]">
                Cacao · grado y pago se calculan al vuelo (NTP-ISO)
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

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* ── Columna formulario ── */}
            <form id="cacao-lote-form" onSubmit={submit} className="space-y-5 px-5 py-5">
              {error && (
                <div className="rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
                  {error}
                </div>
              )}

              <Section icon={Leaf} title="Datos del lote">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha" required>
                    <input
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      required
                      className={I}
                    />
                  </Field>
                  <Field label="Tipo de grano">
                    <Segmented
                      value={tipoGrano}
                      onChange={setTipoGrano}
                      options={[
                        { v: "seco", label: "Seco" },
                        { v: "humedo", label: "Húmedo" },
                      ]}
                    />
                  </Field>
                </div>

                {/* Picker de productor */}
                <div className="space-y-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-3">
                  <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                    <Users className="h-3.5 w-3.5" />
                    Productor
                  </span>
                  {productorNombre && (
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                      <Check className="h-4 w-4 text-[var(--accent)]" /> {productorNombre}
                    </div>
                  )}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input
                      value={pq}
                      onChange={(e) => setPq(e.target.value)}
                      placeholder="Buscar productor…"
                      className={`${I} h-9 pl-8`}
                    />
                  </div>
                  <div className="max-h-32 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {loadingP ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-tertiary)]">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">
                        Sin productores. Registralos en la pestaña Productores (o dejá el nombre
                        libre abajo).
                      </div>
                    ) : (
                      filtered.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pick(p)}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]/60 ${productorId === p.id ? "bg-[var(--accent-soft)]/60" : ""}`}
                        >
                          <span className="truncate">
                            <span className="font-mono text-xs font-bold text-[var(--text-tertiary)]">
                              {p.codigo ?? "—"}
                            </span>{" "}
                            <span className="font-medium text-[var(--text-primary)]">
                              {p.nombre}
                            </span>
                          </span>
                          {p.variedad && (
                            <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                              {p.variedad}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <input
                    value={productorNombre}
                    onChange={(e) => {
                      setProductorNombre(e.target.value);
                      setProductorId(null);
                    }}
                    placeholder="o escribí el nombre del productor…"
                    className={`${I} h-9`}
                  />
                  {productorNombre.trim() && !productorId && (
                    <p className="flex items-start gap-1.5 text-xs text-[var(--data-warning-700)]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Sin vincular al padrón. El lote no sumará al historial ni a los pagos del
                        productor. Elegilo de la lista de arriba para vincularlo.
                      </span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Variedad">
                    <select
                      value={variedad}
                      onChange={(e) => setVariedad(e.target.value)}
                      className={I}
                    >
                      <option value="">—</option>
                      {CACAO_VARIEDADES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Peso (kg)" required>
                    <input
                      type="number"
                      step="0.01"
                      value={pesoKg}
                      onChange={(e) => setPesoKg(e.target.value)}
                      placeholder="50.00"
                      className={`${I} font-mono tabular-nums`}
                    />
                  </Field>
                  <Field label="Humedad (%)" hint={humOk === false ? "⚠ sobre 7%" : "meta ≤ 7%"}>
                    <input
                      type="number"
                      step="0.1"
                      value={humedadPct}
                      onChange={(e) => setHumedadPct(e.target.value)}
                      placeholder="7.0"
                      className={`${I} font-mono tabular-nums ${humOk === false ? "border-[var(--data-warning-400)]" : humOk === true ? "border-[var(--data-success-400)]" : ""}`}
                    />
                  </Field>
                </div>
              </Section>

              <Section icon={Beaker} title="Prueba de corte" hint="NTP-ISO 1114 · % de granos">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Bien ferm." hint="marrón">
                    <input
                      type="number"
                      step="1"
                      value={pctBienFermentado}
                      onChange={(e) => setBien(e.target.value)}
                      placeholder="%"
                      className={`${I} font-mono tabular-nums`}
                    />
                  </Field>
                  <Field label="Violeta" hint="parcial">
                    <input
                      type="number"
                      step="1"
                      value={pctVioleta}
                      onChange={(e) => setVioleta(e.target.value)}
                      placeholder="%"
                      className={`${I} font-mono tabular-nums`}
                    />
                  </Field>
                  <Field label="Pizarroso" hint="sin ferm.">
                    <input
                      type="number"
                      step="1"
                      value={pctPizarroso}
                      onChange={(e) => setPizarroso(e.target.value)}
                      placeholder="%"
                      className={`${I} font-mono tabular-nums`}
                    />
                  </Field>
                  <Field label="Mohoso" hint="defecto">
                    <input
                      type="number"
                      step="1"
                      value={pctMohoso}
                      onChange={(e) => setMohoso(e.target.value)}
                      placeholder="%"
                      className={`${I} font-mono tabular-nums`}
                    />
                  </Field>
                </div>
                {hasCut && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-tertiary)]">Suma de la prueba</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${cutSum > 100 ? "text-[var(--data-error-700)]" : cutSum >= 95 && cutSum <= 100 ? "text-[var(--data-success-700)]" : "text-[var(--data-warning-700)]"}`}
                    >
                      {cutSum}%{" "}
                      {cutSum > 100
                        ? "· revisá, pasa de 100"
                        : cutSum < 95
                          ? "· debería sumar ~100"
                          : "· ok"}
                    </span>
                  </div>
                )}
                <div className="w-40">
                  <Field label="Granos evaluados">
                    <input
                      type="number"
                      value={cutGranos}
                      onChange={(e) => setCutGranos(e.target.value)}
                      placeholder="100"
                      className={`${I} h-9 font-mono tabular-nums`}
                    />
                  </Field>
                </div>
              </Section>

              <Section icon={Coins} title="Liquidación al productor">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Precio S//kg">
                    <input
                      type="number"
                      step="0.01"
                      value={precioPorKg}
                      onChange={(e) => setPrecioPorKg(e.target.value)}
                      placeholder="9.50"
                      className={`${I} font-mono tabular-nums`}
                    />
                  </Field>
                  <Field label="Premio S//kg" hint="fino de aroma">
                    <input
                      type="number"
                      step="0.01"
                      value={premioPorKg}
                      onChange={(e) => setPremioPorKg(e.target.value)}
                      placeholder="0.50"
                      className={`${I} font-mono tabular-nums`}
                    />
                  </Field>
                </div>
                <Field label="Observaciones">
                  <textarea
                    value={observaciones}
                    onChange={(e) => setObs(e.target.value)}
                    rows={2}
                    placeholder="Notas del acopio…"
                    className={`${I} h-auto resize-none py-2.5`}
                  />
                </Field>
              </Section>
            </form>

            {/* ── Columna ficha viva ── */}
            <aside className="border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 px-5 py-5 lg:sticky lg:top-0 lg:self-start lg:border-l-2 lg:border-t-0">
              <p className="mb-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Vista previa del lote
              </p>

              <div className="flex items-center justify-between">
                <GradoBadge grado={grado} />
                {humedadPct && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${humOk ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"}`}
                  >
                    <Droplets className="h-3.5 w-3.5" />
                    {Number(humedadPct).toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Cut test apilado */}
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-tertiary)]">Prueba de corte</span>
                  <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                    índice ferm. {indice || 0}%
                  </span>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  {[
                    { v: Number(pctBienFermentado) || 0, c: "var(--data-success-500)" },
                    { v: Number(pctVioleta) || 0, c: "var(--data-warning-500)" },
                    { v: Number(pctPizarroso) || 0, c: "var(--data-error-500)" },
                    { v: Number(pctMohoso) || 0, c: "var(--data-error-700)" },
                  ].map(
                    (s, i) =>
                      s.v > 0 && (
                        <div
                          key={i}
                          style={{
                            width: `${Math.min((s.v / Math.max(cutSum, 100)) * 100, 100)}%`,
                            background: s.c,
                          }}
                        />
                      ),
                  )}
                </div>
                {!hasCut && (
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Cargá la prueba de corte para ver el grado.
                  </p>
                )}
              </div>

              {/* Liquidación */}
              <div className="mt-5 rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-4">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-700)]">
                  Total a pagar al productor
                </p>
                <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums text-[var(--data-success-700)]">
                  S/ {liquidacion ? liquidacion.toFixed(2) : "0.00"}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {pesoKg ? `${Number(pesoKg).toFixed(2)} kg` : "— kg"} × S/{" "}
                  {((Number(precioPorKg) || 0) + (Number(premioPorKg) || 0)).toFixed(2)}/kg
                </p>
              </div>

              <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                Grado I: mohoso ≤3% · pizarroso ≤3% · humedad ≤7.5%. Todo se recalcula al tipear.
              </p>
            </aside>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={(e) => submit(e, true)}
            disabled={!isValid || submitting}
            className="inline-flex h-10 items-center rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            Guardar y otro
          </button>
          <button
            type="submit"
            form="cacao-lote-form"
            disabled={!isValid || submitting}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando
              </>
            ) : (
              "Registrar lote"
            )}
          </button>
        </footer>
      </div>
    </AdminModal>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Leaf;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-sunken)] text-[var(--accent)]">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        {hint && <span className="text-xs text-[var(--text-tertiary)]">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}
function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: "humedo" | "seco") => void;
  options: { v: string; label: string }[];
}) {
  return (
    <div className="flex h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v as "humedo" | "seco")}
          className={`flex-1 rounded-md text-sm font-bold transition ${value === o.v ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        {label}
        {required && <span className="text-[var(--data-error-600)]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}
function GradoBadge({ grado }: { grado: "I" | "II" | "fuera_norma" | null }) {
  if (!grado)
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-sm font-bold text-[var(--text-tertiary)]">
        Sin clasificar
      </span>
    );
  const cls =
    grado === "I"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]"
      : grado === "II"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"
        : "bg-[var(--data-error-100)] text-[var(--data-error-700)]";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-base font-extrabold ${cls}`}
    >
      {GRADO_LABEL[grado]}
    </span>
  );
}
