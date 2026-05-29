"use client";

/**
 * WoodEntryForm — Modal de registro de ingresos LOE-CTP (ADR-124, v5).
 *
 * Rediseño v5 (2026-05-28):
 * - Layout de dos paneles: formulario (izq, scroll) + vista previa en vivo
 *   tipo "boleta" (der, sticky) estilo Stripe/Linear "create".
 * - 100% dark-mode safe: tokens del DS, cero `bg-white` hardcodeado.
 * - Secciones numeradas, inputs consistentes, footer con progreso real.
 * - Un solo color de acento (verde forestal), cero emojis, cero gradientes.
 */

import { useEffect, useMemo, useState } from "react";
import {
  TreePine,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  Search,
  Check,
  ShieldAlert,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  listSpecies,
  findSpeciesByCommonName,
} from "@/data/forestry-species";

interface Props {
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean }) => void;
}

// ─── Catálogos ────────────────────────────────────────────────────────────

const ORIGIN_TYPES = [
  { value: "concesion", label: "Concesión forestal" },
  { value: "predio_privado", label: "Predio privado" },
  { value: "comunidad_nativa", label: "Comunidad nativa" },
  { value: "reforestacion", label: "Reforestación" },
  { value: "retroaserradero", label: "Re-entrada de otro CTP" },
  { value: "otro", label: "Otro" },
];

const PRODUCT_TYPES = [
  { value: "rolliza", label: "Rolliza (troncos)" },
  { value: "aserrada", label: "Aserrada" },
  { value: "tablones", label: "Tablones" },
  { value: "listones", label: "Listones" },
  { value: "durmientes", label: "Durmientes" },
  { value: "pulgada", label: "En pulgadas" },
  { value: "carbon", label: "Carbón vegetal" },
  { value: "lena", label: "Leña" },
  { value: "otro", label: "Otro" },
];

const DOC_TYPES = [
  { value: "RUC", label: "RUC" },
  { value: "DNI", label: "DNI" },
  { value: "CE", label: "Carnet de Extranjería" },
  { value: "PASAPORTE", label: "Pasaporte" },
];

const REGIONS_PE = [
  "Loreto", "Ucayali", "Madre de Dios", "San Martín",
  "Junín", "Pasco", "Huánuco", "Amazonas", "Cusco", "Otra",
];

const TOP_SPECIES_SLUGS = ["tornillo", "capirona", "shihuahuaco", "cedro", "caoba"];

const DRAFT_KEY = "buleje:ctp-wood-entry-draft";

// ─── Helpers ──────────────────────────────────────────────────────────────

function cubicate(pieces: number, lengthM: number, diameterCm: number): number {
  if (!pieces || !lengthM || !diameterCm) return 0;
  const r = diameterCm / 200;
  return Math.round(Math.PI * r * r * lengthM * pieces * 10000) / 10000;
}

const productLabel = (v: string) => PRODUCT_TYPES.find((p) => p.value === v)?.label ?? v;
const originLabel = (v: string) => ORIGIN_TYPES.find((o) => o.value === v)?.label ?? v;

interface DraftData {
  entryDate: string;
  gtfNumber: string;
  gtfDate: string;
  gtfSeries: string;
  providerName: string;
  providerDocument: string;
  providerDocumentType: string;
  originType: string;
  originCode: string;
  originRegion: string;
  originDistrict: string;
  speciesSlug: string;
  customSpeciesName: string;
  productType: string;
  volumeM3: string;
  pieces: string;
  avgLengthM: string;
  avgDiameterCm: string;
  humidityPct: string;
  defectsNotes: string;
  notes: string;
}

const INITIAL: DraftData = {
  entryDate: new Date().toISOString().slice(0, 10),
  gtfNumber: "",
  gtfDate: "",
  gtfSeries: "",
  providerName: "",
  providerDocument: "",
  providerDocumentType: "RUC",
  originType: "concesion",
  originCode: "",
  originRegion: "Ucayali",
  originDistrict: "",
  speciesSlug: "tornillo",
  customSpeciesName: "",
  productType: "rolliza",
  volumeM3: "",
  pieces: "",
  avgLengthM: "",
  avgDiameterCm: "",
  humidityPct: "",
  defectsNotes: "",
  notes: "",
};

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════

export default function WoodEntryForm({ onClose, onSaved }: Props) {
  const speciesOptions = useMemo(() => listSpecies(), []);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<DraftData>(INITIAL);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);

  // Load draft del localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftData;
        if (parsed.gtfNumber || parsed.providerName) {
          setData({ ...INITIAL, ...parsed, entryDate: INITIAL.entryDate });
        }
      }
    } catch {}
  }, []);

  // Auto-guardar borrador
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch {}
  }, [data]);

  function update<K extends keyof DraftData>(field: K, value: DraftData[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  // Especie derivada
  const selectedSpecies = speciesOptions.find((s) => s.slug === data.speciesSlug);
  const isCustomSpecies = data.speciesSlug === "otro";
  const finalSpeciesName = isCustomSpecies
    ? data.customSpeciesName.trim()
    : selectedSpecies?.commonName ?? "";
  const customMatched = isCustomSpecies
    ? findSpeciesByCommonName(data.customSpeciesName)
    : null;
  const finalScientificName = isCustomSpecies
    ? customMatched?.scientificName ?? null
    : selectedSpecies?.scientificName ?? null;
  const finalCites = isCustomSpecies
    ? customMatched?.cites ?? false
    : selectedSpecies?.cites ?? false;

  // Cubicación auto
  const autoVolume = useMemo(() => {
    const n = Number(data.pieces);
    const l = Number(data.avgLengthM);
    const d = Number(data.avgDiameterCm);
    if (data.productType === "rolliza" && n > 0 && l > 0 && d > 0) {
      return cubicate(n, l, d);
    }
    return 0;
  }, [data.pieces, data.avgLengthM, data.avgDiameterCm, data.productType]);

  // Filtro especies
  const filteredSpecies = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    if (!q) return speciesOptions.slice(0, 12);
    return speciesOptions
      .filter(
        (s) =>
          s.commonName.toLowerCase().includes(q) ||
          s.scientificName?.toLowerCase().includes(q) ||
          s.altNames?.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [speciesQuery, speciesOptions]);

  // Validación — campos obligatorios pendientes (para checklist + footer)
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!data.gtfNumber.trim()) m.push("N° de GTF");
    if (!data.entryDate) m.push("Fecha de ingreso");
    if (data.providerName.trim().length < 2) m.push("Titular habilitante");
    if (finalSpeciesName.length === 0) m.push("Especie forestal");
    if (!(Number(data.volumeM3) > 0)) m.push("Volumen (m³)");
    return m;
  }, [data.gtfNumber, data.entryDate, data.providerName, finalSpeciesName, data.volumeM3]);

  const isValid = missing.length === 0;

  // Submit
  async function handleSubmit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (submitting) return;
    if (!isValid) {
      setError("Completá los campos obligatorios marcados con asterisco.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        entryDate: new Date(data.entryDate).toISOString(),
        gtfNumber: data.gtfNumber.trim(),
        gtfDate: data.gtfDate ? new Date(data.gtfDate).toISOString() : null,
        gtfSeries: data.gtfSeries.trim() || null,
        providerName: data.providerName.trim(),
        providerDocument: data.providerDocument.trim() || null,
        providerDocumentType: data.providerDocument.trim() ? data.providerDocumentType : null,
        originType: data.originType,
        originCode: data.originCode.trim() || null,
        originRegion: data.originRegion === "Otra" ? null : data.originRegion,
        originDistrict: data.originDistrict.trim() || null,
        speciesCommonName: finalSpeciesName,
        speciesScientificName: finalScientificName,
        speciesCites: finalCites,
        productType: data.productType,
        volumeM3: Number(data.volumeM3),
        pieces: data.pieces ? Number(data.pieces) : 0,
        avgLengthM: data.avgLengthM ? Number(data.avgLengthM) : null,
        avgDiameterCm: data.avgDiameterCm ? Number(data.avgDiameterCm) : null,
        humidityPct: data.humidityPct ? Number(data.humidityPct) : null,
        defectsNotes: data.defectsNotes.trim() || null,
        notes: data.notes.trim() || null,
        photos: null,
      };

      const res = await fetch("/api/admin/forestal/wood-entries", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.message ?? (r.issues && r.issues[0]?.message) ?? r.error ?? `HTTP ${res.status}`);
      }

      try { localStorage.removeItem(DRAFT_KEY); } catch {}

      if (keepOpen) {
        setData((prev) => ({
          ...INITIAL,
          entryDate: prev.entryDate,
          providerName: prev.providerName,
          providerDocument: prev.providerDocument,
          providerDocumentType: prev.providerDocumentType,
          originType: prev.originType,
          originCode: prev.originCode,
          originRegion: prev.originRegion,
          originDistrict: prev.originDistrict,
        }));
        setSubmitting(false);
        onSaved({ keepOpen: true });
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const volumeDisplay = Number(data.volumeM3) > 0 ? Number(data.volumeM3).toFixed(4) : null;

  // ═════════════════════════════════════════════════════════════════════
  // RENDER — dos paneles: formulario + vista previa
  // ═════════════════════════════════════════════════════════════════════

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:max-w-[980px]">
      <div className="flex h-full max-h-[86vh] flex-col bg-[var(--surface-raised)]">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
              <TreePine className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">
                Nuevo ingreso de madera
              </CardTitle>
              <p className="truncate text-xs text-[var(--text-tertiary)]">
                Libro de Operaciones CTP · LOE-CTP SERFOR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* ── Cuerpo: dos paneles ─────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ─── Panel izquierdo: formulario ──────────────────────── */}
          <form
            id="wood-entry-form"
            onSubmit={handleSubmit}
            className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6"
          >
            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{error}</div>
              </div>
            )}

            {/* ─── 1 · GTF ─────────────────────────────────────────── */}
            <Section index={1} title="Guía de Transporte Forestal">
              <Field label="N° GTF" required>
                <input
                  type="text"
                  value={data.gtfNumber}
                  onChange={(e) => update("gtfNumber", e.target.value)}
                  placeholder="0001234"
                  autoFocus
                  required
                  className={cls.input}
                />
              </Field>
              <Grid cols={2}>
                <Field label="Fecha del GTF">
                  <input
                    type="date"
                    value={data.gtfDate}
                    onChange={(e) => update("gtfDate", e.target.value)}
                    className={cls.input}
                  />
                </Field>
                <Field label="Serie">
                  <input
                    type="text"
                    value={data.gtfSeries}
                    onChange={(e) => update("gtfSeries", e.target.value)}
                    placeholder="A001"
                    className={cls.input}
                  />
                </Field>
              </Grid>
              <Field label="Fecha de ingreso al CTP" required>
                <input
                  type="date"
                  value={data.entryDate}
                  onChange={(e) => update("entryDate", e.target.value)}
                  required
                  className={cls.input}
                />
              </Field>
            </Section>

            {/* ─── 2 · Titular ─────────────────────────────────────── */}
            <Section index={2} title="Titular habilitante">
              <Field label="Nombre o razón social" required>
                <input
                  type="text"
                  value={data.providerName}
                  onChange={(e) => update("providerName", e.target.value)}
                  placeholder="Concesión Forestal X"
                  required
                  className={cls.input}
                />
              </Field>
              <Grid cols={[120, "1fr"]}>
                <Field label="Tipo doc">
                  <select
                    value={data.providerDocumentType}
                    onChange={(e) => update("providerDocumentType", e.target.value)}
                    className={cls.input}
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Número">
                  <input
                    type="text"
                    value={data.providerDocument}
                    onChange={(e) => update("providerDocument", e.target.value)}
                    placeholder={data.providerDocumentType === "RUC" ? "20XXXXXXXXX" : "Documento"}
                    className={cls.input}
                  />
                </Field>
              </Grid>
            </Section>

            {/* ─── 3 · Origen ──────────────────────────────────────── */}
            <Section index={3} title="Origen del material">
              <Grid cols={2}>
                <Field label="Tipo de origen" required>
                  <select
                    value={data.originType}
                    onChange={(e) => update("originType", e.target.value)}
                    required
                    className={cls.input}
                  >
                    {ORIGIN_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Código de origen">
                  <input
                    type="text"
                    value={data.originCode}
                    onChange={(e) => update("originCode", e.target.value)}
                    placeholder="N° concesión o predio"
                    className={cls.input}
                  />
                </Field>
              </Grid>
              <Grid cols={2}>
                <Field label="Región">
                  <select
                    value={data.originRegion}
                    onChange={(e) => update("originRegion", e.target.value)}
                    className={cls.input}
                  >
                    {REGIONS_PE.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Distrito">
                  <input
                    type="text"
                    value={data.originDistrict}
                    onChange={(e) => update("originDistrict", e.target.value)}
                    className={cls.input}
                  />
                </Field>
              </Grid>
            </Section>

            {/* ─── 4 · Especie ─────────────────────────────────────── */}
            <Section index={4} title="Especie forestal">
              <Field label="Especie" required>
                <button
                  type="button"
                  onClick={() => setShowSpeciesPicker((v) => !v)}
                  className={`${cls.input} flex items-center justify-between text-left`}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span className="truncate font-medium">{finalSpeciesName || "Seleccionar especie..."}</span>
                    {finalCites && <CitesPill />}
                  </span>
                  <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                </button>
              </Field>

              {showSpeciesPicker && (
                <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <input
                    type="text"
                    value={speciesQuery}
                    onChange={(e) => setSpeciesQuery(e.target.value)}
                    placeholder="Buscar por nombre común o científico..."
                    autoFocus
                    className={`${cls.input} mb-2`}
                  />

                  {!speciesQuery && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {TOP_SPECIES_SLUGS.map((slug) => {
                        const s = speciesOptions.find((x) => x.slug === slug);
                        if (!s) return null;
                        const active = data.speciesSlug === slug;
                        return (
                          <button
                            key={slug}
                            type="button"
                            onClick={() => {
                              update("speciesSlug", slug);
                              setShowSpeciesPicker(false);
                              setSpeciesQuery("");
                            }}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-900)]"
                                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                            }`}
                          >
                            {s.commonName}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="max-h-64 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {filteredSpecies.length === 0 && (
                      <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                        Sin resultados
                      </div>
                    )}
                    {filteredSpecies.map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => {
                          update("speciesSlug", s.slug);
                          setShowSpeciesPicker(false);
                          setSpeciesQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-sm font-medium text-[var(--text-primary)]">{s.commonName}</span>
                            {s.cites && <CitesPill />}
                          </div>
                          {s.scientificName && (
                            <div className="truncate text-xs italic text-[var(--text-tertiary)]">
                              {s.scientificName}
                            </div>
                          )}
                        </div>
                        {s.densityKgM3 && (
                          <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                            {s.densityKgM3} kg/m³
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isCustomSpecies && (
                <Field label="Nombre de la especie" required>
                  <input
                    type="text"
                    value={data.customSpeciesName}
                    onChange={(e) => update("customSpeciesName", e.target.value)}
                    placeholder="ej: Aguano masha"
                    required
                    className={cls.input}
                  />
                </Field>
              )}

              {finalCites && (
                <div className="flex items-start gap-2.5 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2.5 text-xs text-[var(--data-error-700)]">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <span className="font-bold">Especie CITES.</span>{" "}
                    Requiere permiso de exportación. Verificá el sello en la GTF.
                  </div>
                </div>
              )}
            </Section>

            {/* ─── 5 · Producto y medidas ──────────────────────────── */}
            <Section index={5} title="Producto y medidas">
              <Grid cols={2}>
                <Field label="Tipo de producto" required>
                  <select
                    value={data.productType}
                    onChange={(e) => update("productType", e.target.value)}
                    required
                    className={cls.input}
                  >
                    {PRODUCT_TYPES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="N° de piezas">
                  <input
                    type="number"
                    min="0"
                    value={data.pieces}
                    onChange={(e) => update("pieces", e.target.value)}
                    placeholder="35"
                    className={cls.input}
                  />
                </Field>
              </Grid>

              <Field
                label="Volumen total (m³)"
                required
                hint="Precisión 4 decimales (estándar SERFOR)"
              >
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={data.volumeM3}
                    onChange={(e) => update("volumeM3", e.target.value)}
                    placeholder="0.0000"
                    required
                    className={`${cls.input} pr-32 font-mono tabular-nums`}
                  />
                  {autoVolume > 0 && data.productType === "rolliza" && Number(data.volumeM3) !== autoVolume && (
                    <button
                      type="button"
                      onClick={() => update("volumeM3", autoVolume.toFixed(4))}
                      title="Aplicar cubicación π·r²·L·n"
                      className="absolute right-1.5 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg bg-[var(--data-success-100)] px-2.5 text-xs font-bold text-[var(--data-success-900)] transition-colors hover:bg-[var(--data-success-200)]"
                    >
                      <Sparkles className="h-3 w-3" />
                      {autoVolume.toFixed(4)}
                    </button>
                  )}
                </div>
              </Field>

              <Grid cols={3}>
                <Field label="Largo prom. (m)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={data.avgLengthM}
                    onChange={(e) => update("avgLengthM", e.target.value)}
                    placeholder="6.50"
                    className={cls.input}
                  />
                </Field>
                <Field label="Diám. prom. (cm)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={data.avgDiameterCm}
                    onChange={(e) => update("avgDiameterCm", e.target.value)}
                    placeholder="45.0"
                    className={cls.input}
                  />
                </Field>
                <Field label="Humedad (%)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={data.humidityPct}
                    onChange={(e) => update("humidityPct", e.target.value)}
                    placeholder="22"
                    className={cls.input}
                  />
                </Field>
              </Grid>
            </Section>

            {/* ─── 6 · Observaciones ───────────────────────────────── */}
            <Section index={6} title="Observaciones" last>
              <Field label="Defectos visibles">
                <input
                  type="text"
                  value={data.defectsNotes}
                  onChange={(e) => update("defectsNotes", e.target.value)}
                  placeholder="ej: 3 piezas con nudos grandes"
                  className={cls.input}
                />
              </Field>
              <Field label="Notas adicionales">
                <textarea
                  value={data.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                  placeholder="Cualquier observación útil..."
                  className={`${cls.input} h-auto resize-none py-2.5`}
                />
              </Field>
            </Section>
          </form>

          {/* ─── Panel derecho: vista previa en vivo (lg+) ─────────── */}
          <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[var(--rule-base)] bg-[var(--surface-canvas)] lg:flex">
            <div className="border-b border-[var(--rule-soft)] px-5 py-3.5">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Vista previa del registro
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* Especie */}
              <div className="mb-5">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-bold leading-tight text-[var(--text-primary)]">
                    {finalSpeciesName || "Sin especie"}
                  </CardTitle>
                  {finalCites && <CitesPill />}
                </div>
                {finalScientificName && (
                  <p className="mt-0.5 text-xs italic text-[var(--text-tertiary)]">
                    {finalScientificName}
                  </p>
                )}
              </div>

              {/* Volumen destacado */}
              <div className="mb-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Volumen total
                </div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {volumeDisplay ?? "0.0000"}
                  <span className="ml-1 text-sm font-medium text-[var(--text-tertiary)]">m³</span>
                </div>
                {autoVolume > 0 && data.productType === "rolliza" && (
                  <div className="mt-1.5 flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    <Sparkles className="h-3 w-3 text-[var(--data-success-600)]" />
                    Cubicación: {autoVolume.toFixed(4)} m³
                  </div>
                )}
              </div>

              {/* Detalle */}
              <dl className="space-y-2.5">
                <SummaryRow label="Producto" value={productLabel(data.productType)} />
                <SummaryRow label="Piezas" value={data.pieces ? Number(data.pieces).toLocaleString("es-PE") : "—"} />
                <SummaryRow label="Humedad" value={data.humidityPct ? `${data.humidityPct}%` : "—"} />
                <SummaryRow
                  label="Origen"
                  value={`${originLabel(data.originType)}${data.originRegion && data.originRegion !== "Otra" ? ` · ${data.originRegion}` : ""}`}
                />
                <SummaryRow label="Titular" value={data.providerName.trim() || "—"} />
                <SummaryRow label="GTF" value={data.gtfNumber.trim() || "—"} mono />
              </dl>
            </div>

            {/* Checklist de validación */}
            <div className="border-t border-[var(--rule-soft)] px-5 py-4">
              {isValid ? (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--data-success-50)] px-3 py-2 text-sm font-medium text-[var(--data-success-900)]">
                  <Check className="h-4 w-4 shrink-0" />
                  Listo para registrar
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Falta completar
                  </p>
                  <ul className="space-y-1">
                    {missing.map((m) => (
                      <li key={m} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-error-500)]" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3.5 sm:px-6">
          <div className="hidden items-center gap-1.5 text-xs text-[var(--text-tertiary)] sm:flex">
            {isValid ? (
              <>
                <Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" />
                <span>Listo para guardar</span>
              </>
            ) : (
              <span>
                Faltan <span className="font-semibold text-[var(--text-secondary)]">{missing.length}</span>{" "}
                {missing.length === 1 ? "campo" : "campos"}
              </span>
            )}
          </div>

          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={!isValid || submitting}
              className="inline-flex h-10 items-center rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar y otro
            </button>
            <button
              type="submit"
              form="wood-entry-form"
              disabled={!isValid || submitting}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--data-success-700)] px-4 text-sm font-bold text-white transition-colors hover:bg-[var(--data-success-800)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando
                </>
              ) : (
                "Registrar ingreso"
              )}
            </button>
          </div>
        </footer>
      </div>
    </AdminModal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════

function Section({
  index,
  title,
  last,
  children,
}: {
  index: number;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "" : "mb-7 border-b border-[var(--rule-soft)] pb-7"}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
          {index}
        </span>
        <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {title}
        </CardTitle>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
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
      {hint && (
        <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>
      )}
    </label>
  );
}

function Grid({
  cols,
  children,
}: {
  cols: 2 | 3 | [number | string, number | string];
  children: React.ReactNode;
}) {
  const style = Array.isArray(cols)
    ? { gridTemplateColumns: `${typeof cols[0] === "number" ? `${cols[0]}px` : cols[0]} ${typeof cols[1] === "number" ? `${cols[1]}px` : cols[1]}` }
    : undefined;
  const cls =
    cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "";
  return (
    <div className={`grid gap-3 ${cls}`} style={style}>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function CitesPill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-error-700)]">
      CITES
    </span>
  );
}

// ─── Estilos canonical ────────────────────────────────────────────────────
const cls = {
  input:
    "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]",
};
