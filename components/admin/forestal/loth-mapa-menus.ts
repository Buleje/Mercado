/**
 * loth-mapa-menus — qué va en cada menú de la barra del mapa del Libro TH, y
 * qué hace cada ícono. Sin JSX: listas de `MenuAccion` / `HerramientaIcono`
 * armadas con el estado de los hooks del mapa.
 *
 * Está aparte de `LothMapaMarco` para que el orden, los textos y el «¿se puede
 * ahora?» de cada opción se lean de corrido, sin el marcado alrededor. Cada
 * `hint` es la línea que explica para qué sirve: lo que un botón suelto no
 * tenía dónde decir.
 */

import {
  Clipboard,
  ClipboardCopy,
  Eye,
  FileSpreadsheet,
  FileText,
  Globe,
  Grid3x3,
  History,
  Image,
  Map as MapaIcono,
  MapPin,
  Navigation,
  Pencil,
  Printer,
  Route,
  Ruler,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  TreePine,
  TrendingUp,
  Upload,
  Waves,
  Download,
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { FAJA_SUGERIDA } from "@/lib/forestal/loth-faja";
import type { HerramientaIcono } from "./LothMapaToolbar";
import { OVERLAYS } from "./loth-mapa-overlays";
import { SECTION_LABEL } from "./loth-mapa-shared";
import type { LothMapaDatos } from "./hooks/use-loth-mapa-datos";
import type { LothMapaDibujo } from "./hooks/use-loth-mapa-dibujo";
import type { LothMapaHerramientasEstado } from "./hooks/use-loth-mapa-herramientas";
import type { LothMapaDerivados } from "./hooks/use-loth-mapa-derivados";
import type { LothMapaExportes } from "./hooks/use-loth-mapa-exportes";

export function menuCapas(h: LothMapaHerramientasEstado, der: LothMapaDerivados): MenuAccion[] {
  const bases: MenuAccion[] = [
    { id: "base-topo", label: "Mapa topográfico", hint: "Relieve, ríos y quebradas (Esri)", icon: MapaIcono, activo: h.basemap === "topo", onSelect: () => h.setBasemap("topo") },
    { id: "base-sat", label: "Imagen satelital", hint: "El bosque y lo abierto, tal como se ve desde arriba", icon: Globe, activo: h.basemap === "sat", onSelect: () => h.setBasemap("sat") },
    { id: "base-street", label: "Calles", hint: "Carreteras y centros poblados (OpenStreetMap)", icon: Route, activo: h.basemap === "street", onSelect: () => h.setBasemap("street") },
  ];
  const capas: MenuAccion[] = [
    { id: "grid", label: "Cuadrícula UTM", hint: "Las líneas con su Este y Norte, como en el plano", icon: Grid3x3, activo: h.showGrid, onSelect: () => h.setShowGrid((v) => !v) },
    ...(der.censoAll.length > 0
      ? [{ id: "censo", label: "Censo forestal", hint: "Cada árbol pintado por su categoría del POA", icon: TreePine, meta: String(der.censoAll.length), activo: h.showCenso, onSelect: () => h.setShowCenso((v) => !v) }]
      : []),
    ...OVERLAYS.map((o) => ({
      id: `ov-${o.id}`,
      label: o.label === "ANP" ? "Áreas Naturales Protegidas" : o.label,
      hint: `${o.detalle} — ${o.fuente}`,
      icon: ShieldCheck,
      activo: h.overlays.includes(o.id),
      onSelect: () => h.toggleOverlay(o.id),
    })),
    ...(der.sectionsPresent.length > 1
      ? der.sectionsPresent.map((s) => ({
          id: `sec-${s}`,
          label: `Operaciones · ${SECTION_LABEL[s] ?? s}`,
          hint: "Mostrar u ocultar los puntos de esta sección del libro",
          icon: Eye,
          activo: !h.hidden.has(s),
          onSelect: () => h.toggleSection(s),
        }))
      : []),
  ];
  return [...bases, ...capas];
}

export function menuDibujar(dib: LothMapaDibujo, datos: LothMapaDatos, der: LothMapaDerivados): MenuAccion[] {
  const ocupado = dib.drawMode || datos.saving;
  const conPredio = datos.carto.predio.vertices.length >= 3;
  return [
    {
      id: "area",
      label: der.declarada ? "Corregir el área de aprovechamiento" : "Área de aprovechamiento",
      hint: "Toca el mapa en cada vértice; el área se calcula sola",
      icon: der.declarada ? Pencil : MapPin,
      tone: "dark",
      activo: dib.drawMode && dib.drawTarget === "area",
      disabled: ocupado,
      onSelect: dib.startDraw,
    },
    {
      id: "predio",
      label: conPredio ? "Corregir el contorno del predio" : "Contorno del predio",
      hint: "El inmueble entero, que tiene que contener al área",
      icon: Square,
      activo: dib.drawMode && dib.drawTarget === "predio",
      disabled: ocupado,
      onSelect: dib.startDrawPredio,
    },
    {
      id: "via",
      label: "Vía o río",
      hint: "Carretera, trocha de arrastre o río, punto por punto",
      icon: Route,
      activo: dib.viaDraft !== null,
      disabled: dib.viaDraft !== null,
      onSelect: dib.iniciarVia,
    },
    {
      id: "referencia",
      label: "Referencia",
      hint: "Centro poblado, campamento o ingreso a la UMF: un toque",
      icon: MapPin,
      activo: dib.markMode,
      onSelect: () => dib.setMarkMode((v) => !v),
    },
    {
      id: "pegar-area",
      label: "Pegar coordenadas del área",
      hint: "El cuadro del plan de manejo, un KML o un GeoJSON",
      icon: Clipboard,
      onSelect: dib.importarArea,
    },
    {
      id: "pegar-predio",
      label: "Pegar coordenadas del predio",
      hint: "El cuadro del título de propiedad",
      icon: Upload,
      onSelect: () => dib.setCoordsOpen("predio"),
    },
    ...(der.declarada && !dib.drawMode
      ? [
          {
            id: "borrar-area",
            label: "Borrar el polígono del área",
            hint: "Pide confirmación: sostiene el POA y el expediente EUDR",
            icon: Trash2,
            tone: "danger" as const,
            disabled: datos.saving,
            onSelect: () => void dib.clearParcela(),
          },
        ]
      : []),
  ];
}

export function menuExportar(exp: LothMapaExportes, der: LothMapaDerivados, h: LothMapaHerramientasEstado, verticesCuadro: number): MenuAccion[] {
  const faltan = der.checkPlano.pendientes.length;
  const sinPoligono = verticesCuadro === 0;
  const canGeo = der.readiness.parcelaDeclarada && der.readiness.geoTotal > 0;
  return [
    {
      id: "plano",
      label: "Plano oficial · Mapa 1",
      hint: faltan > 0 ? `Lámina con cajetín y cuadro de coordenadas — le faltan ${faltan} requisito(s)` : "Lámina con cajetín, cuadrícula y cuadro de coordenadas",
      icon: Printer,
      tone: "dark",
      onSelect: () => void exp.imprimirPlano(),
    },
    {
      id: "mapa2",
      label: "Mapa 2 · dispersión y accesos",
      hint: "Censo, referencias y el cuadro de acceso a la UMF",
      icon: Printer,
      tone: "dark",
      onSelect: exp.imprimirDispersion,
    },
    {
      id: "dds",
      label: "Informe EUDR (DDS)",
      hint: der.readiness.parcelaDeclarada ? "Para la Declaración de Diligencia Debida" : "Declara la parcela primero",
      icon: FileText,
      disabled: !der.readiness.parcelaDeclarada,
      onSelect: exp.imprimirDds,
    },
    {
      id: "geojson",
      label: "GeoJSON para la DDS",
      hint: canGeo ? "La geolocalización que pide el sistema de la UE" : "Declara la parcela y geolocaliza operaciones primero",
      icon: Download,
      disabled: !canGeo,
      onSelect: exp.exportarGeoJson,
    },
    {
      id: "kml",
      label: "KML para Google Earth",
      hint: "Área, censo y operaciones",
      icon: Globe,
      disabled: sinPoligono,
      onSelect: exp.exportarKml,
    },
    {
      id: "csv",
      label: "Cuadro de coordenadas en CSV",
      hint: "Vértice, Este, Norte, lado y azimut — para Excel",
      icon: FileSpreadsheet,
      disabled: sinPoligono,
      onSelect: exp.descargarCsv,
    },
    {
      id: "copiar",
      label: "Copiar el cuadro de coordenadas",
      hint: "Para pegarlo en el informe del regente",
      icon: ClipboardCopy,
      disabled: sinPoligono,
      onSelect: exp.copiarCoordenadas,
    },
    {
      id: "png",
      label: "Imagen PNG de lo que ves",
      hint: "La vista actual con el polígono, el censo y las referencias",
      icon: Image,
      busy: exp.descargando,
      disabled: !h.vista,
      onSelect: () => void exp.descargarPng(),
    },
  ];
}

export function herramientasDelMapa(h: LothMapaHerramientasEstado, cauces: number): HerramientaIcono[] {
  const midiendo = h.medicion !== null;
  return [
    {
      id: "medir",
      corto: "Medir",
      label: midiendo ? "Dejar de medir" : "Medir una distancia o un área (no toca el polígono declarado)",
      icono: Ruler,
      activa: midiendo,
      onClick: () => h.setMedicion(midiendo ? null : []),
    },
    {
      id: "ir",
      corto: "Ir a coordenada",
      label: "Ir a una coordenada UTM de la libreta",
      icono: Search,
      activa: h.irOpen,
      onClick: () => h.setIrOpen((v) => !v),
    },
    {
      id: "eudr",
      corto: "Comparar con antes del corte EUDR",
      label: h.releases.length === 0 && !h.cargandoReleases ? "Comparar con antes del corte EUDR (el servicio de imágenes no respondió)" : "Comparar la imagen de antes del corte EUDR con la de hoy",
      icono: History,
      activa: !!h.wayback,
      cargando: h.cargandoReleases,
      disabled: h.cargandoReleases || h.releases.length === 0,
      onClick: () => (h.wayback ? h.setWayback(null) : h.verCorteEudr()),
    },
    {
      id: "faja",
      corto: "Faja de protección",
      label: cauces === 0 ? "Faja de protección de cauces (traza primero un río o quebrada)" : "Faja de protección a los lados de ríos y quebradas",
      icono: Waves,
      activa: h.fajaAnchoM > 0,
      disabled: cauces === 0,
      onClick: () => h.setFajaAnchoM(h.fajaAnchoM > 0 ? 0 : FAJA_SUGERIDA.rio),
    },
    {
      id: "perfil",
      corto: "Perfil de terreno",
      label: h.perfil ? "Cerrar el perfil de terreno" : "Perfil de terreno de lo que estés midiendo (mide primero 2 puntos)",
      icono: TrendingUp,
      activa: !!h.perfil,
      cargando: h.perfilCargando,
      disabled: h.perfilCargando || (!h.perfil && (h.medicion?.length ?? 0) < 2),
      onClick: () => (h.perfil ? h.cerrarPerfil() : void h.verPerfil()),
    },
    {
      id: "campo",
      corto: "Modo campo (GPS)",
      label: h.campoActivo ? "Dejar de seguir el GPS" : "Modo campo: seguir tu GPS y saber si estás dentro del área",
      icono: Navigation,
      activa: h.campoActivo,
      onClick: () => h.setCampoActivo((v) => !v),
    },
  ];
}
