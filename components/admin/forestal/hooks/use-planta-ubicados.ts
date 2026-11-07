"use client";

/**
 * usePlantaUbicados — lo que la vista Planta deriva de «dónde está cada cosa»
 * para el plano que se está mirando: qué hay en cada zona, el inventario de la
 * etiqueta, las fichas emergentes del satélite y el formato viejo
 * `entryId → zonaId` que todavía leen la barra lateral y las listas.
 *
 * Solo cuenta las pilas (claves sin `troza:`): las trozas separadas las dibuja
 * la capa Croquis, que es la que sabe separarlas.
 */

import { useCallback, useMemo } from "react";
import { esClaveTroza, zonaTipoMeta, type Item, type ItemKind, type PlantaZona, type UbicacionPlanta, type ZonaInv } from "@/lib/forestal/planta-zona-types";
import { fichaItemHtml, fichaZonaHtml } from "@/lib/forestal/planta-iconos";
import { fmtSubtotal, fmtSubtotales, normalizarUnidad, resumirItems } from "@/lib/forestal/planta-resumen";
import { formatNumber } from "@/lib/format";
import type { MarcaItem } from "../CtpPlantaMapa";

/** Área legible: el aserradero se mide en m², el terreno grande en ha. */
export const fmtArea = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${formatNumber(Math.round(m2))} m²`);

const KIND_LABEL: Record<ItemKind, string> = {
  troza: "Troza en patio",
  producto: "Aserrada lista",
  despacho: "Despacho armado",
};

export function usePlantaUbicados(items: Item[], zonas: PlantaZona[], ubicaciones: Record<string, UbicacionPlanta>) {
  const zonaById = useMemo(() => new Map(zonas.map((z) => [z.id, z])), [zonas]);

  /** entryId → zonaId (solo pilas). */
  const asignaciones = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [clave, u] of Object.entries(ubicaciones)) if (!esClaveTroza(clave)) m[clave] = u.zonaId;
    return m;
  }, [ubicaciones]);

  /** entryId → punto exacto dentro de su zona (el operador movió el icono). */
  const posiciones = useMemo(() => {
    const m: Record<string, { lat: number; lng: number }> = {};
    for (const [clave, u] of Object.entries(ubicaciones)) {
      if (!esClaveTroza(clave) && typeof u.lat === "number" && typeof u.lng === "number") m[clave] = { lat: u.lat, lng: u.lng };
    }
    return m;
  }, [ubicaciones]);

  const itemsPorZona = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const it of items) {
      const zid = asignaciones[it.id];
      if (zid && zonaById.has(zid)) (m[zid] ??= []).push(it);
    }
    return m;
  }, [items, asignaciones, zonaById]);

  const ubicadosPorZona = useMemo(() => {
    const m: Record<string, MarcaItem[]> = {};
    for (const [zid, list] of Object.entries(itemsPorZona)) {
      m[zid] = list.map((it) => ({
        id: it.id, kind: it.kind, label: it.label, cites: it.cites,
        cantidad: fmtSubtotal({ unidad: normalizarUnidad(it.unidad), cantidad: it.cantidad, lineas: 1 }),
      }));
    }
    return m;
  }, [itemsPorZona]);

  /** Inventario por zona para la etiqueta: trozas suman m³; producto y despacho se cuentan. */
  const invObj = useMemo(() => {
    const m: Record<string, ZonaInv> = {};
    for (const [zid, list] of Object.entries(itemsPorZona)) {
      const cur: ZonaInv = { trozas: 0, m3: 0, productos: 0, despachos: 0 };
      for (const it of list) {
        if (it.kind === "troza") { cur.trozas += 1; cur.m3 += it.cantidad; }
        else if (it.kind === "producto") cur.productos += 1;
        else cur.despachos += 1;
      }
      m[zid] = { ...cur, m3: Math.round(cur.m3 * 100) / 100 };
    }
    return m;
  }, [itemsPorZona]);

  const areaTotal = useMemo(() => zonas.reduce((a, z) => a + (z.areaM2 ?? 0), 0), [zonas]);
  const ubicadosCount = useMemo(() => items.filter((it) => zonaById.has(asignaciones[it.id] ?? "")).length, [items, asignaciones, zonaById]);

  /** Ficha emergente de un ítem: qué es, cuánto queda y dónde está. */
  const fichaDeItem = useCallback((entryId: string): string | null => {
    const it = items.find((x) => x.id === entryId);
    if (!it) return null;
    const z = zonaById.get(asignaciones[entryId] ?? "");
    return fichaItemHtml({
      kind: it.kind, titulo: it.label, especie: it.especie ?? it.sub,
      cantidad: fmtSubtotal({ unidad: normalizarUnidad(it.unidad), cantidad: it.cantidad, lineas: 1 }),
      zona: z ? `${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""}` : "—",
      cites: it.cites, entryId,
    });
  }, [items, asignaciones, zonaById]);

  /** Ficha emergente de una zona: el terreno + qué hay parado, por especie. */
  const fichaDeZona = useCallback((zonaId: string): string | null => {
    const z = zonaById.get(zonaId);
    if (!z) return null;
    const meta = zonaTipoMeta(z.tipo);
    const r = resumirItems(itemsPorZona[zonaId] ?? [], (it) => it.especie ?? it.sub);
    return fichaZonaHtml({
      codigo: z.codigo, nombre: z.nombre, tipoLabel: meta.label, color: meta.ring,
      area: z.areaM2 != null ? fmtArea(z.areaM2) : null, notas: z.notas,
      porKind: r.porKind.map((k) => ({ label: KIND_LABEL[k.kind], valor: fmtSubtotales(k.subtotales), lineas: k.lineas })),
      porEspecie: r.porEspecie.map((e) => ({ especie: e.especie, valor: fmtSubtotales(e.subtotales), lineas: e.lineas })),
      vacia: r.lineas === 0,
      // Sólo una cancha de RESERVA con aserrada adentro ofrece emitir la guía.
      puedeDespachar: z.tipo === "reserva" && (itemsPorZona[zonaId] ?? []).some((it) => it.kind === "producto"),
    });
  }, [zonaById, itemsPorZona]);

  return { zonaById, asignaciones, posiciones, itemsPorZona, ubicadosPorZona, invObj, areaTotal, ubicadosCount, fichaDeItem, fichaDeZona };
}
