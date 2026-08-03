"use client";

/**
 * LothEntryForm — Modal de registro de línea del LO-TH (ADR-125).
 *
 * Form adaptable por sección (6 secciones SERFOR). Comparte el lenguaje visual
 * del WoodEntryForm (tokens DS, dark-mode safe) pero en una sola columna por ser
 * formularios cortos. Volumen por fórmula SERFOR (Smalian) en tala/trozado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TreePine,
  AlertTriangle,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  Search,
  Check,
  ShieldAlert,
  Camera,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { listSpecies, findSpeciesByCommonName } from "@/data/forestry-species";
import { LOTH_SECTIONS, type LothSection } from "@/lib/forestal/loth-constants";
import { estadoVencimiento, permisoParaEspecie, type LothCitesPermiso } from "@/lib/forestal/loth-cites-types";
import { fromUtm, parseUtmZone } from "@/lib/forestal/loth-utm";
import LothGpsField from "./LothGpsField";

interface Props {
  section: LothSection;
  caratulaId?: string | null;
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean }) => void;
}

export const SECTION_META: Record<
  LothSection,
  { label: string; short: string; index: number; help: string }
> = {
  tala: { label: "Tala", short: "Tala", index: 1, help: "Tumba del árbol censado" },
  trozado: { label: "Trozado", short: "Trozado", index: 2, help: "Corte del fuste en trozas" },
  despacho_troza: { label: "Despacho de trozas", short: "Despacho trozas", index: 3, help: "Salida de trozas con GTF" },
  consumo_troza: { label: "Consumo de trozas", short: "Consumo", index: 4, help: "Trozas que se transforman/consumen" },
  producto_terminado: { label: "Producto terminado", short: "Producto", index: 5, help: "Productos obtenidos del aserrío" },
  despacho_producto: { label: "Despacho de producto terminado", short: "Despacho PT", index: 6, help: "Salida de productos con GTF" },
};

const PRODUCT_TYPES = [
  "Madera aserrada",
  "Madera escuadrada",
  "Madera cuartoneada",
  "Tablillas",
  "Tablones",
  "Listones",
  "Durmientes",
  "Leña",
  "Carbón vegetal",
  "Otro",
];

const TOP_SPECIES_SLUGS = ["tornillo", "capirona", "shihuahuaco", "cedro", "caoba"];

// Qué campos muestra cada sección
const FIELDS: Record<LothSection, Set<string>> = {
  tala: new Set(["treeCode", "isRama", "species", "diams", "volume", "discarded", "obs"]),
  trozado: new Set(["treeCode", "trozaCode", "isRama", "species", "diams", "volume", "discarded", "obs"]),
  despacho_troza: new Set(["trozaCode", "despachoCode", "gtf", "obs"]),
  consumo_troza: new Set(["trozaCode", "species", "volumeManual", "consumoInterno", "obs"]),
  producto_terminado: new Set(["trozaCode", "productType", "species", "quantity", "unit", "obs"]),
  despacho_producto: new Set(["gtf", "productType", "species", "pieces", "quantity", "unit", "obs"]),
};

function smalian(dMayor: number, dMenor: number, len: number): number {
  if (!(dMayor > 0) || !(dMenor > 0) || !(len > 0)) return 0;
  const dProm = (dMayor + dMenor) / 2;
  return Math.round(0.7854 * dProm * dProm * len * 10000) / 10000;
}

export default function LothEntryForm({ section, caratulaId, onClose, onSaved }: Props) {
  const speciesOptions = useMemo(() => listSpecies(), []);
  const fields = FIELDS[section];
  const meta = SECTION_META[section];

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [treeCode, setTreeCode] = useState("");
  const [trozaCode, setTrozaCode] = useState("");
  const [despachoCode, setDespachoCode] = useState("");
  const [isRama, setIsRama] = useState(false);
  const [speciesSlug, setSpeciesSlug] = useState("tornillo");
  const [customSpecies, setCustomSpecies] = useState("");
  const [diamMayor, setDiamMayor] = useState("");
  const [diamMenor, setDiamMenor] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [volumeM3, setVolumeM3] = useState("");
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"m3" | "kg" | "unidad">("m3");
  const [pieces, setPieces] = useState("");
  const [gtfNumber, setGtfNumber] = useState("");
  const [discarded, setDiscarded] = useState(false);
  const [consumoInterno, setConsumoInterno] = useState(false);
  const [observations, setObservations] = useState("");

  const [speciesQuery, setSpeciesQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // ── GPS + foto de evidencia ───────────────────────────────────────────
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Plan + picker de ítems disponibles (flujo data-driven, ADR-127) ──
  interface PlanOpt { id: string; planType: string; planNumber: string | null; titularName: string }
  interface SourceItem {
    kind: string; code: string | null; species: string | null; scientific: string | null; cites?: boolean;
    dapM?: number | null; hcM?: number | null; vol?: number | null; productType?: string | null;
    quantity?: number | null; unit?: string | null; meta?: string | null; trozaCode?: string | null;
    utmZona?: string | null; utmX?: number | null; utmY?: number | null;
  }
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  // Especies autorizadas del plan (normalizadas) — para avisar en vivo si la
  // especie elegida cae fuera del POA antes de que T7 rechace el despacho/GTF.
  const [authorizedSpecies, setAuthorizedSpecies] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loadingSrc, setLoadingSrc] = useState(false);
  const [srcQuery, setSrcQuery] = useState("");

  // Catálogo de permisos CITES de la carátula — para acreditar la especie protegida.
  const [citesPermisos, setCitesPermisos] = useState<LothCitesPermiso[]>([]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/loth/cites", { credentials: "include" });
        if (!r.ok || cancel) return;
        const cat = (await r.json()).catalogo;
        if (!cancel) setCitesPermisos(cat?.permisos ?? []);
      } catch { /* best-effort: sin catálogo, se muestra el aviso genérico */ }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [plansRes, activeRes] = await Promise.all([
          fetch("/api/admin/forestal/plan", { credentials: "include" }),
          fetch("/api/admin/forestal/plan?active=1", { credentials: "include" }),
        ]);
        const pl = plansRes.ok ? (await plansRes.json()).plans ?? [] : [];
        const active = activeRes.ok ? (await activeRes.json()).active : null;
        if (cancel) return;
        setPlans(pl);
        setPlanId(active?.id ?? pl[0]?.id ?? null);
      } catch { /* se puede registrar sin plan (código libre) */ }
    })();
    return () => { cancel = true; };
  }, []);

  const loadSources = useCallback(async (pid: string | null) => {
    setLoadingSrc(true);
    try {
      const q = new URLSearchParams({ available: section });
      if (pid) q.set("planId", pid);
      const r = await fetch(`/api/admin/forestal/loth?${q.toString()}`, { credentials: "include" });
      setSources(r.ok ? (await r.json()).items ?? [] : []);
    } catch { setSources([]); }
    finally { setLoadingSrc(false); }
  }, [section]);
  useEffect(() => { loadSources(planId); }, [planId, loadSources]);

  // Cargar las especies autorizadas del plan seleccionado (para el aviso en vivo).
  useEffect(() => {
    if (!planId) { setAuthorizedSpecies(new Set()); return; }
    let cancel = false;
    fetch(`/api/admin/forestal/plan?planId=${planId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancel) return;
        const rows = (j?.species ?? []) as Array<{ speciesCommon: string }>;
        setAuthorizedSpecies(new Set(rows.map((s) => s.speciesCommon.trim().toLowerCase())));
      })
      .catch(() => { /* best-effort: sin lista, no se muestra el aviso */ });
    return () => { cancel = true; };
  }, [planId]);

  function applySpecies(common: string | null) {
    if (!common) return;
    const slug = speciesOptions.find((s) => s.commonName.toLowerCase() === common.toLowerCase());
    if (slug) setSpeciesSlug(slug.slug);
    else { setSpeciesSlug("otro"); setCustomSpecies(common); }
  }
  function pickSource(it: SourceItem) {
    applySpecies(it.species);
    if (section === "tala") {
      if (it.code) setTreeCode(it.code);
      if (it.dapM) { setDiamMayor(String(it.dapM)); setDiamMenor(String(it.dapM)); }
      if (it.hcM) setLengthM(String(it.hcM));
      aplicarCoordCenso(it.code, it.utmZona ?? null, it.utmX ?? null, it.utmY ?? null);
    } else if (section === "trozado") {
      // Prefill un código de troza COMPLETO y válido (árbol + "-A"); el operador lo
      // ajusta a B/C… para las siguientes trozas del mismo árbol. Antes quedaba
      // "002-TOR-" con el guión colgando y parecía roto.
      if (it.code) { setTreeCode(it.code); setTrozaCode((c) => c || `${it.code}-A`); }
    } else if (section === "despacho_troza" || section === "consumo_troza") {
      if (it.code) setTrozaCode(it.code);
      if (section === "consumo_troza" && it.vol) setVolumeM3(String(it.vol));
    } else if (section === "producto_terminado") {
      // La materia prima del aserrío = la troza consumida. Guardar su código liga
      // el producto a su árbol de origen (trazabilidad individual, no por especie).
      if (it.code) setTrozaCode(it.code);
      if (it.vol) setQuantity(String(it.vol));
    } else if (section === "despacho_producto") {
      if (it.productType) setProductType(it.productType);
      if (it.quantity) setQuantity(String(it.quantity));
      if (it.unit === "m3" || it.unit === "kg" || it.unit === "unidad") setUnit(it.unit);
      // Hereda la troza de origen del producto que se despacha (para trazar por árbol).
      if (it.trozaCode) setTrozaCode(it.trozaCode);
    }
  }
  const SOURCE_TITLE: Record<LothSection, string> = {
    tala: "Elegí el árbol del censo",
    trozado: "Elegí la tala a trozar",
    despacho_troza: "Elegí la troza a despachar",
    consumo_troza: "Elegí la troza a consumir",
    producto_terminado: "Elegí la troza consumida (materia prima)",
    despacho_producto: "Elegí el producto a despachar",
  };
  const filteredSources = useMemo(() => {
    const q = srcQuery.trim().toLowerCase();
    const list = q
      ? sources.filter((s) => (s.code ?? "").toLowerCase().includes(q) || (s.species ?? "").toLowerCase().includes(q) || (s.productType ?? "").toLowerCase().includes(q))
      : sources;
    return list.slice(0, 60);
  }, [sources, srcQuery]);

  // ── Censo: autocompletado data-driven (ADR-126) ──────────────────────
  interface CensusTree {
    treeCode: string; speciesCommon: string | null; speciesScientific: string | null;
    cites: boolean; dapM: string | null; alturaComercialM: string | null;
    volumenEstimadoM3: string | null; estado: string;
    utmZona: string | null; utmX: string | null; utmY: string | null;
  }
  const [censusTree, setCensusTree] = useState<CensusTree | null>(null);
  /** Coordenada UTM del árbol elegido (del picker o del lookup por código). */
  const [censoUtm, setCensoUtm] = useState<{ code: string; zona: string | null; x: number; y: number } | null>(null);
  /** T8: el backend rechazó la tala por estar bajo el DMC; hay que justificar. */
  const [dmcBloqueo, setDmcBloqueo] = useState<string | null>(null);
  const [justificacionDmc, setJustificacionDmc] = useState("");
  const [censusChecked, setCensusChecked] = useState(false);

  /**
   * El censo ya trae la coordenada del árbol: la operación la hereda como GPS
   * si todavía no tiene una (el GPS del teléfono, más preciso, siempre gana).
   */
  function aplicarCoordCenso(code: string | null, zona: string | null, x: number | null, y: number | null) {
    if (x == null || y == null || x <= 0 || y <= 0) {
      setCensoUtm(null);
      return;
    }
    setCensoUtm({ code: code ?? "", zona, x, y });
    if (gpsLat != null || gpsLng != null) return;
    const { zone, south } = parseUtmZone(zona);
    const [la, ln] = fromUtm(x, y, zone, south);
    if (Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) {
      setGpsLat(la);
      setGpsLng(ln);
    }
  }

  async function lookupCensus(code: string) {
    const c = code.trim();
    setCensusChecked(false);
    setCensusTree(null);
    if (!c) return;
    try {
      const r = await fetch(`/api/admin/forestal/plan/census?treeCode=${encodeURIComponent(c)}`, { credentials: "include" });
      setCensusChecked(true);
      if (!r.ok) return;
      const tree = (await r.json()).tree as CensusTree | null;
      if (!tree) return;
      setCensusTree(tree);
      // Inyecta la especie del censo
      const common = (tree.speciesCommon ?? "").toLowerCase();
      const slugMatch = speciesOptions.find((s) => s.commonName.toLowerCase() === common);
      if (slugMatch) setSpeciesSlug(slugMatch.slug);
      else if (tree.speciesCommon) { setSpeciesSlug("otro"); setCustomSpecies(tree.speciesCommon); }
      aplicarCoordCenso(tree.treeCode, tree.utmZona, tree.utmX ? Number(tree.utmX) : null, tree.utmY ? Number(tree.utmY) : null);
      // Prefill de medidas estimadas (solo en Tala; el usuario ajusta a lo real)
      if (section === "tala") {
        if (tree.dapM && !diamMayor) setDiamMayor(String(Number(tree.dapM)));
        if (tree.dapM && !diamMenor) setDiamMenor(String(Number(tree.dapM)));
        if (tree.alturaComercialM && !lengthM) setLengthM(String(Number(tree.alturaComercialM)));
      }
    } catch {
      setCensusChecked(true);
    }
  }

  // Especie derivada
  const selected = speciesOptions.find((s) => s.slug === speciesSlug);
  const isCustom = speciesSlug === "otro";
  const speciesName = isCustom ? customSpecies.trim() : selected?.commonName ?? "";
  // La especie elegida no figura entre las autorizadas del plan → aviso proactivo
  // (T7 la rechazaría al despachar / al emitir la GTF).
  const speciesFueraDelPlan =
    speciesName.trim().length > 0 &&
    authorizedSpecies.size > 0 &&
    !authorizedSpecies.has(speciesName.trim().toLowerCase());
  const matched = isCustom ? findSpeciesByCommonName(customSpecies) : null;
  const scientific = isCustom ? matched?.scientificName ?? null : selected?.scientificName ?? null;
  const cites = isCustom ? matched?.cites ?? false : selected?.cites ?? false;

  const autoVolume = useMemo(() => {
    if (!fields.has("volume")) return 0;
    return smalian(Number(diamMayor), Number(diamMenor), Number(lengthM));
  }, [diamMayor, diamMenor, lengthM, fields]);

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

  // Validación por sección
  const missing = useMemo(() => {
    const m: string[] = [];
    if (fields.has("treeCode") && !fields.has("trozaCode") && !treeCode.trim()) m.push("Código del árbol");
    if (fields.has("trozaCode") && !trozaCode.trim()) m.push("Código de troza");
    if (fields.has("species") && section !== "consumo_troza" && section !== "despacho_producto" && speciesName.length === 0) m.push("Especie");
    if (fields.has("gtf") && !gtfNumber.trim()) m.push("N° de GTF");
    if (fields.has("volumeManual") && !(Number(volumeM3) > 0)) m.push("Volumen (m³)");
    // Tala/Trozado: exigir volumen > 0 (manual o calculado por Smalian) — antes se
    // podía registrar con Ø/longitud vacíos y quedaba una línea con volumen 0.
    if (fields.has("volume") && !(Number(volumeM3) > 0) && !(autoVolume > 0)) m.push("Volumen — completá Ø mayor, Ø menor y longitud");
    if (fields.has("quantity") && !(Number(quantity) > 0)) m.push("Cantidad");
    if (fields.has("productType") && !productType.trim()) m.push("Tipo de producto");
    return m;
  }, [fields, section, treeCode, trozaCode, speciesName, gtfNumber, volumeM3, quantity, autoVolume, productType]);

  const isValid = missing.length === 0;

  // Vista previa: qué código encabeza la tarjeta y qué número se destaca, según sección.
  const previewEntity = fields.has("productType")
    ? productType
    : trozaCode.trim() || treeCode.trim() || despachoCode.trim() || meta.short;
  const highlight = useMemo(() => {
    if (fields.has("volume")) {
      const vol = Number(volumeM3) > 0 ? Number(volumeM3) : autoVolume;
      return { label: "Volumen (Smalian)", value: vol > 0 ? vol.toLocaleString("es-PE", { maximumFractionDigits: 4 }) : "0", unit: "m³" };
    }
    if (fields.has("volumeManual")) {
      return { label: "Volumen consumido", value: volumeM3 ? Number(volumeM3).toLocaleString("es-PE", { maximumFractionDigits: 4 }) : "0", unit: "m³" };
    }
    if (fields.has("quantity")) {
      return { label: section === "despacho_producto" ? "A despachar" : "Producido", value: quantity ? Number(quantity).toLocaleString("es-PE", { maximumFractionDigits: 4 }) : "0", unit: unit === "m3" ? "m³" : unit === "kg" ? "Kg" : "Unidad" };
    }
    return { label: "N° de GTF", value: gtfNumber.trim() || "—", unit: "" };
  }, [fields, volumeM3, autoVolume, quantity, unit, section, gtfNumber]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "general");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: csrfHeaders({}),
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPhotoUrl(data.url);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoUploading(false);
    }
  }

  function reset() {
    setTreeCode(""); setTrozaCode(""); setDespachoCode(""); setIsRama(false);
    setDiamMayor(""); setDiamMenor(""); setLengthM(""); setVolumeM3("");
    setQuantity(""); setPieces(""); setGtfNumber(""); setDiscarded(false);
    setConsumoInterno(false); setObservations("");
    setGpsLat(null); setGpsLng(null); setCensoUtm(null);
    setDmcBloqueo(null); setJustificacionDmc("");
    setPhotoUrl(null); setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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
      const finalVolume =
        fields.has("volume")
          ? (Number(volumeM3) > 0 ? Number(volumeM3) : autoVolume || null)
          : fields.has("volumeManual")
            ? Number(volumeM3)
            : null;

      const payload: Record<string, unknown> = {
        section,
        caratulaId: caratulaId ?? null,
        planId: planId ?? null,
        entryDate: new Date(entryDate).toISOString(),
        observations: observations.trim() || null,
      };
      if (fields.has("treeCode")) payload.treeCode = treeCode.trim() || null;
      // despacho_producto no muestra input de troza pero SÍ hereda la del producto
      // (link de trazabilidad por árbol), así que se manda aunque no esté en FIELDS.
      if (fields.has("trozaCode") || (section === "despacho_producto" && trozaCode.trim())) {
        payload.trozaCode = trozaCode.trim() || null;
      }
      if (fields.has("despachoCode")) payload.despachoCode = despachoCode.trim() || null;
      if (fields.has("isRama")) payload.isRama = isRama;
      if (fields.has("species")) {
        payload.speciesCommon = speciesName || null;
        payload.speciesScientific = scientific;
        payload.cites = cites;
      }
      if (fields.has("diams")) {
        payload.diamMayorM = diamMayor ? Number(diamMayor) : null;
        payload.diamMenorM = diamMenor ? Number(diamMenor) : null;
        payload.lengthM = lengthM ? Number(lengthM) : null;
      }
      if (finalVolume != null) payload.volumeM3 = finalVolume;
      if (fields.has("productType")) payload.productType = productType;
      if (fields.has("quantity")) payload.quantity = Number(quantity);
      if (fields.has("unit")) payload.unit = unit;
      if (fields.has("pieces")) payload.pieces = pieces ? Number(pieces) : null;
      if (fields.has("gtf")) payload.gtfNumber = gtfNumber.trim() || null;
      if (fields.has("discarded")) payload.discarded = discarded;
      if (fields.has("consumoInterno")) payload.consumoInterno = consumoInterno;

      if (justificacionDmc.trim()) payload.justificacionDmc = justificacionDmc.trim();
      payload.gpsLat = gpsLat ?? null;
      payload.gpsLng = gpsLng ?? null;
      payload.photoUrl = photoUrl ?? null;

      const res = await fetch("/api/admin/forestal/loth", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        // T8 (bajo DMC): no es un error a secas — se puede seguir con una
        // justificación, que queda escrita en el libro.
        if (r.error === "T8_BAJO_DMC") {
          setDmcBloqueo(r.message ?? "El árbol está por debajo del diámetro mínimo de corta.");
          setSubmitting(false);
          return;
        }
        throw new Error(r.message ?? (r.issues && r.issues[0]?.message) ?? r.error ?? `HTTP ${res.status}`);
      }
      if (keepOpen) {
        reset();
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

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:max-w-[1200px]">
      <div className="flex h-full max-h-[92vh] flex-col bg-[var(--surface-raised)]">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
              <TreePine className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">
                Nueva línea · {meta.label}
              </CardTitle>
              <p className="truncate text-xs text-[var(--text-tertiary)]">
                Sección {meta.index} · {meta.help}
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

        <div className="flex min-h-0 flex-1 overflow-hidden">
        <form id="loth-entry-form" onSubmit={handleSubmit} className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4 sm:content-start [&>*]:min-w-0 max-sm:space-y-4">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {dmcBloqueo && (
            <div className="space-y-2 rounded-xl border-2 border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)] sm:col-span-2">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div><b>Bajo el diámetro mínimo de corta.</b> {dmcBloqueo}</div>
              </div>
              <input
                value={justificacionDmc}
                onChange={(e) => setJustificacionDmc(e.target.value)}
                placeholder="Motivo (ej. árbol caído por viento, autorización especial N°…)"
                aria-label="Justificación de la tala bajo DMC"
                className="h-12 w-full rounded-lg border-2 border-[var(--data-error-500)]/50 bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]"
              />
              <p className="text-xs font-semibold opacity-80">
                Con el motivo escrito la línea se registra y queda anotada en el libro y en la auditoría.
              </p>
            </div>
          )}

          {speciesFueraDelPlan && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 px-4 py-3 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <b>&ldquo;{speciesName}&rdquo; no está autorizada en el plan de manejo.</b> No vas a poder
                despacharla ni emitir la GTF hasta agregarla en <b>Plan de Manejo · Especies autorizadas</b>.
              </div>
            </div>
          )}

          <Field label="Fecha" required>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className={cls.input} />
          </Field>

          {/* Picker data-driven: elegí del plan lo disponible para esta sección */}
          <div className="space-y-2 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-700)]">
                {SOURCE_TITLE[section]}
              </span>
              <select
                value={planId ?? ""}
                onChange={(e) => setPlanId(e.target.value || null)}
                className="h-8 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none"
              >
                {plans.length === 0 && <option value="">Sin plan</option>}
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>Plan {p.planType} {p.planNumber ?? ""} — {p.titularName}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={srcQuery}
                onChange={(e) => setSrcQuery(e.target.value)}
                placeholder="Buscar por código o especie..."
                className={`${cls.input} h-9 pl-8`}
              />
            </div>
            <div className="max-h-44 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
              {loadingSrc ? (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
              ) : filteredSources.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                  Nada disponible en este plan para esta etapa.{section !== "tala" && " Registrá primero la etapa anterior."}
                </div>
              ) : (
                filteredSources.map((it, i) => (
                  <button
                    key={`${it.code}-${i}`}
                    type="button"
                    onClick={() => pickSource(it)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--data-success-50)]"
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{it.code ?? it.productType ?? "—"}</span>
                      {it.species && <span className="truncate text-sm text-[var(--text-secondary)]">{it.species}</span>}
                      {it.cites && <CitesPill />}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {it.dapM ? `Ø ${it.dapM.toFixed(2)}m ` : ""}
                      {it.vol != null ? `${it.vol.toFixed(4)} m³` : it.quantity != null ? `${it.quantity.toFixed(2)} ${it.unit ?? ""}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
            <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-700)]">
              Seleccioná de la lista para autocompletar, o cargá manualmente abajo.
            </p>
          </div>

          {fields.has("treeCode") && (
            <Field label="Código del árbol" required={!fields.has("trozaCode")} hint="El código del censo forestal — punto de partida de la trazabilidad">
              <input
                type="text"
                value={treeCode}
                onChange={(e) => setTreeCode(e.target.value)}
                onBlur={(e) => lookupCensus(e.target.value)}
                placeholder="1-MIS"
                className={cls.input}
              />
            </Field>
          )}

          {/* Banner: datos jalados del censo (data-driven) */}
          {fields.has("treeCode") && censusTree && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] px-3 py-2.5 text-xs text-[var(--data-success-700)] sm:col-span-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-bold">Jalado del censo:</span>{" "}
                {censusTree.speciesCommon}
                {censusTree.dapM ? ` · DAP ${Number(censusTree.dapM).toFixed(2)} m` : ""}
                {censusTree.alturaComercialM ? ` · Hc ${Number(censusTree.alturaComercialM).toFixed(2)} m` : ""}
                {censusTree.volumenEstimadoM3 ? ` · vol. est. ${Number(censusTree.volumenEstimadoM3).toFixed(4)} m³` : ""}
                {censusTree.estado === "talado" && (
                  <span className="ml-1 font-bold text-[var(--data-warning-700)]">· ya marcado como talado</span>
                )}
                <div className="mt-0.5 text-[var(--data-success-700)] opacity-80">Especie y medidas precargadas — ajustá los Ø y el largo a lo medido en campo.</div>
              </div>
            </div>
          )}
          {fields.has("treeCode") && censusChecked && !censusTree && treeCode.trim() && (
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-xs text-[var(--text-tertiary)] sm:col-span-2">
              Este código no está en el censo del plan — se registra como código libre.
            </div>
          )}

          {fields.has("trozaCode") && (
            <Field label="Código de troza" required hint="Código del árbol + letra/número por nivel de trozado (ej. 1-MIS-A)">
              <input type="text" value={trozaCode} onChange={(e) => setTrozaCode(e.target.value)} placeholder="1-MIS-A" className={cls.input} />
            </Field>
          )}

          {fields.has("despachoCode") && (
            <Field label="Código de despacho" hint="Solo si despachás con un código distinto al de la troza">
              <input type="text" value={despachoCode} onChange={(e) => setDespachoCode(e.target.value)} placeholder="Opcional" className={cls.input} />
            </Field>
          )}

          {fields.has("isRama") && (
            <label className="flex items-center gap-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
              <input type="checkbox" checked={isRama} onChange={(e) => setIsRama(e.target.checked)} className="h-4 w-4 accent-[var(--data-success-600)]" />
              Proviene de una <span className="font-semibold">rama aprovechable</span> (R)
            </label>
          )}

          {fields.has("species") && (
            <Field label="Especie" required={section === "tala" || section === "trozado" || section === "producto_terminado"}>
              <button type="button" onClick={() => setShowPicker((v) => !v)} className={`${cls.input} flex items-center justify-between text-left`}>
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <span className="truncate font-medium">{speciesName || "Seleccionar especie..."}</span>
                  {cites && <CitesPill />}
                </span>
                <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
              </button>
            </Field>
          )}

          {fields.has("species") && showPicker && (
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 sm:col-span-2">
              <input
                type="text"
                value={speciesQuery}
                onChange={(e) => setSpeciesQuery(e.target.value)}
                placeholder="Buscar por nombre común o científico..."
                className={`${cls.input} mb-2`}
              />
              {!speciesQuery && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {TOP_SPECIES_SLUGS.map((slug) => {
                    const s = speciesOptions.find((x) => x.slug === slug);
                    if (!s) return null;
                    const active = speciesSlug === slug;
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => { setSpeciesSlug(slug); setShowPicker(false); setSpeciesQuery(""); }}
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
                  <button
                    type="button"
                    onClick={() => { setSpeciesSlug("otro"); setShowPicker(false); setSpeciesQuery(""); }}
                    className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  >
                    Otra…
                  </button>
                </div>
              )}
              <div className="max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                {filteredSpecies.length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">Sin resultados</div>
                )}
                {filteredSpecies.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => { setSpeciesSlug(s.slug); setShowPicker(false); setSpeciesQuery(""); }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{s.commonName}</span>
                        {s.cites && <CitesPill />}
                      </div>
                      {s.scientificName && (
                        <div className="truncate text-xs italic text-[var(--text-tertiary)]">{s.scientificName}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {fields.has("species") && isCustom && (
            <Field label="Nombre de la especie" required>
              <input type="text" value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)} placeholder="ej: Aguano masha" className={cls.input} />
            </Field>
          )}

          {fields.has("species") && cites && (() => {
            const permiso = permisoParaEspecie({ permisos: citesPermisos }, speciesName);
            const est = permiso ? estadoVencimiento(permiso.vencimiento) : null;
            const ok = permiso && est !== "vencido";
            return (
              <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs sm:col-span-2 ${ok ? "border-[var(--data-success-100)] bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "border-[var(--data-error-100)] bg-[var(--data-error-50)] text-[var(--data-error-700)]"}`}>
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-bold">Especie CITES.</span>{" "}
                  {permiso ? (
                    <>
                      Permiso <span className="font-mono font-bold">{permiso.numero || "(sin N°)"}</span>
                      {permiso.vencimiento && (
                        <> · vence {permiso.vencimiento}{est === "vencido" ? " — VENCIDO" : est === "por_vencer" ? " — por vencer" : ""}</>
                      )}
                      {est === "vencido" && ". Renová el permiso en la carátula antes de movilizar."}
                    </>
                  ) : (
                    <>Sin permiso CITES cargado para esta especie. Cargalo en <span className="font-bold">Configurar carátula → Permisos CITES</span> para acreditar el origen.</>
                  )}
                </div>
              </div>
            );
          })()}

          {fields.has("diams") && (
            <>
              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field label="Ø mayor (m)" hint="Promedio 2 medidas">
                  <input type="number" step="0.001" min="0" value={diamMayor} onChange={(e) => setDiamMayor(e.target.value)} placeholder="0.96" className={cls.input} />
                </Field>
                <Field label="Ø menor (m)">
                  <input type="number" step="0.001" min="0" value={diamMenor} onChange={(e) => setDiamMenor(e.target.value)} placeholder="0.65" className={cls.input} />
                </Field>
                <Field label="Longitud (m)">
                  <input type="number" step="0.01" min="0" value={lengthM} onChange={(e) => setLengthM(e.target.value)} placeholder="16" className={cls.input} />
                </Field>
              </div>
              <Field label="Volumen (m³)" hint="Smalian: 0.7854 × ((Ø mayor + Ø menor)/2)² × Longitud">
                <div className="relative">
                  <input
                    type="number" step="0.0001" min="0"
                    value={volumeM3}
                    onChange={(e) => setVolumeM3(e.target.value)}
                    placeholder={autoVolume > 0 ? autoVolume.toFixed(4) : "0.0000"}
                    className={`${cls.input} pr-32 font-mono tabular-nums`}
                  />
                  {autoVolume > 0 && Number(volumeM3) !== autoVolume && (
                    <button
                      type="button"
                      onClick={() => setVolumeM3(autoVolume.toFixed(4))}
                      title="Aplicar fórmula Smalian"
                      className="absolute right-1.5 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg bg-[var(--data-success-100)] px-2.5 text-xs font-bold text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-100)]"
                    >
                      <Sparkles className="h-3 w-3" />
                      {autoVolume.toFixed(4)}
                    </button>
                  )}
                </div>
              </Field>
            </>
          )}

          {fields.has("volumeManual") && (
            <Field label="Volumen (m³)" required>
              <input type="number" step="0.0001" min="0.0001" value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} placeholder="0.0000" className={`${cls.input} font-mono tabular-nums`} />
            </Field>
          )}

          {fields.has("productType") && (
            <Field label="Tipo de producto" required>
              <select value={productType} onChange={(e) => setProductType(e.target.value)} className={cls.input}>
                {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          )}

          {(fields.has("quantity") || fields.has("unit") || fields.has("pieces")) && (
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              {fields.has("pieces") && (
                <Field label="N° piezas">
                  <input type="number" min="0" value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="25" className={cls.input} />
                </Field>
              )}
              {fields.has("quantity") && (
                <Field label="Cantidad" required>
                  <input type="number" step="0.0001" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="3.5620" className={`${cls.input} font-mono tabular-nums`} />
                </Field>
              )}
              {fields.has("unit") && (
                <Field label="Unidad" required>
                  <select value={unit} onChange={(e) => setUnit(e.target.value as "m3" | "kg" | "unidad")} className={cls.input}>
                    <option value="m3">m³</option>
                    <option value="kg">Kg</option>
                    <option value="unidad">Unidad</option>
                  </select>
                </Field>
              )}
            </div>
          )}

          {fields.has("gtf") && (
            <Field label="N° de GTF" required hint="Debe coincidir con la fecha de emisión de la guía">
              <input type="text" value={gtfNumber} onChange={(e) => setGtfNumber(e.target.value)} placeholder="001-0000120" className={`${cls.input} font-mono`} />
            </Field>
          )}

          {fields.has("discarded") && (
            <label className="flex items-center gap-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
              <input type="checkbox" checked={discarded} onChange={(e) => setDiscarded(e.target.checked)} className="h-4 w-4 accent-[var(--data-error-600)]" />
              Descartado <span className="text-[var(--text-tertiary)]">(no aprovechable — anotá el motivo abajo)</span>
            </label>
          )}

          {fields.has("consumoInterno") && (
            <label className="flex items-center gap-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
              <input type="checkbox" checked={consumoInterno} onChange={(e) => setConsumoInterno(e.target.checked)} className="h-4 w-4 accent-[var(--data-success-600)]" />
              Consumo interno <span className="text-[var(--text-tertiary)]">(campamento, puentes, etc.)</span>
            </label>
          )}

          {/* Evidencia de campo (GPS + foto) */}
          <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 sm:col-span-2">
            <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
              Evidencia de campo <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span>
            </CardTitle>

            {/* GPS — teléfono, censo o UTM tecleada */}
            <LothGpsField
              lat={gpsLat}
              lng={gpsLng}
              onChange={(la, ln) => {
                setGpsLat(la);
                setGpsLng(ln);
              }}
              censo={censoUtm}
            />

            {/* Foto */}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Foto de evidencia"
                onChange={handlePhotoChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {photoUploading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Camera className="h-4 w-4 text-[var(--data-success-600)]" />
                }
                {photoUploading ? "Subiendo foto…" : photoUrl ? "Cambiar foto" : "Subir foto del tocón / troza"}
              </button>
              {photoError && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--data-error-700)]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{photoError}
                </p>
              )}
              {photoUrl && (
                <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="Foto de evidencia de campo"
                    className="h-28 w-auto rounded-lg border border-[var(--rule-base)] object-cover transition-opacity hover:opacity-80"
                  />
                </a>
              )}
            </div>
          </div>

          <div className="sm:col-span-2">
            <Field label="Observaciones">
              <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} placeholder="Información adicional relevante..." className={`${cls.input} h-auto resize-none py-2.5`} />
            </Field>
          </div>
        </form>

        {/* Panel derecho: vista previa en vivo (lg+) */}
        <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[var(--rule-base)] bg-[var(--surface-canvas)] lg:flex">
          <div className="border-b border-[var(--rule-soft)] px-5 py-3.5">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Vista previa del registro</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-5">
              <CardTitle className="text-lg font-bold leading-tight text-[var(--text-primary)]">{previewEntity}</CardTitle>
              <p className="mt-0.5 text-xs italic text-[var(--text-tertiary)]">{meta.label}</p>
            </div>
            <div className="mb-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{highlight.label}</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">{highlight.value}{highlight.unit && <span className="ml-1 text-sm font-medium text-[var(--text-tertiary)]">{highlight.unit}</span>}</div>
            </div>
            <dl className="space-y-2.5">
              <PreviewRow label="Fecha" value={entryDate || "—"} />
              {fields.has("treeCode") && <PreviewRow label="Árbol" value={treeCode.trim() || "—"} mono />}
              {fields.has("trozaCode") && <PreviewRow label="Troza" value={trozaCode.trim() || "—"} mono />}
              {fields.has("despachoCode") && <PreviewRow label="Despacho" value={despachoCode.trim() || "—"} mono />}
              {fields.has("species") && <PreviewRow label="Especie" value={speciesName || "—"} />}
              {fields.has("gtf") && <PreviewRow label="GTF" value={gtfNumber.trim() || "—"} mono />}
              {fields.has("pieces") && <PreviewRow label="Piezas" value={pieces ? Number(pieces).toLocaleString("es-PE") : "—"} />}
              {fields.has("discarded") && <PreviewRow label="Estado" value={discarded ? "Descartado" : "Aprovechable"} />}
              {fields.has("consumoInterno") && <PreviewRow label="Consumo interno" value={consumoInterno ? "Sí" : "No"} />}
            </dl>
          </div>
          <div className="border-t border-[var(--rule-soft)] px-5 py-4">
            {isValid ? (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--data-success-50)] px-3 py-2 text-sm font-medium text-[var(--data-success-700)]"><Check className="h-4 w-4 shrink-0" /> Listo para registrar</div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--data-warning-50)] px-3 py-2 text-sm font-medium text-[var(--data-warning-700)]"><AlertCircle className="h-4 w-4 shrink-0" /> Faltan {missing.length} {missing.length === 1 ? "campo" : "campos"}</div>
            )}
          </div>
        </aside>
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3.5 sm:px-6">
          <div className="hidden items-center gap-1.5 text-xs text-[var(--text-tertiary)] sm:flex">
            {isValid ? (
              <><Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" /><span>Listo para registrar</span></>
            ) : (
              <span>Faltan <span className="font-semibold text-[var(--text-secondary)]">{missing.length}</span> {missing.length === 1 ? "campo" : "campos"}</span>
            )}
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
              Cancelar
            </button>
            <button type="button" onClick={(e) => handleSubmit(e, true)} disabled={!isValid || submitting} className="inline-flex h-10 items-center rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50">
              Guardar y otro
            </button>
            <button type="submit" form="loth-entry-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--data-success-700)] px-4 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" />Guardando</>) : "Registrar línea"}
            </button>
          </div>
        </footer>
      </div>
    </AdminModal>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
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

function CitesPill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-error-700)]">
      CITES
    </span>
  );
}

function PreviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}

const cls = {
  input:
    "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]",
};

export { LOTH_SECTIONS };
