/**
 * Índice local del buscador del panel (⌘K): módulos, sus vistas y las
 * secciones de adentro. Salió de `GlobalSearch.tsx` (17-10) para que el
 * buscador sumara comandos y recientes sin pasar las 300 líneas.
 */

import type { ElementType } from "react";
import type { TipoRemoto } from "@/lib/admin/busqueda-remota";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import { ANIDADAS_POR_MODULO, CTP_VISTAS, LOTH_VISTAS, VISTAS_POR_MODULO } from "@/lib/admin/subvistas-modulos";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ResultType = "modulo" | "accion" | "reciente" | "papel" | TipoRemoto;

export interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  tab?: string;
  /** Para módulos: navegar directo al tab */
  navigateTo?: string;
  /** Sub-vista dentro del módulo destino (`?vista=`). */
  vista?: string;
  /** Sub-vista del módulo ANIDADO dentro del destino (ver navigateTab). */
  sub?: string;
  /** Ruta exacta (comandos y recientes): gana sobre `navigateTo`/`vista`/`sub`. */
  href?: string;
  /** Evento que la pantalla destino escucha si ya estaba montada (`buleje:cerrar-turno`). */
  evento?: string;
  /** Sobre qué actúa un comando o qué es un reciente («Fiado», «Cliente»): chip a la derecha. */
  entidad?: string;
  /** Ícono propio de la fila (si no, el del grupo). */
  icono?: ElementType;
  /** Papeles del Archivo: cuándo vence (el vencido se pinta en rojo). */
  vence?: { texto: string; vencido: boolean };
  /** Fila de apoyo («Buscar … en el Archivo»): no es un resultado, no cuenta en la cabecera del grupo. */
  sinContar?: boolean;
  /** Para acciones: callback directo */
  action?: () => void;
  /** Texto original para highlight */
  matchText?: string;
}

export interface GroupedResults {
  /** Con el campo vacío: las páginas que más abres. */
  masUsadas: SearchResult[];
  recientes: SearchResult[];
  modulos: SearchResult[];
  productos: SearchResult[];
  clientes: SearchResult[];
  pedidos: SearchResult[];
  proveedores: SearchResult[];
  /** Aserradero (28-10): guías GTF, Anexos 04, trozas, permisos, lotes de aserrío y el Directorio. */
  guias: SearchResult[];
  anexos: SearchResult[];
  trozas: SearchResult[];
  permisos: SearchResult[];
  lotes: SearchResult[];
  partes: SearchResult[];
  /** El personal de RRHH (sin plata ni documento). */
  trabajadores: SearchResult[];
  /** Papeles del Archivo que coinciden (nombre, carpeta, vencimiento). */
  papeles: SearchResult[];
  acciones: SearchResult[];
  /** Módulos que salen por una palabra clave o sinónimo, no por su nombre: van al final. */
  relacionados: SearchResult[];
}

export const SIN_RESULTADOS: GroupedResults = {
  masUsadas: [], recientes: [], modulos: [], productos: [], clientes: [], pedidos: [], papeles: [], acciones: [], relacionados: [],
  proveedores: [], guias: [], anexos: [], trozas: [], permisos: [], lotes: [], partes: [], trabajadores: [],
};

// ── Índice de módulos ─────────────────────────────────────────────────────────
// Se DERIVA de ALL_TABS (el catálogo que arma el sidebar), no de una lista
// aparte. La lista hardcodeada anterior había quedado vieja: sus 20 entradas
// apuntaban a tabs que ya no existen —pos-caja, crm-clientes,
// inventario-almacenes, precios-promos…— así que el buscador no encontraba
// medio panel y lo que encontraba no llevaba a ningún lado.

export interface ModuleEntry {
  tab: string;
  label: string;
  icon: ElementType;
  keywords: string[];
  subtabs?: { id: string; label: string; keywords?: string[] }[];
  /** Destinos que además necesitan abrir una vista del hub (ver ANIDADAS_INDEX). */
  anidadas?: { id: string; vista: string; label: string; keywords: string[] }[];
}

/** "Análisis" → "analisis": así "analisis" sin tilde también encuentra. */
export function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Sinónimos de negocio que nadie deduce del label ("plata" → dinero, caja…). */
const SINONIMOS: Record<string, string[]> = {
  "vendor-dashboard": ["dashboard", "panel", "resumen", "home"],
  "ventas-caja": ["pos", "punto de venta", "cobrar", "arqueo", "turno", "vender"],
  inventario: ["stock", "almacen", "existencias", "merma", "vencimiento"],
  productos: ["precios", "promos", "ofertas", "descuentos", "catalogo"],
  plata: ["dinero", "finanzas", "gastos", "ingresos", "caja chica", "utilidad"],
  clientes: ["crm", "compradores", "contactos"],
  fiados: ["credito", "deuda", "prestado", "debe"],
  pedidos: ["ordenes", "delivery", "envios"],
  compras: ["proveedores", "abastecimiento", "reposicion"],
  facturacion: ["sunat", "boleta", "factura", "comprobante", "electronica"],
  documentos: ["drive", "archivos", "contratos", "licencias", "papeles"],
  config: ["ajustes", "configuracion", "preferencias"],
  "whatsapp-inbox": ["wa", "mensajes", "chat", "bot"],
  "analytics-pro": ["metricas", "reportes", "bi", "estadisticas"],
  auditoria: ["logs", "actividad", "historial", "seguridad"],
  plan: ["suscripcion", "facturacion buleje", "limites", "upgrade"],
};

/**
 * Sub-vistas buscables por módulo.
 *
 * `subtabs` existía en la interfaz y el buscador ya lo leía, pero NADA lo
 * llenaba: con el Libro CTP (18 vistas) o el de Títulos Habilitantes, la mayor
 * parte de los destinos reales del panel no aparecía al buscar. Se derivan de
 * las MISMAS constantes que dibujan la cabina de cada módulo, así que agregar
 * una vista allá la hace buscable acá sin tocar este archivo.
 *
 * Sólo tiene sentido para módulos cuya vista es direccionable por `?vista=`
 * (los que usan `useVistaModulo`); el resto no tendría a dónde navegar.
 */
const aSubtabs = (vistas: readonly { key: string; label: string; hint: string }[]) =>
  vistas.map((v) => ({
    id: v.key,
    label: v.label,
    keywords: [sinTildes(v.label), ...sinTildes(v.hint).split(/[^a-z0-9]+/).filter((w) => w.length > 3)],
  }));

const SUBTABS_POR_MODULO: Record<string, { id: string; label: string; keywords?: string[] }[]> = {
  "ctp-libro-operaciones": aSubtabs(CTP_VISTAS),
  "loth-libro-operaciones": aSubtabs(LOTH_VISTAS),
  ...Object.fromEntries(Object.entries(VISTAS_POR_MODULO).map(([id, v]) => [id, aSubtabs(v)])),
};

/**
 * Los destinos de segundo nivel, aplanados por módulo. Llevan `vista` además de
 * `id`: el buscador tiene que abrir la vista del hub Y la sub-vista de adentro,
 * o aterriza en la puerta del módulo equivocado.
 */
const ANIDADAS_INDEX: Record<string, { id: string; vista: string; label: string; keywords: string[] }[]> =
  Object.fromEntries(
    Object.entries(ANIDADAS_POR_MODULO).map(([id, vistas]) => [
      id,
      vistas.map((v) => ({
        id: v.key,
        vista: v.vista,
        label: v.label,
        keywords: [sinTildes(v.label), ...sinTildes(v.hint).split(/[^a-z0-9]+/).filter((w) => w.length > 3)],
      })),
    ]),
  );

export const MODULE_INDEX: ModuleEntry[] = ALL_TABS.map((t) => {
  const base = sinTildes(t.label).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return {
    tab: t.id as string,
    label: t.label,
    icon: t.icon,
    keywords: [...new Set([...base, ...(SINONIMOS[t.id as string] ?? [])])],
    subtabs: SUBTABS_POR_MODULO[t.id as string],
    anidadas: ANIDADAS_INDEX[t.id as string],
  };
});

// ── Búsqueda local en módulos ─────────────────────────────────────────────────

/**
 * Qué tan bien coincide el NOMBRE con lo escrito (20-10: «pedidos» mostraba
 * «Bodega al Mes» primero): 4 exacto · 3 empieza con · 2 palabra completa ·
 * 1 contiene · 0 no está en el nombre (salió por sinónimo o descripción).
 */
export function nivelDeNombre(nombre: string, q: string): 0 | 1 | 2 | 3 | 4 {
  const n = sinTildes(nombre).trim();
  const l = sinTildes(q).trim();
  if (!l || !n.includes(l)) return 0;
  if (n === l) return 4;
  if (n.startsWith(l)) return 3;
  return n.split(/[^a-z0-9]+/).includes(l) ? 2 : 1;
}

/**
 * Módulos, vistas y secciones que coinciden, los de mejor nombre primero. `permitido` decide si
 * ESTA persona ve ese destino (la misma regla que los comandos); sin él, todo
 * (rol sin confirmar todavía: el TabRouter igual frena al entrar).
 */
export function searchModules(
  q: string,
  permitido: (tab: string, vista?: string, sub?: string) => boolean = () => true,
): SearchResult[] {
  const results: SearchResult[] = [];
  const lower = sinTildes(q.trim());

  for (const mod of MODULE_INDEX) {
    if (!permitido(mod.tab)) continue;
    const labelMatch = sinTildes(mod.label).includes(lower);
    const kwMatch = mod.keywords.some(k => k.includes(lower));

    if (labelMatch || kwMatch) {
      results.push({
        id: `modulo-${mod.tab}-${mod.label}`,
        type: "modulo",
        title: mod.label,
        subtitle: "Módulo",
        navigateTo: mod.tab,
        tab: mod.tab,
        icono: mod.icon,
      });
    }

    // Buscar en subtabs
    if (mod.subtabs) {
      for (const sub of mod.subtabs) {
        const subMatch =
          sinTildes(sub.label).includes(lower) ||
          (sub.keywords ?? []).some(k => k.includes(lower));
        if (subMatch && !labelMatch && permitido(mod.tab, sub.id)) {
          results.push({
            id: `subtab-${mod.tab}-${sub.label}`,
            type: "modulo",
            title: sub.label,
            subtitle: `En ${mod.label}`,
            // El destino es el MÓDULO; la vista viaja en la URL (useVistaModulo
            // la lee al montar). Antes se mandaba el id de la sub-vista como si
            // fuera un tab de primer nivel — un destino que no existe.
            navigateTo: mod.tab,
            tab: mod.tab,
            vista: sub.id,
            icono: mod.icon,
          });
        }
      }
    }

    // Y los de segundo nivel: mismo criterio, pero el destino lleva las DOS
    // coordenadas (la vista del hub y la sub-vista del módulo de adentro).
    if (mod.anidadas) {
      for (const a of mod.anidadas) {
        const match = sinTildes(a.label).includes(lower) || a.keywords.some((k) => k.includes(lower));
        if (match && !labelMatch && permitido(mod.tab, a.vista, a.id)) {
          results.push({
            id: `anidada-${mod.tab}-${a.vista}-${a.id}`,
            type: "modulo",
            title: a.label,
            subtitle: `En ${mod.label}`,
            navigateTo: mod.tab,
            tab: mod.tab,
            vista: a.vista,
            sub: a.id,
            icono: mod.icon,
          });
        }
      }
    }
  }

  /* Primero el nombre que más se parece; un módulo entero pesa 3 más que una
     vista suya (el módulo «Pedidos y reparto» antes que la vista «Pedidos» de
     otro). Entre iguales, el orden del índice (sort estable). */
  const peso = (r: SearchResult) => {
    const n = nivelDeNombre(r.title, lower);
    return n === 0 ? 0 : n * 2 + (r.subtitle === "Módulo" ? 3 : 0);
  };
  return results
    .map((r) => ({ r, n: peso(r) }))
    .sort((a, b) => b.n - a.n)
    .map((x) => x.r);
}

/** El rótulo de la barra de un tab (para el destino de un comando). */
export function etiquetaDeTab(tab: string): string | null {
  return MODULE_INDEX.find((m) => m.tab === tab)?.label ?? null;
}
