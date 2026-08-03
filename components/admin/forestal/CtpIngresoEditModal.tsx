"use client";

/**
 * CtpIngresoEditModal — corregir un ingreso ya registrado.
 *
 * Hasta ahora un error de tipeo (una GTF con un dígito cambiado, 5.20 en vez de
 * 5.02) sólo se arreglaba anulando y volviendo a cargar los 15 campos. Eso
 * ensucia el libro con un anulado por cada dedazo.
 *
 * Límites que impone el backend y que este form respeta a la vista:
 * · sólo mientras el ingreso está PENDIENTE (validado → anular y registrar),
 * · sólo si el mes no está cerrado,
 * · todo cambio queda auditado campo por campo.
 */

import { useState } from "react";
import { AlertCircle, Pencil } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { Btn, Field, I, MODAL_BODY, ModalFooter, Seccion, useAtajoGuardar, useCierreSeguro, type WoodEntry } from "./ctp-shared";

const ORIGENES = [
  { value: "concesion", label: "Concesión forestal" },
  { value: "predio_privado", label: "Predio privado" },
  { value: "comunidad_nativa", label: "Comunidad nativa" },
  { value: "reforestacion", label: "Reforestación" },
  { value: "retroaserradero", label: "Re-entrada de otro CTP" },
  { value: "otro", label: "Otro" },
];

const PRODUCTOS = [
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

/** Fecha date-only → `YYYY-MM-DD` sin correrla de día (se guarda a medianoche UTC). */
const aInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : "");

interface Borrador {
  entryDate: string;
  gtfNumber: string;
  gtfDate: string;
  providerName: string;
  providerDocument: string;
  originType: string;
  originCode: string;
  speciesCommonName: string;
  speciesScientificName: string;
  speciesCites: boolean;
  productType: string;
  volumeM3: string;
  pieces: string;
  notes: string;
}

const desde = (e: WoodEntry): Borrador => ({
  entryDate: aInput(e.entryDate),
  gtfNumber: e.gtfNumber,
  gtfDate: aInput(e.gtfDate),
  providerName: e.providerName,
  providerDocument: e.providerDocument ?? "",
  originType: e.originType,
  originCode: e.originCode ?? "",
  speciesCommonName: e.speciesCommonName,
  speciesScientificName: e.speciesScientificName ?? "",
  speciesCites: e.speciesCites,
  productType: e.productType,
  volumeM3: String(e.volumeM3),
  pieces: String(e.pieces),
  notes: e.notes ?? "",
});

export default function CtpIngresoEditModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: WoodEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Borrador>(() => desde(entry));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setData((p) => ({ ...p, [k]: v }));

  const volumen = Number(data.volumeM3);
  const invalido =
    !data.gtfNumber.trim() ||
    !data.providerName.trim() ||
    !data.speciesCommonName.trim() ||
    !(volumen > 0);

  // Sólo viaja lo que cambió: así la auditoría narra el cambio real y no
  // "corrigió el ingreso" sobre 15 campos que quedaron igual.
  function cambios(): Record<string, unknown> {
    const base = desde(entry);
    const out: Record<string, unknown> = {};
    if (data.entryDate !== base.entryDate) out.entryDate = data.entryDate;
    if (data.gtfNumber !== base.gtfNumber) out.gtfNumber = data.gtfNumber.trim();
    if (data.gtfDate !== base.gtfDate) out.gtfDate = data.gtfDate || null;
    if (data.providerName !== base.providerName) out.providerName = data.providerName.trim();
    if (data.providerDocument !== base.providerDocument) out.providerDocument = data.providerDocument.trim() || null;
    if (data.originType !== base.originType) out.originType = data.originType;
    if (data.originCode !== base.originCode) out.originCode = data.originCode.trim() || null;
    if (data.speciesCommonName !== base.speciesCommonName) out.speciesCommonName = data.speciesCommonName.trim();
    if (data.speciesScientificName !== base.speciesScientificName) {
      out.speciesScientificName = data.speciesScientificName.trim() || null;
    }
    if (data.speciesCites !== base.speciesCites) out.speciesCites = data.speciesCites;
    if (data.productType !== base.productType) out.productType = data.productType;
    if (Number(data.volumeM3) !== Number(base.volumeM3)) out.volumeM3 = Number(data.volumeM3);
    if (Number(data.pieces) !== Number(base.pieces)) out.pieces = Number(data.pieces || 0);
    if (data.notes !== base.notes) out.notes = data.notes.trim() || null;
    return out;
  }

  const nCambios = Object.keys(cambios()).length;

  async function guardar() {
    const fields = cambios();
    if (Object.keys(fields).length === 0) {
      onClose();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forestal/wood-entries/${entry.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "update", fields }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  const bodyRef = useAtajoGuardar(() => void guardar(), !guardando && !invalido && nCambios > 0);
  const cerrar = useCierreSeguro(nCambios > 0 && !guardando, onClose);

  return (
    <AdminModal
      open
      onClose={cerrar}
      variant="info"
      title={`Corregir ingreso · ${entry.gtfNumber}`}
      description="Queda registrado qué cambió, quién y cuándo"
      icon={Pencil}
      /* El pie vive FUERA del scroll (prop `footer` de AdminModal): con doce
         campos, "Guardar corrección" quedaba al final de la lista y había que
         recorrer todo el formulario para encontrarlo. */
      footer={
        <ModalFooter
          error={error}
          nota={nCambios === 0 ? "Sin cambios todavía" : `${nCambios} ${nCambios === 1 ? "campo" : "campos"} por corregir`}
        >
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn variant="primary" disabled={invalido || guardando || nCambios === 0} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar corrección"}
          </Btn>
        </ModalFooter>
      }
    >
      <div ref={bodyRef} className={MODAL_BODY}>
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Mismas secciones y mismos números que el alta: quien corrige un
            ingreso ya llenó ese formulario y busca los campos donde estaban. */}
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Seccion numero={1} title="Documento de origen">
              <Field span={6} label="Fecha de la operación" required casillero={2}>
                <input type="date" className={I} value={data.entryDate} onChange={(e) => set("entryDate", e.target.value)} />
              </Field>
              <Field span={6} label="Fecha de la GTF">
                <input type="date" className={I} value={data.gtfDate} onChange={(e) => set("gtfDate", e.target.value)} />
              </Field>
              <Field span={12} label="N° de GTF" required casillero={4} hint="El origen legal de la madera">
                <input type="text" className={`${I} font-mono`} value={data.gtfNumber} onChange={(e) => set("gtfNumber", e.target.value)} />
              </Field>
            </Seccion>

            <Seccion numero={2} title="Titular habilitante">
              <Field span={12} label="Proveedor" required>
                <input type="text" className={I} value={data.providerName} onChange={(e) => set("providerName", e.target.value)} />
              </Field>
              <Field span={12} label="Documento del proveedor">
                <input type="text" className={I} value={data.providerDocument} onChange={(e) => set("providerDocument", e.target.value)} />
              </Field>
            </Seccion>

            <Seccion numero={3} title="Origen del material">
              <Field span={12} label="Tipo de origen">
                <select className={I} value={data.originType} onChange={(e) => set("originType", e.target.value)}>
                  {ORIGENES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field span={12} label="Código de origen" casillero={9} hint="Concesión, predio o comunidad">
                <input type="text" className={I} value={data.originCode} onChange={(e) => set("originCode", e.target.value)} />
              </Field>
            </Seccion>
          </div>

          <div>
            <Seccion numero={4} title="Especie forestal">
              <Field span={12} label="Especie" required casillero={7}>
                <input type="text" className={I} value={data.speciesCommonName} onChange={(e) => set("speciesCommonName", e.target.value)} />
              </Field>
              <Field span={12} label="Nombre científico" casillero={8}>
                <input type="text" className={`${I} italic`} value={data.speciesScientificName} onChange={(e) => set("speciesScientificName", e.target.value)} />
              </Field>
              <label className="sm:col-span-12 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={data.speciesCites}
                  onChange={(e) => set("speciesCites", e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand-ink)]"
                />
                Especie protegida CITES
              </label>
            </Seccion>

            <Seccion numero={5} title="Producto y medidas">
              <Field span={12} label="Producto" casillero={6}>
                <select className={I} value={data.productType} onChange={(e) => set("productType", e.target.value)}>
                  {PRODUCTOS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field span={6} label="Volumen (m³)" required casillero={12}>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  className={`${I} font-mono tabular-nums`}
                  value={data.volumeM3}
                  onChange={(e) => set("volumeM3", e.target.value)}
                />
              </Field>
              <Field span={6} label="Piezas">
                <input
                  type="number"
                  min="0"
                  className={`${I} tabular-nums`}
                  value={data.pieces}
                  onChange={(e) => set("pieces", e.target.value)}
                />
              </Field>
            </Seccion>

            <Seccion numero={6} title="Observaciones">
              <Field span={12} label="Notas" casillero={13}>
                <textarea
                  rows={3}
                  className={`${I} h-auto py-2.5`}
                  value={data.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </Seccion>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
