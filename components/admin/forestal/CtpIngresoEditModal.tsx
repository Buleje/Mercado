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
import { findSpeciesByCommonName, listSpecies } from "@/data/forestry-species";
import {
  Btn,
  Field,
  I,
  MODAL_BODY,
  ModalFooter,
  Seccion,
  useAtajoGuardar,
  useCierreSeguro,
  type WoodEntry,
} from "./ctp-shared";
import CtpIngresoPartesForm from "./CtpIngresoPartesForm";
import { leerGtfDatos, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";

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
  docType: string;
  gtfNumber: string;
  gtfDate: string;
  gtfSeries: string;
  serforNumeroRegistro: string;
  fechaRecepcion: string;
  providerName: string;
  providerDocument: string;
  originType: string;
  originCode: string;
  originSourceNumber: string;
  ctpProductCode: string;
  originRegion: string;
  originDistrict: string;
  speciesCommonName: string;
  speciesScientificName: string;
  speciesCites: boolean;
  productType: string;
  volumeM3: string;
  pieces: string;
  avgLengthM: string;
  avgDiameterCm: string;
  humidityPct: string;
  defectsNotes: string;
  notes: string;
}

const desde = (e: WoodEntry): Borrador => ({
  entryDate: aInput(e.entryDate),
  docType: e.docType ?? "GTF",
  gtfNumber: e.gtfNumber,
  gtfDate: aInput(e.gtfDate),
  gtfSeries: e.gtfSeries ?? "",
  serforNumeroRegistro: e.serforNumeroRegistro ?? "",
  fechaRecepcion: aInput(e.fechaRecepcion ?? null),
  providerName: e.providerName,
  providerDocument: e.providerDocument ?? "",
  originType: e.originType,
  originCode: e.originCode ?? "",
  originSourceNumber: e.originSourceNumber ?? "",
  ctpProductCode: e.ctpProductCode ?? "",
  originRegion: e.originRegion ?? "",
  originDistrict: e.originDistrict ?? "",
  speciesCommonName: e.speciesCommonName,
  speciesScientificName: e.speciesScientificName ?? "",
  speciesCites: e.speciesCites,
  productType: e.productType,
  volumeM3: String(e.volumeM3),
  pieces: String(e.pieces),
  avgLengthM: e.avgLengthM == null ? "" : String(e.avgLengthM),
  avgDiameterCm: e.avgDiameterCm == null ? "" : String(e.avgDiameterCm),
  humidityPct: e.humidityPct == null ? "" : String(e.humidityPct),
  defectsNotes: e.defectsNotes ?? "",
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
  /** Casilleros (13) a (34): propietario, destinatario, transporte. */
  const gtfBase = leerGtfDatos((entry as { gtfDatos?: unknown }).gtfDatos);
  const [gtfDatos, setGtfDatos] = useState<GtfDatos>(gtfBase);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setData((p) => ({ ...p, [k]: v }));

  /**
   * Al corregir la especie de un ingreso ya registrado, el campo era texto
   * libre puro sin ningún vínculo al catálogo — a diferencia del alta
   * (`WoodEntryForm`), que obliga a elegir de un picker. Un dedazo acá
   * desincroniza la especie del catálogo (agrupación de lotes, biblioteca de
   * fotos, exports) sin ningún aviso. Mismo patrón que ya usa `LoteForm`:
   * autocompleta el científico y el CITES al perder foco, sin bloquear el
   * campo para especies fuera del catálogo (regla de honestidad legal del
   * módulo: mejor texto libre que un enum que rechace una especie real).
   */
  function onEspecieBlur() {
    const match = findSpeciesByCommonName(data.speciesCommonName);
    if (!match) return;
    setData((p) => ({
      ...p,
      speciesScientificName: p.speciesScientificName.trim() || match.scientificName,
      speciesCites: match.cites,
    }));
  }

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
    /* El cuerpo del documento va entero si algo cambió: el endpoint lo valida
       con `gtfDatosSchema` y la DB anota casillero por casillero qué se tocó. */
    if (JSON.stringify(gtfDatos) !== JSON.stringify(gtfBase)) out.gtfDatos = gtfDatos;
    if (data.entryDate !== base.entryDate) out.entryDate = data.entryDate;
    if (data.gtfNumber !== base.gtfNumber) out.gtfNumber = data.gtfNumber.trim();
    if (data.gtfDate !== base.gtfDate) out.gtfDate = data.gtfDate || null;
    if (data.docType !== base.docType) out.docType = data.docType;
    if (data.gtfSeries !== base.gtfSeries) out.gtfSeries = data.gtfSeries.trim() || null;
    if (data.serforNumeroRegistro !== base.serforNumeroRegistro) {
      out.serforNumeroRegistro = data.serforNumeroRegistro.trim() || null;
    }
    if (data.fechaRecepcion !== base.fechaRecepcion)
      out.fechaRecepcion = data.fechaRecepcion || null;
    if (data.providerName !== base.providerName) out.providerName = data.providerName.trim();
    if (data.providerDocument !== base.providerDocument)
      out.providerDocument = data.providerDocument.trim() || null;
    if (data.originType !== base.originType) out.originType = data.originType;
    if (data.originCode !== base.originCode) out.originCode = data.originCode.trim() || null;
    if (data.originSourceNumber !== base.originSourceNumber) {
      out.originSourceNumber = data.originSourceNumber.trim() || null;
    }
    if (data.ctpProductCode !== base.ctpProductCode)
      out.ctpProductCode = data.ctpProductCode.trim() || null;
    if (data.originRegion !== base.originRegion)
      out.originRegion = data.originRegion.trim() || null;
    if (data.originDistrict !== base.originDistrict)
      out.originDistrict = data.originDistrict.trim() || null;
    if (data.speciesCommonName !== base.speciesCommonName)
      out.speciesCommonName = data.speciesCommonName.trim();
    if (data.speciesScientificName !== base.speciesScientificName) {
      out.speciesScientificName = data.speciesScientificName.trim() || null;
    }
    if (data.speciesCites !== base.speciesCites) out.speciesCites = data.speciesCites;
    if (data.productType !== base.productType) out.productType = data.productType;
    if (Number(data.volumeM3) !== Number(base.volumeM3)) out.volumeM3 = Number(data.volumeM3);
    if (Number(data.pieces) !== Number(base.pieces)) out.pieces = Number(data.pieces || 0);
    /* Los numéricos van `null` cuando quedan vacíos, nunca 0: «no se midió» y
       «midió cero» son cosas distintas, y un 0 inventado ensucia los promedios
       del patio. Mismo criterio que el costo sin factura. */
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    if (data.avgLengthM !== base.avgLengthM) out.avgLengthM = num(data.avgLengthM);
    if (data.avgDiameterCm !== base.avgDiameterCm) out.avgDiameterCm = num(data.avgDiameterCm);
    if (data.humidityPct !== base.humidityPct) out.humidityPct = num(data.humidityPct);
    if (data.defectsNotes !== base.defectsNotes)
      out.defectsNotes = data.defectsNotes.trim() || null;
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
          nota={
            nCambios === 0
              ? "Sin cambios todavía"
              : `${nCambios} ${nCambios === 1 ? "campo" : "campos"} por corregir`
          }
        >
          <Btn variant="ghost" onClick={cerrar}>
            Cancelar
          </Btn>
          <Btn
            variant="primary"
            disabled={invalido || guardando || nCambios === 0}
            onClick={() => void guardar()}
          >
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
                <input
                  type="date"
                  className={I}
                  value={data.entryDate}
                  onChange={(e) => set("entryDate", e.target.value)}
                />
              </Field>
              <Field span={6} label="Fecha de la GTF">
                <input
                  type="date"
                  className={I}
                  value={data.gtfDate}
                  onChange={(e) => set("gtfDate", e.target.value)}
                />
              </Field>
              <Field
                span={12}
                label="N° de GTF"
                required
                casillero={4}
                hint="El origen legal de la madera"
              >
                <input
                  type="text"
                  className={`${I} font-mono`}
                  value={data.gtfNumber}
                  onChange={(e) => set("gtfNumber", e.target.value)}
                />
              </Field>
              {/* Estos cuatro los aceptaba el endpoint desde siempre y el form
                  no los ofrecía: se veían vacíos en la ficha y no había dónde
                  escribirlos. El del SNIFFS ni siquiera lo aceptaba el PATCH. */}
              <Field span={6} label="Tipo de documento" casillero={3}>
                <select
                  className={I}
                  value={data.docType}
                  onChange={(e) => set("docType", e.target.value)}
                >
                  <option value="GTF">GTF</option>
                  <option value="GRR">GRR</option>
                </select>
              </Field>
              <Field span={6} label="Serie">
                <input
                  type="text"
                  className={`${I} font-mono`}
                  value={data.gtfSeries}
                  onChange={(e) => set("gtfSeries", e.target.value)}
                />
              </Field>
              <Field
                span={12}
                label="N° de registro SNIFFS"
                hint="Con ese número se consulta la guía en la base pública de SERFOR"
              >
                <input
                  type="text"
                  className={`${I} font-mono`}
                  value={data.serforNumeroRegistro}
                  onChange={(e) => set("serforNumeroRegistro", e.target.value)}
                  placeholder="1-19-0313629"
                />
              </Field>
              <Field
                span={12}
                label="Llegó a la planta"
                hint="Cuándo descargó el camión — no es la fecha del asiento ni la del documento"
              >
                <input
                  type="date"
                  className={I}
                  value={data.fechaRecepcion}
                  onChange={(e) => set("fechaRecepcion", e.target.value)}
                />
              </Field>
            </Seccion>

            <Seccion numero={2} title="Titular habilitante">
              <Field span={12} label="Proveedor" required>
                <input
                  type="text"
                  className={I}
                  value={data.providerName}
                  onChange={(e) => set("providerName", e.target.value)}
                />
              </Field>
              <Field span={12} label="Documento del proveedor">
                <input
                  type="text"
                  className={I}
                  value={data.providerDocument}
                  onChange={(e) => set("providerDocument", e.target.value)}
                />
              </Field>
            </Seccion>

            <Seccion numero={3} title="Origen del material">
              <Field span={12} label="Tipo de origen">
                <select
                  className={I}
                  value={data.originType}
                  onChange={(e) => set("originType", e.target.value)}
                >
                  {ORIGENES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                span={12}
                label="Código de origen"
                casillero={9}
                hint="Concesión, predio o comunidad"
              >
                <input
                  type="text"
                  className={I}
                  value={data.originCode}
                  onChange={(e) => set("originCode", e.target.value)}
                />
              </Field>
              <Field span={12} label="N° de resolución" casillero={8}>
                <input
                  type="text"
                  className={`${I} font-mono`}
                  value={data.originSourceNumber}
                  onChange={(e) => set("originSourceNumber", e.target.value)}
                />
              </Field>
              <Field span={6} label="Región">
                <input
                  type="text"
                  className={I}
                  value={data.originRegion}
                  onChange={(e) => set("originRegion", e.target.value)}
                />
              </Field>
              <Field span={6} label="Distrito">
                <input
                  type="text"
                  className={I}
                  value={data.originDistrict}
                  onChange={(e) => set("originDistrict", e.target.value)}
                />
              </Field>
              <Field
                span={12}
                label="Código de CTP de procedencia"
                casillero={9}
                hint="Sólo si la madera viene de otro centro de transformación"
              >
                <input
                  type="text"
                  className={`${I} font-mono`}
                  value={data.ctpProductCode}
                  onChange={(e) => set("ctpProductCode", e.target.value)}
                />
              </Field>
            </Seccion>
          </div>

          <div>
            <Seccion numero={4} title="Especie forestal">
              <Field span={12} label="Especie" required casillero={7}>
                <input
                  type="text"
                  className={I}
                  value={data.speciesCommonName}
                  onChange={(e) => set("speciesCommonName", e.target.value)}
                  onBlur={onEspecieBlur}
                  list="ctp-ingreso-especies"
                />
                <datalist id="ctp-ingreso-especies">
                  {listSpecies().map((s) => (
                    <option key={s.slug} value={s.commonName} />
                  ))}
                </datalist>
              </Field>
              <Field span={12} label="Nombre científico" casillero={8}>
                <input
                  type="text"
                  className={`${I} italic`}
                  value={data.speciesScientificName}
                  onChange={(e) => set("speciesScientificName", e.target.value)}
                />
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
                <select
                  className={I}
                  value={data.productType}
                  onChange={(e) => set("productType", e.target.value)}
                >
                  {PRODUCTOS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
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
              {/* Vacío se guarda como `null`, nunca 0: «no se midió» y «midió
                  cero» son cosas distintas y un 0 inventado ensucia los
                  promedios del patio. */}
              <Field span={6} label="Largo promedio (m)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${I} font-mono tabular-nums`}
                  value={data.avgLengthM}
                  onChange={(e) => set("avgLengthM", e.target.value)}
                  placeholder="sin medir"
                />
              </Field>
              <Field span={6} label="Diámetro promedio (cm)">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className={`${I} font-mono tabular-nums`}
                  value={data.avgDiameterCm}
                  onChange={(e) => set("avgDiameterCm", e.target.value)}
                  placeholder="sin medir"
                />
              </Field>
              <Field span={6} label="Humedad (%)">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className={`${I} font-mono tabular-nums`}
                  value={data.humidityPct}
                  onChange={(e) => set("humidityPct", e.target.value)}
                  placeholder="sin medir"
                />
              </Field>
              <Field
                span={12}
                label="Defectos observados"
                hint="Mancha, rajaduras, insectos — lo que se vio al descargar"
              >
                <input
                  type="text"
                  className={I}
                  value={data.defectsNotes}
                  onChange={(e) => set("defectsNotes", e.target.value)}
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

            {/* Lo que el papel trae y nadie transcribió al recibir. Antes estos
                casilleros se veían vacíos en la ficha y no había dónde
                llenarlos: el PATCH no los aceptaba. */}
            <Seccion numero={7} title="Cuerpo del documento · casilleros (13) a (34)">
              <CtpIngresoPartesForm datos={gtfDatos} onChange={setGtfDatos} />
            </Seccion>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
