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
 *
 * Tala y Trozado llevan a la derecha la ficha del árbol (28-09): en Tala lo que
 * dice el censo y lo que queda; en Trozado además la línea de tala y las
 * trozas que ya salieron, con lo que queda por trozar.
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
import LothMedicionFuste from "./LothMedicionFuste";
import {
  conMedidasDelCenso,
  derivarTala,
  formaDeLaLinea,
  medicionCrudaDe,
  medidasDePlantilla,
  medidasVacias,
  type MedidasTala,
} from "@/lib/forestal/loth-forma-medicion";
import { useFormaMedicion } from "./hooks/use-forma-medicion";
import LothTalaObservaciones from "./LothTalaObservaciones";
import {
  componerObservaciones,
  obligatoriedadTala,
  type MarcaFisica,
  type MotivoTala,
} from "@/lib/forestal/loth-tala";
import { estadoVencimiento, permisoParaEspecie, type LothCitesPermiso } from "@/lib/forestal/loth-cites-types";
import { fromUtm, parseUtmZone } from "@/lib/forestal/loth-utm";
import LothGpsField, { type GpsOrigen } from "./LothGpsField";
import LothCensoElegirModal from "./LothCensoElegirModal";
import LothFichaArbol from "./LothFichaArbol";
import LothPlacaFoto from "./LothPlacaFoto";
import LothFichaTrozado from "./LothFichaTrozado";
import LothFuentesLista, { conTrozasDelCenso, fuentesDelCenso, type PlanOpt, type SourceItem } from "./LothFuentesLista";
import { olvidarArbolEnElLibro, useArbolEnElLibro } from "./hooks/use-arbol-en-el-libro";
import { restanteTrozado, siguienteCodigoDeTroza } from "@/lib/forestal/loth-restante";
import LothTalaDatosInternos from "./LothTalaDatosInternos";
import { olvidarCensoDeTala, useCensoDeTala } from "./hooks/use-censo-de-tala";
import type { TandaTalaInicial } from "./hooks/use-tala-en-tanda";
import { arbolDeTroza, type ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import LothAvisoTransformacion from "./LothAvisoTransformacion";
import { cientificoDeEspecie } from "@/lib/forestal/especies-catalogo";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { logger } from "@/lib/logger";
import { Casilla, CitesPill, cls, etiquetaPlan, Field } from "./loth-entry-form-ui";

interface Props {
  section: LothSection;
  caratulaId?: string | null;
  onClose: () => void;
  /**
   * `arbolTalado`: la tala que se acaba de asentar — la vista ofrece seguir
   * con el trozado de ese árbol («Talar y trozar»).
   */
  onSaved: (opts?: { keepOpen?: boolean; arbolTalado?: string | null }) => void;
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
  /**
   * Código de árbol con el que arranca el formulario: en Tala lo busca en el
   * censo y lo elige (enlace `?nuevaTala=<código>` desde otras pantallas); en
   * Trozado elige esa tala (después de «Talar y trozar»).
   */
  arbolInicial?: string | null;
  /**
   * Tala: «Talar los N elegidos» en «Ver censo» lleva los árboles marcados a
   * la planilla de tala en tanda, con la fecha, el motosierrista y la hora
   * que ya tenía este formulario. Sin la prop, «Ver censo» elige de a uno.
   */
  onTalarVarios?: (t: TandaTalaInicial) => void;
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

export default function LothEntryForm({ section, caratulaId, onClose, onSaved, plantilla, corrigeLineNo, onIrAlCtp, arbolInicial, onTalarVarios }: Props) {
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
  /**
   * El código de troza que puso el formulario (no el operador): ése se puede
   * mover a la letra libre. Duplicar una troza es registrar la SIGUIENTE del
   * mismo árbol: su código también se mueve (corregir, no).
   */
  const trozaSugerida = useRef<string | null>(section === "trozado" && !corrigeLineNo ? (plantilla?.trozaCode ?? null) : null);
  const sugerirTroza = (c: string) => {
    trozaSugerida.current = c;
    return c;
  };
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
  const [medidasTala, setMedidasTala] = useState<MedidasTala>(() => medidasDePlantilla(plantilla));
  /** «D1 y D2 promediados» o «Varias medidas por Ø»: fijada en el equipo, para Tala y Trozado. */
  const [formaMedicion, setFormaMedicion] = useFormaMedicion(formaDeLaLinea(plantilla?.medicionCruda));
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
  /** De dónde salió: sin esto no se distingue el tocón de la copia del censo. */
  const [gpsOrigen, setGpsOrigen] = useState<GpsOrigen | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** «Foto de la placa» arranca de cero con cada línea nueva (reset). */
  const [placaVez, setPlacaVez] = useState(0);
  /** Enter en la última medida de la troza lleva acá, si ya se puede guardar. */
  const registrarRef = useRef<HTMLButtonElement>(null);

  // ── Plan + picker de ítems disponibles (flujo data-driven, ADR-127) ──
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  // Especies autorizadas del plan (normalizadas) — para avisar en vivo si la
  // especie elegida cae fuera del POA antes de que T7 rechace el despacho/GTF.
  const [authorizedSpecies, setAuthorizedSpecies] = useState<Set<string>>(new Set());

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loadingSrc, setLoadingSrc] = useState(false);
  /** La primera carga de fuentes ya respondió (para elegir el árbol inicial). */
  const [fuentesListas, setFuentesListas] = useState(false);
  const [planesListos, setPlanesListos] = useState(false);

  /** Tala y Trozado: la ficha del árbol al lado del formulario. */
  const conFicha = section === "tala" || section === "trozado";
  /** El censo del plan cruzado con el libro — lista corta (tala), «Ver censo» y ficha. */
  const censoTala = useCensoDeTala(planId, conFicha);
  const [verCenso, setVerCenso] = useState(false);
  /** El científico que el censo trae para ESA especie (lo anotó el regente). */
  const [cientificoCenso, setCientificoCenso] = useState<{ especie: string; cientifico: string } | null>(null);
  /** Datos internos de la tala: NO salen en el formato SERFOR. */
  const [motosierrista, setMotosierrista] = useState(plantilla?.motosierrista ?? "");
  const [motosierristaId, setMotosierristaId] = useState<string | null>(plantilla?.motosierristaId ?? null);
  const [horaTala, setHoraTala] = useState("");

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
      if (!cancel) setPlanesListos(true);
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
    finally { setLoadingSrc(false); setFuentesListas(true); }
  }, [section]);
  /* En tala la lista sale del censo ya cruzado con el libro (`censoTala`):
     pedir además `?available=tala` era otra consulta para un subconjunto. */
  useEffect(() => { if (section !== "tala") loadSources(planId); }, [planId, loadSources, section]);

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
      setCientificoCenso(it.species && it.scientific ? { especie: it.species, cientifico: it.scientific } : null);
      // El censo arranca la medición, no la reemplaza: el DAP es del árbol EN
      // PIE y la altura comercial es estimada. Antes se copiaba el DAP en Ø
      // mayor y Ø menor a la vez —fingiendo dos medidas cruzadas que nadie
      // tomó, y dando un volumen cilíndrico—; ahora entra como primera medida
      // y la pantalla avisa que hay que confirmarla contra el tocón.
      if (it.dapM || it.hcM) setMedidasTala((m) => conMedidasDelCenso(m, it.dapM, it.hcM));
      aplicarCoordCenso(it.code, it.utmZona ?? null, it.utmX ?? null, it.utmY ?? null);
    } else if (section === "trozado") {
      // Prefill un código de troza COMPLETO y válido (árbol + "-A"); cuando el
      // libro responde, pasa a la primera letra libre si «-A» ya salió. Antes
      // quedaba "002-TOR-" con el guión colgando y parecía roto. Uno de OTRO
      // árbol (o el que se sugirió) se reemplaza: si no, el 111 quedaba con 85-TOR-A.
      if (it.code) {
        const code = it.code;
        setTreeCode(code);
        setTrozaCode((c) => (!c.trim() || c === trozaSugerida.current || arbolDeTroza(c) !== code ? sugerirTroza(`${code}-A`) : c));
      }
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
  /** Tala: el censo cruzado con el libro. Trozado: las talas, con cuántas trozas ya salieron. */
  const fuentes = useMemo(
    () => (section === "tala" ? fuentesDelCenso(censoTala.arboles) : section === "trozado" ? conTrozasDelCenso(sources, censoTala.arboles) : sources),
    [section, censoTala.arboles, sources],
  );

  // ── Censo: autocompletado data-driven (ADR-126) ──────────────────────
  /** Coordenada UTM del árbol elegido (del picker o del lookup por código). */
  const [censoUtm, setCensoUtm] = useState<{ code: string; zona: string | null; x: number; y: number } | null>(null);
  /** T8: el backend rechazó la tala por estar bajo el DMC; hay que justificar. */
  const [dmcBloqueo, setDmcBloqueo] = useState<string | null>(null);
  const [justificacionDmc, setJustificacionDmc] = useState("");

  /**
   * El censo ya trae la coordenada del árbol: la operación la hereda como GPS
   * si todavía no tiene una (el GPS del teléfono, más preciso, siempre gana).
   */
  function aplicarCoordCenso(code: string | null, zona: string | null, x: number | null, y: number | null) {
    /* La coordenada tomada en el tocón (o tipeada) no se pisa; la copiada del
       censo sí: al cambiar de árbol, la línea se llevaba la del anterior. */
    const copiada = gpsOrigen === "censo";
    if (x == null || y == null || x <= 0 || y <= 0) {
      setCensoUtm(null);
      if (copiada) { setGpsLat(null); setGpsLng(null); setGpsOrigen(null); }
      return;
    }
    setCensoUtm({ code: code ?? "", zona, x, y });
    if ((gpsLat != null || gpsLng != null) && !copiada) return;
    const { zone, south } = parseUtmZone(zona);
    const [la, ln] = fromUtm(x, y, zone, south);
    if (Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) {
      setGpsLat(la);
      setGpsLng(ln);
      setGpsOrigen("censo");
    }
  }

  /**
   * Tipeado el código del árbol: la especie, el científico y la coordenada del
   * censo. Del plan elegido sin otra consulta; de otro plan, se pregunta. (Las
   * medidas NO: acá se copiaba el DAP como Ø mayor Y Ø menor sin pasar por la
   * medición —dos medidas que nadie tomó—, y la ficha ya muestra el censo.)
   */
  async function lookupCensus(code: string) {
    const c = code.trim();
    if (!c) return;
    const local = conFicha ? censoTala.arboles.find((a) => a.treeCode === c) : undefined;
    if (local) {
      applySpecies(local.speciesCommon);
      setCientificoCenso(local.speciesScientific ? { especie: local.speciesCommon, cientifico: local.speciesScientific } : null);
      aplicarCoordCenso(local.treeCode, local.utmZona, local.utmX, local.utmY);
      return;
    }
    try {
      const r = await fetch(`/api/admin/forestal/plan/census?treeCode=${encodeURIComponent(c)}`, { credentials: "include" });
      if (!r.ok) return;
      const tree = (await r.json()).tree as {
        treeCode: string; speciesCommon: string | null; utmZona: string | null; utmX: string | null; utmY: string | null;
      } | null;
      if (!tree) return;
      applySpecies(tree.speciesCommon);
      aplicarCoordCenso(tree.treeCode, tree.utmZona, tree.utmX ? Number(tree.utmX) : null, tree.utmY ? Number(tree.utmY) : null);
    } catch (err) {
      logger.error("[LothEntryForm] censo por código failed", { error: String(err) });
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
  /* El del censo manda si es de la MISMA especie que la línea: lo anotó el
     regente para ese árbol. Medido 28-09 en Blas: la tala de la Copaiba 111
     quedó sin científico aunque el censo trae «Copaifera reticulata Ducke». */
  const cientificoDelCenso =
    cientificoCenso && claveEspecie(cientificoCenso.especie) === claveEspecie(speciesName) ? cientificoCenso.cientifico : null;
  const cientificoEfectivo = (scientificManual ?? cientificoDelCenso ?? scientific)?.trim() || null;

  const autoVolume = useMemo(() => {
    if (!fields.has("volume")) return 0;
    return smalian(Number(diamMayor), Number(diamMenor), Number(lengthM));
  }, [diamMayor, diamMenor, lengthM, fields]);

  /**
   * Tala: las medidas crudas mandan. Lo que se guarda en el libro (Ø promedio,
   * longitud aprovechable, volumen) se deriva de ellas, para que la columna
   * oficial y lo que se midió no puedan separarse.
   */
  const derivados = useMemo(() => derivarTala(medidasTala, formaMedicion), [medidasTala, formaMedicion]);
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
  /**
   * El árbol cuya ficha se muestra (el del código, esté o no disponible). En
   * el trozado, si no se tipeó, el que sale del código de troza («85-TOR-E»).
   */
  const codigoFicha =
    section === "trozado" ? treeCode.trim() || (trozaCode.trim() ? arbolDeTroza(trozaCode) : "") : treeCode.trim();
  const arbolFicha = conFicha ? censoTala.arboles.find((a) => a.treeCode === codigoFicha) ?? null : null;
  /** Trozado: la tala y las trozas del árbol, como están asentadas en el libro. */
  const libroArbol = useArbolEnElLibro(section === "trozado" ? codigoFicha : "");
  /* La troza que sugirió el formulario pasa a la primera libre cuando llega el libro. */
  useEffect(() => {
    const d = libroArbol.datos;
    if (!d || !trozaCode || trozaCode !== trozaSugerida.current) return;
    const libre = siguienteCodigoDeTroza(d.treeCode, d.trozas);
    if (libre !== trozaCode) setTrozaCode(sugerirTroza(libre));
    // Sólo cuando responde el libro: lo que tipea el operador no se toca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libroArbol.datos]);
  /**
   * Ya tiene tala vigente en el libro: T3 lo rechazaría al guardar. Se frena
   * antes, con la línea a la vista. Una corrección no entra acá (enmienda esa
   * misma línea), y un árbol «talado» sólo en el censo, sin línea, sí se deja
   * registrar: justamente es la línea que falta.
   */
  const yaTaladoEnLibro = section === "tala" && corrigeLineNo == null ? (arbolFicha?.uso?.tala ?? null) : null;
  /** Trozado: lo que queda del árbol con esta troza (la ficha lo pinta; acá, para el pie). */
  const restoTrozado =
    section === "trozado" && libroArbol.datos ? restanteTrozado(libroArbol.datos, { trozaCode, volumeM3: derivados.volumenM3 }) : null;
  /** El código de troza ya está asentado — T3 lo rechazaría al guardar. */
  const trozaRepetida = corrigeLineNo == null ? (restoTrozado?.repetida ?? null) : null;
  /** Guardar pide los obligatorios Y, en 4-6, haber contestado en qué libro va. */
  const puedeGuardar = isValid && !faltaConfirmarTh && !yaTaladoEnLibro && !trozaRepetida;
  /** Enter en la última medida: al botón de guardar si ya se puede; si no, sigue el bloque de abajo. */
  const irARegistrar = () => {
    const boton = registrarRef.current;
    if (!boton || !puedeGuardar || submitting) return false;
    boton.focus();
    return true;
  };
  const motivoBloqueo = yaTaladoEnLibro
    ? `El árbol ${treeCode.trim()} ya se taló en la línea N° ${yaTaladoEnLibro.lineNo}: elige otro del censo`
    : trozaRepetida
      ? `La troza ${trozaCode.trim()} ya está en la línea N° ${trozaRepetida.lineNo}: usa la letra que sigue`
      : faltaConfirmarTh
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
    setGpsLat(null); setGpsLng(null); setGpsOrigen(null); setCensoUtm(null);
    // El motosierrista sigue (tumba el árbol siguiente); la hora y el científico no.
    setHoraTala(""); setCientificoCenso(null);
    setDmcBloqueo(null); setJustificacionDmc("");
    setPhotoUrl(null); setPhotoError(null); setPlacaVez((v) => v + 1);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Sin esto la medición seguía a la vista con el volumen ya borrado: «falta el volumen» con los números puestos.
    setMedidasTala((m) => medidasVacias(m.modo));
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
    if ((yaTaladoEnLibro || trozaRepetida) && motivoBloqueo) {
      setError(`${motivoBloqueo}.`);
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
                nombreCientifico: cientificoEfectivo,
                textoLibre: observations,
              }) || null
            : observations.trim() || null,
      };
      // Tala: el estado de la línea sale de los casos del item 10, no de dos
      // checkboxes que podían contradecir al texto de observaciones.
      if (section === "tala" || section === "trozado") {
        // ADR-422: de dónde salieron el Ø promedio y la longitud, y en qué forma
        // se anotó el Ø. Sin esto, la cuenta no se puede reconstruir después.
        payload.medicionCruda = medicionCrudaDe(medidasTala, formaMedicion);
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
        payload.speciesScientific = cientificoEfectivo;
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
      payload.gpsOrigen = gpsLat != null && gpsLng != null ? gpsOrigen : null;
      payload.photoUrl = photoUrl ?? null;
      if (section === "tala") {
        payload.motosierrista = motosierrista.trim() || null;
        payload.motosierristaId = motosierrista.trim() ? motosierristaId : null;
        payload.horaTala = horaTala || null;
      }

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
      // Lo recordado del censo y del árbol ya no vale: cambió lo que el libro dice de él.
      olvidarCensoDeTala();
      olvidarArbolEnElLibro();
      // La vista ofrece «Trozarlo ahora» con el árbol recién tumbado.
      const arbolTalado = section === "tala" ? treeCode.trim() || null : null;
      if (keepOpen) {
        // Trozado: «Guardar y otro» es la troza siguiente del MISMO árbol.
        const seguirArbol = section === "trozado" ? treeCode.trim() : "";
        reset();
        if (seguirArbol) {
          setTreeCode(seguirArbol);
          setTrozaCode(sugerirTroza(`${seguirArbol}-A`));
          libroArbol.recargar();
        }
        setSubmitting(false);
        // Sigue abierto: la lista y el censo tienen que dejar de ofrecer el recién talado.
        if (section === "tala") censoTala.recargar();
        onSaved({ keepOpen: true, arbolTalado });
      } else {
        onSaved({ arbolTalado });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }


  /** Elegido en «Ver censo»: lo mismo que tocarlo en la lista corta. */
  function elegirArbol(a: ArbolParaElegir) {
    setVerCenso(false);
    if (section === "trozado") {
      // La tala del libro, si la lista la tiene (trae su volumen y especie).
      pickSource(sources.find((x) => x.code === a.treeCode) ?? {
        kind: "tala", code: a.treeCode, species: a.speciesCommon, scientific: a.speciesScientific, cites: a.cites, vol: a.uso?.tala?.volumeM3 ?? null,
      });
      return;
    }
    pickSource({
      kind: "censo", code: a.treeCode, species: a.speciesCommon, scientific: a.speciesScientific, cites: a.cites,
      dapM: a.dapM, hcM: a.hcM, vol: a.volM3, utmZona: a.utmZona, utmX: a.utmX, utmY: a.utmY,
    });
  }

  /**
   * El árbol con el que llega el formulario (`?nuevaTala=` o «Trozarlo
   * ahora»). Se atiende UNA vez, cuando lo que hay que buscar ya cargó. Si el
   * código es de otro plan, primero se cambia a ese plan.
   */
  const inicialAtendido = useRef(false);
  const inicialOtroPlan = useRef(false);
  useEffect(() => {
    const code = arbolInicial?.trim();
    if (!code || inicialAtendido.current) return;
    if (section === "tala") {
      if (!planesListos || (planId && (censoTala.cargando || censoTala.listoPara !== planId))) return;
      const a = censoTala.arboles.find((x) => x.treeCode === code);
      if (a) {
        inicialAtendido.current = true;
        // Uno que no se puede talar igual se muestra: la ficha dice por qué.
        if (a.disponibilidad === "disponible") elegirArbol(a);
        else setTreeCode(code);
        return;
      }
      if (inicialOtroPlan.current) {
        inicialAtendido.current = true;
        setTreeCode(code);
        return;
      }
      inicialOtroPlan.current = true;
      fetch(`/api/admin/forestal/plan/census?treeCode=${encodeURIComponent(code)}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { tree?: { planId?: string | null } | null } | null) => {
          const otro = j?.tree?.planId ?? null;
          if (otro && otro !== planId && plans.some((p) => p.id === otro)) {
            setPlanId(otro);
            return;
          }
          inicialAtendido.current = true;
          setTreeCode(code);
        })
        .catch((err) => {
          inicialAtendido.current = true;
          setTreeCode(code);
          logger.error("[LothEntryForm] árbol inicial failed", { error: String(err) });
        });
    } else if (section === "trozado") {
      if (!fuentesListas || loadingSrc) return;
      inicialAtendido.current = true;
      const it = sources.find((x) => x.code === code);
      if (it) pickSource(it);
      else {
        setTreeCode(code);
        setTrozaCode((c) => c || `${code}-A`);
      }
    }
    // pickSource/elegirArbol se redefinen en cada render: lo que decide son los datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbolInicial, section, planesListos, planId, plans, censoTala.cargando, censoTala.listoPara, censoTala.arboles, fuentesListas, loadingSrc, sources]);

  const planSel = plans.find((p) => p.id === planId) ?? null;
  const planLabel = planSel ? etiquetaPlan(planSel) : null;

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
      // Tala: el formulario y la ficha del árbol lado a lado (Brandon 28-09:
      // «hazlo más ancho para que todo esté mejor acoplado»). Clave propia:
      // una ventana recordada a 44 rem no aprieta la ficha.
      claveVentana={conFicha ? "loth-entry-tala" : "loth-entry"}
      className={conFicha ? "sm:max-w-[44rem] lg:max-w-[62rem]" : "sm:max-w-[44rem]"}
      // El pie va por prop, FUERA del scroll: adentro, con el cuerpo en 92vh y
      // el modal en 85vh, «Registrar línea» quedaba 63 px debajo del borde y
      // hacía falta un segundo scroll para llegar (medido 28-09 a 1280×900).
      footer={
        <div className="flex items-center justify-between gap-3">
          <p id={idEstado} title={motivoBloqueo} className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-[var(--text-tertiary)] sm:flex">
            {puedeGuardar && restoTrozado?.excede ? (
              /* Aviso, no bloqueo: lo decide T4 al guardar, con su mensaje. */
              <span className="flex min-w-0 items-center gap-1.5 font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Se pasa de lo talado</span>
              </span>
            ) : puedeGuardar ? (
              <><Check className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)]" /><span>Listo para registrar</span></>
            ) : yaTaladoEnLibro ? (
              <span className="truncate">Ya talado en la línea N° {yaTaladoEnLibro.lineNo}</span>
            ) : trozaRepetida ? (
              <span className="truncate">Troza ya asentada en la línea N° {trozaRepetida.lineNo}</span>
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
              ref={registrarRef}
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

        {/* Tala en escritorio: grilla de dos columnas — arriba a la izquierda
            avisos y buscador, abajo los datos, y la ficha del árbol a la
            derecha, pegajosa. En el celular la ficha cae justo después del
            buscador. Sin `overflow` propio: el que scrollea es el cuerpo del
            modal, y un ancestro con overflow apaga el `sticky`. */}
        <form
          id="loth-entry-form"
          onSubmit={handleSubmit}
          className={
            conFicha
              ? "min-h-0 flex-1 space-y-4 px-5 py-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr] lg:gap-x-5"
              : "min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6"
          }
        >
          <div className="space-y-4 lg:col-start-1 lg:row-start-1">
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

            {/* Tala: la placa del tocón elige el árbol, guarda la foto y toma el GPS. */}
            {section === "tala" && (
              <LothPlacaFoto
                key={placaVez}
                arboles={censoTala.arboles}
                cargandoCenso={censoTala.cargando}
                elegido={treeCode}
                onElegir={elegirArbol}
                onFoto={(url) => { setPhotoUrl(url); setPhotoError(null); }}
                onGps={(la, ln) => { setGpsLat(la); setGpsLng(ln); setGpsOrigen("telefono"); }}
                marcadoTocon={marcasFisicas.includes("tocon")}
                onMarcadoTocon={(v) => setMarcasFisicas((m) => (v ? [...m.filter((x) => x !== "tocon"), "tocon"] : m.filter((x) => x !== "tocon")))}
              />
            )}

            {/* Picker data-driven: elige del plan lo disponible para esta sección */}
            <LothFuentesLista
              section={section}
              planId={planId}
              plans={plans}
              onPlan={setPlanId}
              fuentes={fuentes}
              cargando={section === "tala" ? censoTala.cargando : loadingSrc}
              error={section === "tala" ? censoTala.error : null}
              onReintentar={censoTala.recargar}
              onElegir={pickSource}
              verCenso={conFicha ? { total: censoTala.arboles.length, onAbrir: () => setVerCenso(true) } : null}
            />
          </div>

          {conFicha && (
            /* Tope de alto con scroll propio: la ficha del trozado mide ~670 px y
               a 1280×900 el cuerpo del modal deja ~620 debajo de la cabecera —
               pegada arriba, lo de abajo quedaba fuera de la vista. */
            <aside aria-label="Ficha del árbol" className="lg:sticky lg:top-[4.5rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(85vh-11rem)] lg:self-start lg:overflow-y-auto">
              {section === "tala" ? (
                <LothFichaArbol
                  arbol={arbolFicha}
                  cargando={censoTala.cargando}
                  codigo={treeCode}
                  medido={{ diamMayorM: derivados.diamMayorM, longitudM: derivados.longitudM, volumenM3: derivados.volumenM3 }}
                  medidasDelCenso={Boolean(medidasTala.origenCenso)}
                  gps={gpsLat != null && gpsLng != null ? { lat: gpsLat, lng: gpsLng, origen: gpsOrigen } : null}
                  censo={censoTala.arboles}
                />
              ) : (
                <LothFichaTrozado
                  arbol={arbolFicha}
                  cargandoCenso={censoTala.cargando}
                  codigo={codigoFicha}
                  libro={libroArbol}
                  troza={{ codigo: trozaCode, volumenM3: derivados.volumenM3 }}
                  onUsarCodigo={setTrozaCode}
                />
              )}
            </aside>
          )}

          <div className="space-y-4 lg:col-start-1 lg:row-start-2">

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
                  <input
                    type="text"
                    value={trozaCode}
                    onChange={(e) => setTrozaCode(e.target.value)}
                    // Sin árbol tipeado, sale del código de troza («85-TOR-E» → 85-TOR), a la vista y editable.
                    onBlur={(e) => {
                      const arbol = e.target.value.includes("-") ? arbolDeTroza(e.target.value) : "";
                      if (section === "trozado" && !treeCode.trim() && arbol) {
                        setTreeCode(arbol);
                        void lookupCensus(arbol);
                      }
                    }}
                    placeholder="1-MIS-A"
                    className={cls.input}
                  />
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
              <LothMedicionFuste
                medidas={medidasTala}
                onChange={setMedidasTala}
                forma={formaMedicion}
                onForma={setFormaMedicion}
                seccion={section}
                /* Trozado: la medida es lo último que se llena. Tala sigue al
                   bloque de abajo (observaciones, motosierrista). */
                alTerminar={section === "trozado" ? irARegistrar : undefined}
              />
            )}

            {section === "tala" && (
              <LothTalaObservaciones
                motivos={motivosTala}
                onMotivos={setMotivosTala}
                detalle={detalleMotivo}
                onDetalle={setDetalleMotivo}
                textoLibre={observations}
                onTextoLibre={setObservations}
                nombreCientifico={cientificoEfectivo}
                marcas={marcasFisicas}
                onMarcas={setMarcasFisicas}
                tieneFoto={!!photoUrl}
              />
            )}

            {section === "tala" && (
              <LothTalaDatosInternos
                motosierrista={motosierrista}
                onMotosierrista={(nombre, id) => {
                  setMotosierrista(nombre);
                  setMotosierristaId(id);
                }}
                hora={horaTala}
                onHora={setHoraTala}
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
                onChange={(la, ln, origen) => {
                  setGpsLat(la);
                  setGpsLng(ln);
                  setGpsOrigen(origen);
                }}
                origen={gpsOrigen}
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
          </div>
        </form>

        {conFicha && (
          <LothCensoElegirModal
            para={section === "trozado" ? "trozado" : "tala"}
            open={verCenso}
            onClose={() => setVerCenso(false)}
            censo={censoTala}
            planLabel={planLabel}
            elegido={treeCode}
            posicion={gpsOrigen === "telefono" && gpsLat != null && gpsLng != null ? { lat: gpsLat, lng: gpsLng } : null}
            onElegir={elegirArbol}
            onElegirVarios={
              section === "tala" && corrigeLineNo == null && onTalarVarios
                ? {
                    etiqueta: (n) => (n === 0 ? "Talar los elegidos" : n === 1 ? "Talar el elegido" : `Talar los ${n} elegidos`),
                    onElegir: (arboles) => {
                      setVerCenso(false);
                      onTalarVarios({
                        planId,
                        planLabel,
                        arboles,
                        comunes: { fecha: entryDate, motosierrista, motosierristaId, hora: horaTala, modo: medidasTala.modo },
                      });
                    },
                  }
                : undefined
            }
          />
        )}
      </div>
    </AdminModal>
  );
}

export { LOTH_SECTIONS };
