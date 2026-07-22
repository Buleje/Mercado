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
import { MapPin, Loader2, Camera } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";
import { csrfHeaders } from "@/lib/csrf-client";
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
import { dominantZone, hullBuffer, zoneLabel } from "@/lib/forestal/loth-utm";
import { buildKml } from "@/lib/forestal/loth-coords-io";
import {
  emptyCartografia,
  normalizeCartografia,
  referenciaMeta,
  type LothCartografia,
} from "@/lib/forestal/loth-cartografia";
import { printLothPlano, type PlanoBasemap } from "@/lib/forestal/loth-plano-print";
import { printLothEudrDds } from "@/lib/forestal/loth-eudr-print";
import LothEudrRail from "./LothEudrRail";
import LothMapaCanvasRaw, { type BasemapId } from "./LothMapaCanvas";
import LothMapaChrome, { type LegendItem } from "./LothMapaChrome";
import LothContextoPanel from "./LothContextoPanel";
import LothCoordsModal from "./LothCoordsModal";
import LothMapaDrawBar from "./LothMapaDrawBar";
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
  const [raw, setRaw] = useState<LothEntryDTO[] | null>(null);
  const [trees, setTrees] = useState<CensusTreeDTO[]>([]);
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
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  const [coordsOpen, setCoordsOpen] = useState(false);

  // Contexto del plano: referencias del territorio + cuadro de acceso.
  const [carto, setCarto] = useState<LothCartografia>(emptyCartografia());
  const [markMode, setMarkMode] = useState(false);
  const [savingCarto, setSavingCarto] = useState(false);

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
        // El censo cuelga del plan activo: se pide en cascada (no bloquea el mapa).
        if (a?.id) {
          const tRes = await fetch(`/api/admin/forestal/plan/census?planId=${encodeURIComponent(a.id)}`, { credentials: "include" });
          if (tRes.ok) setTrees((await tRes.json()).trees ?? []);
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

  const geoAll = useMemo(() => (raw ? toGeo(raw) : []), [raw]);
  const censoAll = useMemo(() => toCenso(trees), [trees]);
  const censoShown = useMemo(() => (showCenso ? censoAll : []), [showCenso, censoAll]);
  const sectionsPresent = useMemo(() => Array.from(new Set(geoAll.map((g) => g.section))), [geoAll]);
  const geoShown = useMemo(() => geoAll.filter((g) => !hidden.has(g.section)), [geoAll, hidden]);
  const readiness = useMemo(() => computeEudrReadiness(raw ? toOps(raw) : [], parcela), [raw, parcela]);
  const declarada = hasParcela(parcela);
  const draftAreaHa = draft.length >= 3 ? polygonAreaHa(draft) : 0;
  const center = useMemo<LatLng>(() => [BRAND_GEO.lat, BRAND_GEO.lng], []);

  const censoEstados = useMemo(() => Array.from(new Set(censoAll.map((t) => t.estado))), [censoAll]);
  const legendItems = useMemo<LegendItem[]>(
    () => [
      ...(declarada ? [{ label: "Área de aprovechamiento", color: PARCELA_COLOR, shape: "poly" as const }] : []),
      ...(showCenso
        ? censoEstados.map((e) => ({
            label: `Censo · ${CENSO_ESTADO_LABEL[e] ?? e}`,
            color: CENSO_ESTADO_COLOR[e] ?? "#15803d",
            shape: "tree" as const,
          }))
        : []),
      ...sectionsPresent
        .filter((s) => !hidden.has(s))
        .map((s) => ({ label: SECTION_LABEL[s] ?? s, color: SECTION_COLOR[s] ?? "#334155", shape: "dot" as const })),
      ...(showGrid ? [{ label: "Cuadrícula UTM (WGS 84)", color: "#64748b", shape: "grid" as const }] : []),
    ],
    [declarada, showCenso, censoEstados, sectionsPresent, hidden, showGrid],
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
    setDraft(parcela.vertices.slice());
    setDrawMode(true);
  }, [parcela.vertices]);
  const cancelDraw = () => {
    setDrawMode(false);
    setDraft([]);
  };
  const saveDraw = async () => {
    if (draft.length < 3) return;
    await persistParcela({ vertices: draft, nota: parcela.nota, deforestacionCero: parcela.deforestacionCero });
    setDrawMode(false);
    setDraft([]);
  };
  const clearParcela = useCallback(async () => {
    if (!window.confirm("¿Borrar el polígono del área de aprovechamiento?")) return;
    await persistParcela({ vertices: [], nota: "", deforestacionCero: false });
  }, [persistParcela]);
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

  const guardarCartografia = useCallback(async () => {
    setSavingCarto(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/cartografia", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ referencias: carto.referencias, accesos: carto.accesos, nota: carto.nota }),
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
  const onView = useCallback((v: { metersPerPixel: number }) => setMetersPerPixel(v.metersPerPixel), []);

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
    accesos: carto.accesos.map((a) => ({ lugar: a.lugar, tiempo: a.tiempo, movilidad: a.movilidad })),
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

  const doPrintPlano = () => {
    try {
      printLothPlano(planoBase());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const totalPuntos = geoAll.length + censoAll.length;

  return (
    <div className="space-y-4">
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
            />
          </div>

          {error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
            <LothMapaCanvas
              geo={geoShown}
              censo={censoShown}
              referencias={carto.referencias}
              markMode={markMode}
              onMarkReferencia={marcarReferencia}
              parcela={parcela.vertices}
              declarada={declarada}
              draft={draft}
              drawMode={drawMode}
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
                count={draft.length}
                areaHa={draftAreaHa}
                saving={saving}
                canWrapCenso={censoAll.length > 0}
                onWrapCenso={envolverCenso}
                onImportCoords={() => setCoordsOpen(true)}
                onUndo={() => setDraft((d) => d.slice(0, -1))}
                onSave={saveDraw}
                onCancel={cancelDraw}
              />
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
          setCoordsOpen(true);
        }}
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
        open={coordsOpen}
        zonaDefault={zonaSugerida}
        onClose={() => setCoordsOpen(false)}
        onApply={(vertices) => {
          if (!drawMode) setDrawMode(true);
          setDraft(vertices);
        }}
      />
    </div>
  );
}
