"use client";

/**
 * useLothCanvasTrazos — las LÍNEAS y POLÍGONOS del mapa: cuadrícula UTM,
 * polígono del área, contorno del predio y centroide, borrador en vivo, faja
 * de protección y cinta métrica. Las vías tienen su hook desde el 29-09
 * (`use-loth-canvas-vias`: se muestran solas y abren su ficha).
 *
 * Los efectos están copiados sin cambios desde `LothMapaCanvas` (se partió en
 * 2026-09-18 al pasar de 300 líneas): mismas dependencias, mismo orden.
 */

import { useEffect } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { centroid } from "@/lib/forestal/loth-geo";
import { dominantZone, gridLabel, utmGrid, vertexCode } from "@/lib/forestal/loth-utm";
import { construirFaja } from "@/lib/forestal/loth-faja";
import { referenciaMeta, viaMeta } from "@/lib/forestal/loth-cartografia";
import { COLOR_HERRAMIENTA, PARCELA_COLOR } from "../loth-mapa-shared";
import { MAX_PERMANENT_LABELS, PREDIO_COLOR, type LeafletCtx, type LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca: llegan
   por parámetro y el linter no puede saber que son estables. Agregarlas no
   re-dispara ningún efecto. */
export function useLothCanvasTrazos(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef, gridRef, parcelaRef, predioRef, draftRef, fajaRef, medicionRef } = ctx;
  const { showGrid, vias, parcela, declarada, drawMode, drawTarget, predio, draft, onInsertVertex, onMoveVertex, onDeleteVertex, fajaAnchoM, medicion, medicionModo, areasOtras, contexto } = p;

  // ── Cuadrícula UTM (se recalcula al mover/zoomear) ─────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = gridRef.current;
    if (!ready || !L || !map || !group) return;

    const draw = () => {
      group.clearLayers();
      if (!showGrid) return;
      const b = map.getBounds();
      const bounds = {
        latMin: b.getSouth(),
        latMax: b.getNorth(),
        lngMin: b.getWest(),
        lngMax: b.getEast(),
      };
      const zone = dominantZone([[(bounds.latMin + bounds.latMax) / 2, (bounds.lngMin + bounds.lngMax) / 2]]);
      const { step, lines } = utmGrid(bounds, zone);
      if (lines.length > 60) return; // zoom demasiado lejano: la grilla sería ruido
      for (const line of lines) {
        // Casing blanco + guion oscuro: legible sobre satélite y sobre topográfico.
        L.polyline(line.path, { color: "#ffffff", weight: 2.5, opacity: 0.45, interactive: false }).addTo(group);
        L.polyline(line.path, { color: "#0f172a", weight: 1, opacity: 0.45, dashArray: "5 5", interactive: false }).addTo(group);
        // Las "E" se rotulan arriba (último punto = norte del bbox) y las "N" a la
        // izquierda: igual que las reglas de un plano, y sin taparse entre ellas.
        const anchor = line.axis === "E" ? line.path[line.path.length - 1] : line.path[0];
        L.marker(anchor, {
          interactive: false,
          keyboard: false, // sin tabindex: son rótulos, no controles
          icon: L.divIcon({
            className: "loth-grid-label",
            html: gridLabel(line.value, step),
            iconSize: [0, 0],
            // El ancla cae sobre el borde: se corre hacia adentro del marco
            // (iconAnchor resta, así que un valor negativo empuja hacia adentro).
            // Las "N" esquivan además el control de zoom del ángulo superior.
            iconAnchor: line.axis === "E" ? [18, -6] : [-52, 5],
          }),
        }).addTo(group);
      }
    };

    draw();
    map.on("moveend zoomend", draw);
    return () => {
      map.off("moveend zoomend", draw);
    };
  }, [ready, showGrid, mapRef, LRef, gridRef]);

  // ── Polígono guardado + vértices rotulados ─────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = parcelaRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if ((drawMode && drawTarget === "area") || !declarada) return;
    L.polygon(parcela, { color: PARCELA_COLOR, weight: 2.5, fillColor: PARCELA_COLOR, fillOpacity: 0.12 }).addTo(group);
    // Con muchos vértices los rótulos se pisan y tapan el polígono: a partir de
    // ~12 se muestran al pasar el mouse (el cuadro de coordenadas los lista todos).
    const permanent = parcela.length <= MAX_PERMANENT_LABELS;
    parcela.forEach((v, i) =>
      L.circleMarker(v, { radius: 4, color: "#fff", weight: 1.5, fillColor: "#0f172a", fillOpacity: 1 })
        .bindTooltip(vertexCode(i), { permanent, direction: "right", className: "loth-vertex-label", offset: [6, 0] })
        .addTo(group),
    );
  }, [ready, parcela, declarada, drawMode, drawTarget, LRef, parcelaRef]);

  // ── Contorno del predio + centroide del área ───────────────────────────────
  /**
   * El plano del expediente pide DOS polígonos: el del inmueble completo y el
   * exacto del área trabajada. El predio va en trazo discontinuo y SIN relleno
   * —es el marco, no el protagonista— y debajo del área para que no la tape.
   * El centroide se dibuja porque el cajetín lo declara: si sólo vive en el
   * papel, nadie puede comprobar en pantalla que cayó donde corresponde.
   */
  useEffect(() => {
    const L = LRef.current;
    const group = predioRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (predio.length >= 3 && !(drawMode && drawTarget === "predio")) {
      L.polygon(predio, {
        color: PREDIO_COLOR,
        weight: 2,
        dashArray: "8 6",
        fill: false,
        interactive: false,
      })
        .bindTooltip("Predio", { direction: "center", className: "loth-vertex-label", sticky: true })
        .addTo(group);
      predio.forEach((v, i) =>
        L.circleMarker(v, { radius: 3, color: PREDIO_COLOR, weight: 1.5, fillColor: "#fff", fillOpacity: 1, interactive: false })
          .bindTooltip(`P${i + 1}`, { permanent: predio.length <= MAX_PERMANENT_LABELS, direction: "left", className: "loth-vertex-label", offset: [-6, 0] })
          .addTo(group),
      );
    }
    // Con «Todos», el área de cada permiso con su nombre (ADR-462). Sin
    // interacción: se toca el mapa de abajo, no el polígono.
    for (const a of areasOtras ?? []) {
      if (a.vertices.length < 3) continue;
      L.polygon(a.vertices, { color: PARCELA_COLOR, weight: 2, dashArray: "2 5", fillColor: PARCELA_COLOR, fillOpacity: 0.06, interactive: false })
        .bindTooltip(a.nombre, { permanent: true, direction: "center", className: "loth-vertex-label" })
        .addTo(group);
    }
    // Con un permiso elegido, lo del negocio es contexto común: tenue y sin ficha.
    for (const v of contexto?.vias ?? []) {
      const m = viaMeta(v.tipo);
      L.polyline(v.puntos, { color: m.color, weight: 2, opacity: 0.35, dashArray: m.dash || undefined, interactive: false }).addTo(group);
    }
    for (const r of contexto?.referencias ?? []) {
      L.circleMarker([r.lat, r.lng], { radius: 5, color: referenciaMeta(r.tipo).color, weight: 1.5, opacity: 0.45, fillOpacity: 0.2, interactive: false })
        .bindTooltip(`${r.nombre} · del negocio`, { direction: "top", className: "loth-vertex-label" })
        .addTo(group);
    }
    const centro = declarada && !(drawMode && drawTarget === "area") ? centroid(parcela) : null;
    if (centro) {
      // Cruz de centroide (el símbolo del plano), no un pin: un marcador más
      // se confundiría con las referencias del territorio.
      L.circleMarker(centro, { radius: 6, color: "#0f172a", weight: 2, fill: false, interactive: false }).addTo(group);
      L.circleMarker(centro, { radius: 1.5, color: "#0f172a", weight: 2, fillColor: "#0f172a", fillOpacity: 1, interactive: false })
        .bindTooltip("Centroide", { permanent: false, direction: "top", className: "loth-vertex-label" })
        .addTo(group);
    }
  }, [ready, predio, parcela, declarada, drawMode, drawTarget, areasOtras, contexto, LRef, predioRef]);

  // ── Borrador en vivo: vértices arrastrables + puntos medios para insertar ──
  useEffect(() => {
    const L = LRef.current;
    const group = draftRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!drawMode || draft.length === 0) return;

    if (draft.length >= 3) {
      L.polygon(draft, { color: PARCELA_COLOR, weight: 2, dashArray: "6 4", fillColor: PARCELA_COLOR, fillOpacity: 0.1 }).addTo(group);
    } else if (draft.length === 2) {
      L.polyline(draft, { color: PARCELA_COLOR, weight: 2, dashArray: "6 4" }).addTo(group);
    }

    // Puntos medios de cada lado: un click parte el lado en dos (vértice nuevo).
    if (draft.length >= 2) {
      draft.forEach((v, i) => {
        const next = draft[(i + 1) % draft.length];
        if (draft.length === 2 && i === 1) return; // con 2 puntos hay un solo lado
        const mid: LatLng = [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2];
        L.circleMarker(mid, {
          radius: 4,
          color: PARCELA_COLOR,
          weight: 1.5,
          fillColor: "#fff",
          fillOpacity: 0.85,
          className: "loth-midpoint",
          // Sin esto el click también llega al mapa y agrega un 2º vértice al
          // final: los Path de Leaflet burbujean sus eventos de mouse por default.
          bubblingMouseEvents: false,
        })
          .bindTooltip("Insertar vértice acá", { direction: "top", className: "loth-vertex-label", offset: [0, -6] })
          .on("click", () => onInsertVertex(i + 1, mid))
          .addTo(group);
      });
    }

    // Vértices: arrastrar mueve, click derecho borra.
    const rotula = draft.length <= MAX_PERMANENT_LABELS;
    draft.forEach((v, i) => {
      const marker = L.marker(v, {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({ className: "loth-vertex-handle", html: "", iconSize: [14, 14], iconAnchor: [7, 7] }),
        title: `${vertexCode(i)} — arrastra para mover · click derecho para borrar`,
      });
      if (rotula) {
        marker.bindTooltip(vertexCode(i), { permanent: true, direction: "top", className: "loth-vertex-label", offset: [0, -8] });
      }
      marker
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on("dragend", (e: any) => {
          const p = e.target.getLatLng();
          onMoveVertex(i, [p.lat, p.lng]);
        })
        .on("contextmenu", () => onDeleteVertex(i))
        .addTo(group);
    });
  }, [ready, draft, drawMode, onInsertVertex, onMoveVertex, onDeleteVertex, LRef, draftRef]);

  // ── Faja marginal de protección sobre los cauces ───────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = fajaRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!fajaAnchoM || fajaAnchoM <= 0) return;
    const estilo = { color: COLOR_HERRAMIENTA.faja, weight: 1, fillColor: COLOR_HERRAMIENTA.faja, fillOpacity: 0.18, interactive: false };
    for (const via of vias.filter((v) => v.tipo === "rio")) {
      const faja = construirFaja(via.puntos, fajaAnchoM);
      for (const t of faja.tramos) L.polygon(t, estilo).addTo(group);
      // Discos en los quiebres: sin ellos la faja queda "mordida" en las curvas.
      for (const d of faja.discos) L.circle(d.centro, { ...estilo, radius: d.radioM }).addTo(group);
    }
  }, [ready, vias, fajaAnchoM, LRef, fajaRef]);

  // ── Cinta métrica ──────────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = medicionRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!medicion || medicion.length === 0) return;
    const color = COLOR_HERRAMIENTA.medir;
    if (medicionModo === "area" && medicion.length >= 3) {
      L.polygon(medicion, { color, weight: 2.5, dashArray: "6 4", fillColor: color, fillOpacity: 0.15, interactive: false }).addTo(group);
    } else if (medicion.length >= 2) {
      L.polyline(medicion, { color, weight: 3, dashArray: "6 4", interactive: false }).addTo(group);
    }
    medicion.forEach((p, i) =>
      L.circleMarker(p, { radius: 4, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1, interactive: false })
        .bindTooltip(String(i + 1), { permanent: true, direction: "top", className: "loth-vertex-label", offset: [0, -6] })
        .addTo(group),
    );
  }, [ready, medicion, medicionModo, LRef, medicionRef]);
}
