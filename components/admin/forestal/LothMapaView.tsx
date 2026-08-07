"use client";

/**
 * LothMapaView — cabina geoespacial del Libro TH. El gemelo espacial del libro:
 * el libro dice CUÁNTA madera salió; el mapa dice DE DÓNDE, con qué coordenadas
 * y si eso resiste una fiscalización (SERFOR/OSINFOR) y el Reglamento UE
 * Antideforestación (EUDR · UE 2023/1115).
 *
 * Orquestador: datos + estado. Lo cartográfico está repartido para que cada
 * pieza sea legible por separado:
 *   · `LothMapaCanvas`  — Leaflet: base, cuadrícula UTM, polígono, censo, puntos.
 *   · `LothMapaChrome`  — leyenda, norte, escala y lectura de coordenadas.
 *   · `LothVerticesPanel` — cuadro de coordenadas UTM (C.001…) + CSV.
 *   · `LothEudrRail`    — readiness EUDR, checklist y exports de la DDS.
 *   · `loth-plano-print` — lámina imprimible con cajetín, leyenda y cuadrícula.
 *
 * El censo forestal se registra en UTM (`utmX/utmY`): se proyecta a lat/lng en
 * `loth-mapa-shared` para poder dibujarlo junto a las operaciones del libro.
 */
import "leaflet/dist/leaflet.css";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Loader2, Camera, Route, Undo2, Check, X } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";
import { csrfHeaders } from "@/lib/csrf-client";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  computeEudrReadiness,
  polygonAreaHa,
  hasParcela,
  buildEudrGeoJson,
  normalizeParcela,
  emptyParcela,
  type LothParcela,
  type LatLng,
  type OpForEudr,
  type EudrPoint,
} from "@/lib/forestal/loth-geo";
import { dominantZone, formatDistance, hullBuffer, zoneLabel } from "@/lib/forestal/loth-utm";
import { buildKml } from "@/lib/forestal/loth-coords-io";
import {
  emptyCartografia,
  normalizeCartografia,
  referenciaMeta,
  viaMeta,
  type LothCartografia,
} from "@/lib/forestal/loth-cartografia";
import { lineLengthM } from "@/lib/forestal/loth-utm";
import { analizarPoa, defaultPoaConfig, CATEGORIA_COLOR, CATEGORIA_LABEL, type PoaConfig } from "@/lib/forestal/loth-poa";
import { OVERLAYS, type OverlayId } from "./loth-mapa-overlays";
import LothMapaHerramientas from "./LothMapaHerramientas";
import type { ModoMedicion } from "@/lib/forestal/loth-medicion";
import { cargarWaybackReleases, EUDR_CUTOFF, releaseParaFecha, type WaybackRelease } from "@/lib/forestal/loth-wayback";
import { arbolesEnFaja } from "@/lib/forestal/loth-faja";
import { cargarElevaciones, construirPerfil, muestrearTraza, type PerfilElevacion } from "@/lib/forestal/loth-elevacion";
import { descargarImagenMapa, type ImagenBase } from "@/lib/forestal/loth-mapa-imagen";
import { printLothPlano, type PlanoBasemap } from "@/lib/forestal/loth-plano-print";
import { printLothEudrDds } from "@/lib/forestal/loth-eudr-print";
import LothEudrRail from "./LothEudrRail";
import LothMapaCanvasRaw, { type BasemapId } from "./LothMapaCanvas";
import LothMapaChrome, { type LegendItem } from "./LothMapaChrome";
import LothCampoBar, { type PosicionCampo } from "./LothCampoBar";
import LothCaratulaBanner, { type CaratulaUbicacion } from "./LothCaratulaBanner";
import LothContextoPanel from "./LothContextoPanel";
import LothCoordsModal from "./LothCoordsModal";
import LothMapaDrawBar from "./LothMapaDrawBar";
import LothPredioPanel from "./LothPredioPanel";
import { evaluarPlano } from "@/lib/forestal/loth-plano-checklist";
import LothMapaToolbar from "./LothMapaToolbar";
import LothVerticesPanel from "./LothVerticesPanel";
import {
  toGeo,
  toCenso,
  CENSO_ESTADO_COLOR,
  CENSO_ESTADO_LABEL,
  PARCELA_COLOR,
  SECTION_COLOR,
  SECTION_LABEL,
  type CensusTreeDTO,
} from "./loth-mapa-shared";

/** El canvas re-monta capas por efecto: memo evita repintarlo al mover el mouse. */
const LothMapaCanvas = memo(LothMapaCanvasRaw);
const EudrRail = memo(LothEudrRail);

/** Mapeo de la base en pantalla → base de la lámina impresa. */
const PRINT_BASEMAP: Record<BasemapId, PlanoBasemap> = { topo: "topo", sat: "satelite", street: "calles" };

interface ActivePlan {
  id: string;
  areaHa: number | null;
  parcelaCorta: string | null;
  titularName: string | null;
  planNumber: string | null;
  tituloHabilitante: string | null;
  resolucionNumber: string | null;
  arffs: string | null;
  region: string | null;
}
interface Caratula {
  id: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  titularName: string | null;
  tituloHabilitante: string | null;
}

function toOps(entries: LothEntryDTO[]): OpForEudr[] {
  return entries.map((e) => ({
    section: e.section,
    lat: e.gpsLat != null ? Number(e.gpsLat) : null,
    lng: e.gpsLng != null ? Number(e.gpsLng) : null,
    cites: e.cites,
    status: e.status,
  }));
}

export default function LothMapaView() {
  const { confirm } = useConfirm();
  const [raw, setRaw] = useState<LothEntryDTO[] | null>(null);
  const [trees, setTrees] = useState<CensusTreeDTO[]>([]);
  /** Especies autorizadas + parámetros del POA: pintan el censo por categoría. */
  const [planSpecies, setPlanSpecies] = useState<{ speciesCommon: string; volumenAutorizadoM3: string | number; arbolesAutorizados: number | null }[]>([]);
  const [poaConfig, setPoaConfig] = useState<PoaConfig>(defaultPoaConfig());
  const [parcela, setParcela] = useState<LothParcela>(emptyParcela());
  const [plan, setPlan] = useState<ActivePlan | null>(null);
  const [caratula, setCaratula] = useState<Caratula | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);

  const [basemap, setBasemap] = useState<BasemapId>("topo");
  const [showGrid, setShowGrid] = useState(true);
  const [showCenso, setShowCenso] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const [metersPerPixel, setMetersPerPixel] = useState(30);

  // Dibujo de la parcela (sin leaflet-draw: click en el mapa = vértice).
  /**
   * Qué polígono se está dibujando: el área declarada o el contorno del predio.
   * El borrador, los vértices arrastrables y la barra son los MISMOS — lo único
   * que cambia es dónde se guarda al confirmar.
   */
  const [drawTarget, setDrawTarget] = useState<"area" | "predio">("area");
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  /** A dónde van los vértices que se peguen: al área declarada o al predio. */
  const [coordsOpen, setCoordsOpen] = useState<null | "area" | "predio">(null);

  // Contexto del plano: referencias del territorio + cuadro de acceso.
  const [carto, setCarto] = useState<LothCartografia>(emptyCartografia());
  const [markMode, setMarkMode] = useState(false);
  const [savingCarto, setSavingCarto] = useState(false);
  const [overlays, setOverlays] = useState<OverlayId[]>([]);
  /** Traza en curso del modo "dibujar vía" (null = inactivo). */
  const [viaDraft, setViaDraft] = useState<LatLng[] | null>(null);
  const [campoActivo, setCampoActivo] = useState(false);
  const [posicion, setPosicion] = useState<PosicionCampo | null>(null);
  /** Pedido de centrado: el canvas lo consume por `fitKey`-style. */
  const [centrarEn, setCentrarEn] = useState<{ p: LatLng; n: number } | null>(null);

  // Caja de herramientas: cinta métrica, comparador histórico y pantalla completa.
  const [medicion, setMedicion] = useState<LatLng[] | null>(null);
  const [medicionModo, setMedicionModo] = useState<ModoMedicion>("distancia");
  const [releases, setReleases] = useState<WaybackRelease[]>([]);
  const [cargandoReleases, setCargandoReleases] = useState(true);
  const [wayback, setWayback] = useState<WaybackRelease | null>(null);
  const [waybackSplit, setWaybackSplit] = useState(50);
  const [fullscreen, setFullscreen] = useState(false);
  const [fajaAnchoM, setFajaAnchoM] = useState(0);
  const [perfil, setPerfil] = useState<PerfilElevacion | null>(null);
  const [perfilCargando, setPerfilCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  /** bbox visible del mapa — lo necesita la descarga en PNG. */
  const [vista, setVista] = useState<{ latMin: number; latMax: number; lngMin: number; lngMax: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eRes, pRes, plRes, cRes, gRes] = await Promise.all([
        fetch("/api/admin/forestal/loth?limit=500&includeAnnulled=1", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/parcela", { credentials: "include" }),
        fetch("/api/admin/forestal/plan?active=1", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/caratula", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/cartografia", { credentials: "include" }),
      ]);
      if (!eRes.ok) throw new Error((await eRes.json().catch(() => ({}))).message ?? `HTTP ${eRes.status}`);
      setRaw((await eRes.json()).entries ?? []);
      if (pRes.ok) setParcela(normalizeParcela((await pRes.json()).parcela));
      if (gRes.ok) setCarto(normalizeCartografia((await gRes.json()).cartografia));
      if (cRes.ok) {
        const active = (await cRes.json()).active;
        setCaratula(
          active
            ? {
                id: active.id ?? null,
                departamento: active.departamento ?? null,
                provincia: active.provincia ?? null,
                distrito: active.distrito ?? null,
                titularName: active.titularName ?? null,
                tituloHabilitante: active.tituloHabilitante ?? null,
              }
            : null,
        );
      }
      if (plRes.ok) {
        const a = (await plRes.json()).active;
        setPlan(
          a
            ? {
                id: a.id,
                areaHa: a.areaHa != null ? Number(a.areaHa) : null,
                parcelaCorta: a.parcelaCorta ?? null,
                titularName: a.titularName ?? null,
                planNumber: a.planNumber ?? null,
                tituloHabilitante: a.tituloHabilitante ?? null,
                resolucionNumber: a.resolucionNumber ?? null,
                arffs: a.arffs ?? null,
                region: a.region ?? null,
              }
            : null,
        );
        // El censo y el POA cuelgan del plan activo: se piden en cascada (no
        // bloquean el primer render del mapa).
        if (a?.id) {
          const pid = encodeURIComponent(a.id);
          const [tRes, sRes, poaRes] = await Promise.all([
            fetch(`/api/admin/forestal/plan/census?planId=${pid}`, { credentials: "include" }),
            fetch(`/api/admin/forestal/plan?planId=${pid}`, { credentials: "include" }),
            fetch(`/api/admin/forestal/loth/poa?planId=${pid}`, { credentials: "include" }),
          ]);
          if (tRes.ok) setTrees((await tRes.json()).trees ?? []);
          if (sRes.ok) setPlanSpecies((await sRes.json()).species ?? []);
          if (poaRes.ok) setPoaConfig((await poaRes.json()).config ?? defaultPoaConfig());
        }
      }
      setFitKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Catálogo de imágenes históricas (Esri Wayback). Si el servicio no responde,
  // la herramienta queda deshabilitada y el mapa sigue funcionando igual.
  useEffect(() => {
    const ac = new AbortController();
    cargarWaybackReleases(ac.signal)
      .then(setReleases)
      .finally(() => setCargandoReleases(false));
    return () => ac.abort();
  }, []);

  const geoAll = useMemo(() => (raw ? toGeo(raw) : []), [raw]);
  const censoBase = useMemo(() => toCenso(trees), [trees]);
  /**
   * El mapa pinta cada árbol por su categoría del POA (aprovechable, semillero,
   * bajo DMC): el mismo criterio legal que el cuadro del Plan de Manejo, para
   * que en campo se vea de un golpe qué se puede tumbar.
   */
  const censoAll = useMemo(() => {
    if (censoBase.length === 0) return censoBase;
    const analisis = analizarPoa({
      trees: censoBase.map((t) => ({
        id: t.id,
        treeCode: t.code,
        speciesCommon: t.species,
        // El censo del mapa guarda el DAP sólo si vino en el DTO original.
        dapM: t.dapM,
        volumenEstimadoM3: t.volumeM3,
        estado: t.estado,
      })),
      species: planSpecies.map((s) => ({
        speciesCommon: s.speciesCommon,
        volumenAutorizadoM3: Number(s.volumenAutorizadoM3 ?? 0),
        arbolesAutorizados: s.arbolesAutorizados,
      })),
      areaHa: plan?.areaHa ?? null,
      config: poaConfig,
    });
    const cat = new Map(analisis.arboles.map((a) => [a.id, a.categoria]));
    return censoBase.map((t) => ({ ...t, categoria: cat.get(t.id) }));
  }, [censoBase, planSpecies, plan, poaConfig]);
  const censoShown = useMemo(() => (showCenso ? censoAll : []), [showCenso, censoAll]);
  const sectionsPresent = useMemo(() => Array.from(new Set(geoAll.map((g) => g.section))), [geoAll]);
  const geoShown = useMemo(() => geoAll.filter((g) => !hidden.has(g.section)), [geoAll, hidden]);
  const readiness = useMemo(() => computeEudrReadiness(raw ? toOps(raw) : [], parcela), [raw, parcela]);
  const declarada = hasParcela(parcela);
  const draftAreaHa = draft.length >= 3 ? polygonAreaHa(draft) : 0;
  const center = useMemo<LatLng>(() => [BRAND_GEO.lat, BRAND_GEO.lng], []);

  /** Entradas de leyenda del censo: por categoría POA si la hay, si no por estado. */
  const censoCategorias = useMemo(() => {
    const out = new Map<string, { cat?: (typeof censoAll)[number]["categoria"]; estado: string }>();
    for (const t of censoAll) out.set(t.categoria ?? `estado:${t.estado}`, { cat: t.categoria, estado: t.estado });
    return [...out.values()];
  }, [censoAll]);
  const legendItems = useMemo<LegendItem[]>(
    () => [
      ...(declarada ? [{ label: "Área de aprovechamiento", color: PARCELA_COLOR, shape: "poly" as const }] : []),
      ...(showCenso
        ? censoCategorias.map((c) =>
            c.cat
              ? { label: `Censo · ${CATEGORIA_LABEL[c.cat]}`, color: CATEGORIA_COLOR[c.cat], shape: "tree" as const }
              : { label: `Censo · ${CENSO_ESTADO_LABEL[c.estado] ?? c.estado}`, color: CENSO_ESTADO_COLOR[c.estado] ?? "#15803d", shape: "tree" as const },
          )
        : []),
      ...sectionsPresent
        .filter((s) => !hidden.has(s))
        .map((s) => ({ label: SECTION_LABEL[s] ?? s, color: SECTION_COLOR[s] ?? "#334155", shape: "dot" as const })),
      ...[...new Map(carto.vias.map((v) => [viaMeta(v.tipo).label, viaMeta(v.tipo).color])).entries()].map(([label, color]) => ({
        label,
        color,
        shape: "line" as const,
      })),
      ...(showGrid ? [{ label: "Cuadrícula UTM (WGS 84)", color: "#64748b", shape: "grid" as const }] : []),
    ],
    [declarada, showCenso, censoCategorias, sectionsPresent, hidden, showGrid, carto.vias],
  );

  // ── Persistencia de la parcela ─────────────────────────────────────────────
  const persistParcela = useCallback(
    async (next: { vertices: LatLng[]; nota: string; deforestacionCero: boolean }) => {
      setSaving(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/parcela", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(next),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
        setParcela(normalizeParcela((await r.json()).parcela));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const startDraw = useCallback(() => {
    setDrawTarget("area");
    setDraft(parcela.vertices.slice());
    setDrawMode(true);
  }, [parcela.vertices]);
  /** Levantar el contorno del predio a mano (o corregir el que ya está). */
  const startDrawPredio = useCallback(() => {
    setDrawTarget("predio");
    setDraft(carto.predio.vertices.slice());
    setDrawMode(true);
  }, [carto.predio.vertices]);
  const cancelDraw = () => {
    setDrawMode(false);
    setDraft([]);
  };
  const saveDraw = async () => {
    if (draft.length < 3) return;
    if (drawTarget === "predio") {
      // El predio vive en la cartografía: se guarda ahí y se persiste en el
      // mismo PUT que las referencias y las vías.
      const siguiente = { ...carto, predio: { ...carto.predio, vertices: draft } };
      setCarto(siguiente);
      await guardarCartografia(siguiente);
    } else {
      await persistParcela({ vertices: draft, nota: parcela.nota, deforestacionCero: parcela.deforestacionCero });
    }
    setDrawMode(false);
    setDraft([]);
  };
  const clearParcela = useCallback(async () => {
    // El polígono sostiene el área declarada, el cross-check del POA y el DDS
    // de EUDR: borrarlo no es un "ok" al pasar, va con el diálogo del DS.
    const ok = await confirm({
      title: "¿Borrar el polígono del área de aprovechamiento?",
      description: "Se pierden los vértices dibujados y con ellos el área calculada, el cross-check contra el POA y la geometría del expediente EUDR. Vas a tener que volver a dibujarlo o importarlo.",
      intent: "danger",
      confirmLabel: "Sí, borrar el polígono",
    });
    if (!ok) return;
    await persistParcela({ vertices: [], nota: "", deforestacionCero: false });
  }, [persistParcela, confirm]);
  const toggleDeforestacion = useCallback(
    (v: boolean) => persistParcela({ vertices: parcela.vertices, nota: parcela.nota, deforestacionCero: v }),
    [persistParcela, parcela.vertices, parcela.nota],
  );

  /** Envolvente del censo + franja de 60 m: polígono de arranque, editable a mano. */
  const envolverCenso = () => {
    if (censoAll.length === 0) return;
    const ring = hullBuffer(censoAll.map((t): LatLng => [t.lat, t.lng]), 60);
    if (ring.length >= 3) setDraft(ring);
  };

  const addVertex = useCallback((v: LatLng) => setDraft((d) => [...d, v]), []);
  const moveVertex = useCallback(
    (i: number, v: LatLng) => setDraft((d) => d.map((old, idx) => (idx === i ? v : old))),
    [],
  );
  const deleteVertex = useCallback((i: number) => setDraft((d) => d.filter((_, idx) => idx !== i)), []);
  const insertVertex = useCallback(
    (i: number, v: LatLng) => setDraft((d) => [...d.slice(0, i), v, ...d.slice(i)]),
    [],
  );
  const toggleSection = useCallback(
    (s: string) =>
      setHidden((h) => {
        const n = new Set(h);
        if (n.has(s)) n.delete(s);
        else n.add(s);
        return n;
      }),
    [],
  );
  /** Marca una referencia donde el usuario tocó (se renombra en el panel). */
  const marcarReferencia = useCallback((v: LatLng) => {
    setCarto((c) => ({
      ...c,
      referencias: [
        ...c.referencias,
        {
          id: `ref-${c.referencias.length + 1}-${c.referencias.length}`,
          nombre: `Referencia ${c.referencias.length + 1}`,
          tipo: "centro_poblado" as const,
          lat: v[0],
          lng: v[1],
          nota: "",
        },
      ],
    }));
    setMarkMode(false);
  }, []);

  const centrar = useCallback((p: LatLng) => setCentrarEn((c) => ({ p, n: (c?.n ?? 0) + 1 })), []);

  const addMedicionPunto = useCallback((v: LatLng) => setMedicion((m) => [...(m ?? []), v]), []);
  /** Salta a la última imagen anterior al corte EUDR (31-dic-2020). */
  const verCorteEudr = () => {
    const r = releaseParaFecha(releases, EUDR_CUTOFF);
    if (r) setWayback(r);
  };

  /** Perfil de terreno de la traza que se esté midiendo. */
  const verPerfil = async () => {
    const traza = medicion ?? [];
    if (traza.length < 2) return;
    setPerfilCargando(true);
    setError(null);
    try {
      const muestras = muestrearTraza(traza, 60);
      const elevaciones = await cargarElevaciones(muestras);
      if (elevaciones.length === 0) {
        setError("El servicio de altitudes no respondió. Probá de nuevo en un momento.");
        return;
      }
      setPerfil(construirPerfil(muestras, elevaciones));
    } finally {
      setPerfilCargando(false);
    }
  };

  /** PNG de la vista actual con el polígono, el censo y las referencias. */
  const descargarPng = async () => {
    if (!vista) return;
    setDescargando(true);
    setError(null);
    try {
      const BASE_PNG: Record<BasemapId, ImagenBase> = { topo: "topo", sat: "sat", street: "street" };
      await descargarImagenMapa({
        bounds: vista,
        ancho: 1400,
        alto: Math.round((1400 * 560) / 912),
        base: BASE_PNG[basemap],
        parcela: parcela.vertices,
        lineas: carto.vias.map((v) => ({ puntos: v.puntos, color: viaMeta(v.tipo).color, dash: !!viaMeta(v.tipo).dash })),
        puntos: [
          ...censoShown.map((t) => ({
            lat: t.lat,
            lng: t.lng,
            color: t.categoria ? CATEGORIA_COLOR[t.categoria] : "#15803d",
            label: t.code,
            forma: "triangulo" as const,
          })),
          ...geoShown.map((g) => ({ lat: g.lat, lng: g.lng, color: SECTION_COLOR[g.section] ?? "#334155", label: g.code })),
          ...carto.referencias.map((r) => ({ lat: r.lat, lng: r.lng, color: referenciaMeta(r.tipo).color, label: r.nombre })),
        ],
        titulo: `Área de aprovechamiento${plan?.parcelaCorta ? ` · ${plan.parcelaCorta}` : ""}`,
        fecha: new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDescargando(false);
    }
  };

  const addViaPoint = useCallback((v: LatLng) => setViaDraft((d) => [...(d ?? []), v]), []);
  const toggleOverlay = useCallback(
    (id: OverlayId) => setOverlays((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id])),
    [],
  );

  /** Cierra el trazado y suma la vía a la cartografía (se nombra en el panel). */
  const terminarVia = () => {
    const pts = viaDraft ?? [];
    if (pts.length >= 2) {
      setCarto((c) => ({
        ...c,
        vias: [
          ...c.vias,
          { id: `via-${c.vias.length + 1}-${c.vias.length}`, nombre: `Vía ${c.vias.length + 1}`, tipo: "acceso" as const, puntos: pts },
        ],
      }));
    }
    setViaDraft(null);
  };

  /**
   * `siguiente` permite guardar un estado recién armado sin esperar al re-render
   * (lo usa el guardado del dibujo del predio).
   *
   * El cuerpo se arma con TODOS los campos y no con una lista escrita a mano:
   * cuando era `{referencias, vias, accesos, nota}` el predio se perdía en cada
   * guardado —el PUT reemplaza el documento entero— y sin un solo error.
   */
  const guardarCartografia = useCallback(async (siguiente?: LothCartografia) => {
    const cuerpo = siguiente ?? carto;
    setSavingCarto(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/cartografia", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          referencias: cuerpo.referencias,
          vias: cuerpo.vias,
          accesos: cuerpo.accesos,
          predio: cuerpo.predio,
          nota: cuerpo.nota,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setCarto(normalizeCartografia((await r.json()).cartografia));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCarto(false);
    }
  }, [carto]);

  const onCursor = useCallback((p: LatLng | null) => setCursor(p), []);
  const onView = useCallback((v: { metersPerPixel: number; bounds?: { latMin: number; latMax: number; lngMin: number; lngMax: number } }) => {
    setMetersPerPixel(v.metersPerPixel);
    if (v.bounds) setVista(v.bounds);
  }, []);

  // ── Exports ────────────────────────────────────────────────────────────────
  const doExportGeoJson = useCallback(() => {
    const points: EudrPoint[] = geoAll.map((g) => ({
      lat: g.lat,
      lng: g.lng,
      section: g.section,
      code: g.code,
      species: g.species,
      cites: g.cites,
      volumeM3: g.volumeM3,
      date: g.date,
    }));
    const fc = buildEudrGeoJson({ parcela, points, titular: plan?.titularName, titulo: plan?.planNumber });
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dds-eudr-libro-th.geojson";
    a.click();
    URL.revokeObjectURL(url);
  }, [geoAll, parcela, plan]);

  const doPrintDds = useCallback(() => {
    printLothEudrDds().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  /** Descarga genérica de un texto como archivo (KML / GeoJSON). */
  const download = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** KML del área + censo + operaciones — para abrirlo en Google Earth. */
  const doExportKml = () => {
    const kml = buildKml({
      ring: parcela.vertices,
      name: `Área de aprovechamiento${plan?.parcelaCorta ? ` · ${plan.parcelaCorta}` : ""}`,
      description: [plan?.titularName, plan?.tituloHabilitante, plan?.planNumber].filter(Boolean).join(" · "),
      points: [
        ...censoAll.map((t) => ({
          lat: t.lat,
          lng: t.lng,
          name: t.code,
          description: `Censo · ${t.species}${t.volumeM3 != null ? ` · ${t.volumeM3.toFixed(4)} m³` : ""}`,
        })),
        ...geoAll.map((g) => ({
          lat: g.lat,
          lng: g.lng,
          name: g.code,
          description: `${SECTION_LABEL[g.section] ?? g.section}${g.species ? ` · ${g.species}` : ""}`,
        })),
      ],
    });
    download(kml, "area-aprovechamiento.kml", "application/vnd.google-earth.kml+xml");
  };

  /** Zona UTM sugerida al importar: la del polígono o la del censo. */
  const zonaSugerida = useMemo(() => {
    const ref = parcela.vertices.length ? parcela.vertices : censoAll.map((t): LatLng => [t.lat, t.lng]);
    if (ref.length === 0) return "18L";
    return zoneLabel(dominantZone(ref), ref[0][0] < 0);
  }, [parcela.vertices, censoAll]);

  const planoBase = () => ({
    parcela: parcela.vertices,
    predio: carto.predio.vertices,
    predioMeta: { nombre: carto.predio.nombre, sector: carto.predio.sector, comunidad: carto.predio.comunidad },
    puntos: geoShown.map((g) => ({
      lat: g.lat,
      lng: g.lng,
      label: g.code,
      seccionLabel: SECTION_LABEL[g.section] ?? g.section,
      color: SECTION_COLOR[g.section] ?? "#334155",
    })),
    censo: censoShown.map((t) => ({ lat: t.lat, lng: t.lng, code: t.code, species: t.species, estado: t.estado })),
    basemap: PRINT_BASEMAP[basemap],
    referencias: carto.referencias.map((r) => {
      const m = referenciaMeta(r.tipo);
      return { lat: r.lat, lng: r.lng, nombre: r.nombre, tipoLabel: m.label, color: m.color };
    }),
    vias: carto.vias.map((v) => {
      const m = viaMeta(v.tipo);
      return { nombre: v.nombre, tipoLabel: m.label, color: m.color, dash: m.dash, puntos: v.puntos };
    }),
    accesos: carto.accesos.map((a) => ({ lugar: a.lugar, tiempo: a.tiempo, movilidad: a.movilidad })),
    overlays: OVERLAYS.filter((o) => overlays.includes(o.id)).map((o) => ({
      label: o.label,
      fuente: o.fuente,
      url: o.url,
      opacity: o.opacity,
      color: o.color,
    })),
    meta: {
      titulo: "Plano de ubicación del área de aprovechamiento",
      mapaNumero: "1",
      sector: parcela.nota || plan?.parcelaCorta || null,
      distrito: caratula?.distrito ?? null,
      provincia: caratula?.provincia ?? null,
      departamento: caratula?.departamento ?? plan?.region ?? null,
      titular: plan?.titularName ?? caratula?.titularName ?? null,
      tituloHabilitante: plan?.tituloHabilitante ?? caratula?.tituloHabilitante ?? null,
      planNumber: plan?.planNumber ?? null,
      resolucion: plan?.resolucionNumber ?? null,
      arffs: plan?.arffs ?? null,
      parcelaCorta: plan?.parcelaCorta ?? null,
      areaAutorizadaHa: plan?.areaHa ?? null,
      elaboradoPor: plan?.titularName ?? null,
      fuente: "Esri World Topo/Imagery · censo forestal y GPS de campo del Libro de Operaciones",
    },
  });

  /** Mapa 2: dispersión del censo + referencias + cuadro de acceso. */
  const doPrintDispersion = () => {
    try {
      const base = planoBase();
      printLothPlano({
        ...base,
        variante: "dispersion",
        meta: {
          ...base.meta,
          titulo: "Plano de dispersión y accesos de la UMF",
          mapaNumero: "2",
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /**
   * El checklist del plano, vivo: lo lee el panel del predio y también el
   * camino de impresión, así que los dos dicen lo mismo.
   */
  const checkPlano = useMemo(
    () =>
      evaluarPlano({
        parcela,
        cartografia: carto,
        ubicacion: {
          distrito: caratula?.distrito ?? null,
          provincia: caratula?.provincia ?? null,
          departamento: caratula?.departamento ?? plan?.region ?? null,
        },
        zonaUtm: zonaSugerida,
      }),
    [parcela, carto, caratula, plan, zonaSugerida],
  );

  const doPrintPlano = async () => {
    // Avisa, no bloquea: un plano borrador sirve para trabajar. Lo que no puede
    // pasar es imprimir para el expediente sin saber que le falta algo — que es
    // exactamente de lo que vuelve de mesa de partes.
    if (checkPlano.pendientes.length > 0) {
      const ok = await confirm({
        title: `Al plano le faltan ${checkPlano.pendientes.length} requisito(s)`,
        description: `Falta: ${checkPlano.pendientes.map((r) => r.label).join(" · ")}. Se puede imprimir igual como borrador de trabajo, pero así NO conviene presentarlo.`,
        intent: "warning",
        confirmLabel: "Imprimir igual",
        cancelLabel: "Volver a completarlo",
      });
      if (!ok) return;
    }
    try {
      printLothPlano(planoBase());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const totalPuntos = geoAll.length + censoAll.length;

  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Columna mapa */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--text-tertiary)]">
              {loading && raw === null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando ubicaciones…
                </span>
              ) : (
                <>
                  <b className="font-mono tabular-nums text-[var(--text-secondary)]">{geoAll.length}</b> operación(es) geolocalizada(s)
                  {censoAll.length > 0 && (
                    <>
                      {" · "}
                      <b className="font-mono tabular-nums text-[var(--text-secondary)]">{censoAll.length}</b> árbol(es) del censo
                    </>
                  )}
                  {declarada && (
                    <>
                      {" · parcela "}
                      <b className="text-[var(--text-secondary)]">{readiness.areaHa.toFixed(1)} ha</b>
                    </>
                  )}
                  {declarada && readiness.fuera > 0 && <span className="text-[var(--data-error-700)]"> · {readiness.fuera} fuera</span>}
                </>
              )}
            </p>
            <LothMapaToolbar
              basemap={basemap}
              onBasemap={setBasemap}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((v) => !v)}
              censoCount={censoAll.length}
              showCenso={showCenso}
              onToggleCenso={() => setShowCenso((v) => !v)}
              sections={sectionsPresent}
              hidden={hidden}
              onToggleSection={toggleSection}
              overlays={overlays}
              onToggleOverlay={toggleOverlay}
              drawingVia={viaDraft !== null}
              onDrawVia={() => (viaDraft === null ? setViaDraft([]) : terminarVia())}
            />
          </div>

          <LothCaratulaBanner
            caratula={
              caratula
                ? {
                    id: caratula.id,
                    titularName: caratula.titularName,
                    departamento: caratula.departamento,
                    provincia: caratula.provincia,
                    distrito: caratula.distrito,
                  }
                : null
            }
            titularSugerido={plan?.titularName ?? null}
            onSaved={(c: CaratulaUbicacion) =>
              setCaratula({
                id: c.id,
                departamento: c.departamento,
                provincia: c.provincia,
                distrito: c.distrito,
                titularName: c.titularName,
                tituloHabilitante: caratula?.tituloHabilitante ?? null,
              })
            }
          />

          <LothCampoBar
            activo={campoActivo}
            posicion={posicion}
            parcela={parcela.vertices}
            declarada={declarada}
            onToggle={() => setCampoActivo((v) => !v)}
            onPosicion={setPosicion}
            onMarcarAqui={marcarReferencia}
            onCentrar={centrar}
          />

          <LothMapaHerramientas
            medicion={medicion}
            medicionModo={medicionModo}
            onMedicion={setMedicion}
            onMedicionModo={setMedicionModo}
            releases={releases}
            cargandoReleases={cargandoReleases}
            wayback={wayback}
            onWayback={setWayback}
            waybackSplit={waybackSplit}
            onWaybackSplit={setWaybackSplit}
            onWaybackCorteEudr={verCorteEudr}
            onIrA={(p) => centrar(p)}
            fullscreen={fullscreen}
            onFullscreen={() => setFullscreen((v) => !v)}
            zonaDefault={zonaSugerida}
            fajaAnchoM={fajaAnchoM}
            onFajaAncho={setFajaAnchoM}
            cauces={carto.vias.filter((v) => v.tipo === "rio").length}
            arbolesEnFaja={
              fajaAnchoM > 0
                ? carto.vias
                    .filter((v) => v.tipo === "rio")
                    .reduce((total, v) => total + arbolesEnFaja(censoAll, v.puntos, fajaAnchoM).length, 0)
                : 0
            }
            perfil={perfil}
            perfilCargando={perfilCargando}
            onPerfil={verPerfil}
            onCerrarPerfil={() => setPerfil(null)}
            descargando={descargando}
            onDescargarImagen={descargarPng}
          />

          {error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div
            className={
              fullscreen
                ? "fixed inset-3 z-[55] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
                : "relative h-[560px] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]"
            }
          >
            <LothMapaCanvas
              geo={geoShown}
              censo={censoShown}
              predio={carto.predio.vertices}
              referencias={carto.referencias}
              markMode={markMode}
              onMarkReferencia={marcarReferencia}
              vias={carto.vias}
              viaDraft={viaDraft}
              onViaPoint={addViaPoint}
              overlays={overlays}
              posicion={posicion}
              wayback={wayback}
              waybackSplit={waybackSplit}
              medicion={medicion}
              medicionModo={medicionModo}
              onMedicionPunto={addMedicionPunto}
              fullscreen={fullscreen}
              fajaAnchoM={fajaAnchoM}
              centrarEn={centrarEn}
              parcela={parcela.vertices}
              declarada={declarada}
              draft={draft}
              drawMode={drawMode}
              drawTarget={drawTarget}
              basemap={basemap}
              showGrid={showGrid}
              center={center}
              fitKey={fitKey}
              onAddVertex={addVertex}
              onMoveVertex={moveVertex}
              onDeleteVertex={deleteVertex}
              onInsertVertex={insertVertex}
              onCursor={onCursor}
              onView={onView}
            />
            <LothMapaChrome items={legendItems} cursor={cursor} metersPerPixel={metersPerPixel} />

            {drawMode && (
              <LothMapaDrawBar
                target={drawTarget}
                count={draft.length}
                areaHa={draftAreaHa}
                saving={saving}
                canWrapCenso={censoAll.length > 0}
                onWrapCenso={envolverCenso}
                onImportCoords={() => setCoordsOpen("area")}
                onUndo={() => setDraft((d) => d.slice(0, -1))}
                onSave={saveDraw}
                onCancel={cancelDraw}
              />
            )}

            {viaDraft !== null && (
              <div className="absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[#a21caf] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-lg backdrop-blur">
                <Route className="h-4 w-4 text-[#a21caf]" />
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  Tocá el mapa para trazar la vía · <b className="font-mono tabular-nums">{viaDraft.length}</b> punto(s)
                  {viaDraft.length >= 2 && (
                    <span className="text-[var(--text-tertiary)]"> · {formatDistance(lineLengthM(viaDraft))}</span>
                  )}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViaDraft((d) => (d ? d.slice(0, -1) : d))}
                    disabled={viaDraft.length === 0}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Deshacer
                  </button>
                  <button
                    type="button"
                    onClick={terminarVia}
                    disabled={viaDraft.length < 2}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#a21caf] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" /> Terminar vía
                  </button>
                  <button
                    type="button"
                    onClick={() => setViaDraft(null)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
                  >
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Estado vacío */}
            {raw !== null && totalPuntos === 0 && !declarada && !drawMode && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
                <div className="pointer-events-auto max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-5 text-center shadow-lg backdrop-blur">
                  <MapPin className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">Todavía no hay geolocalización</p>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Dibujá la <b>parcela de aprovechamiento</b> (botón en la cabina EUDR), cargá el <b>censo</b> con sus coordenadas UTM y
                    capturá el <b>GPS</b> al registrar cada tala. Los tres alimentan el plano y el cumplimiento EUDR.
                  </p>
                </div>
              </div>
            )}
          </div>

          <p className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <Camera className="h-3.5 w-3.5" /> Tocá un punto para ver su coordenada UTM, la especie y la foto de campo.
          </p>
        </div>

        {/* Cabina EUDR */}
        <EudrRail
          readiness={readiness}
          parcela={parcela}
          planAreaHa={plan?.areaHa ?? null}
          planParcelaCorta={plan?.parcelaCorta ?? null}
          drawMode={drawMode}
          saving={saving}
          onStartDraw={startDraw}
          onClearParcela={clearParcela}
          onToggleDeforestacion={toggleDeforestacion}
          onExportGeoJson={doExportGeoJson}
          onPrintDds={doPrintDds}
        />
      </div>

      {/* Cuadro de coordenadas UTM + plano oficial */}
      <LothVerticesPanel
        vertices={drawMode && draft.length >= 3 ? draft : parcela.vertices}
        censoCount={censoAll.length}
        onPrintPlano={doPrintPlano}
        onExportKml={doExportKml}
        onImportCoords={() => {
          if (!drawMode) startDraw();
          setCoordsOpen("area");
        }}
      />

      <LothPredioPanel
        check={checkPlano}
        cartografia={carto}
        parcela={parcela}
        saving={savingCarto}
        onChange={setCarto}
        onSave={guardarCartografia}
        onDibujarPredio={startDrawPredio}
        onImportPredio={() => setCoordsOpen("predio")}
        onCopiarDelArea={() => setCarto((c) => ({ ...c, predio: { ...c.predio, vertices: parcela.vertices } }))}
      />

      <LothContextoPanel
        cartografia={carto}
        markMode={markMode}
        saving={savingCarto}
        onChange={setCarto}
        onSave={guardarCartografia}
        onToggleMark={() => setMarkMode((v) => !v)}
        onPrintDispersion={doPrintDispersion}
      />

      <LothCoordsModal
        open={coordsOpen !== null}
        zonaDefault={zonaSugerida}
        onClose={() => setCoordsOpen(null)}
        onApply={(vertices) => {
          if (coordsOpen === "predio") {
            // El predio se guarda derecho: no pasa por el borrador del área,
            // que tiene su propio flujo de dibujo y confirmación.
            setCarto((c) => ({ ...c, predio: { ...c.predio, vertices } }));
            return;
          }
          if (!drawMode) setDrawMode(true);
          setDraft(vertices);
        }}
      />
    </div>
  );
}
