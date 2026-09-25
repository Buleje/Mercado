"use client";

/**
 * useLothMapaExportes — todo lo que SALE del mapa del Libro TH: el plano
 * oficial (Mapa 1), el de dispersión y accesos (Mapa 2), el informe EUDR, el
 * GeoJSON de la DDS, el KML para Google Earth, la imagen PNG de la vista y el
 * cuadro de coordenadas (copiar / CSV).
 *
 * Antes eran nueve botones repartidos en cuatro lugares de la pantalla (la
 * cabina EUDR, el cuadro de coordenadas, el panel de contexto y la barra de
 * herramientas). Ahora los junta el menú «Exportar» de la barra del mapa, y
 * esto es lo que cada opción hace — el mismo código que tenían los botones.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { buildEudrGeoJson, type EudrPoint, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { buildKml } from "@/lib/forestal/loth-coords-io";
import { referenciaMeta, viaMeta, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { CATEGORIA_COLOR } from "@/lib/forestal/loth-poa";
import { descargarImagenMapa, type ImagenBase } from "@/lib/forestal/loth-mapa-imagen";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { printLothPlano, type PlanoBasemap } from "@/lib/forestal/loth-plano-print";
import { printLothEudrDds } from "@/lib/forestal/loth-eudr-print";
import type { ChecklistPlano } from "@/lib/forestal/loth-plano-checklist";
import type { BasemapId } from "../LothMapaCanvas";
import { OVERLAYS, type OverlayId } from "../loth-mapa-overlays";
import { SECTION_COLOR, SECTION_LABEL, type CensoTree, type GeoEntry } from "../loth-mapa-shared";
import { cuadroDeCoordenadas, csvDeCoordenadas, descargarTexto } from "../loth-mapa-coordenadas";
import type { CaratulaMapa, PlanActivoMapa } from "./use-loth-mapa-datos";
import type { VistaMapa } from "./use-loth-mapa-herramientas";

/** Mapeo de la base en pantalla → base de la lámina impresa. */
const PRINT_BASEMAP: Record<BasemapId, PlanoBasemap> = { topo: "topo", sat: "satelite", street: "calles" };
const BASE_PNG: Record<BasemapId, ImagenBase> = { topo: "topo", sat: "sat", street: "street" };

interface Deps {
  parcela: LothParcela;
  /** Lo que muestra el cuadro de coordenadas: el borrador mientras se dibuja. */
  verticesCuadro: LatLng[];
  carto: LothCartografia;
  plan: PlanActivoMapa | null;
  caratula: CaratulaMapa | null;
  geoAll: GeoEntry[];
  geoShown: GeoEntry[];
  censoAll: CensoTree[];
  censoShown: CensoTree[];
  basemap: BasemapId;
  overlays: OverlayId[];
  vista: VistaMapa | null;
  checkPlano: ChecklistPlano;
  onError: (msg: string | null) => void;
}

const mensaje = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useLothMapaExportes(d: Deps) {
  const { parcela, verticesCuadro, carto, plan, caratula, geoAll, geoShown, censoAll, censoShown, basemap, overlays, vista, checkPlano, onError } = d;
  const { confirm } = useConfirm();
  const [descargando, setDescargando] = useState(false);
  const nombreArea = `Área de aprovechamiento${plan?.parcelaCorta ? ` · ${plan.parcelaCorta}` : ""}`;

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

  const imprimirPlano = async () => {
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
      onError(mensaje(err));
    }
  };

  /** Mapa 2: dispersión del censo + referencias + cuadro de acceso. */
  const imprimirDispersion = () => {
    try {
      const base = planoBase();
      printLothPlano({
        ...base,
        variante: "dispersion",
        meta: { ...base.meta, titulo: "Plano de dispersión y accesos de la UMF", mapaNumero: "2" },
      });
    } catch (err) {
      onError(mensaje(err));
    }
  };

  const exportarGeoJson = () => {
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
    descargarTexto(JSON.stringify(fc, null, 2), "dds-eudr-libro-th.geojson", "application/geo+json");
  };

  const imprimirDds = () => {
    printLothEudrDds().catch((err) => onError(mensaje(err)));
  };

  /** KML del área + censo + operaciones — para abrirlo en Google Earth. */
  const exportarKml = () => {
    const kml = buildKml({
      ring: parcela.vertices,
      name: nombreArea,
      description: [plan?.titularName, plan?.tituloHabilitante, plan?.planNumber].filter(Boolean).join(" · "),
      points: [
        ...censoAll.map((t) => ({
          lat: t.lat,
          lng: t.lng,
          name: t.code,
          description: `Censo · ${t.species}${t.volumeM3 != null ? ` · ${fmtM3(t.volumeM3)} m³` : ""}`,
        })),
        ...geoAll.map((g) => ({
          lat: g.lat,
          lng: g.lng,
          name: g.code,
          description: `${SECTION_LABEL[g.section] ?? g.section}${g.species ? ` · ${g.species}` : ""}`,
        })),
      ],
    });
    descargarTexto(kml, "area-aprovechamiento.kml", "application/vnd.google-earth.kml+xml");
  };

  /** PNG de la vista actual con el polígono, el censo y las referencias. */
  const descargarPng = async () => {
    if (!vista) return;
    setDescargando(true);
    onError(null);
    try {
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
        titulo: nombreArea,
        fecha: new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }),
      });
    } catch (err) {
      onError(mensaje(err));
    } finally {
      setDescargando(false);
    }
  };

  const descargarCsv = () => {
    const csv = csvDeCoordenadas(cuadroDeCoordenadas(verticesCuadro));
    descargarTexto(`﻿${csv}`, "coordenadas-utm-umf.csv", "text/csv;charset=utf-8");
  };

  const copiarCoordenadas = () => {
    const cuadro = cuadroDeCoordenadas(verticesCuadro);
    navigator.clipboard
      .writeText(csvDeCoordenadas(cuadro))
      .then(() => toast.success(`Copiaste el cuadro de coordenadas: ${cuadro.rows.length} vértices`))
      .catch((err) => onError(`No se pudo copiar al portapapeles: ${mensaje(err)}`));
  };

  return {
    descargando,
    imprimirPlano,
    imprimirDispersion,
    exportarGeoJson,
    imprimirDds,
    exportarKml,
    descargarPng,
    descargarCsv,
    copiarCoordenadas,
  };
}

export type LothMapaExportes = ReturnType<typeof useLothMapaExportes>;
