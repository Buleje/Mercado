"use client";

/**
 * LoteForm — alta de un lote de producción/comercialización forestal (ADR-136).
 * Datos comerciales del lote + selección de corridas (LoteMiembrosEditor).
 * Los totales/especie NO se auto-derivan de las corridas: el lote puede mezclar
 * y el operador decide cómo describirlo comercialmente.
 */

import { useState } from "react";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { Field, I } from "./ctp-shared";
import LoteMiembrosEditor, { loteRowsValidas, type LoteRow } from "./LoteMiembrosEditor";

const PRODUCT_TYPES = ["Madera aserrada", "Madera escuadrada", "Madera cuartoneada", "Tablillas", "Tablones", "Listones", "Durmientes", "Leña", "Carbón vegetal", "Otro"];
const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };
const GRADES = ["", "Exportación", "Grado A", "Grado B", "Grado C", "Primera", "Segunda"];

export default function LoteForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [productType, setProductType] = useState("Madera aserrada");
  const [speciesCommon, setSpeciesCommon] = useState("");
  const [speciesScientific, setSpeciesScientific] = useState("");
  const [cites, setCites] = useState(false);
  const [unit, setUnit] = useState("m3");
  const [grade, setGrade] = useState("");
  const [destino, setDestino] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LoteRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSpeciesBlur() {
    const match = findSpeciesByCommonName(speciesCommon);
    if (match) {
      if (!speciesScientific) setSpeciesScientific(match.scientificName);
      setCites(match.cites);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/lotes", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          productType: productType || null,
          speciesCommon: speciesCommon.trim() || null,
          speciesScientific: speciesScientific.trim() || null,
          cites,
          unit,
          grade: grade || null,
          destino: destino.trim() || null,
          notes: notes.trim() || null,
          miembros: rows.filter((x) => Number(x.quantity) > 0).map((x) => ({ produccionEntryId: x.produccionEntryId, quantity: Number(x.quantity) })),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && rows.length > 0 && loteRowsValidas(rows);

  return (
    <AdminModal open onClose={onClose} variant="side" title="Nuevo lote de producción" description="Agrupá corridas del CTP en un lote comercial" icon={Layers}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Producto" required>
            <select value={productType} onChange={(e) => setProductType(e.target.value)} className={I}>
              {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Unidad">
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={I}>
              {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Especie">
            <input value={speciesCommon} onChange={(e) => setSpeciesCommon(e.target.value)} onBlur={onSpeciesBlur} placeholder="Tornillo" className={I} />
          </Field>
          <Field label="Nombre científico" hint={cites ? "Especie CITES — requiere permiso" : undefined}>
            <input value={speciesScientific} onChange={(e) => setSpeciesScientific(e.target.value)} placeholder="Cedrelinga cateniformis" className={I} />
          </Field>
          <Field label="Grado de calidad">
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className={I}>
              {GRADES.map((g) => <option key={g} value={g}>{g || "— sin grado —"}</option>)}
            </select>
          </Field>
          <Field label="Destino / comprador">
            <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Maderera Ucayali EIRL" className={I} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={cites} onChange={(e) => setCites(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)]" />
          Especie protegida (CITES)
        </label>

        <LoteMiembrosEditor unitLabel={UNIT_LABELS[unit] ?? unit} rows={rows} onRowsChange={setRows} />

        <Field label="Notas (opcional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observaciones comerciales del lote..." className={`${I} h-auto py-2`} />
        </Field>

        {error && <p className="rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)]">{error}</p>}

        <div className="flex justify-end gap-2 border-t-2 border-[var(--rule-soft)] pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={!canSave} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Crear lote
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
