"use client";

/**
 * LothEntryForm — Modal de registro de línea del LO-TH (ADR-125).
 *
 * Form adaptable por sección (6 secciones SERFOR). Comparte el lenguaje visual
 * del WoodEntryForm (tokens DS, dark-mode safe). Volumen por fórmula SERFOR
 * (Smalian) en tala/trozado.
 *
 * Una columna, con los campos cortos en grilla (Brandon 2026-09-28: «quita la
 * vista previa… dale mejor y compacto»). La vista previa del registro repetía
 * lo que ya estaba escrito a la izquierda y costaba 300 px de ancho: el modal
 * medía 1200 px para un formulario de dos columnas de campos.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  TreePine,
  AlertTriangle,
  Loader2,
  X,
  Search,
  Check,
  ShieldAlert,
  Camera,
} from "@buleje/design-system/icons";
import AdminModal, { CabeceraPropia } from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { listSpecies, findSpeciesByCommonName } from "@/data/forestry-species";
import {
  claveEspecie,
  LOTH_SECTION_GROUPS,
  LOTH_SECTIONS,
  smalianVolume,
  type LothEntryDTO,
  type LothSection,
} from "@/lib/forestal/loth-constants";
import LothMedicionFuste, { derivarTala, type MedidasTala } from "./LothMedicionFuste";
import LothTalaObservaciones from "./LothTalaObservaciones";
import {
  componerObservaciones,
  obligatoriedadTala,
  type MarcaFisica,
  type MotivoTala,
} from "@/lib/forestal/loth-tala";
import { estadoVencimiento, permisoParaEspecie, type LothCitesPermiso } from "@/lib/forestal/loth-cites-types";
import { fromUtm, parseUtmZone } from "@/lib/forestal/loth-utm";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import LothGpsField from "./LothGpsField";
import LothAvisoTransformacion from "./LothAvisoTransformacion";
import { cientificoDeEspecie } from "@/lib/forestal/especies-catalogo";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { logger } from "@/lib/logger";

interface Props {
  section: LothSection;
  caratulaId?: string | null;
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean }) => void;
  /**
   * Línea de la que se parte. Sirve para dos cosas distintas:
   *  · **duplicar** (registrar la troza siguiente del mismo árbol sin volver a
   *    tipear seis campos), y
   *  · **corregir** (subsanación SERFOR: se asienta una línea nueva que enmienda
   *    a otra; la vieja nunca se borra).
   */
  plantilla?: LothEntryDTO | null;
  /** N° de línea que esta nueva corrige. Presente = modo subsanación. */
  corrigeLineNo?: number | null;
  /**
   * Secciones 4-6: lleva al Libro CTP, que es donde va la madera que se
   * transforma en una planta. Sin la prop, el aviso sale sin el botón.
   */
  onIrAlCtp?: () => void;
}

/** Las secciones de transformación: las que casi siempre van en el Libro CTP.
 * Salen del mismo grupo que usa el riel, para que las dos pantallas no difieran. */
const SECCIONES_DE_TRANSFORMACION: ReadonlySet<LothSection> = new Set(
  LOTH_SECTION_GROUPS.find((g) => g.key === "transformacion")?.sections ?? [],
);

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
  // La Sección 6 tiene el nombre científico como columna PROPIA (item 6),
  // aparte de la especie (item 5). No es un detalle de observaciones.
  despacho_producto: new Set(["gtf", "productType", "species", "scientific", "pieces", "quantity", "unit", "obs"]),
};

/**
 * La fórmula vive en `loth-constants` (single source). Acá había una copia
 * propia, que es exactamente cómo se llega a que dos pantallas cubiquen
 * distinto el mismo árbol.
 */
const smalian = smalianVolume;

export default function LothEntryForm({ section, caratulaId, onClose, onSaved, plantilla, corrigeLineNo, onIrAlCtp }: Props) {
  /**
   * Qué especies ofrece este libro.
   *
   * **NO el catálogo del aserradero** (ADR-410): ahí manda lo que el CTP
   * trabaja, y acá manda lo que la resolución AUTORIZA. Ofrecer una especie que
   * el plan no aprobó es ofrecer una infracción — para eso está el aviso de
   * «fuera del plan» y el guard T7 al despachar.
   *
   * Lo que sí faltaba: las del PROPIO plan. Si la resolución autoriza
   * «Panguana» y el catálogo del código no la trae, había que elegir «Otro» y
   * tipearla cada vez — con su nombre científico de memoria.
   */
  const [especiesDelPlanState, setEspeciesDelPlanState] = useState<
    { speciesCommon: string; speciesScientific?: string | null }[]
  >([]);
  const speciesOptions = useMemo(() => {
    const base = listSpecies({ includeOther: false });
    const vistas = new Set(base.map((s) => claveEspecie(s.commonName)));
    const delPlan: typeof base = [];
    for (const e of especiesDelPlanState) {
      const clave = claveEspecie(e.speciesCommon);
      if (!clave || vistas.has(clave)) continue;
      vistas.add(clave);
      delPlan.push({
        slug: `plan:${clave}`,
        commonName: e.speciesCommon.trim(),
        scientificName: (e.speciesScientific ?? "").trim(),
        cites: false,
        protectionLevel: "controlada",
        regions: [],
      });
    }
    /* Las del plan primero: son las autorizadas, y el que carga busca ésas. */
    const otro = listSpecies({ includeOther: true }).find((s) => s.slug === "otro");
    return [...delPlan, ...base, ...(otro ? [otro] : [])];
  }, [especiesDelPlanState]);
  /** Slug de la especie de la plantilla; «otro» si no está en el catálogo. */
  const slugDePlantilla = useMemo(() => {
    if (!plantilla?.speciesCommon) return null;
    const hit = listSpecies().find((s) => s.commonName.toLowerCase() === plantilla.speciesCommon!.toLowerCase());
    return hit?.slug ?? "otro";
  }, [plantilla]);
  const fields = FIELDS[section];
  const meta = SECTION_META[section];

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState(plantilla?.entryDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [treeCode, setTreeCode] = useState(plantilla?.treeCode ?? "");
  const [trozaCode, setTrozaCode] = useState(plantilla?.trozaCode ?? "");
  const [despachoCode, setDespachoCode] = useState(plantilla?.despachoCode ?? "");
  const [isRama, setIsRama] = useState(plantilla?.isRama ?? false);
  const [speciesSlug, setSpeciesSlug] = useState(slugDePlantilla ?? "tornillo");
  const [customSpecies, setCustomSpecies] = useState(slugDePlantilla === "otro" ? (plantilla?.speciesCommon ?? "") : "");
  /** Sección 6: el científico es columna propia y se puede corregir a mano. */
  const [scientificManual, setScientificManual] = useState<string | null>(
    plantilla?.speciesScientific ?? null,
  );
  const [diamMayor, setDiamMayor] = useState(plantilla?.diamMayorM ?? "");
  const [diamMenor, setDiamMenor] = useState(plantilla?.diamMenorM ?? "");
  const [lengthM, setLengthM] = useState(plantilla?.lengthM ?? "");
  const [volumeM3, setVolumeM3] = useState(plantilla?.volumeM3 ?? "");

  /**
   * Sección 1 (Tala): las medidas CRUDAS de campo. El libro sigue guardando el
   * diámetro promedio y la longitud aprovechable —lo que pide el formato
   * oficial—; acá se guarda cómo se llegó a esos números, que es lo que el
   * motosierrista tiene en la mano. Ver `lib/forestal/loth-tala.ts`.
   */
  const [medidasTala, setMedidasTala] = useState<MedidasTala>(() => {
    // Si la línea de la que se parte guardó cómo se midió (ADR-422), se
    // restaura tal cual: duplicar la troza siguiente del mismo árbol no debería
    // obligar a volver a tipear las dos medidas cruzadas.
    const cruda = plantilla?.medicionCruda;
    if (cruda && (cruda.mayor?.length || cruda.menor?.length || cruda.totalM != null)) {
      const aTexto = (ns: number[] | undefined) => {
        const base = (ns ?? []).map(String);
        while (base.length < 2) base.push("");
        return base;
      };
      return {
        modo: null,
        mayor: aTexto(cruda.mayor),
        menor: aTexto(cruda.menor),
        totalM: cruda.totalM != null ? String(cruda.totalM) : "",
        descuentos: (cruda.descuentos ?? []) as MedidasTala["descuentos"],
      };
    }
    return {
      modo: null,
      mayor: [plantilla?.diamMayorM ?? "", ""],
      menor: [plantilla?.diamMenorM ?? "", ""],
      totalM: plantilla?.lengthM ?? "",
      descuentos: [],
    };
  });
  /** Los casos que el item 10 tipifica, en vez de un textarea en blanco. */
  const [motivosTala, setMotivosTala] = useState<MotivoTala[]>([]);
  const [detalleMotivo, setDetalleMotivo] = useState("");
  /**
   * Item 3: el código va marcado en el fuste Y en el tocón. Al duplicar una
   * línea se hereda lo declarado: la troza siguiente del mismo árbol sale del
   * mismo tocón ya marcado.
   */
  const [marcasFisicas, setMarcasFisicas] = useState<MarcaFisica[]>(() => {
    const previas: MarcaFisica[] = [];
    if (plantilla?.marcadoFuste) previas.push("fuste");
    if (plantilla?.marcadoTocon) previas.push("tocon");
    return previas;
  });
  const [productType, setProductType] = useState(plantilla?.productType ?? PRODUCT_TYPES[0]);
  const [quantity, setQuantity] = useState(plantilla?.quantity ?? "");
  const [unit, setUnit] = useState<"m3" | "kg" | "unidad">((plantilla?.unit as "m3" | "kg" | "unidad") ?? "m3");
  const [pieces, setPieces] = useState(plantilla?.pieces != null ? String(plantilla.pieces) : "");
  const [gtfNumber, setGtfNumber] = useState(plantilla?.gtfNumber ?? "");
  const [discarded, setDiscarded] = useState(false);
  const [consumoInterno, setConsumoInterno] = useState(false);
  const [observations, setObservations] = useState(plantilla && !corrigeLineNo ? (plantilla.observations ?? "") : "");
  /** Por qué se corrige. SERFOR pide que la enmienda diga su motivo. */
  const [correctionNote, setCorrectionNote] = useState("");
  /**
   * Secciones 4-6: «la transformé dentro del TH». Sin marcarla no se guarda.
   * Partiendo de una línea que ya está en el libro (duplicar o corregir), eso
   * ya se contestó cuando se asentó: arranca marcada.
   */
  const esTransformacion = SECCIONES_DE_TRANSFORMACION.has(section);
  const [transformeEnTh, setTransformeEnTh] = useState(Boolean(plantilla));
  const faltaConfirmarTh = esTransformacion && !transformeEnTh;

  const [speciesQuery, setSpeciesQuery] = useState("");
  /* Sólo para completar el nombre científico de una especie tipeada a mano. */
  const catalogoEspecies = useEspeciesCatalogo();
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
    if (!planId) { setAuthorizedSpecies(new Set()); setEspeciesDelPlanState([]); return; }
    let cancel = false;
    fetch(`/api/admin/forestal/plan?planId=${planId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancel) return;
        const rows = (j?.species ?? []) as Array<{ speciesCommon: string; speciesScientific?: string | null }>;
        setEspeciesDelPlanState(rows.filter((r) => (r.speciesCommon ?? "").trim()));
        // Misma clave canónica que usa el motor: el plan escribe «Tornillo
        // (Cedrelinga catenaeformis)» y acá se elige «Tornillo». Comparar los
        // strings crudos avisaba «no autorizada» sobre una especie que sí lo está.
        setAuthorizedSpecies(new Set(rows.map((s) => claveEspecie(s.speciesCommon))));
      })
      .catch((err) => logger.error("[LothEntryForm] especies del plan failed", { error: String(err) }));
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
      // El censo arranca la medición, no la reemplaza: el DAP es del árbol EN
      // PIE y la altura comercial es estimada. Antes se copiaba el DAP en Ø
      // mayor y Ø menor a la vez —fingiendo dos medidas cruzadas que nadie
      // tomó, y dando un volumen cilíndrico—; ahora entra como primera medida
      // y la pantalla avisa que hay que confirmarla contra el tocón.
      if (it.dapM || it.hcM) {
        setMedidasTala((m) => ({
          ...m,
          mayor: [it.dapM ? String(it.dapM) : "", ""],
          menor: ["", ""],
          totalM: it.hcM ? String(it.hcM) : m.totalM,
          origenCenso: true,
        }));
      }
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
    tala: "Elige el árbol del censo",
    trozado: "Elige la tala a trozar",
    despacho_troza: "Elige la troza a despachar",
    consumo_troza: "Elige la troza a consumir",
    producto_terminado: "Elige la troza consumida (materia prima)",
    despacho_producto: "Elige el producto a despachar",
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
    !authorizedSpecies.has(claveEspecie(speciesName));
  const matched = isCustom ? findSpeciesByCommonName(customSpecies) : null;
  /* Tipeada a mano: el binomio sale del código o, si no lo conoce, del catálogo
     de la planta (ADR-410). El catálogo NO decide qué especie se puede declarar
     —eso lo dice el plan— pero sí sabe cómo se llama en latín. */
  const scientific = isCustom
    ? (matched?.scientificName ?? cientificoDeEspecie(customSpecies, catalogoEspecies.catalogo))
    : selected?.scientificName || null;
  const cites = isCustom ? matched?.cites ?? false : selected?.cites ?? false;

  const autoVolume = useMemo(() => {
    if (!fields.has("volume")) return 0;
    return smalian(Number(diamMayor), Number(diamMenor), Number(lengthM));
  }, [diamMayor, diamMenor, lengthM, fields]);

  /**
   * Tala: las medidas crudas mandan. Lo que se guarda en el libro (Ø promedio,
   * longitud aprovechable, volumen) se deriva de ellas, para que la columna
   * oficial y lo que se midió no puedan separarse.
   */
  const derivados = useMemo(() => derivarTala(medidasTala), [medidasTala]);
  useEffect(() => {
    if (section !== "tala" && section !== "trozado") return;
    setDiamMayor(derivados.diamMayorM != null ? String(derivados.diamMayorM) : "");
    setDiamMenor(derivados.diamMenorM != null ? String(derivados.diamMenorM) : "");
    setLengthM(derivados.longitudM != null ? String(derivados.longitudM) : "");
    setVolumeM3(derivados.volumenM3 != null ? Number(derivados.volumenM3).toFixed(4) : "");
  }, [section, derivados]);

  /** Qué exige la norma para ESTA línea de tala (Art. 4 + notas items 6/7/9). */
  const obligTala = useMemo(() => obligatoriedadTala(medidasTala.modo), [medidasTala.modo]);

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
    //
    // En TALA la exigencia es la de la norma, no una más dura: los diámetros y
    // el volumen son obligatorios sólo si el aserrío se hace dentro del área
    // (RDE 264-2019, notas de los items 6, 7 y 9); la longitud aprovechable se
    // registra siempre. Pedir de más empuja a inventar un número.
    if (section === "tala") {
      if (!(derivados.longitudM != null && derivados.longitudM > 0)) m.push("Longitud aprovechable");
      if (obligTala.volumen && !(Number(volumeM3) > 0) && !(autoVolume > 0)) {
        m.push("Volumen — completa las medidas cruzadas y la longitud");
      }
      if (derivados.excedeDescuento) m.push("Los descuentos superan el fuste entero");
    } else if (fields.has("volume") && !(Number(volumeM3) > 0) && !(autoVolume > 0)) {
      m.push("Volumen — completa Ø mayor, Ø menor y longitud");
    }
    if (fields.has("quantity") && !(Number(quantity) > 0)) m.push("Cantidad");
    if (fields.has("productType") && !productType.trim()) m.push("Tipo de producto");
    if (corrigeLineNo && correctionNote.trim().length < 3) m.push("Motivo de la corrección");
    return m;
  }, [fields, section, treeCode, trozaCode, speciesName, gtfNumber, volumeM3, quantity, autoVolume, productType, corrigeLineNo, correctionNote, derivados, obligTala]);

  const isValid = missing.length === 0;
  /** Guardar pide los obligatorios Y, en 4-6, haber contestado en qué libro va. */
  const puedeGuardar = isValid && !faltaConfirmarTh;
  const motivoBloqueo = faltaConfirmarTh
    ? "Marca «La transformé dentro del título habilitante» para guardar"
    : !isValid
      ? `Falta: ${missing.join(", ")}`
      : undefined;

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
      setError("Completa los campos obligatorios marcados con asterisco.");
      return;
    }
    if (faltaConfirmarTh) {
      setError("Si la madera va a una planta, esto se registra en el Libro CTP. Si la transformaste dentro del título habilitante, marca la casilla de arriba.");
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
        // Subsanación SERFOR: la línea nueva declara a cuál enmienda y por qué.
        // La vieja NO se toca — el libro corrige asentando, no borrando.
        ...(corrigeLineNo ? { correctsLineNo: corrigeLineNo, correctionNote: correctionNote.trim() || null } : {}),
        observations:
          section === "tala"
            ? componerObservaciones({
                motivos: motivosTala,
                detalle: detalleMotivo,
                nombreCientifico: scientific,
                textoLibre: observations,
              }) || null
            : observations.trim() || null,
      };
      // Tala: el estado de la línea sale de los casos del item 10, no de dos
      // checkboxes que podían contradecir al texto de observaciones.
      if (section === "tala" || section === "trozado") {
        // ADR-422: de dónde salieron el Ø promedio y la longitud. Sin esto, la
        // cuenta no se puede reconstruir después.
        const nums = (arr: string[]) => arr.map(Number).filter((n) => Number.isFinite(n) && n > 0);
        const cruda = {
          mayor: nums(medidasTala.mayor),
          menor: nums(medidasTala.menor),
          totalM: Number(medidasTala.totalM) > 0 ? Number(medidasTala.totalM) : null,
          descuentos: medidasTala.descuentos.filter((d) => d.metros > 0),
        };
        const midioAlgo = cruda.mayor.length > 0 || cruda.menor.length > 0 || cruda.totalM != null;
        payload.medicionCruda = midioAlgo ? cruda : null;
      }
      if (section === "tala") {
        payload.discarded = motivosTala.includes("descartado");
        payload.consumoInterno = motivosTala.includes("consumo_interno");
        // Item 3: el código marcado en el fuste y en el tocón. Ya tiene columna
        // propia (migración 20260921000000_loth_marcado_fisico).
        payload.marcadoFuste = marcasFisicas.includes("fuste");
        payload.marcadoTocon = marcasFisicas.includes("tocon");
      }
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
        payload.speciesScientific = (scientificManual ?? scientific)?.trim() || null;
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
      // En tala estos dos ya salieron de los motivos del item 10, más arriba.
      // Sin esta guarda, el checkbox —que en tala ni se muestra— los pisaba con
      // false y la línea quedaba con «Descartado» escrito en observaciones pero
      // sin el flag: el texto decía una cosa y el dato, otra.
      if (fields.has("discarded") && section !== "tala") payload.discarded = discarded;
      if (fields.has("consumoInterno") && section !== "tala") payload.consumoInterno = consumoInterno;

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


  /** El aviso de 4-6 manda al Libro CTP: la línea a medio cargar se descarta. */
  const irAlCtp = onIrAlCtp
    ? () => {
        onClose();
        onIrAlCtp();
      }
    : undefined;
  const spanCantidad = fields.has("pieces") ? "col-span-2" : "col-span-3";
  const idEstado = useId();

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      hideCloseButton
      claveVentana="loth-entry"
      className="sm:max-w-[44rem]"
      // El pie va por prop, FUERA del scroll: adentro, con el cuerpo en 92vh y
      // el modal en 85vh, «Registrar línea» quedaba 63 px debajo del borde y
      // hacía falta un segundo scroll para llegar (medido 28-09 a 1280×900).
      footer={
        <div className="flex items-center justify-between gap-3">
          <p id={idEstado} title={motivoBloqueo} className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-[var(--text-tertiary)] sm:flex">
            {puedeGuardar ? (
              <><Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)]" /><span>Listo para registrar</span></>
            ) : !isValid ? (
              <span>Faltan <span className="font-semibold text-[var(--text-secondary)]">{missing.length}</span> {missing.length === 1 ? "campo" : "campos"}</span>
            ) : (
              <span className="truncate">Falta marcar la casilla de arriba</span>
            )}
          </p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={!puedeGuardar || submitting}
              title={motivoBloqueo}
              aria-describedby={idEstado}
              className="inline-flex h-10 items-center whitespace-nowrap rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar y otro
            </button>
            <button
              type="submit"
              form="loth-entry-form"
              disabled={!puedeGuardar || submitting}
              title={motivoBloqueo}
              aria-describedby={idEstado}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-3.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" />Guardando</>) : "Registrar línea"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col bg-[var(--surface-raised)]">
        {/* Header — y asa de la ventana (ADR-420). `sticky`: fuera de la
            ventana el que scrollea es el cuerpo del AdminModal, no el form, y
            sin esto el título se iba con el primer campo. */}
        <CabeceraPropia
          className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3 sm:px-6"
          acciones={
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          }
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]">
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
        </CabeceraPropia>

        <form id="loth-entry-form" onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {esTransformacion && (
            <LothAvisoTransformacion confirmado={transformeEnTh} onConfirmado={setTransformeEnTh} onIrAlCtp={irAlCtp} />
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2.5 text-sm text-[var(--data-error-700)] dark:border-[var(--data-error-500)]/40 dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {dmcBloqueo && (
            <div className="space-y-2 rounded-xl border-2 border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] px-3 py-2.5 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div><b>Bajo el diámetro mínimo de corta.</b> {dmcBloqueo}</div>
              </div>
              <input
                value={justificacionDmc}
                onChange={(e) => setJustificacionDmc(e.target.value)}
                placeholder="Motivo (ej. árbol caído por viento, autorización especial N°…)"
                aria-label="Justificación de la tala bajo DMC"
                className="h-10 w-full rounded-lg border-2 border-[var(--data-error-500)]/50 bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]"
              />
              <p className="text-xs font-semibold opacity-80">
                Con el motivo escrito la línea se registra y queda anotada en el libro y en la auditoría.
              </p>
            </div>
          )}

          {speciesFueraDelPlan && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <b>&ldquo;{speciesName}&rdquo; no está autorizada en el plan.</b> Agrégala en Plan de Manejo · Especies autorizadas.
              </span>
              <InfoTip
                title="Especie fuera del plan"
                what="Sin estar en las especies autorizadas del plan no vas a poder despacharla ni emitir la GTF."
              />
            </div>
          )}

          {corrigeLineNo != null && (
            <div className="space-y-2 rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-500)]/10 p-3">
              <div className="flex items-center gap-1">
                <p className="text-sm font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                  Subsanación de la línea N° {corrigeLineNo}
                </p>
                <InfoTip
                  title="Subsanación"
                  what={`La línea N° ${corrigeLineNo} no se borra: queda en el libro marcada como corregida por esta.`}
                  affects="Así lo pide SERFOR: la enmienda tiene que poder leerse."
                />
              </div>
              <input
                type="text"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                aria-label="Motivo de la corrección"
                placeholder="Motivo de la corrección (ej.: el Ø mayor se anotó en cm, no en m)"
                className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-info-500)]"
              />
            </div>
          )}

          {/* Picker data-driven: elige del plan lo disponible para esta sección */}
          <section aria-label={SOURCE_TITLE[section]} className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
                  {SOURCE_TITLE[section]}
                </span>
                <InfoTip
                  icono="ayuda"
                  title={SOURCE_TITLE[section]}
                  what="Elige de la lista para autocompletar la línea, o cárgala a mano abajo."
                  affects="Sólo aparece lo que el plan elegido tiene disponible para esta etapa."
                />
              </div>
              <select
                value={planId ?? ""}
                onChange={(e) => setPlanId(e.target.value || null)}
                aria-label="Elegir plan de manejo"
                className="h-9 max-w-full truncate rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none"
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
                aria-label="Buscar por código o especie"
                placeholder="Buscar por código o especie..."
                className={`${cls.input} h-9 pl-8`}
              />
            </div>
            <div className="max-h-40 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
              {loadingSrc ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
              ) : filteredSources.length === 0 ? (
                <div className="px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">
                  Nada disponible en este plan para esta etapa.{section !== "tala" && " Registra primero la etapa anterior."}
                </div>
              ) : (
                filteredSources.map((it, i) => (
                  <button
                    key={`${it.code}-${i}`}
                    type="button"
                    onClick={() => pickSource(it)}
                    className="flex min-h-9 w-full items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{it.code ?? it.productType ?? "—"}</span>
                      {it.species && <span className="truncate text-sm text-[var(--text-secondary)]">{it.species}</span>}
                      {it.cites && <CitesPill />}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {it.dapM ? `Ø ${Number(it.dapM).toFixed(2)}m ` : ""}
                      {it.vol != null ? `${fmtM3(it.vol)} m³` : it.quantity != null ? `${Number(it.quantity).toFixed(2)} ${it.unit ?? ""}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Despacho de PT sin troza de origen: se guarda igual (el libro admite
              huecos), pero la trazabilidad de esa línea deja de llegar al árbol
              y su volumen se reparte por especie. Decirlo acá es mucho más
              barato que descubrirlo en la vista «Por árbol». */}
          {section === "despacho_producto" && !trozaCode.trim() && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 px-3 py-2 text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">Sin troza de origen: elige el producto de la lista para que herede la suya.</span>
              <InfoTip
                title="Troza de origen"
                what={`Sin troza esta salida no se puede atribuir a un árbol: su volumen se reparte por especie entre todos los de ${speciesName || "esa especie"}.`}
                affects="La vista «Por árbol» del libro."
              />
            </div>
          )}

          {/* Los datos de la línea: grilla de 6, cada campo corto ocupa media fila. */}
          <div className="grid grid-cols-6 gap-x-3 gap-y-3 [&>*]:min-w-0">
            <Field label="Fecha" required className="col-span-3">
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className={cls.input} />
            </Field>

            {fields.has("treeCode") && (
              <Field label="Código del árbol" required={!fields.has("trozaCode")} hint="El código del censo forestal — punto de partida de la trazabilidad" className="col-span-3">
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

            {fields.has("trozaCode") && (
              <Field label="Código de troza" required hint="Código del árbol + letra/número por nivel de trozado (ej. 1-MIS-A)" className="col-span-3">
                <input type="text" value={trozaCode} onChange={(e) => setTrozaCode(e.target.value)} placeholder="1-MIS-A" className={cls.input} />
              </Field>
            )}

            {fields.has("despachoCode") && (
              <Field label="Código de despacho" hint="Solo si despachas con un código distinto al de la troza" className="col-span-3">
                <input type="text" value={despachoCode} onChange={(e) => setDespachoCode(e.target.value)} placeholder="Opcional" className={cls.input} />
              </Field>
            )}

            {fields.has("gtf") && (
              <Field label="N° de GTF" required hint="Debe coincidir con la fecha de emisión de la guía" className="col-span-3">
                <input type="text" value={gtfNumber} onChange={(e) => setGtfNumber(e.target.value)} placeholder="001-0000120" className={`${cls.input} font-mono`} />
              </Field>
            )}

            {fields.has("productType") && (
              <Field label="Tipo de producto" required className="col-span-3">
                <select value={productType} onChange={(e) => setProductType(e.target.value)} className={cls.input}>
                  {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            )}

            {fields.has("species") && (
              <Field label="Especie" required={section === "tala" || section === "trozado" || section === "producto_terminado"} className="col-span-3">
                <button type="button" onClick={() => setShowPicker((v) => !v)} aria-expanded={showPicker} className={`${cls.input} flex items-center justify-between text-left`}>
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span className="truncate font-medium">{speciesName || "Seleccionar especie..."}</span>
                    {cites && <CitesPill />}
                  </span>
                  <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                </button>
              </Field>
            )}

            {fields.has("species") && showPicker && (
              <div className="col-span-6 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                <input
                  type="text"
                  value={speciesQuery}
                  onChange={(e) => setSpeciesQuery(e.target.value)}
                  aria-label="Buscar especie"
                  placeholder="Buscar por nombre común o científico..."
                  className={`${cls.input} mb-2 h-9`}
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
                              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
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
                <div className="max-h-48 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
                  {filteredSpecies.length === 0 && (
                    <div className="px-3 py-3 text-center text-sm text-[var(--text-tertiary)]">Sin resultados</div>
                  )}
                  {filteredSpecies.map((s) => (
                    <button
                      key={s.slug}
                      type="button"
                      onClick={() => { setSpeciesSlug(s.slug); setShowPicker(false); setSpeciesQuery(""); }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
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
              <Field label="Nombre de la especie" required className="col-span-3">
                <input type="text" value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)} placeholder="ej: Aguano masha" className={cls.input} />
              </Field>
            )}

            {/* Sección 6 · item 6: el nombre científico es una columna del formato.
                La nota al pie del Anexo 02 exceptúa a los productos formados por
                más de una especie (carbón, entre otros): ahí no es obligatorio ni
                el nombre común ni el científico. */}
            {fields.has("scientific") && (
              <Field
                label="Nombre científico"
                hint="Columna 6 del formato. Si el producto mezcla especies (ej. carbón), puede ir vacío"
                className="col-span-6"
              >
                <input
                  type="text"
                  value={scientificManual ?? scientific ?? ""}
                  onChange={(e) => setScientificManual(e.target.value)}
                  placeholder="ej: Cedrelinga catenaeformis"
                  className={`${cls.input} italic`}
                />
              </Field>
            )}

            {fields.has("isRama") && (
              <Casilla checked={isRama} onChange={setIsRama} title="Proviene de una rama aprovechable (R)">
                De una <span className="font-semibold">rama aprovechable</span> (R)
              </Casilla>
            )}

            {fields.has("volumeManual") && (
              <Field label="Volumen (m³)" required className="col-span-3">
                <input type="number" step="0.0001" min="0.0001" value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} placeholder="0.0000" className={`${cls.input} font-mono tabular-nums`} />
              </Field>
            )}

            {fields.has("consumoInterno") && (
              <Casilla checked={consumoInterno} onChange={setConsumoInterno} title="Consumo interno (campamento, puentes, etc.)">
                Consumo interno <span className="text-[var(--text-tertiary)]">(campamento, puentes)</span>
              </Casilla>
            )}

            {/* En tala, «descartado» dejó de ser un checkbox suelto: es uno de los
                casos del item 10, y viaja junto con su motivo y el término exacto. */}
            {fields.has("discarded") && section !== "tala" && (
              <Casilla checked={discarded} onChange={setDiscarded} acento="error" title="Descartado: no aprovechable. Anota el motivo en Observaciones.">
                Descartado <span className="text-[var(--text-tertiary)]">(no aprovechable)</span>
              </Casilla>
            )}

            {fields.has("pieces") && (
              <Field label="N° piezas" className={spanCantidad}>
                <input type="number" min="0" value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="25" className={cls.input} />
              </Field>
            )}
            {fields.has("quantity") && (
              <Field label="Cantidad" required className={spanCantidad}>
                <input type="number" step="0.0001" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="3.5620" className={`${cls.input} font-mono tabular-nums`} />
              </Field>
            )}
            {fields.has("unit") && (
              <Field label="Unidad" required className={spanCantidad}>
                <select value={unit} onChange={(e) => setUnit(e.target.value as "m3" | "kg" | "unidad")} className={cls.input}>
                  <option value="m3">m³</option>
                  <option value="kg">Kg</option>
                  <option value="unidad">Unidad</option>
                </select>
              </Field>
            )}
          </div>

          {/* Banner: datos jalados del censo (data-driven) */}
          {fields.has("treeCode") && censusTree && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-xs text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="font-bold">Jalado del censo:</span>{" "}
                {censusTree.speciesCommon}
                {censusTree.dapM ? ` · DAP ${Number(censusTree.dapM).toFixed(2)} m` : ""}
                {censusTree.alturaComercialM ? ` · Hc ${Number(censusTree.alturaComercialM).toFixed(2)} m` : ""}
                {censusTree.volumenEstimadoM3 ? ` · vol. est. ${fmtM3(Number(censusTree.volumenEstimadoM3))} m³` : ""}
                {censusTree.estado === "talado" && (
                  <span className="ml-1 font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">· ya marcado como talado</span>
                )}
              </span>
              <InfoTip title="Datos del censo" what="Especie y medidas precargadas del censo: ajusta los Ø y el largo a lo medido en campo." />
            </div>
          )}
          {fields.has("treeCode") && censusChecked && !censusTree && treeCode.trim() && (
            <p className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
              Este código no está en el censo del plan — se registra como código libre.
            </p>
          )}

          {fields.has("species") && cites && (() => {
            const permiso = permisoParaEspecie({ permisos: citesPermisos }, speciesName);
            const est = permiso ? estadoVencimiento(permiso.vencimiento) : null;
            const ok = permiso && est !== "vencido";
            return (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${ok ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" : "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]"}`}>
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <span className="font-bold">Especie CITES.</span>{" "}
                  {permiso ? (
                    <>
                      Permiso <span className="font-mono font-bold">{permiso.numero || "(sin N°)"}</span>
                      {permiso.vencimiento && (
                        <> · vence {permiso.vencimiento}{est === "vencido" ? " — VENCIDO" : est === "por_vencer" ? " — por vencer" : ""}</>
                      )}
                      {est === "vencido" && ". Renueva el permiso en la carátula antes de movilizar."}
                    </>
                  ) : (
                    <>Sin permiso CITES cargado para esta especie. Cárgalo en <span className="font-bold">Configurar carátula → Permisos CITES</span> para acreditar el origen.</>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Tala y Trozado: medidas crudas de campo → el libro guarda lo que
              pide el formato. Los items 6 y 7 de las dos secciones repiten la
              misma instrucción («2 o más medidas de forma cruzada»). */}
          {(section === "tala" || section === "trozado") && (
            <LothMedicionFuste medidas={medidasTala} onChange={setMedidasTala} seccion={section} />
          )}

          {section === "tala" && (
            <LothTalaObservaciones
              motivos={motivosTala}
              onMotivos={setMotivosTala}
              detalle={detalleMotivo}
              onDetalle={setDetalleMotivo}
              textoLibre={observations}
              onTextoLibre={setObservations}
              nombreCientifico={scientific}
              marcas={marcasFisicas}
              onMarcas={setMarcasFisicas}
              tieneFoto={!!photoUrl}
            />
          )}

          {/* Evidencia de campo (GPS + foto), en una fila de botones */}
          <section aria-label="Evidencia de campo" className="space-y-2 border-t border-[var(--rule-soft)] pt-3">
            <div className="flex items-center gap-1.5">
              <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
                Evidencia de campo
              </CardTitle>
              {section === "tala" ? (
                <InfoTip
                  title="Evidencia de campo"
                  what="La foto del tocón con el código visible es la prueba del marcado."
                  affects="Es lo que sostiene la línea si te supervisan."
                />
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">opcional</span>
              )}
            </div>

            {/* GPS — teléfono, censo o UTM tecleada; la foto va en la misma fila */}
            <LothGpsField
              lat={gpsLat}
              lng={gpsLng}
              onChange={(la, ln) => {
                setGpsLat(la);
                setGpsLng(ln);
              }}
              censo={censoUtm}
            >
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
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {photoUploading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Camera className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
                }
                {photoUploading ? "Subiendo foto…" : photoUrl ? "Cambiar foto" : "Foto del tocón / troza"}
              </button>
            </LothGpsField>
            {photoError && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{photoError}
              </p>
            )}
            {photoUrl && (
              <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Foto de evidencia de campo"
                  className="h-20 w-auto rounded-lg border border-[var(--rule-base)] object-cover transition-opacity hover:opacity-80"
                />
              </a>
            )}
          </section>

          {/* En tala la nota libre ya está en «Observaciones (item 10)», con el
              mismo estado: repetirla acá eran dos cajas que se pisaban. */}
          {section !== "tala" && (
            <Field label="Observaciones">
              <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} placeholder="Información adicional relevante..." className={`${cls.input} h-auto resize-none py-2`} />
            </Field>
          )}
        </form>
      </div>
    </AdminModal>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/**
 * Un campo con su rótulo. `min-h-6` en el rótulo: el ⓘ mide 24 px y un rótulo
 * sin ayuda, 20 — sin igualarlos, las cajas de una misma fila de la grilla
 * arrancan 4 px corridas.
 */
function Field({ label, required, hint, className = "", children }: { label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  const rotulo = (
    <>
      {label}
      {required && <span className="text-[var(--data-error-600)]">*</span>}
    </>
  );
  if (!hint) {
    return (
      <label className={`block ${className}`}>
        <span className="mb-1 flex min-h-6 items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{rotulo}</span>
        {children}
      </label>
    );
  }
  /* Con ayuda, el ⓘ va FUERA del <label>: adentro, el campo se anunciaba
     «Código de troza Información: Código de troza» y buscarlo por su rótulo
     encontraba el botón. El <label> conserva el nombre para el lector. */
  return (
    <div className={`block ${className}`}>
      <div className="mb-1 flex min-h-6 items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        <span aria-hidden="true" className="flex items-center gap-1">{rotulo}</span>
        <InfoTip icono="ayuda" title={label} what={hint} />
      </div>
      <label className="block">
        <span className="sr-only">{label}</span>
        {children}
      </label>
    </div>
  );
}

/**
 * Casilla de la grilla: la altura de un input y pegada abajo (`self-end`), para
 * que quede a la par del campo de al lado. A 400 px ocupa la fila entera: en
 * media fila el rótulo partía en tres renglones.
 */
function Casilla({
  checked,
  onChange,
  acento = "marca",
  title,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  acento?: "marca" | "error";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      title={title}
      className="col-span-6 flex h-10 cursor-pointer items-center gap-2 self-end rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] sm:col-span-3"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`h-4 w-4 shrink-0 ${acento === "error" ? "accent-[var(--data-error-600)]" : "accent-[var(--accent-dark)]"}`}
      />
      <span className="min-w-0 truncate">{children}</span>
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

const cls = {
  input:
    "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]",
};

export { LOTH_SECTIONS };
