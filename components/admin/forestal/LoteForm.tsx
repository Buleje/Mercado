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
import { Btn, Field, I, ModalBody, ModalFooter, Seccion } from "./ctp-shared";
import { avisosVentana } from "@/lib/forestal/lote-ventana";
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
  // Ventana de trabajo y dueño de la madera (ADR-327).
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [titularNombre, setTitularNombre] = useState("");
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
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null,
          titularNombre: titularNombre.trim() || null,
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

  /** La ventana al revés casi siempre es un typo en el año: se avisa al tipear. */
  const avisosFechas = avisosVentana({ fechaInicio: fechaInicio || null, fechaFin: fechaFin || null });

  return (
    <AdminModal
      open
      onClose={onClose}
      /* Rediseño 2026-07-30: era un drawer de 28rem con los nueve campos en una
         sola columna, así que el editor de corridas —lo único que de verdad se
         trabaja acá— quedaba perdido a mitad de un scroll largo. En `wide` con
         dos columnas, la identidad del lote se llena de un lado y las corridas
         se eligen del otro, sin scroll en desktop. */
      variant="wide"
      title="Nuevo lote de producción"
      description="Agrupá corridas del CTP en un lote comercial"
      icon={Layers}
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="dark" onClick={() => void save()} disabled={!canSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Crear lote
          </Btn>
        </ModalFooter>
      }
    >
      {/* El error dejó de repetirse arriba del formulario: vive en el pie,
          donde se ve aunque el modal esté scrolleado. */}
      <ModalBody>
        <div className="grid gap-x-6 md:grid-cols-2">
          <div>
            <Seccion numero={1} title="Identidad del lote">
              <Field span={6} label="Producto" required>
                <select value={productType} onChange={(e) => setProductType(e.target.value)} className={I}>
                  {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field span={6} label="Unidad">
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className={I}>
                  {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field span={12} label="Especie">
                <input value={speciesCommon} onChange={(e) => setSpeciesCommon(e.target.value)} onBlur={onSpeciesBlur} placeholder="Tornillo" className={I} />
              </Field>
              <Field span={12} label="Nombre científico" hint={cites ? "Especie CITES — requiere permiso" : undefined}>
                <input value={speciesScientific} onChange={(e) => setSpeciesScientific(e.target.value)} placeholder="Cedrelinga cateniformis" className={I} />
              </Field>
              <Field span={12} label="Grado de calidad">
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className={I}>
                  {GRADES.map((g) => <option key={g} value={g}>{g || "— sin grado —"}</option>)}
                </select>
              </Field>
              <Field span={12} label="Destino / comprador">
                <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Maderera Ucayali EIRL" className={I} />
              </Field>
              {/* De QUIÉN es la madera. En un aserradero que asierra por encargo
                  el lote no es del centro, y el certificado tiene que decirlo. */}
              <Field span={12} label="Titular de la madera" hint="Dejalo vacío si la madera es del propio centro">
                <input value={titularNombre} onChange={(e) => setTitularNombre(e.target.value)} placeholder="CC.NN. San Luis · servicio de maquila" className={I} />
              </Field>
              <Field span={6} label="Inicio de trabajo" hint="Cuándo la planta empieza con este lote">
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={I} />
              </Field>
              <Field span={6} label="Fin de trabajo">
                <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={I} />
              </Field>
              {avisosFechas.map((a) => (
                <p key={a} className="sm:col-span-12 rounded-lg bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
                  {a}
                </p>
              ))}
              <label className="sm:col-span-12 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" checked={cites} onChange={(e) => setCites(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)] accent-[var(--color-primary)]" />
                Especie protegida (CITES)
              </label>
            </Seccion>

            <Seccion numero={3} title="Notas">
              <Field label="Observaciones comerciales">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Observaciones comerciales del lote..." className={`${I} h-auto py-2.5`} />
              </Field>
            </Seccion>
          </div>

          <div>
            <Seccion numero={2} title="Corridas del lote" hint={rows.length > 0 ? `${rows.length} elegida(s)` : undefined}>
              <div className="sm:col-span-12">
                <LoteMiembrosEditor unitLabel={UNIT_LABELS[unit] ?? unit} rows={rows} onRowsChange={setRows} />
              </div>
            </Seccion>
          </div>
        </div>
      </ModalBody>
    </AdminModal>
  );
}
