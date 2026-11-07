import "server-only";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestPlantaAsignacionDB } from "@/lib/db/forest-planta-asignacion.db";
import { ForestPlantaCroquisDB } from "@/lib/db/forest-planta-croquis.db";
import { ForestPlantaZonaDB } from "@/lib/db/forest-planta-zona.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { logger } from "@/lib/logger";
import { esSinCodigo } from "@/lib/forestal/consumo-trozas";
import { enPatio } from "@/lib/forestal/patio-por-permiso";
import { separarHuerfanas } from "@/lib/forestal/planta-croquis-guardado";
import { normalizarUnidad } from "@/lib/forestal/planta-resumen";
import { soloZonas, type Ubicacion } from "@/lib/forestal/planta-ubicacion";
import { claveTroza, type Item, type PlantaCroquis, type PlantaZona, type TrozaUbicable } from "@/lib/forestal/planta-zona-types";

/**
 * ForestPlantaDB — lo que dibuja el Mapa de Planta (satélite y croquis,
 * ADR-142 / ADR-465): zonas, lo ubicable del libro, dónde está cada cosa y el
 * croquis. Sólo LEE el libro; la ubicación es informativa y nunca cambia saldo,
 * consumo ni GTF.
 *
 * Ubicable, en el orden del flujo:
 *  · PILA (ítem «troza»): la guía/ingreso con saldo en m³, con sus trozas EN EL
 *    PATIO (`enPatio`, el mismo predicado del libro) para separarlas.
 *  · PRODUCTO: la corrida con stock.
 *  · DESPACHO: la salida armada.
 *
 * `pt`, `piezas`, `dueno` y `permiso` salen sólo de lo que el libro guarda; si
 * no está, `null` (nunca un número inventado — un pt parcial presentado como
 * total es un derivado disfrazado de dato).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const txt = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** De quién es la madera de una corrida o despacho (ADR-412): sólo lo declarado. */
function duenoDeCorrida(duenoMadera: string | null | undefined, titular: string | null | undefined): string | null {
  if (duenoMadera === "tercero") return txt(titular);
  if (duenoMadera === "propia") return "Propia";
  return null;
}

export interface VistaPlanta {
  zonas: PlantaZona[];
  items: Item[];
  /** `clave → zonaId` (compatibilidad con lo que ya lo consume). */
  asignaciones: Record<string, string>;
  /** `clave → { zonaId, lat?, lng? }`; incluye `troza:<id>` de las separadas. */
  ubicaciones: Record<string, Ubicacion>;
  croquis: PlantaCroquis | null;
  /** Cuántas ubicaciones huérfanas se quitaron en esta lectura (0 casi siempre). */
  huerfanasQuitadas: number;
}

export const ForestPlantaDB = {
  async vista(tenantId: string, opts: { user?: string } = {}): Promise<VistaPlanta> {
    if (!tenantId) throw new Error("tenantId is required");
    const [zonas, ingresosSrc, corridasSrc, despRes, guardadas, piezas, croquis] = await Promise.all([
      ForestPlantaZonaDB.list(tenantId),
      ForestCtpDB.availableSource(tenantId, "produccion"), // pilas (materia prima con saldo)
      ForestCtpDB.availableSource(tenantId, "despacho"), // producto terminado (corridas con stock)
      ForestCtpDB.list(tenantId, { section: "despacho" }), // despachos (salidas)
      ForestPlantaAsignacionDB.getUbicaciones(tenantId),
      WoodEntriesDB.trozasComoConsumibles(tenantId), // las piezas, con el criterio del libro
      ForestPlantaCroquisDB.getParaCliente(tenantId),
    ]);

    // Trozas EN EL PATIO por pila. `conLista` = la guía tiene trozas cargadas
    // (aunque ya no queden): ahí «0 piezas» es un dato; sin lista es «no se sabe».
    const enPila = new Map<string, TrozaUbicable[]>();
    const conLista = new Set<string>();
    for (const t of piezas) {
      conLista.add(t.woodEntryId);
      if (!enPatio(t)) continue;
      const codigo = txt(t.codigoPlanta) ?? (esSinCodigo(t) ? null : txt(t.codificacion));
      const lista = enPila.get(t.woodEntryId) ?? [];
      lista.push({ id: t.id, codigo, m3: t.volumenM3 ?? null, pt: t.oxPt ?? null });
      enPila.set(t.woodEntryId, lista);
    }

    const items: Item[] = [];
    for (const t of ingresosSrc) {
      if (t.kind !== "ingreso") continue;
      const trozas = enPila.get(t.id) ?? [];
      // pt sólo si TODAS las piezas de la pila se cubicaron (Oxapampa): una suma
      // parcial se leería como el total.
      const pt = trozas.length > 0 && trozas.every((x) => x.pt != null) ? r2(trozas.reduce((s, x) => s + (x.pt ?? 0), 0)) : null;
      items.push({
        id: t.id,
        kind: "troza",
        label: `GTF ${t.code ?? "—"}`,
        sub: t.species ?? null,
        especie: t.species ?? null,
        cantidad: t.disponible,
        unidad: "m³",
        cites: !!t.cites,
        pt,
        piezas: conLista.has(t.id) ? trozas.length : null,
        // Madera de servicio (ADR-437): el dueño es el tercero; si no se cargó, no se sabe.
        dueno: t.maderaDeTercero ? txt(t.duenoNombre) : txt(t.proveedor),
        permiso: txt(t.permiso),
        trozas,
      });
    }
    for (const c of corridasSrc) {
      if (c.kind !== "corrida") continue;
      const esPt = normalizarUnidad(c.unit) === "pt";
      items.push({
        id: c.id,
        kind: "producto",
        label: c.code ?? "Corrida",
        // `sub` es lo que se muestra (el producto); `especie` agrupa el desglose.
        sub: c.productType ?? c.species ?? null,
        especie: c.species ?? null,
        cantidad: c.disponible,
        unidad: c.unit ?? "u",
        cites: !!c.cites,
        pt: esPt ? c.disponible : null,
        // Las piezas declaradas valen mientras no salió nada: con una salida parcial ya no son las del patio.
        piezas: c.piezas != null && c.disponible === c.producido ? c.piezas : null,
        dueno: duenoDeCorrida(c.duenoMadera, c.titularNombre),
        permiso: txt(c.permiso),
      });
    }
    for (const d of despRes.entries) {
      const cantidad = Number(d.quantity ?? 0);
      items.push({
        id: d.id,
        kind: "despacho",
        label: `Despacho #${d.lineNo}`,
        sub: d.destino ?? d.productType ?? null,
        especie: d.speciesCommon ?? null,
        cantidad,
        unidad: d.unit ?? "u",
        cites: !!d.cites,
        pt: normalizarUnidad(d.unit) === "pt" ? cantidad : null,
        piezas: d.pieces ?? null,
        dueno: duenoDeCorrida(d.duenoMadera, d.titularNombre),
        permiso: txt(d.originCode),
      });
    }

    /*
     * Huérfanas: la ubicación de algo que ya no está en el plano. No se ven
     * (el mapa dibuja sobre `items`) pero inflaban el «X de Y ubicados» y el KV
     * crecía para siempre. Antes se escondían en cada lectura y quedaban
     * guardadas: en Blas, 8 apuntaban a registros muertos desde el 2026-08-10.
     * Ahora se BORRAN — pero sólo las confirmadas por id contra la base.
     */
    const vivas = new Set<string>(items.map((i) => i.id));
    for (const lista of enPila.values()) for (const t of lista) vivas.add(claveTroza(t.id));
    const { vigentes, zonaMuerta, candidatas } = separarHuerfanas(guardadas, vivas, new Set(zonas.map((z) => z.id)));

    let huerfanasQuitadas = 0;
    if (zonaMuerta.length > 0 || candidatas.length > 0) {
      try {
        const muertas = await ForestPlantaAsignacionDB.confirmarMuertas(tenantId, candidatas);
        huerfanasQuitadas = await ForestPlantaAsignacionDB.limpiarHuerfanas(tenantId, { muertas, zonaMuerta }, opts.user ?? "sistema");
      } catch (err) {
        // Limpiar es mantenimiento: si falla, el mapa se dibuja igual.
        logger.error("[planta] limpieza de ubicaciones huérfanas falló", { tenantId, error: String(err) });
      }
    }

    return { zonas, items, asignaciones: soloZonas(vigentes), ubicaciones: vigentes, croquis, huerfanasQuitadas };
  },
};
