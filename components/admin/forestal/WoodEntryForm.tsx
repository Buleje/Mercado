"use client";

import { useState } from "react";
import { TreePine, AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { listSpecies, findSpeciesByCommonName } from "@/data/forestry-species";
import AdminModal from "@/components/admin/shared/AdminModal";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const ORIGIN_TYPES = [
  { value: "concesion", label: "Concesión forestal" },
  { value: "predio_privado", label: "Predio privado" },
  { value: "comunidad_nativa", label: "Comunidad nativa" },
  { value: "reforestacion", label: "Plantación / reforestación" },
  { value: "retroaserradero", label: "Re-entrada desde otro CTP" },
  { value: "otro", label: "Otro" },
];

const PRODUCT_TYPES = [
  { value: "rolliza", label: "Madera rolliza (troncos)" },
  { value: "aserrada", label: "Aserrada" },
  { value: "tablones", label: "Tablones" },
  { value: "listones", label: "Listones" },
  { value: "durmientes", label: "Durmientes" },
  { value: "pulgada", label: "En pulgadas (tradicional)" },
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
  "Loreto",
  "Ucayali",
  "Madre de Dios",
  "San Martín",
  "Junín",
  "Pasco",
  "Huánuco",
  "Amazonas",
  "Cusco",
  "Otra",
];

export default function WoodEntryForm({ onClose, onSaved }: Props) {
  const speciesOptions = listSpecies();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fields
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [gtfNumber, setGtfNumber] = useState("");
  const [gtfDate, setGtfDate] = useState("");
  const [gtfSeries, setGtfSeries] = useState("");

  const [providerName, setProviderName] = useState("");
  const [providerDocument, setProviderDocument] = useState("");
  const [providerDocumentType, setProviderDocumentType] = useState<string>("RUC");

  const [originType, setOriginType] = useState("concesion");
  const [originCode, setOriginCode] = useState("");
  const [originRegion, setOriginRegion] = useState("Ucayali");
  const [originDistrict, setOriginDistrict] = useState("");

  const [speciesSlug, setSpeciesSlug] = useState("tornillo");
  const [customSpeciesName, setCustomSpeciesName] = useState("");

  const [productType, setProductType] = useState("rolliza");
  const [volumeM3, setVolumeM3] = useState("");
  const [pieces, setPieces] = useState("");
  const [avgLengthM, setAvgLengthM] = useState("");
  const [avgDiameterCm, setAvgDiameterCm] = useState("");
  const [humidityPct, setHumidityPct] = useState("");
  const [defectsNotes, setDefectsNotes] = useState("");
  const [notes, setNotes] = useState("");

  const selectedSpecies = speciesOptions.find((s) => s.slug === speciesSlug);
  const isCustom = speciesSlug === "otro";
  const finalSpeciesName = isCustom
    ? customSpeciesName.trim()
    : selectedSpecies?.commonName ?? "";
  const finalScientificName = isCustom
    ? findSpeciesByCommonName(customSpeciesName)?.scientificName ?? null
    : selectedSpecies?.scientificName ?? null;
  const finalCites = isCustom
    ? findSpeciesByCommonName(customSpeciesName)?.cites ?? false
    : selectedSpecies?.cites ?? false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setError(null);

    if (!finalSpeciesName) {
      setError("Especificá la especie (o seleccioná una del catálogo).");
      return;
    }

    if (!volumeM3 || Number(volumeM3) <= 0) {
      setError("Volumen debe ser mayor a 0 m³.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        entryDate: new Date(entryDate).toISOString(),
        gtfNumber: gtfNumber.trim(),
        gtfDate: gtfDate ? new Date(gtfDate).toISOString() : null,
        gtfSeries: gtfSeries.trim() || null,

        providerName: providerName.trim(),
        providerDocument: providerDocument.trim() || null,
        providerDocumentType: providerDocument.trim() ? providerDocumentType : null,

        originType,
        originCode: originCode.trim() || null,
        originRegion: originRegion === "Otra" ? null : originRegion,
        originDistrict: originDistrict.trim() || null,

        speciesCommonName: finalSpeciesName,
        speciesScientificName: finalScientificName,
        speciesCites: finalCites,

        productType,
        volumeM3: Number(volumeM3),
        pieces: pieces ? Number(pieces) : 0,
        avgLengthM: avgLengthM ? Number(avgLengthM) : null,
        avgDiameterCm: avgDiameterCm ? Number(avgDiameterCm) : null,
        humidityPct: humidityPct ? Number(humidityPct) : null,
        defectsNotes: defectsNotes.trim() || null,

        notes: notes.trim() || null,
        photos: null,
      };

      const res = await fetch("/api/admin/forestal/wood-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          data.message ??
          (data.issues && data.issues[0]?.message) ??
          data.error ??
          `HTTP ${res.status}`;
        throw new Error(msg);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Nuevo ingreso al CTP"
      description="Registro LOE-CTP — Compatible con formato SERFOR"
      variant="wide"
    >
      {/* Mini-encabezado con icon (overrides el default de AdminModal con
          el icon forestal para identidad visual del módulo) */}
      <div className="mb-4 flex items-center gap-3 border-b-2 border-[var(--rule-base)] pb-3">
        <div className="rounded-2xl bg-[var(--data-success-100)] p-2">
          <TreePine className="h-5 w-5 text-[var(--data-success-700)]" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
            Forestal · LOE-CTP SERFOR
          </p>
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Completá los 6 pasos. Los campos con * son obligatorios.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-4 text-[var(--data-danger-900)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          {/* Sección 1: GTF + Fecha */}
          <Section title="1. Guía de Transporte Forestal (GTF)">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Fecha de ingreso" required>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="N° GTF" required>
                <input
                  type="text"
                  value={gtfNumber}
                  onChange={(e) => setGtfNumber(e.target.value)}
                  placeholder="ej: 0001234"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Serie GTF (opcional)">
                <input
                  type="text"
                  value={gtfSeries}
                  onChange={(e) => setGtfSeries(e.target.value)}
                  placeholder="ej: A001"
                  className={inputCls}
                />
              </Field>
              <Field label="Fecha de GTF (opcional)">
                <input
                  type="date"
                  value={gtfDate}
                  onChange={(e) => setGtfDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* Sección 2: Titular habilitante */}
          <Section title="2. Titular habilitante (proveedor)">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre / Razón social" required className="sm:col-span-3">
                <input
                  type="text"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="Nombre del concesionario o titular"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Tipo doc">
                <select
                  value={providerDocumentType}
                  onChange={(e) => setProviderDocumentType(e.target.value)}
                  className={inputCls}
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Número de documento" className="sm:col-span-2">
                <input
                  type="text"
                  value={providerDocument}
                  onChange={(e) => setProviderDocument(e.target.value)}
                  placeholder="RUC, DNI, etc."
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* Sección 3: Origen */}
          <Section title="3. Origen del material">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tipo de origen" required>
                <select
                  value={originType}
                  onChange={(e) => setOriginType(e.target.value)}
                  required
                  className={inputCls}
                >
                  {ORIGIN_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Código origen">
                <input
                  type="text"
                  value={originCode}
                  onChange={(e) => setOriginCode(e.target.value)}
                  placeholder="N° concesión / predio"
                  className={inputCls}
                />
              </Field>
              <Field label="Región">
                <select
                  value={originRegion}
                  onChange={(e) => setOriginRegion(e.target.value)}
                  className={inputCls}
                >
                  {REGIONS_PE.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Distrito">
                <input
                  type="text"
                  value={originDistrict}
                  onChange={(e) => setOriginDistrict(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* Sección 4: Especie */}
          <Section title="4. Especie">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Especie" required>
                <select
                  value={speciesSlug}
                  onChange={(e) => setSpeciesSlug(e.target.value)}
                  required
                  className={inputCls}
                >
                  {speciesOptions.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.commonName}
                      {s.cites ? " · CITES" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {isCustom && (
                <Field label="Nombre común (custom)" required>
                  <input
                    type="text"
                    value={customSpeciesName}
                    onChange={(e) => setCustomSpeciesName(e.target.value)}
                    placeholder="ej: Aguano masha"
                    required
                    className={inputCls}
                  />
                </Field>
              )}
              {!isCustom && selectedSpecies && (
                <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Datos técnicos</div>
                  <div className="mt-1 text-sm italic text-[var(--text-primary)]">
                    {selectedSpecies.scientificName}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {selectedSpecies.densityKgM3 && (
                      <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 font-medium text-[var(--text-secondary)]">
                        {selectedSpecies.densityKgM3} kg/m³
                      </span>
                    )}
                    {selectedSpecies.cites && (
                      <span className="rounded-full bg-[var(--data-danger-100)] px-2 py-0.5 font-bold text-[var(--data-danger-900)]">
                        CITES Apéndice {selectedSpecies.citesAppendix ?? "II"}
                      </span>
                    )}
                    {selectedSpecies.protectionLevel === "controlada" && (
                      <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 font-bold text-[var(--data-warning-900)]">
                        Plan de manejo
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {finalCites && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-3 text-sm text-[var(--data-danger-900)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>Especie CITES:</strong> requiere permiso de exportación
                  CITES si la madera saldrá del país. Verificá que la GTF tenga
                  el sello correspondiente.
                </div>
              </div>
            )}
          </Section>

          {/* Sección 5: Producto */}
          <Section title="5. Producto + medidas">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tipo de producto" required>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  required
                  className={inputCls}
                >
                  {PRODUCT_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Volumen (m³)" required>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={volumeM3}
                  onChange={(e) => setVolumeM3(e.target.value)}
                  placeholder="ej: 12.5430"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="N° de piezas">
                <input
                  type="number"
                  min="0"
                  value={pieces}
                  onChange={(e) => setPieces(e.target.value)}
                  placeholder="ej: 35"
                  className={inputCls}
                />
              </Field>
              <Field label="Largo promedio (m)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={avgLengthM}
                  onChange={(e) => setAvgLengthM(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Diámetro promedio (cm)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={avgDiameterCm}
                  onChange={(e) => setAvgDiameterCm(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Humedad (%)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={humidityPct}
                  onChange={(e) => setHumidityPct(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Defectos visibles" className="sm:col-span-2">
                <input
                  type="text"
                  value={defectsNotes}
                  onChange={(e) => setDefectsNotes(e.target.value)}
                  placeholder="ej: 3 piezas con nudos, 1 con podredumbre"
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* Sección 6: Notas */}
          <Section title="6. Notas adicionales (opcional)">
            <Field label="Observaciones">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Cualquier observación adicional sobre el ingreso..."
                className={`${inputCls} resize-none`}
              />
            </Field>
          </Section>

          {/* Footer */}
          <footer className="flex items-center justify-end gap-3 border-t-2 border-[var(--rule-base)] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 text-base font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-6 text-base font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar ingreso"
              )}
            </button>
          </footer>
        </form>
    </AdminModal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--brand-ink)]";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
        {title}
      </h4>
      {children}
    </section>
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
