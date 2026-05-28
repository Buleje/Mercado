"use client";

/**
 * WoodEntryForm — Modal premium para registrar ingresos LOE-CTP (ADR-124).
 *
 * Rediseño 2026-05-28 v3:
 * - Wizard 3 pasos (transporte → producto → medidas) con stepper visible
 * - Autocomplete especies con typeahead + chips sugeridos
 * - Cubicación automática si ingresan pieza/largo/diámetro
 * - Alerta CITES live con permiso requerido
 * - Borrador en localStorage (no perder datos al cerrar accidental)
 * - Botón "Guardar y agregar otro" para flujos batch
 * - Animaciones smooth, jerarquía premium tipo Linear/Notion
 */

import { useEffect, useMemo, useState } from "react";
import {
  TreePine,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Truck,
  Boxes,
  Scale,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  X,
  Info,
  Search,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  listSpecies,
  findSpeciesByCommonName,
  type ForestrySpecies,
} from "@/data/forestry-species";

interface Props {
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean }) => void;
}

// ─── Catálogos ────────────────────────────────────────────────────────────

const ORIGIN_TYPES = [
  { value: "concesion", label: "Concesión forestal", hint: "Habilitación SERFOR del Estado" },
  { value: "predio_privado", label: "Predio privado", hint: "Tierras privadas con plan de manejo" },
  { value: "comunidad_nativa", label: "Comunidad nativa", hint: "Territorio indígena titulado" },
  { value: "reforestacion", label: "Plantación / reforestación", hint: "Proyecto de reforestación" },
  { value: "retroaserradero", label: "Re-entrada desde otro CTP", hint: "Madera ya procesada que vuelve" },
  { value: "otro", label: "Otro", hint: "Especificar en observaciones" },
];

const PRODUCT_TYPES = [
  { value: "rolliza", label: "Rolliza (troncos)", emoji: "🪵" },
  { value: "aserrada", label: "Aserrada", emoji: "🪚" },
  { value: "tablones", label: "Tablones", emoji: "📏" },
  { value: "listones", label: "Listones", emoji: "📐" },
  { value: "durmientes", label: "Durmientes", emoji: "🛤️" },
  { value: "pulgada", label: "En pulgadas (tradicional)", emoji: "📊" },
  { value: "carbon", label: "Carbón vegetal", emoji: "⚫" },
  { value: "lena", label: "Leña", emoji: "🔥" },
  { value: "otro", label: "Otro", emoji: "❓" },
];

const DOC_TYPES = [
  { value: "RUC", label: "RUC" },
  { value: "DNI", label: "DNI" },
  { value: "CE", label: "Carnet Extranjería" },
  { value: "PASAPORTE", label: "Pasaporte" },
];

const REGIONS_PE = [
  "Loreto", "Ucayali", "Madre de Dios", "San Martín",
  "Junín", "Pasco", "Huánuco", "Amazonas", "Cusco", "Otra",
];

const TOP_SPECIES_SLUGS = ["tornillo", "capirona", "shihuahuaco", "cedro", "caoba"];

const DRAFT_KEY = "buleje:ctp-wood-entry-draft";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Cubicación automática: π·(d/2)²·largo·n para rolliza */
function cubicate(pieces: number, lengthM: number, diameterCm: number): number {
  if (!pieces || !lengthM || !diameterCm) return 0;
  const r = diameterCm / 200; // cm → m, /2 para radio
  const vol = Math.PI * r * r * lengthM * pieces;
  return Math.round(vol * 10000) / 10000;
}

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

// ─── Stepper config ───────────────────────────────────────────────────────

type StepId = "transporte" | "producto" | "medidas";

const STEPS: Array<{ id: StepId; label: string; icon: typeof Truck; desc: string }> = [
  { id: "transporte", label: "Transporte", icon: Truck, desc: "GTF + titular + origen" },
  { id: "producto", label: "Producto", icon: Boxes, desc: "Especie + tipo de producto" },
  { id: "medidas", label: "Medidas", icon: Scale, desc: "Volumen + dimensiones + notas" },
];

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════

export default function WoodEntryForm({ onClose, onSaved }: Props) {
  const speciesOptions = useMemo(() => listSpecies(), []);

  // Step navigation
  const [currentStep, setCurrentStep] = useState<StepId>("transporte");
  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data (single object para facilitar draft persistence)
  const [data, setData] = useState<DraftData>(INITIAL);

  // Species typeahead
  const [speciesQuery, setSpeciesQuery] = useState("");

  // ── Load draft del localStorage al abrir ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftData;
        // Solo restaurar si el draft tiene contenido real (no inicial vacío)
        if (parsed.gtfNumber || parsed.providerName) {
          setData({ ...INITIAL, ...parsed, entryDate: INITIAL.entryDate });
        }
      }
    } catch {}
  }, []);

  // ── Auto-guardar borrador al cambiar campos ──
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch {}
  }, [data]);

  // Helper de actualización tipada
  function update<K extends keyof DraftData>(field: K, value: DraftData[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  // ── Especie derivada ──
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

  // ── Cubicación auto ──
  const autoVolume = useMemo(() => {
    const n = Number(data.pieces);
    const l = Number(data.avgLengthM);
    const d = Number(data.avgDiameterCm);
    if (data.productType === "rolliza" && n > 0 && l > 0 && d > 0) {
      return cubicate(n, l, d);
    }
    return 0;
  }, [data.pieces, data.avgLengthM, data.avgDiameterCm, data.productType]);

  function applyAutoVolume() {
    if (autoVolume > 0) update("volumeM3", autoVolume.toFixed(4));
  }

  // ── Filtrado de especies para typeahead ──
  const filteredSpecies = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    if (!q) return speciesOptions.slice(0, 10);
    return speciesOptions
      .filter(
        (s) =>
          s.commonName.toLowerCase().includes(q) ||
          s.scientificName?.toLowerCase().includes(q) ||
          s.altNames?.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  }, [speciesQuery, speciesOptions]);

  // ── Validación por paso ──
  const stepValid: Record<StepId, boolean> = {
    transporte: !!(
      data.entryDate &&
      data.gtfNumber.trim().length >= 1 &&
      data.providerName.trim().length >= 2
    ),
    producto: !!(finalSpeciesName && data.productType),
    medidas: !!(Number(data.volumeM3) > 0),
  };
  const allValid = stepValid.transporte && stepValid.producto && stepValid.medidas;

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent, keepOpen = false) {
    e.preventDefault();
    if (submitting) return;
    if (!allValid) {
      setError("Completá los pasos faltantes (los inválidos están en rojo).");
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
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.message ?? (r.issues && r.issues[0]?.message) ?? r.error ?? `HTTP ${res.status}`);
      }

      // Limpiar draft tras éxito
      try { localStorage.removeItem(DRAFT_KEY); } catch {}

      if (keepOpen) {
        // Reset campos del registro pero mantener proveedor/origen (suele venir mismo lote)
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
        setCurrentStep("producto");
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

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton>
      <div className="-mx-6 -my-6">
        {/* ── Header con stepper integrado ─────────────────────────────── */}
        <header className="relative border-b-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--data-success-50)] via-[var(--surface-raised)] to-[var(--surface-raised)] px-7 py-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-5 top-5 rounded-xl p-2 text-[var(--text-tertiary)] hover:bg-white/60 hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl bg-[var(--data-success-100)] p-3 ring-4 ring-[var(--data-success-50)]">
              <TreePine className="h-7 w-7 text-[var(--data-success-700)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-700)]">
                Forestal · LOE-CTP SERFOR
              </p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Nuevo ingreso de madera
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Registro oficial del flujo de madera entrante al Centro de Transformación Primaria.
              </p>
            </div>
          </div>

          {/* Stepper */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            {STEPS.map((step, i) => {
              const isActive = step.id === currentStep;
              const isDone = i < stepIndex;
              const isValid = stepValid[step.id];
              const StepIcon = step.icon;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`group relative flex items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left transition-all ${
                    isActive
                      ? "border-[var(--brand-ink)] bg-white shadow-sm"
                      : isDone && isValid
                        ? "border-[var(--data-success-300)] bg-[var(--data-success-50)] hover:border-[var(--data-success-500)]"
                        : "border-[var(--rule-base)] bg-white/50 hover:border-[var(--rule-strong)]"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                      isActive
                        ? "bg-[var(--brand-ink)] text-white"
                        : isDone && isValid
                          ? "bg-[var(--data-success-600)] text-white"
                          : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {isDone && isValid ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-bold ${
                        isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      Paso {i + 1} · {step.label}
                    </p>
                    <p className="truncate text-xs text-[var(--text-tertiary)]">{step.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </header>

        {/* ── Body por paso ─────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="px-7 py-6">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-sm text-[var(--data-danger-900)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {/* ─── Step 1: TRANSPORTE ──────────────────────────────────── */}
          {currentStep === "transporte" && (
            <div className="space-y-6">
              <StepHero
                icon={Truck}
                title="Guía de Transporte Forestal"
                description="Datos del documento SERFOR que ampara el movimiento."
              />

              <Group label="Documento de transporte" required>
                <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
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
                  <Field label="Fecha GTF">
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
                </div>
                <Field label="Fecha de ingreso al CTP" required className="mt-4 max-w-[280px]">
                  <input
                    type="date"
                    value={data.entryDate}
                    onChange={(e) => update("entryDate", e.target.value)}
                    required
                    className={cls.input}
                  />
                </Field>
              </Group>

              <Group label="Titular habilitante (proveedor)" required>
                <Field label="Nombre o Razón Social" required>
                  <input
                    type="text"
                    value={data.providerName}
                    onChange={(e) => update("providerName", e.target.value)}
                    placeholder="Concesión Forestal X / Comunidad Y"
                    required
                    className={cls.input}
                  />
                </Field>
                <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
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
                  <Field label="Número de documento">
                    <input
                      type="text"
                      value={data.providerDocument}
                      onChange={(e) => update("providerDocument", e.target.value)}
                      placeholder={data.providerDocumentType === "RUC" ? "20XXXXXXXXX" : "DNI/CE/Pasaporte"}
                      className={cls.input}
                    />
                  </Field>
                </div>
              </Group>

              <Group label="Origen del material">
                <Field label="Tipo de origen" required>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {ORIGIN_TYPES.map((o) => {
                      const active = data.originType === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => update("originType", o.value)}
                          className={`rounded-2xl border-2 px-3 py-2.5 text-left transition-all ${
                            active
                              ? "border-[var(--brand-ink)] bg-[var(--brand-ink)]/5"
                              : "border-[var(--rule-base)] hover:border-[var(--rule-strong)] hover:bg-[var(--surface-canvas)]"
                          }`}
                        >
                          <div className={`text-sm font-bold ${active ? "text-[var(--brand-ink)]" : "text-[var(--text-primary)]"}`}>
                            {o.label}
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{o.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Código origen">
                    <input
                      type="text"
                      value={data.originCode}
                      onChange={(e) => update("originCode", e.target.value)}
                      placeholder="N° concesión o predio"
                      className={cls.input}
                    />
                  </Field>
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
                </div>
              </Group>
            </div>
          )}

          {/* ─── Step 2: PRODUCTO ──────────────────────────────────────── */}
          {currentStep === "producto" && (
            <div className="space-y-6">
              <StepHero
                icon={Boxes}
                title="¿Qué especie y producto entra?"
                description="Seleccioná de las especies cargadas o escribí una nueva. El sistema detecta CITES automático."
              />

              <Group label="Especie forestal" required>
                {/* Chips sugeridos top */}
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-1 self-center">
                    Comunes:
                  </span>
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
                          setSpeciesQuery("");
                        }}
                        className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold transition-all ${
                          active
                            ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-900)]"
                            : "border-[var(--rule-base)] hover:border-[var(--rule-strong)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {s.commonName}
                        {s.cites && <span className="ml-1.5 text-[var(--data-danger-600)]">·CITES</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Typeahead search */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={speciesQuery}
                    onChange={(e) => setSpeciesQuery(e.target.value)}
                    placeholder="Buscar especie por nombre común o científico..."
                    className={`${cls.input} pl-11`}
                  />
                </div>
                {speciesQuery && filteredSpecies.length > 0 && (
                  <div className="mt-2 max-h-60 overflow-y-auto rounded-2xl border-2 border-[var(--rule-base)] bg-white">
                    {filteredSpecies.map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => {
                          update("speciesSlug", s.slug);
                          setSpeciesQuery("");
                        }}
                        className="flex w-full items-start gap-3 border-b border-[var(--rule-soft)] px-4 py-2.5 text-left hover:bg-[var(--data-success-50)] last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-[var(--text-primary)]">
                            {s.commonName}
                            {s.cites && (
                              <span className="ml-2 rounded-full bg-[var(--data-danger-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-danger-900)]">
                                CITES {s.citesAppendix ?? "II"}
                              </span>
                            )}
                          </div>
                          {s.scientificName && (
                            <div className="text-xs italic text-[var(--text-tertiary)]">
                              {s.scientificName}
                            </div>
                          )}
                        </div>
                        {s.densityKgM3 && (
                          <div className="shrink-0 text-xs font-mono text-[var(--text-tertiary)] tabular-nums">
                            {s.densityKgM3} kg/m³
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* "Otro" → input custom */}
                {data.speciesSlug === "otro" && (
                  <Field label="Nombre de la especie (custom)" required className="mt-4">
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

                {/* Card de info de la especie seleccionada */}
                {selectedSpecies && data.speciesSlug !== "otro" && (
                  <div className="mt-4 rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--data-success-50)] via-white to-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Especie seleccionada
                        </p>
                        <p className="mt-1 text-lg font-extrabold text-[var(--text-primary)]">
                          {selectedSpecies.commonName}
                        </p>
                        {selectedSpecies.scientificName && (
                          <p className="text-sm italic text-[var(--text-secondary)]">
                            {selectedSpecies.scientificName}
                          </p>
                        )}
                      </div>
                      {selectedSpecies.densityKgM3 && (
                        <div className="shrink-0 rounded-xl bg-white/80 px-3 py-2 text-center border border-[var(--rule-soft)]">
                          <div className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                            {selectedSpecies.densityKgM3}
                          </div>
                          <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                            kg/m³
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedSpecies.cites && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-danger-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-danger-900)]">
                          <AlertTriangle className="h-3 w-3" />
                          CITES Apéndice {selectedSpecies.citesAppendix ?? "II"}
                        </span>
                      )}
                      {selectedSpecies.protectionLevel === "controlada" && (
                        <span className="rounded-full bg-[var(--data-warning-100)] px-2.5 py-1 text-xs font-bold text-[var(--data-warning-900)]">
                          Plan de manejo
                        </span>
                      )}
                      {selectedSpecies.uses?.slice(0, 3).map((u) => (
                        <span key={u} className="rounded-full bg-white/80 border border-[var(--rule-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                          {u}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerta CITES bloqueante */}
                {finalCites && (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-sm text-[var(--data-danger-900)]">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-bold">Especie CITES — atención legal</p>
                      <p className="mt-1">
                        Esta especie está protegida internacionalmente. Si la madera saldrá del país necesitás permiso CITES de exportación. Verificá que la GTF tenga el sello correspondiente y que la trazabilidad esté completa.
                      </p>
                    </div>
                  </div>
                )}
              </Group>

              <Group label="Tipo de producto" required>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PRODUCT_TYPES.map((p) => {
                    const active = data.productType === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => update("productType", p.value)}
                        className={`flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 transition-all ${
                          active
                            ? "border-[var(--brand-ink)] bg-[var(--brand-ink)]/5"
                            : "border-[var(--rule-base)] hover:border-[var(--rule-strong)] hover:bg-[var(--surface-canvas)]"
                        }`}
                      >
                        <span className="text-lg" aria-hidden>{p.emoji}</span>
                        <span className={`text-sm font-bold ${active ? "text-[var(--brand-ink)]" : "text-[var(--text-primary)]"}`}>
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Group>
            </div>
          )}

          {/* ─── Step 3: MEDIDAS ──────────────────────────────────────── */}
          {currentStep === "medidas" && (
            <div className="space-y-6">
              <StepHero
                icon={Scale}
                title="Medidas y características del lote"
                description="Volumen, piezas, dimensiones. La cubicación se calcula automática para madera rolliza."
              />

              {/* Hero card volumen */}
              <div className="rounded-3xl border-2 border-[var(--data-success-300)] bg-linear-to-br from-[var(--data-success-50)] via-white to-white p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="volumen-m3" className="text-xs font-bold uppercase tracking-wider text-[var(--data-success-700)]">
                      Volumen total (m³) *
                    </label>
                    <input
                      id="volumen-m3"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={data.volumeM3}
                      onChange={(e) => update("volumeM3", e.target.value)}
                      placeholder="0.0000"
                      required
                      className="mt-2 w-full bg-transparent text-4xl sm:text-5xl font-extrabold tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]/30 border-b-2 border-[var(--data-success-300)] focus:border-[var(--data-success-600)] py-1"
                    />
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Precisión de 4 decimales (estándar forestal SERFOR).
                    </p>
                  </div>
                  {autoVolume > 0 && data.productType === "rolliza" && (
                    <button
                      type="button"
                      onClick={applyAutoVolume}
                      title="Aplicar cubicación π·r²·L·n calculada de las medidas"
                      className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-[var(--data-success-600)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 shadow-sm"
                    >
                      <Sparkles className="h-4 w-4" />
                      Usar {autoVolume.toFixed(4)} m³
                    </button>
                  )}
                </div>

                {data.productType === "rolliza" && (
                  <div className="mt-4 flex items-start gap-2 text-xs text-[var(--text-tertiary)] border-t border-[var(--rule-soft)] pt-3">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Si llenás piezas + largo + diámetro promedio, el sistema calcula la cubicación automática (fórmula π·r²·L·n) y te sugiere usarla.
                    </span>
                  </div>
                )}
              </div>

              <Group label="Dimensiones físicas">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="N° piezas">
                    <input
                      type="number"
                      min="0"
                      value={data.pieces}
                      onChange={(e) => update("pieces", e.target.value)}
                      placeholder="35"
                      className={cls.input}
                    />
                  </Field>
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
                  <Field label="Diámetro prom. (cm)">
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
                </div>
              </Group>

              <Group label="Observaciones (opcional)">
                <Field label="Defectos visibles">
                  <input
                    type="text"
                    value={data.defectsNotes}
                    onChange={(e) => update("defectsNotes", e.target.value)}
                    placeholder="ej: 3 piezas con nudos grandes, 1 con podredumbre central"
                    className={cls.input}
                  />
                </Field>
                <Field label="Notas adicionales" className="mt-4">
                  <textarea
                    value={data.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={3}
                    placeholder="Cualquier observación útil sobre el lote, transportista, calidad..."
                    className={`${cls.input} resize-none py-3 min-h-[80px]`}
                  />
                </Field>
              </Group>
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <footer className="mt-7 flex items-center justify-between gap-3 border-t-2 border-[var(--rule-base)] pt-5">
            <div className="text-xs text-[var(--text-tertiary)]">
              💾 Borrador guardado automático
            </div>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(STEPS[stepIndex - 1].id)}
                  disabled={submitting}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Anterior
                </button>
              )}

              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep(STEPS[stepIndex + 1].id)}
                  disabled={!stepValid[currentStep] || submitting}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e, true)}
                    disabled={!allValid || submitting}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--brand-ink)] bg-white px-5 text-sm font-bold text-[var(--brand-ink)] hover:bg-[var(--brand-ink)]/5 disabled:opacity-50"
                  >
                    Guardar y agregar otro
                  </button>
                  <button
                    type="submit"
                    disabled={!allValid || submitting}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--data-success-600)] px-6 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Registrar ingreso
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </footer>
        </form>
      </div>
    </AdminModal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════

function StepHero({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Truck;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 rounded-2xl bg-[var(--surface-canvas)] p-2.5">
        <Icon className="h-5 w-5 text-[var(--brand-ink)]" />
      </div>
      <div>
        <h3 className="text-lg font-extrabold text-[var(--text-primary)]">{title}</h3>
        <p className="text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
    </div>
  );
}

function Group({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-3xl border-2 border-[var(--rule-base)] bg-white p-5">
      <legend className="px-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
        {label}
        {required && <span className="ml-1 text-[var(--data-danger-600)]">*</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-sm font-bold text-[var(--text-primary)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--data-danger-600)]">*</span>}
      </span>
      {children}
    </label>
  );
}

// ─── Styles canonized ─────────────────────────────────────────────────────
const cls = {
  input:
    "w-full h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--brand-ink)] focus:bg-white transition-colors",
};
