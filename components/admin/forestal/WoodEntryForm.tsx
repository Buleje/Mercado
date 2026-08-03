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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Camera, Check, FileText, Loader2, Search, ShieldAlert, ShieldCheck, Sparkles, TreePine, X,
  ClipboardList,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, Field, I, ModalFooter, Seccion } from "./ctp-shared";
import CtpParteBarra from "./CtpParteBarra";
import CtpTrozasImportModal from "./CtpTrozasImportModal";
import type { TrozaImportada } from "@/lib/forestal/trozas-import";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import type { DocTipo } from "@/lib/forestal/directorio";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { printGtfSerfor } from "@/lib/forestal/serfor-gtf-print";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpFichaFaltantes, type CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import {
  listSpecies,
  findSpeciesByCommonName,
} from "@/data/forestry-species";
import { TIPOS_DOCUMENTO_LOCTP, UNIDADES_LOCTP } from "@/lib/forestal/loctp-campos";
import { PRESENTACIONES_LOCTP } from "@/lib/forestal/loctp-catalogos";
import { ORIGEN_SERFOR, REGIONS_PE, sinTildesUp } from "@/lib/forestal/serfor-origen";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { repartirGtfEnIngresos } from "@/lib/forestal/serfor-gtf-a-ingresos";

/** Lo que se copia al duplicar un ingreso: el camión siguiente del mismo
 *  proveedor y la misma concesión. Nunca la GTF ni el volumen. */
export interface WoodEntryPreset {
  providerName?: string;
  providerDocument?: string | null;
  providerDocumentType?: string | null;
  originType?: string;
  originCode?: string | null;
  originRegion?: string | null;
  originDistrict?: string | null;
  speciesCommonName?: string;
  productType?: string;
}

interface Props {
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean; /** Quedó anotado en el patio, no en el libro. */ offline?: boolean }) => void;
  /** Bandeja monte→planta: abre el form con esta guía ya cargada (sin doble digitación). */
  initialGtfNumber?: string;
  /** Duplicar: campos repetidos ya cargados (ver WoodEntryPreset). */
  preset?: WoodEntryPreset;
}

// Guía emitida (ForestGtf) — para importar sus datos al ingreso.
interface GtfItem {
  species?: string | null; scientific?: string | null; productType?: string | null;
  volumeM3?: number | null; quantity?: number | null; pieces?: number | null; unit?: string | null;
}
interface GtfRecord {
  gtfNumber?: string; gtfDate?: string | null; titularName?: string | null; tituloHabilitante?: string | null;
  parcelaCorta?: string | null; origen?: string | null; transportista?: string | null;
  placaVehiculo?: string | null; volumenTotalM3?: number | null; piezasTotal?: number | null;
  items?: GtfItem[] | null;
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

/**
 * La ficha de SERFOR, con el tipo canónico de `lib/forestal/serfor-gtf`. Antes
 * había acá una copia recortada: dejó de servir cuando el reparto en ingresos
 * (ADR-312) pasó a ser lógica compartida entre el formulario y el servidor.
 */
type GtfSerforLite = GtfSerfor;

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
  /** (3) Tipo de documento del LO-CTP: GTF | GRR. */
  docType: string;
  providerName: string;
  providerDocument: string;
  providerDocumentType: string;
  originType: string;
  originCode: string;
  /** (5) N° Fuente de origen/procedencia (el documento que ampara la fuente). */
  originSourceNumber: string;
  /** (9) Código de CTP — sólo si la madera viene de otro centro. */
  ctpProductCode: string;
  originRegion: string;
  originDistrict: string;
  speciesSlug: string;
  customSpeciesName: string;
  productType: string;
  /** (10) Unidad de medida declarada en el documento. */
  unit: string;
  /** "Forma de presentación" del formato (ADR-314). */
  presentacion: string;
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
  docType: "GTF",
  providerName: "",
  providerDocument: "",
  providerDocumentType: "RUC",
  originType: "concesion",
  originCode: "",
  originSourceNumber: "",
  ctpProductCode: "",
  originRegion: "Ucayali",
  originDistrict: "",
  speciesSlug: "tornillo",
  customSpeciesName: "",
  productType: "rolliza",
  unit: "m3",
  presentacion: "",
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

export default function WoodEntryForm({ onClose, onSaved, initialGtfNumber, preset }: Props) {
  const speciesOptions = useMemo(() => listSpecies(), []);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** La libreta del CTP (ADR-317) y qué proveedor se usó en ESTE ingreso. */
  const directorio = useDirectorioForestal();
  const partesUsadas = useRef<Set<string>>(new Set());
  /** El uso se cuenta con el ingreso ya guardado, no al elegir de la lista. */
  /** Lista de trozas pegada a mano cuando SERFOR no la trajo (ADR-320). */
  const [trozasManuales, setTrozasManuales] = useState<TrozaImportada[]>([]);
  const [importarTrozas, setImportarTrozas] = useState(false);
  const marcarProveedorUsado = () => {
    if (!partesUsadas.current.size) return;
    directorio.marcarUso({ partes: [...partesUsadas.current] });
    partesUsadas.current.clear();
  };

  const [data, setData] = useState<DraftData>(INITIAL);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  // Importar guía por N° de registro (autocompleta el ingreso).
  const [loadingGtf, setLoadingGtf] = useState(false);
  // Consulta oficial a SERFOR por el N° de registro del QR de la guía.
  const [nroRegistroSerfor, setNroRegistroSerfor] = useState("");
  const [serforCargando, setSerforCargando] = useState(false);
  const [serforMsg, setSerforMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** Ficha oficial tal como la publicó SERFOR — viaja con el ingreso para el PDF. */
  const [serforGtf, setSerforGtf] = useState<GtfSerforLite | null>(null);
  // Aviso flotante: el operador está mirando el formulario llenarse solo, no el
  // renglón de estado del campo.
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  /**
   * Dos caminos para el mismo ingreso:
   * · "manual" — se llena a mano (el de siempre, por defecto);
   * · "serfor" — se pide la guía por su N° de registro y se registra lo que dice
   *   el documento oficial. En ese modo los campos manuales se ocultan: si el
   *   dato vino de SERFOR, editarlo al lado invita a "corregir" un documento que
   *   no es nuestro.
   */
  const [modo, setModo] = useState<"manual" | "serfor">("manual");
  const [gtfMsg, setGtfMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gtfItems, setGtfItems] = useState<GtfItem[]>([]);
  const [showGuias, setShowGuias] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Ficha del CTP: para avisar si está incompleta (G) y ofrecer permisos CITES (H).
  const [ficha, setFicha] = useState<CtpFicha | null>(null);
  const [citesPermiso, setCitesPermiso] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.ficha) setFicha(j.ficha as CtpFicha); })
      .catch((err) => console.warn("[wood-form] ficha fetch failed", err));
    return () => { alive = false; };
  }, []);
  const [guias, setGuias] = useState<GtfRecord[]>([]);
  const [loadingGuias, setLoadingGuias] = useState(false);
  const [guiaQuery, setGuiaQuery] = useState("");

  // Load draft del localStorage. Si el form abre desde la bandeja monte→planta
  // (initialGtfNumber) o duplicando un ingreso (preset), la intención es
  // explícita: eso pisa al borrador.
  useEffect(() => {
    if (initialGtfNumber || preset) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftData;
        if (parsed.gtfNumber || parsed.providerName) {
          setData({ ...INITIAL, ...parsed, entryDate: INITIAL.entryDate });
        }
      }
    } catch {}
  }, [initialGtfNumber, preset]);

  // Duplicar un ingreso: lo que se repite camión tras camión (proveedor, origen,
  // especie, producto) llega armado; lo que cambia (GTF, volumen, piezas) queda
  // vacío a propósito — un duplicado con la GTF del anterior sería un registro
  // falso, no un atajo.
  const presetLoadedRef = useRef(false);
  useEffect(() => {
    if (!preset || presetLoadedRef.current) return;
    presetLoadedRef.current = true;
    const slug = preset.speciesCommonName
      ? speciesOptions.find((s) => s.commonName.toLowerCase() === preset.speciesCommonName!.toLowerCase())?.slug
      : undefined;
    setData((prev) => ({
      ...INITIAL,
      entryDate: prev.entryDate,
      providerName: preset.providerName ?? "",
      providerDocument: preset.providerDocument ?? "",
      providerDocumentType: preset.providerDocumentType ?? INITIAL.providerDocumentType,
      originType: preset.originType ?? INITIAL.originType,
      originCode: preset.originCode ?? "",
      originRegion: preset.originRegion ?? INITIAL.originRegion,
      originDistrict: preset.originDistrict ?? "",
      productType: preset.productType ?? INITIAL.productType,
      speciesSlug: slug ?? (preset.speciesCommonName ? "otro" : INITIAL.speciesSlug),
      customSpeciesName: slug ? "" : (preset.speciesCommonName ?? ""),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar con el preset
  }, [preset]);

  // Bandeja monte→planta: pre-cargar la guía apenas abre el form. Ref guard:
  // StrictMode monta doble en dev y sin él la guía se aplicaba 2 veces
  // (las notas quedaban con "Origen guía: …" duplicado).
  const initLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialGtfNumber || initLoadedRef.current) return;
    initLoadedRef.current = true;
    setData((prev) => ({ ...INITIAL, entryDate: prev.entryDate, gtfNumber: initialGtfNumber }));
    void cargarGuia(initialGtfNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar con la guía
  }, [initialGtfNumber]);

  // Auto-guardar borrador
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch {}
  }, [data]);

  function update<K extends keyof DraftData>(field: K, value: DraftData[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  const mapProduct = (pt: string | null | undefined, fallback: string): string => {
    if (!pt) return fallback;
    const low = pt.toLowerCase();
    return PRODUCT_TYPES.find((p) => p.label.toLowerCase().includes(low) || low.includes(p.value))?.value ?? fallback;
  };

  // Rellena especie/producto/volumen/piezas desde un ítem de la guía.
  const fillFromItem = (it: GtfItem) => {
    setData((prev) => {
      const slug = speciesOptions.find((s) => s.commonName.toLowerCase() === (it.species ?? "").toLowerCase())?.slug;
      return {
        ...prev,
        speciesSlug: slug ?? (it.species ? "otro" : prev.speciesSlug),
        customSpeciesName: slug ? "" : (it.species ?? prev.customSpeciesName),
        productType: mapProduct(it.productType, prev.productType),
        volumeM3: it.volumeM3 != null ? String(it.volumeM3) : it.quantity != null ? String(it.quantity) : prev.volumeM3,
        pieces: it.pieces != null ? String(it.pieces) : prev.pieces,
      };
    });
    setGtfItems([]);
  };

  // Aplica los datos de una guía al formulario (usado por número y por picker).
  const aplicarGuia = (gtf: GtfRecord) => {
    const region = REGIONS_PE.find((rg) => (gtf.origen ?? "").toLowerCase().includes(rg.toLowerCase()));
    setData((prev) => ({
      ...prev,
      gtfNumber: gtf.gtfNumber ?? prev.gtfNumber,
      gtfDate: gtf.gtfDate ? String(gtf.gtfDate).slice(0, 10) : prev.gtfDate,
      providerName: gtf.titularName ?? prev.providerName,
      originCode: gtf.tituloHabilitante ?? gtf.parcelaCorta ?? prev.originCode,
      originRegion: region ?? prev.originRegion,
      notes: [prev.notes, gtf.origen ? `Origen guía: ${gtf.origen}` : "", gtf.transportista ? `Transportista: ${gtf.transportista}${gtf.placaVehiculo ? ` · ${gtf.placaVehiculo}` : ""}` : ""].filter(Boolean).join(" · "),
    }));
    setShowGuias(false);
    const items = Array.isArray(gtf.items) ? gtf.items : [];
    if (items.length === 1) { fillFromItem(items[0]); setGtfMsg({ ok: true, text: `Guía cargada: ${gtf.titularName ?? "titular"} · datos importados.` }); }
    else if (items.length > 1) { setGtfItems(items); setGtfMsg({ ok: true, text: `Guía cargada. Tiene ${items.length} ítems — elegí cuál registrar en este ingreso.` }); }
    else { setData((prev) => ({ ...prev, volumeM3: gtf.volumenTotalM3 != null ? String(gtf.volumenTotalM3) : prev.volumeM3, pieces: gtf.piezasTotal != null ? String(gtf.piezasTotal) : prev.pieces })); setGtfMsg({ ok: true, text: "Guía cargada (sin detalle de ítems)." }); }
  };

  // Escanea una foto de la GTF (OCR con IA) y pre-llena el ingreso. La especie
  // NO se auto-selecciona (tiene peso legal): se detecta y el operador la elige.
  async function scanGtf(file: File) {
    setScanning(true);
    setGtfMsg(null);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
        fr.readAsDataURL(file);
      });
      const r = await fetch("/api/admin/forestal/gtf-ocr", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ image: b64 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setData((prev) => ({
        ...prev,
        gtfNumber: j.gtfNumber || prev.gtfNumber,
        gtfSeries: j.gtfSeries || prev.gtfSeries,
        gtfDate: j.fecha || prev.gtfDate,
        providerName: j.proveedor || prev.providerName,
        providerDocument: j.ruc || prev.providerDocument,
        volumeM3: j.volumenM3 ? String(j.volumenM3) : prev.volumeM3,
        originCode: j.origen || prev.originCode,
      }));
      const esp = [j.especie, j.especieCientifica].filter(Boolean).join(" · ");
      setGtfMsg({ ok: true, text: `GTF escaneada.${esp ? ` Especie detectada: ${esp} — seleccionala en el picker.` : ""} Revisá los datos antes de guardar.` });
    } catch (e) {
      setGtfMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setScanning(false);
    }
  }

  // Carga la guía por su N° de registro y autocompleta el ingreso. Acepta un
  // número explícito (bandeja monte→planta) o usa el tipeado en el campo.
  /**
   * Trae la guía desde la base de SERFOR por su N° de registro y llena el
   * formulario con lo que dice el documento oficial.
   *
   * Pisa lo que esté vacío y respeta lo que el operador ya escribió: el sistema
   * ayuda, no corrige. La ficha completa queda guardada para poder reimprimir la
   * GTF después (`serforGtf`).
   */
  async function consultarSerfor() {
    const n = nroRegistroSerfor.trim();
    if (!n) { setSerforMsg({ ok: false, text: "Escribí el N° de registro de la guía (ej. 1-19-0313629)." }); return; }
    setSerforCargando(true); setSerforMsg(null);
    try {
      const r = await fetch(`/api/admin/forestal/gtf/serfor?numeroRegistro=${encodeURIComponent(n)}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) { setSerforMsg({ ok: false, text: j?.message ?? `El servidor respondió ${r.status}` }); return; }
      if (j.estado !== "encontrada" || !j.gtf) {
        setSerforMsg({ ok: false, text: j.mensaje ?? "SERFOR no encontró esa guía." });
        pushToast?.({ tono: "warning", msg: "SERFOR no encontró esa guía", detail: "Revisá el N° de registro (va con guiones)." });
        return;
      }
      const g = j.gtf as GtfSerforLite;
      setSerforGtf(g);

      // Fechas: SERFOR las publica dd/mm/aaaa y el input las quiere aaaa-mm-dd.
      const aISO = (f: string | null) => {
        const m = (f ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
      };
      const p0 = g.productos?.[0];
      const piezas = (g.productos ?? []).reduce((a, x) => a + (x.cantidad ?? 0), 0);
      const volumen = g.volumenTotal ?? (g.productos ?? []).reduce((a, x) => a + (x.volumen ?? 0), 0);
      /**
       * Qué campos se van a llenar se decide ANTES de tocar el estado: armar el
       * aviso desde dentro de `setData` lo dejaba siempre en "ya estaban
       * completos", porque el callback corre después de mostrarlo.
       *
       * Se respeta lo que el operador escribió; los valores que todavía son el
       * default del formulario (la especie precargada, por ejemplo) SÍ los pisa
       * el documento oficial: entre un default nuestro y lo que dice la guía,
       * manda la guía.
       */
      const cambios: Partial<DraftData> = {};
      const llenados: string[] = [];
      /**
       * En modo SERFOR **manda el documento, siempre**: los campos manuales
       * están ocultos, así que lo que quedó del borrador anterior no se puede
       * ver ni corregir. Con la regla "respetar lo escrito" un ingreso de esta
       * guía se guardaba con el titular del camión anterior — el libro decía
       * una cosa y la GTF otra, que es justo lo que un fiscalizador cruza.
       */
      const mandaElDocumento = modo === "serfor";
      const proponer = <K extends keyof DraftData>(campo: K, valor: string, etiqueta: string, pisaDefault = false) => {
        if (!valor) return;
        const actual = String(data[campo] ?? "").trim();
        const esDefault = actual === String(INITIAL[campo] ?? "").trim();
        if (actual && !mandaElDocumento && !(pisaDefault && esDefault)) return;
        if (actual === valor) return;
        (cambios as Record<string, string>)[campo as string] = valor;
        llenados.push(etiqueta);
      };

      proponer("gtfNumber", g.gtfNumber ?? "", "N° GTF");
      proponer("gtfDate", aISO(g.fechaExpedicion), "fecha de la guía");
      proponer("providerName", g.titular ?? "", "titular");
      proponer("providerDocument", (g.rucInstancia ?? g.propietarioDoc ?? "").split("/")[0]?.trim() ?? "", "RUC");
      proponer("originCode", g.numeroTitulo ?? "", "código de origen");
      proponer("originSourceNumber", g.numeroResolucion ?? "", "N° de fuente de origen");
      proponer("originDistrict", g.distrito ?? "", "distrito");
      proponer("presentacion", (p0?.presentacion ?? "").toUpperCase(), "presentación", true);
      if (volumen > 0) proponer("volumeM3", volumen.toFixed(4), "volumen");
      if (piezas > 0) proponer("pieces", String(Math.round(piezas)), "piezas");
      // SERFOR manda el departamento EN MAYÚSCULAS ("PASCO") y el catálogo lo
      // tiene capitalizado ("Pasco"): comparar tal cual fallaba en silencio y el
      // ingreso se guardaba con la región POR DEFECTO (Ucayali) para una guía de
      // Pasco. Se compara sin tildes ni mayúsculas y se guarda el valor del
      // catálogo.
      const regionCatalogo = g.departamento
        ? REGIONS_PE.find((r) => sinTildesUp(r) === sinTildesUp(g.departamento ?? ""))
        : undefined;
      if (regionCatalogo) proponer("originRegion", regionCatalogo, "región", true);
      else if (g.departamento) proponer("originRegion", "Otra", "región", true);
      // La especie y el tipo de origen del formulario arrancan con un default:
      // el dato oficial de la guía tiene prioridad sobre él.
      if (p0?.comun) {
        // Si la especie de la guía está en el catálogo se elige del listado; si
        // no, va como "otro" con su nombre — el slug para especie libre es
        // "otro" (con "otra" el selector quedaba vacío y el ingreso sin especie).
        const delCatalogo = findSpeciesByCommonName(p0.comun);
        if (delCatalogo?.slug) {
          proponer("speciesSlug", delCatalogo.slug, "especie", true);
        } else {
          proponer("speciesSlug", "otro", "especie", true);
          proponer("customSpeciesName", p0.comun, "especie", true);
        }
      }
      const tipo = ORIGEN_SERFOR[(g.origenRecurso ?? "").toUpperCase()];
      if (tipo) proponer("originType", tipo, "tipo de origen", true);

      if (Object.keys(cambios).length > 0) setData((prev) => ({ ...prev, ...cambios }));

      setSerforMsg({
        ok: true,
        text: `Guía ${g.gtfNumber ?? n} · ${g.titular ?? "sin titular"} · ${g.estado ?? "sin estado"}`,
      });
      pushToast?.({
        tono: "success",
        msg: `Guía ${g.gtfNumber ?? n} cargada desde SERFOR`,
        detail:
          llenados.length > 0
            ? `Se completó: ${[...new Set(llenados)].slice(0, 6).join(", ")}${llenados.length > 6 ? "…" : ""}`
            : "Los campos ya estaban completos con lo que escribiste.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSerforMsg({ ok: false, text: msg });
      pushToast?.({ tono: "error", msg: "No se pudo consultar SERFOR", detail: msg.slice(0, 90) });
    } finally {
      setSerforCargando(false);
    }
  }

  async function cargarGuia(num?: string) {
    const n = (num ?? data.gtfNumber).trim();
    if (!n) { setGtfMsg({ ok: false, text: "Escribí el N° de guía primero." }); return; }
    setLoadingGtf(true); setGtfMsg(null); setGtfItems([]); setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/gtf?gtfNumber=${encodeURIComponent(n)}`, { credentials: "include" });
      if (r.status === 404) { setGtfMsg({ ok: false, text: `No hay una guía emitida con el N° ${n}. Revisá el número.` }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      aplicarGuia((await r.json()).gtf as GtfRecord);
    } catch (e) { setGtfMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setLoadingGtf(false); }
  }

  // Lista de guías emitidas (picker) — evita teclear el número.
  async function toggleGuias() {
    if (showGuias) { setShowGuias(false); return; }
    setShowGuias(true); setLoadingGuias(true);
    try {
      const r = await fetch(`/api/admin/forestal/gtf`, { credentials: "include" });
      const list = r.ok ? ((await r.json()).gtfs ?? []) : [];
      setGuias((list as GtfRecord[]).filter((g) => (g as { status?: string }).status !== "anulada"));
    } catch { setGuias([]); }
    finally { setLoadingGuias(false); }
  }
  const guiasFiltradas = useMemo(() => {
    const q = guiaQuery.trim().toLowerCase();
    return (q ? guias.filter((g) => (g.gtfNumber ?? "").toLowerCase().includes(q) || (g.titularName ?? "").toLowerCase().includes(q)) : guias).slice(0, 50);
  }, [guias, guiaQuery]);

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

  /**
   * Qué especie mostrar arriba del panel. Una guía puede traer VARIAS (esta
   * trae Copaiba y Sapotillo): mostrar sólo la primera haría creer que el
   * ingreso es de una sola.
   */
  /**
   * Qué renglones va a dejar esta guía en el libro. Se calcula con la MISMA
   * función que usa el servidor para crearlos (ADR-312): lo que el operador ve
   * antes de registrar es exactamente lo que se va a registrar.
   */
  const reparto = useMemo(() => (serforGtf ? repartirGtfEnIngresos(serforGtf) : null), [serforGtf]);

  const especiesResumen = useMemo(() => {
    const deGuia = (serforGtf?.productos ?? []).map((p) => p.comun ?? p.cientifico).filter(Boolean) as string[];
    if (deGuia.length > 1) {
      return { titulo: `${deGuia.length} especies`, sub: deGuia.join(" · ") };
    }
    return { titulo: finalSpeciesName || "Sin especie", sub: finalScientificName || null };
  }, [serforGtf, finalSpeciesName, finalScientificName]);

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

  // (E) Divergencia >15% entre volumen declarado y cubicaje calculado.
  const cubicajeDivergente =
    autoVolume > 0 && Number(data.volumeM3) > 0
      ? Math.abs(Number(data.volumeM3) - autoVolume) / autoVolume > 0.15
      : false;
  // (G) Datos legales mínimos de la Ficha del CTP que faltan.
  const fichaFaltante = ficha ? ctpFichaFaltantes(ficha) : [];
  // (H) Permisos CITES cargados en la Ficha.
  const permisosCites = ficha?.citesPermisos ?? [];
  const permisoCitesSel = permisosCites.find((p) => p.numero === citesPermiso) ?? null;
  // ¿El permiso vinculado ya estaba vencido a la FECHA DE INGRESO? Comparación
  // fiscal: importa la vigencia al momento de la operación, no la de hoy. Se
  // avisa (no bloquea): CITES es legal con permiso; puede haber una renovación
  // en trámite — un permiso vencido debilita el respaldo, no lo anula.
  const citesPermisoVencidoAlIngreso = Boolean(
    permisoCitesSel?.vencimiento && data.entryDate &&
    new Date(`${permisoCitesSel.vencimiento}T23:59:59`).getTime() <
      new Date(`${data.entryDate}T00:00:00`).getTime(),
  );

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
    // (E) Divergencia grande volumen vs cubicaje → exigir justificación escrita.
    if (cubicajeDivergente && data.notes.trim().length < 3) m.push("Justificación de la diferencia de volumen (Observaciones)");
    // (H) Especie CITES → exigir vincular un permiso CITES de la Ficha (si hay).
    if (finalCites && permisosCites.length > 0 && !citesPermiso.trim()) m.push("Permiso CITES vinculado");
    // Modo SERFOR: si la guía no se puede repartir en ingresos (por ejemplo, no
    // declara volumen para una de sus especies) el registro automático no va.
    // El camino es cargarla a mano, no que el sistema complete el hueco.
    if (modo === "serfor") {
      if (!serforGtf) m.push("Consultar la guía en SERFOR");
      else if (reparto && !reparto.ok) m.push("Una guía que se pueda repartir por especie");
    }
    return m;
  }, [data.gtfNumber, data.entryDate, data.providerName, finalSpeciesName, data.volumeM3, cubicajeDivergente, data.notes, finalCites, permisosCites.length, citesPermiso, modo, serforGtf, reparto]);

  const isValid = missing.length === 0;

  /**
   * Qué secciones ya están listas. Se deriva de `missing`, la MISMA lista que
   * bloquea el registro: si el tilde verde y el botón se calcularan por separado
   * terminarían diciendo cosas distintas —una sección "completa" que igual no
   * deja guardar es peor que no marcar nada.
   *
   * "Origen del material" no aparece: todos sus campos son opcionales en el
   * formato, así que nunca traba y se marca completa desde el arranque.
   */
  const estadoSeccion = useMemo(() => {
    const de: Record<string, string> = {
      "N° de GTF": "guia",
      "Fecha de ingreso": "guia",
      "Titular habilitante": "titular",
      "Especie forestal": "especie",
      "Permiso CITES vinculado": "especie",
      "Volumen (m³)": "producto",
      "Justificación de la diferencia de volumen (Observaciones)": "observaciones",
    };
    const pendientes = new Set(missing.map((m) => de[m]).filter(Boolean));
    const estado = (k: string) => (pendientes.has(k) ? "pendiente" : "ok") as "ok" | "pendiente";
    return {
      guia: estado("guia"),
      titular: estado("titular"),
      origen: "ok" as const,
      especie: estado("especie"),
      producto: estado("producto"),
      observaciones: estado("observaciones"),
    };
  }, [missing]);


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
      // Modo SERFOR: no se manda la ficha, se manda el N° de registro. El
      // servidor la vuelve a pedir y crea UN ingreso por especie declarada, con
      // sus trozas, en una transacción (ADR-312). Media guía registrada dejaría
      // un saldo que no corresponde a ningún documento.
      if (modo === "serfor" && serforGtf) {
        const r = await fetch("/api/admin/forestal/wood-entries/desde-serfor", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            numeroRegistro: serforGtf.numeroRegistro || nroRegistroSerfor.trim(),
            entryDate: new Date(data.entryDate).toISOString(),
            ctpProductCode: data.ctpProductCode.trim() || null,
            humidityPct: data.humidityPct ? Number(data.humidityPct) : null,
            notes: data.notes.trim() || null,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        marcarProveedorUsado();
        pushToast?.({
          tono: "success",
          msg: `Guía ${j.gtfNumber ?? ""} registrada`,
          detail: `${j.ingresos?.length ?? 0} ingreso(s) · ${j.trozas ?? 0} troza(s)` +
            (j.avisos?.length ? ` · ${j.avisos[0]}` : ""),
        });
        onSaved();
        return;
      }

      const payload = {
        entryDate: new Date(data.entryDate).toISOString(),
        gtfNumber: data.gtfNumber.trim(),
        gtfDate: data.gtfDate ? new Date(data.gtfDate).toISOString() : null,
        gtfSeries: data.gtfSeries.trim() || null,
        docType: data.docType || "GTF",
        // La guía oficial viaja con el ingreso: después se reimprime desde acá.
        serforNumeroRegistro: serforGtf?.numeroRegistro ?? (nroRegistroSerfor.trim() || null),
        serforGtf: serforGtf ?? null,
        providerName: data.providerName.trim(),
        providerDocument: data.providerDocument.trim() || null,
        providerDocumentType: data.providerDocument.trim() ? data.providerDocumentType : null,
        originType: data.originType,
        originCode: data.originCode.trim() || null,
        originSourceNumber: data.originSourceNumber.trim() || null,
        ctpProductCode: data.ctpProductCode.trim() || null,
        originRegion: data.originRegion === "Otra" ? null : data.originRegion,
        originDistrict: data.originDistrict.trim() || null,
        speciesCommonName: finalSpeciesName,
        speciesScientificName: finalScientificName,
        speciesCites: finalCites,
        productType: data.productType,
        unit: data.unit || "m3",
        presentacion: data.presentacion || null,
        volumeM3: Number(data.volumeM3),
        pieces: data.pieces ? Number(data.pieces) : 0,
        avgLengthM: data.avgLengthM ? Number(data.avgLengthM) : null,
        avgDiameterCm: data.avgDiameterCm ? Number(data.avgDiameterCm) : null,
        humidityPct: data.humidityPct ? Number(data.humidityPct) : null,
        defectsNotes: data.defectsNotes.trim() || null,
        // (H) El permiso CITES vinculado queda en el acta del ingreso (notes).
        notes: [data.notes.trim(), finalCites && citesPermiso.trim() ? `Permiso CITES: ${citesPermiso.trim()}` : ""].filter(Boolean).join(" · ") || null,
        photos: null,
        // Las trozas van con su guía y en la misma transacción: media guía
        // registrada deja un saldo sin documento (ADR-312).
        trozas: trozasManuales.length ? trozasManuales : undefined,
      };

      let res: Response;
      try {
        res = await fetch("/api/admin/forestal/wood-entries", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } catch (netErr) {
        // Sin señal en el patio: la guía queda anotada en el equipo y sube sola.
        // Es esto o el cuaderno (que después se tipea tarde y fuera de plazo).
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const { anotar, URL_INGRESO } = await import("@/lib/forestal/patio-cola");
          await anotar("ingresos", payload, URL_INGRESO);
          onSaved({ offline: true });
          return;
        }
        throw netErr;
      }

      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.message ?? (r.issues && r.issues[0]?.message) ?? r.error ?? `HTTP ${res.status}`);
      }

      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      marcarProveedorUsado();

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
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      hideCloseButton
      /* Con la guía de SERFOR el alta pasó a mostrar la ficha oficial completa
         (propietario, destinatario, transporte y la lista de trozas): 1280px se
         quedaban cortos y obligaban a scrollear de más. */
      /* Ancho: el alta muestra el formulario en dos columnas + el panel de
         registro, y con la guía de SERFOR agrega la ficha completa. Se toma el
         ancho de la pantalla menos un respiro, con techo para que en monitores
         muy anchos las líneas no queden imposibles de leer. */
      className="sm:w-[min(96vw,110rem)] sm:max-w-none sm:max-h-[95vh]"
      // El pie va por prop: dentro del scroll quedaba fuera del modal y el
      // botón "Registrar ingreso" no se veía (medido: modal 925px, footer 942px).
      footer={
        <ModalFooter
          nota={
            isValid ? (
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" />
                Listo para guardar
              </span>
            ) : (
              <span>
                Faltan <span className="font-semibold text-[var(--text-secondary)]">{missing.length}</span>{" "}
                {missing.length === 1 ? "campo" : "campos"}
              </span>
            )
          }
        >
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Btn variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Btn>
            <Btn variant="secondary" onClick={(e) => handleSubmit(e, true)} disabled={!isValid || submitting}>Guardar y otro</Btn>
            <Btn variant="primary" type="submit" form="wood-entry-form" disabled={!isValid || submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando</> : "Registrar ingreso"}
            </Btn>
          </div>
        </ModalFooter>
      }
    >
      <div className="flex h-full flex-col bg-[var(--surface-raised)]">
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

            {/* (G) La Ficha del CTP debe estar completa para que los documentos tengan validez legal. */}
            {fichaFaltante.length > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm text-[var(--data-warning-700)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div><strong>Ficha del CTP incompleta.</strong> Faltan datos legales (Código CTP, RUC…) que los documentos SERFOR necesitan. Completala en la pestaña «Ficha CTP» — podés registrar igual, pero el libro no tendrá identidad legal completa.</div>
              </div>
            )}

            {/* 2 columnas explícitas en pantallas anchas (xl+): [1·2·3 | 4·5·6].
                NO usamos CSS multicol porque, con la altura fija del panel, hace
                column-fill:auto y desborda las secciones a una 3ª columna fuera
                del form. El grid explícito es determinístico. */}
            {/* Selector de modo: es lo primero que se decide al abrir el alta. */}
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--surface-sunken)] p-3">
              <SegmentedControl
                value={modo}
                onChange={(v) => {
                  setModo(v);
                  setSerforMsg(null);
                  // La carga manual no muestra nada de SERFOR: si se vuelve a
                  // mano, la ficha consultada se suelta. Dejarla pegada hacía
                  // que el panel dijera "verificado en SERFOR" sobre un ingreso
                  // que el operador terminó escribiendo a mano.
                  if (v === "manual") { setSerforGtf(null); setNroRegistroSerfor(""); }
                  // Y al revés: lo que la guía va a traer se suelta antes de
                  // consultarla. Si el documento no trae un dato, el registro lo
                  // muestra vacío — nunca el del camión anterior.
                  else {
                    setData((prev) => ({
                      ...prev,
                      gtfNumber: "", gtfDate: "", providerName: "", providerDocument: "",
                      originCode: "", originSourceNumber: "", originDistrict: "",
                      volumeM3: "", pieces: "",
                    }));
                  }
                }}
                size="lg"
                label="Cómo se carga el ingreso"
                options={[
                  { value: "manual", label: "Carga manual" },
                  { value: "serfor", label: "Desde SERFOR" },
                ]}
              />
              <p className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
                {modo === "manual"
                  ? "Llenás la guía a mano, campo por campo."
                  : "Se pide la guía a SERFOR por su N° de registro y se registra lo que dice el documento oficial."}
              </p>
            </div>

            {modo === "serfor" && (
              <div className="mb-5">
                <Seccion numero={1} title="Guía en la base de SERFOR">
              {/* La vía más corta: el N° de registro del QR trae la guía desde la
                  base de SERFOR. Va PRIMERO porque, cuando la guía existe allá,
                  llena medio formulario de una. */}
              <Field
                span={12}
                label="N° de registro SERFOR"
                hint="El que asigna el SNIFFS a la guía, con guiones (ej. 2-25-0002326). NO es el N° de GTF impreso."
              >
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    inputMode="text"
                    value={nroRegistroSerfor}
                    onChange={(e) => { setNroRegistroSerfor(e.target.value); setSerforMsg(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void consultarSerfor(); } }}
                    placeholder="2-25-0002326"
                    className={`${I} w-full flex-1 font-mono sm:w-auto`}
                  />
                  <button
                    type="button"
                    onClick={() => void consultarSerfor()}
                    disabled={serforCargando || !nroRegistroSerfor.trim()}
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-3.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {serforCargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Consultar SERFOR
                  </button>
                </div>
                {serforGtf && (
                  <button
                    type="button"
                    onClick={() => { void printGtfSerfor(serforGtf as never); }}
                    className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)]"
                  >
                    <FileText className="h-3.5 w-3.5" /> Imprimir la GTF
                  </button>
                )}
                {serforMsg && (
                  <p
                    className={`mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium ${
                      serforMsg.ok
                        ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
                        : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
                    }`}
                  >
                    {serforMsg.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    <span>{serforMsg.text}</span>
                  </p>
                )}
              </Field>

                </Seccion>
              </div>
            )}

            <div className={modo === "manual" ? "xl:grid xl:grid-cols-2 xl:gap-x-5 xl:items-start" : "hidden"}>
            <div>
            {/* ─── 1 · GTF ─────────────────────────────────────────── */}
            <Seccion numero={1} title="Guía de Transporte Forestal" estado={estadoSeccion.guia}>
              {/* (3) del formato LO-CTP: casi siempre GTF, pero la madera también
                  puede entrar con Guía de Remisión Remitente y el libro tiene
                  que decir con cuál (ADR-311). */}
              <Field span={12} label="Tipo de documento" required casillero={3}>
                <select
                  value={data.docType}
                  onChange={(e) => update("docType", e.target.value)}
                  required
                  className={I}
                >
                  {TIPOS_DOCUMENTO_LOCTP.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field span={12} label="N° GTF" required hint="Escribí el número y tocá «Cargar guía» para traer todos los datos.">
                {/* El número manda: fila propia. Con los tres botones al lado,
                    al input le quedaban 35px de ancho y no se veía lo tipeado. */}
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={data.gtfNumber}
                    onChange={(e) => { update("gtfNumber", e.target.value); setGtfMsg(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); cargarGuia(); } }}
                    aria-label="N° de la guía de transporte forestal"
                    placeholder="0001234"
                    autoFocus
                    required
                    className={`${I} w-full font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => void cargarGuia()}
                    disabled={loadingGtf || !data.gtfNumber.trim()}
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--data-success-700)] px-3.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingGtf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Cargar guía
                  </button>
                  <button
                    type="button"
                    onClick={toggleGuias}
                    className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors ${showGuias ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                  >
                    <Search className="h-4 w-4" /> Ver guías
                  </button>
                  <label
                    title="Escaneá una foto de la GTF para pre-llenar el ingreso con IA"
                    className={`inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors ${scanning ? "border-[var(--rule-base)] text-[var(--text-tertiary)] opacity-70" : "border-[var(--brand-ink)] text-[var(--brand-ink)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"}`}
                  >
                    {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Escanear
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={scanning}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanGtf(f); e.target.value = ""; }}
                    />
                  </label>
                </div>
              </Field>
              {showGuias && (
                <div className="space-y-2 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-2">
                  <input value={guiaQuery} onChange={(e) => setGuiaQuery(e.target.value)} placeholder="Buscar por N° o titular…" className={`${I} h-9`} />
                  <div className="max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {loadingGuias ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando guías…</div>
                      : guiasFiltradas.length === 0 ? <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">No hay guías emitidas. Se emiten en el Libro de Títulos Habilitantes → GTF.</div>
                        : guiasFiltradas.map((g, i) => (
                          <button key={i} type="button" onClick={() => aplicarGuia(g)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--data-success-50)]">
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">{g.gtfNumber}</span>
                              <span className="truncate text-xs text-[var(--text-secondary)]">{g.titularName ?? "—"}{g.origen ? ` · ${g.origen}` : ""}</span>
                            </span>
                            <span className="shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{g.volumenTotalM3 != null ? `${g.volumenTotalM3} m³` : ""}{g.gtfDate ? <><br />{String(g.gtfDate).slice(0, 10)}</> : ""}</span>
                          </button>
                        ))}
                  </div>
                </div>
              )}
              {gtfMsg && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${gtfMsg.ok ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "bg-[var(--data-error-50)] text-[var(--data-error-700)]"}`}>
                  {gtfMsg.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{gtfMsg.text}</span>
                </div>
              )}
              {gtfItems.length > 1 && (
                <div className="space-y-1 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-2">
                  <span className="px-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-700)]">Elegí el ítem de la guía</span>
                  <div className="max-h-40 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                    {gtfItems.map((it, i) => (
                      <button key={i} type="button" onClick={() => fillFromItem(it)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--data-success-50)]">
                        <span className="truncate text-sm font-medium text-[var(--text-primary)]">{it.species ?? it.productType ?? "Ítem"}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{it.volumeM3 != null ? `${it.volumeM3} m³` : it.quantity != null ? `${it.quantity} ${it.unit ?? ""}` : ""}{it.pieces != null ? ` · ${it.pieces} pz` : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
                <Field span={6} label="Fecha del GTF">
                  <input
                    type="date"
                    value={data.gtfDate}
                    onChange={(e) => update("gtfDate", e.target.value)}
                    className={I}
                  />
                </Field>
                <Field span={6} label="Serie">
                  <input
                    type="text"
                    value={data.gtfSeries}
                    onChange={(e) => update("gtfSeries", e.target.value)}
                    placeholder="A001"
                    className={I}
                  />
                </Field>
              <Field span={12} label="Fecha de ingreso al CTP" required>
                <input
                  type="date"
                  value={data.entryDate}
                  onChange={(e) => update("entryDate", e.target.value)}
                  required
                  className={I}
                />
              </Field>
            </Seccion>

            {/* ─── 2 · Titular ─────────────────────────────────────── */}
            <Seccion numero={2} title="Titular habilitante" estado={estadoSeccion.titular}>
              {/* La libreta del CTP (ADR-317): el mismo titular trae madera todo
                  el año y su nombre entraba escrito distinto cada vez. */}
              <div className="sm:col-span-12">
                <CtpParteBarra
                  rol="proveedor"
                  valor={{
                    nombre: data.providerName,
                    docTipo: (data.providerDocumentType || "RUC") as DocTipo,
                    docNumero: data.providerDocument,
                    direccion: "",
                  }}
                  opciones={directorio.porRol("proveedor")}
                  onAplicar={(v) => {
                    if (v.nombre !== undefined) update("providerName", v.nombre);
                    if (v.docNumero !== undefined) update("providerDocument", v.docNumero);
                    if (v.docTipo !== undefined) update("providerDocumentType", v.docTipo);
                  }}
                  onElegir={(parte) => {
                    partesUsadas.current.add(parte.id);
                    // El título habilitante del proveedor propone el código de
                    // origen, pero SÓLO si está vacío: lo tipeado manda.
                    if (parte.tituloHabilitante) {
                      setData((prev) => (prev.originCode ? prev : { ...prev, originCode: parte.tituloHabilitante ?? "" }));
                    }
                  }}
                  onGuardar={async (v) => {
                    const parte = await directorio.guardarParte({
                      roles: ["proveedor"],
                      nombre: v.nombre,
                      docTipo: v.docTipo,
                      docNumero: v.docNumero,
                      // El código de origen del ingreso ES el título con el que
                      // extrae: se guarda con el proveedor para la próxima guía.
                      tituloHabilitante: data.originCode.trim() || undefined,
                    });
                    partesUsadas.current.add(parte.id);
                  }}
                />
              </div>
              <Field span={12} label="Nombre o razón social" required>
                <input
                  type="text"
                  value={data.providerName}
                  onChange={(e) => update("providerName", e.target.value)}
                  placeholder="Concesión Forestal X"
                  required
                  className={I}
                />
              </Field>
                <Field span={4} label="Tipo doc">
                  <select
                    value={data.providerDocumentType}
                    onChange={(e) => update("providerDocumentType", e.target.value)}
                    className={I}
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>
                <Field span={8} label="Número">
                  <input
                    type="text"
                    value={data.providerDocument}
                    onChange={(e) => update("providerDocument", e.target.value)}
                    placeholder={data.providerDocumentType === "RUC" ? "20XXXXXXXXX" : "Documento"}
                    className={I}
                  />
                </Field>
            </Seccion>

            {/* ─── 3 · Origen ──────────────────────────────────────── */}
            <Seccion numero={3} title="Origen del material" estado={estadoSeccion.origen}>
                <Field span={6} label="Tipo de origen" required>
                  <select
                    value={data.originType}
                    onChange={(e) => update("originType", e.target.value)}
                    required
                    className={I}
                  >
                    {ORIGIN_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                <Field span={6} label="Código de origen" casillero={9} hint="El código con el que salió del bosque">
                  <input
                    type="text"
                    value={data.originCode}
                    onChange={(e) => update("originCode", e.target.value)}
                    placeholder="N° concesión o predio"
                    className={I}
                  />
                </Field>
                <Field span={6} label="N° fuente de origen" casillero={5} hint="De qué fuente viene la madera (Apartado 1)">
                  <input
                    type="text"
                    value={data.originSourceNumber}
                    onChange={(e) => update("originSourceNumber", e.target.value)}
                    placeholder="RD-SD-549"
                    className={`${I} font-mono`}
                  />
                </Field>
                <Field span={6} label="Código que asigna el CTP" casillero={10} hint="El que vos le ponés a la troza o al paquete">
                  <input
                    type="text"
                    value={data.ctpProductCode}
                    onChange={(e) => update("ctpProductCode", e.target.value)}
                    placeholder="T-0142 / PQ-08"
                    className={`${I} font-mono`}
                  />
                </Field>
                <Field span={6} label="Región">
                  <select
                    value={data.originRegion}
                    onChange={(e) => update("originRegion", e.target.value)}
                    className={I}
                  >
                    {REGIONS_PE.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field span={6} label="Distrito">
                  <input
                    type="text"
                    value={data.originDistrict}
                    onChange={(e) => update("originDistrict", e.target.value)}
                    className={I}
                  />
                </Field>
            </Seccion>
            </div>
            <div>
            {/* ─── 4 · Especie ─────────────────────────────────────── */}
            <Seccion numero={4} title="Especie forestal" estado={estadoSeccion.especie}>
              <Field span={12} label="Especie" required>
                <button
                  type="button"
                  onClick={() => setShowSpeciesPicker((v) => !v)}
                  className={`${I} flex items-center justify-between text-left`}
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
                    className={`${I} mb-2`}
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
                                ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"
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
                <Field span={12} label="Nombre de la especie" required>
                  <input
                    type="text"
                    value={data.customSpeciesName}
                    onChange={(e) => update("customSpeciesName", e.target.value)}
                    placeholder="ej: Aguano masha"
                    required
                    className={I}
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
              {/* (H) Vincular un permiso CITES cargado en la Ficha del CTP. */}
              {finalCites && (
                <div className="mt-2">
                  {permisosCites.length > 0 ? (
                    <Field span={12} label="Permiso CITES vinculado" required hint="Del listado cargado en la Ficha del CTP">
                      <select className={I} value={citesPermiso} onChange={(e) => setCitesPermiso(e.target.value)}>
                        <option value="">Elegí el permiso CITES…</option>
                        {permisosCites.map((p, i) => (
                          <option key={i} value={p.numero}>{p.especie} · {p.numero}{p.vencimiento ? ` (vence ${p.vencimiento})` : ""}</option>
                        ))}
                      </select>
                      {citesPermisoVencidoAlIngreso && permisoCitesSel && (
                        <p className="mt-2 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2.5 text-xs font-medium text-[var(--data-warning-700)]">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>El permiso <strong>{permisoCitesSel.numero}</strong> venció el {permisoCitesSel.vencimiento}, antes de la fecha de ingreso ({data.entryDate}). Verificá que exista una renovación vigente — un permiso vencido al momento del ingreso debilita el respaldo legal del origen CITES.</span>
                        </p>
                      )}
                    </Field>
                  ) : (
                    <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2.5 text-xs font-medium text-[var(--data-error-700)]">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>No hay permisos CITES cargados en la Ficha del CTP. Cargá el permiso de esta especie en «Ficha CTP» antes de registrar — sin permiso archivado, un ingreso CITES no tiene respaldo legal.</span>
                    </p>
                  )}
                </div>
              )}
            </Seccion>

            {/* ─── 5 · Producto y medidas ──────────────────────────── */}
            <Seccion numero={5} title="Producto y medidas" estado={estadoSeccion.producto}>
              {/* La lista de trozas normalmente viene de SERFOR; cuando el
                  servicio no responde o el detalle llegó en un Excel, se pega
                  acá en vez de tipear ochenta filas o quedarse sin trozas. */}
              <div className="sm:col-span-12 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
                <Btn size="sm" variant="secondary" onClick={() => setImportarTrozas(true)}>
                  <ClipboardList className="h-4 w-4" />
                  {trozasManuales.length ? "Cambiar la lista de trozas" : "Pegar lista de trozas"}
                </Btn>
                {trozasManuales.length > 0 && (
                  <>
                    <span className="text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      {trozasManuales.length} troza(s) · {trozasManuales.reduce((a, t) => a + (t.volumenM3 ?? 0), 0).toFixed(4)} m³
                    </span>
                    <button
                      type="button"
                      onClick={() => setTrozasManuales([])}
                      className="text-sm font-medium text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]"
                    >
                      Quitar
                    </button>
                  </>
                )}
              </div>
                <Field span={6} label="Tipo de producto" required>
                  <select
                    value={data.productType}
                    onChange={(e) => update("productType", e.target.value)}
                    required
                    className={I}
                  >
                    {PRODUCT_TYPES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>
                <Field span={6} label="N° de piezas">
                  <input
                    type="number"
                    min="0"
                    value={data.pieces}
                    onChange={(e) => update("pieces", e.target.value)}
                    placeholder="35"
                    className={I}
                  />
                </Field>

              {/* (10) del formato. El libro SIEMPRE calcula en m³ (saldos,
                  invariantes, costeo): esto guarda lo que decía el documento
                  cuando vino declarado en otra unidad (ADR-311). */}
              {/* La "forma de presentación" del formato (ADR-314): cómo vino
                  físicamente la madera. La guía de SERFOR la declara —"TROZAS"—
                  y hasta ahora se perdía al registrar. */}
              <Field label="Forma de presentación" span={6} hint="Cómo vino: TROZAS, PIEZAS…">
                <select
                  value={data.presentacion}
                  onChange={(e) => update("presentacion", e.target.value)}
                  className={I}
                >
                  <option value="">Sin declarar</option>
                  {PRESENTACIONES_LOCTP.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Unidad de medida"
                casillero={11}
                span={6}
                hint="El libro calcula en m³ igual: esto conserva lo que decía el documento."
              >
                <select
                  value={data.unit}
                  onChange={(e) => update("unit", e.target.value)}
                  className={I}
                >
                  {UNIDADES_LOCTP.map((u) => (
                    <option key={u.valor} value={u.valor}>{u.label}</option>
                  ))}
                </select>
              </Field>

              <Field span={12}
                label="Volumen total (m³)"
                required
                hint="Precisión 4 decimales (estándar SERFOR)"
              >
                <div className="sm:col-span-12 relative">
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={data.volumeM3}
                    onChange={(e) => update("volumeM3", e.target.value)}
                    aria-label="Volumen total en metros cúbicos"
                    placeholder="0.0000"
                    required
                    className={`${I} pr-32 font-mono tabular-nums`}
                  />
                  {autoVolume > 0 && data.productType === "rolliza" && Number(data.volumeM3) !== autoVolume && (
                    <button
                      type="button"
                      onClick={() => update("volumeM3", autoVolume.toFixed(4))}
                      title="Aplicar cubicación π·r²·L·n"
                      className="absolute right-1.5 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg bg-[var(--data-success-100)] px-2.5 text-xs font-bold text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-100)]"
                    >
                      <Sparkles className="h-3 w-3" />
                      {autoVolume.toFixed(4)}
                    </button>
                  )}
                </div>
                {cubicajeDivergente && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-medium text-[var(--data-warning-700)]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>El volumen declarado ({Number(data.volumeM3).toFixed(2)} m³) difiere más de 15% del cubicaje calculado ({autoVolume.toFixed(2)} m³). Verificá las medidas o justificá la diferencia en Observaciones (obligatorio).</span>
                  </p>
                )}
              </Field>
                <Field span={4} label="Largo prom. (m)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={data.avgLengthM}
                    onChange={(e) => update("avgLengthM", e.target.value)}
                    placeholder="6.50"
                    className={I}
                  />
                </Field>
                <Field span={4} label="Diám. prom. (cm)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={data.avgDiameterCm}
                    onChange={(e) => update("avgDiameterCm", e.target.value)}
                    placeholder="45.0"
                    className={I}
                  />
                </Field>
                <Field span={4} label="Humedad (%)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={data.humidityPct}
                    onChange={(e) => update("humidityPct", e.target.value)}
                    placeholder="22"
                    className={I}
                  />
                </Field>

            </Seccion>

            {/* ─── 6 · Observaciones ───────────────────────────────── */}
            <Seccion numero={6} title="Observaciones" estado={estadoSeccion.observaciones}>
              <Field span={12} label="Defectos visibles">
                <input
                  type="text"
                  value={data.defectsNotes}
                  onChange={(e) => update("defectsNotes", e.target.value)}
                  placeholder="ej: 3 piezas con nudos grandes"
                  className={I}
                />
              </Field>
              <Field span={12} label="Notas adicionales">
                <textarea
                  value={data.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                  placeholder="Cualquier observación útil..."
                  className={`${I} h-auto resize-none py-2.5`}
                />
              </Field>
            </Seccion>
            </div>
            </div>

            {/* La guía, a ANCHO COMPLETO y fuera de las dos columnas: en media
                columna la tabla de productos se cortaba y la lista de trozas
                —lo que un fiscalizador compara pieza por pieza— quedaba
                ilegible. Sólo existe en el modo SERFOR: en carga manual no hay
                guía consultada que mostrar.

                Trae partes que el libro NO registra —propietario del producto,
                destinatario, transportista— pero que el fiscalizador pregunta.
                Se muestran como vinieron de SERFOR, sin editar: son
                declaraciones de un documento ajeno. */}
            {modo === "serfor" && (
              <div className="space-y-5">
              {serforGtf && (
                <Seccion
                  numero={2}
                  title="Datos de la guía · SERFOR"
                  hint={serforGtf.estado ? `GTF ${serforGtf.gtfNumber ?? ""} · ${serforGtf.estado}` : undefined}
                >
                  <div className="sm:col-span-12 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-[var(--surface-sunken)] p-3.5">
                    <DatoGuia n="5" label="Origen del recurso" value={serforGtf.origenRecurso} />
                    <DatoGuia n="6" label="N° del título" value={serforGtf.numeroTitulo} />
                    <DatoGuia n="7" label="Titular" value={serforGtf.titular} />
                    <DatoGuia label="Representante legal" value={serforGtf.representanteLegal} />
                    <DatoGuia n="8" label="N° de resolución" value={serforGtf.numeroResolucion} />
                    <DatoGuia n="10-12" label="Ubicación" value={[serforGtf.departamento, serforGtf.provincia, serforGtf.distrito].filter(Boolean).join(" · ")} />
                    <DatoGuia n="13" label="Propietario del producto" value={serforGtf.propietario} />
                    <DatoGuia n="16" label="Dirección del propietario" value={serforGtf.propietarioDireccion} />
                    <DatoGuia n="22" label="Destinatario" value={serforGtf.destinatario} />
                    <DatoGuia n="23-24" label="RUC / DNI del destinatario" value={serforGtf.destinatarioDoc} />
                    <DatoGuia n="25" label="Dirección del destinatario" value={serforGtf.destinatarioDireccion} />
                    <DatoGuia n="28" label="Distrito del destinatario" value={serforGtf.destinatarioDistrito} />
                    <DatoGuia n="30-31" label="Transporte" value={[serforGtf.tipoTransporte, serforGtf.tipoVehiculo, serforGtf.placa].filter(Boolean).join(" · ")} />
                    <DatoGuia n="32-34" label="Conductor" value={[serforGtf.transportista, serforGtf.transportistaDni, serforGtf.licenciaConducir].filter(Boolean).join(" · ")} />
                    <DatoGuia n="35" label="Lista de trozas" value={serforGtf.listaTrozas} />
                    <DatoGuia n="3-4" label="Vigencia" value={[serforGtf.fechaExpedicion, serforGtf.fechaVencimiento].filter(Boolean).join(" → ")} />
                  </div>
                </Seccion>
              )}
              {modo === "serfor" && serforGtf && (serforGtf.productos?.length ?? 0) > 0 && (
                <div className="mt-5 space-y-3">
                      <TablaGuia
                        titulo="Detalle del producto (37) · según la guía"
                        columnas={["Nombre científico", "Nombre común", "Tipo de producto", "Presentación", "Cant.", "Unidad", "Volumen"]}
                        filas={(serforGtf.productos ?? []).map((pr) => [
                          pr.cientifico ?? "—", pr.comun ?? "—", pr.tipoProducto ?? "—",
                          pr.presentacion ?? "—", pr.cantidad != null ? String(pr.cantidad) : "—",
                          pr.unidad ?? "—", pr.volumen != null ? pr.volumen.toFixed(3) : "—",
                        ])}
                        total={serforGtf.volumenTotal != null ? `Volumen total: ${serforGtf.volumenTotal.toFixed(3)}` : undefined}
                      />
                      {(serforGtf.trozas?.length ?? 0) > 0 && (
                        <TablaGuia
                          titulo={`Lista de trozas · ${serforGtf.trozas?.length} registro(s)`}
                          columnas={["Especie", "Codificación", "Dimensiones", "Cant.", "Volumen"]}
                          filas={(serforGtf.trozas ?? []).map((t) => [
                            t.comun ?? t.cientifico ?? "—", t.codificacion ?? "—", t.dimensiones ?? "—",
                            t.cantidad != null ? String(t.cantidad) : "—",
                            t.volumen != null ? t.volumen.toFixed(3) : "—",
                          ])}
                        />
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* Lo que la guía NO trae y el libro sí necesita: cuándo entró al
                patio y el código con el que este centro marca la madera. Son
                datos del CTP, no del documento — por eso se piden igual. */}
            {modo === "serfor" && serforGtf && (
              <div className="mt-5">
                <Seccion numero={3} title="Datos del ingreso al CTP" hint="Lo único que la guía no trae">
                  <Field span={4} label="Fecha de ingreso al CTP" required casillero={2}>
                    <input
                      type="date"
                      value={data.entryDate}
                      onChange={(e) => update("entryDate", e.target.value)}
                      required
                      className={I}
                    />
                  </Field>
                  <Field span={4} label="Código que asigna el CTP" casillero={10} hint="El que le ponés a la troza o al paquete">
                    <input
                      type="text"
                      value={data.ctpProductCode}
                      onChange={(e) => update("ctpProductCode", e.target.value)}
                      placeholder="T-0142 / PQ-08"
                      className={`${I} font-mono`}
                    />
                  </Field>
                  <Field span={4} label="Humedad (%)">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={data.humidityPct}
                      onChange={(e) => update("humidityPct", e.target.value)}
                      placeholder="22"
                      className={I}
                    />
                  </Field>
                  <Field span={12} label="Observaciones del ingreso" casillero={13}>
                    <textarea
                      value={data.notes}
                      onChange={(e) => update("notes", e.target.value)}
                      rows={2}
                      placeholder="Estado de la carga, faltantes, defectos…"
                      className={`${I} h-auto py-2.5`}
                    />
                  </Field>
                </Seccion>
              </div>
            )}

          </form>

          {/* ─── Panel derecho: el registro tal como va a quedar ─────
              Tres capas, de arriba abajo: QUÉ es (especie y volumen), SI SE
              PUEDE guardar (progreso o lo que falta) y DE DÓNDE salió (SERFOR,
              cuando corresponde). Antes mezclaba las tres y el operador no sabía
              dónde mirar. */}
          <aside className="hidden w-[340px] shrink-0 flex-col border-l border-[var(--rule-base)] bg-[var(--surface-canvas)] lg:flex">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-5 py-3.5">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {modo === "serfor" ? "Lo que se va a registrar" : "Vista previa del registro"}
              </span>
              {modo === "serfor" && serforGtf && (
                <span className="shrink-0 rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  SERFOR
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* 1 · Qué se registra */}
              <div className="mb-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-bold leading-tight text-[var(--text-primary)]">
                    {especiesResumen.titulo}
                  </CardTitle>
                  {finalCites && <CitesPill />}
                </div>
                {especiesResumen.sub && (
                  <p className="mt-0.5 text-xs italic text-[var(--text-tertiary)]">{especiesResumen.sub}</p>
                )}
              </div>

              <div className="mb-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Volumen total
                </div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {volumeDisplay ?? "0.0000"}
                  <span className="ml-1 text-sm font-medium text-[var(--text-tertiary)]">m³</span>
                </div>
                {autoVolume > 0 && data.productType === "rolliza" && modo === "manual" && (
                  <div className="mt-1.5 flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    <Sparkles className="h-3 w-3 text-[var(--data-success-600)]" />
                    Cubicación: {autoVolume.toFixed(4)} m³
                  </div>
                )}
                {serforGtf?.volumenTotal != null && (
                  <div className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Declarado en la guía: {serforGtf.volumenTotal.toFixed(3)} m³
                  </div>
                )}
              </div>

              {/* 1b · Los renglones que va a dejar la guía en el libro.
                  Una GTF de dos especies son DOS ingresos con su volumen cada
                  uno, no uno con el total (ADR-312): el operador tiene que ver
                  eso ANTES de registrar, no descubrirlo en el listado. */}
              {modo === "serfor" && reparto?.ok && reparto.ingresos.length > 0 && (
                <div className="mb-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Entra al libro como
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[var(--text-primary)]">
                      {reparto.ingresos.length} ingreso{reparto.ingresos.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {reparto.ingresos.map((l, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-[var(--text-secondary)]">
                          {l.especieComun}
                          {l.trozas.length > 0 && (
                            <span className="ml-1 text-[var(--text-tertiary)]">· {l.trozas.length} troza{l.trozas.length === 1 ? "" : "s"}</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                          {l.volumenM3.toFixed(4)} m³
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* La guía tiene que cuadrar consigo misma. Si la suma de sus
                  productos no da el total que declara, o si una troza no
                  pertenece a ninguna especie listada, se avisa ACÁ —antes de
                  registrar— sin corregir ninguno de los dos: manda el documento. */}
              {modo === "serfor" && reparto?.ok && reparto.avisos.length > 0 && (
                <div className="mb-4 rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/10">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="h-3.5 w-3.5" /> La guía no cuadra
                  </p>
                  <ul className="space-y-1">
                    {reparto.avisos.map((a, i) => (
                      <li key={i} className="text-xs leading-snug text-[var(--text-secondary)]">{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {modo === "serfor" && reparto && !reparto.ok && (
                <div className="mb-4 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                    <AlertTriangle className="h-3.5 w-3.5" /> No se puede registrar sola
                  </p>
                  <p className="text-xs leading-snug text-[var(--text-secondary)]">{reparto.motivo}</p>
                </div>
              )}

              {/* 2 · Si se puede guardar */}
              <div className="mb-5">
                {isValid ? (
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--data-success-50)] px-3 py-2.5 text-sm font-medium text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
                    <Check className="h-4 w-4 shrink-0" />
                    Listo para registrar
                  </div>
                ) : (
                  <div className="rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/10">
                    <p className="mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      <AlertTriangle className="h-3.5 w-3.5" /> Falta completar
                    </p>
                    <ul className="space-y-1">
                      {missing.map((m) => (
                        <li key={m} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-warning-500)]" />
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 3 · El registro, campo por campo */}
              <dl className="space-y-2.5">
                <SummaryRow label="Documento" value={`${data.docType || "GTF"} ${data.gtfNumber.trim()}`.trim() || "—"} mono />
                <SummaryRow label="Producto" value={productLabel(data.productType)} />
                <SummaryRow label="Piezas" value={data.pieces ? Number(data.pieces).toLocaleString("es-PE") : "—"} />
                <SummaryRow
                  label="Ingreso al CTP"
                  value={
                    data.entryDate
                      ? new Date(`${data.entryDate}T00:00:00.000Z`).toLocaleDateString("es-PE", {
                          day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
                        })
                      : "—"
                  }
                />
                <SummaryRow label="Titular" value={data.providerName.trim() || "—"} />
                <SummaryRow
                  label="Origen"
                  value={`${originLabel(data.originType)}${data.originRegion && data.originRegion !== "Otra" ? ` · ${data.originRegion}` : ""}${data.originDistrict ? ` · ${data.originDistrict}` : ""}`}
                />
                {data.humidityPct && <SummaryRow label="Humedad" value={`${data.humidityPct}%`} />}
              </dl>

              {/* 4 · De dónde salió (sólo si vino de SERFOR) */}
              {modo === "serfor" && serforGtf && (
                <div className="mt-5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] p-3.5 dark:bg-[var(--data-success-500)]/10">
                  <div className="mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verificado en SERFOR
                  </div>
                  <dl className="space-y-2">
                    <SummaryRow label="N° de registro" value={serforGtf.numeroRegistro} mono />
                    <SummaryRow label="Estado" value={serforGtf.estado ?? "—"} />
                    <SummaryRow
                      label="Vigencia"
                      value={[serforGtf.fechaExpedicion, serforGtf.fechaVencimiento].filter(Boolean).join(" → ") || "—"}
                    />
                    <SummaryRow label="Destinatario" value={serforGtf.destinatario ?? "—"} />
                    {(serforGtf.trozas?.length ?? 0) > 0 && (
                      <SummaryRow label="Trozas" value={`${serforGtf.trozas?.length} en la lista`} />
                    )}
                  </dl>
                  {(serforGtf.productos?.length ?? 0) > 1 && (
                    <ul className="mt-2.5 space-y-1 border-t border-[var(--data-success-500)]/20 pt-2.5">
                      {(serforGtf.productos ?? []).map((pr, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate text-[var(--text-secondary)]">{pr.comun ?? pr.cientifico ?? "—"}</span>
                          <span className="shrink-0 font-mono tabular-nums text-[var(--text-primary)]">
                            {pr.volumen != null ? pr.volumen.toFixed(3) : "—"} m³
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>

      </div>
      <ActionToasts toasts={toasts} onDismiss={dismissToast} />
      {importarTrozas && (
        <CtpTrozasImportModal
          especie={finalSpeciesName}
          especieCientifica={finalScientificName}
          volumenDeclarado={Number(data.volumeM3) || undefined}
          onAceptar={(t) => setTrozasManuales(t)}
          onClose={() => setImportarTrozas(false)}
        />
      )}
    </AdminModal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════




/**
 * Tabla de sólo lectura con lo que declara la guía. Es un dato ajeno —de SERFOR—
 * así que no se edita: se muestra para contrastar contra la carga que llegó.
 */
function TablaGuia({
  titulo,
  columnas,
  filas,
  total,
}: {
  titulo: string;
  columnas: string[];
  filas: string[][];
  total?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
      <div className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {titulo}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs hoja-grilla">
          <thead>
            <tr className="bg-[var(--surface-canvas)]">
              {columnas.map((c) => (
                <th key={c} className="whitespace-nowrap px-2.5 py-1.5 text-left font-bold text-[var(--text-secondary)]">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-[var(--rule-soft)]">
                {f.map((v, j) => (
                  <td key={j} className={`px-2.5 py-1.5 ${j >= f.length - 2 ? "text-right font-mono tabular-nums" : ""} ${j === 0 ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="border-t border-[var(--rule-base)] bg-[var(--surface-canvas)]">
                <td colSpan={columnas.length} className="px-2.5 py-1.5 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                  {total}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Un dato de la guía oficial: etiqueta con su casillero y el valor. */
function DatoGuia({ n, label, value }: { n?: string; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {n && <span className="mr-1 font-mono">({n})</span>}{label}
      </div>
      <div className="truncate text-sm font-medium text-[var(--text-primary)]" title={value}>{value}</div>
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
