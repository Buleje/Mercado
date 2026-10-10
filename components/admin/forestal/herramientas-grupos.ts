import { BarChart3, Calculator, Ruler, Trees } from "@buleje/design-system/icons";
import type { LibroGroup } from "@/components/admin/shared/libro-chrome";
import { GRUPOS as GRUPOS_TRAMITES, type Vista as VistaTramite } from "./tramites-grupos";

/**
 * «Herramientas y trámites» (`forestal-herramientas`) — dos fases en una cabina
 * (plan «panel unificado», F30, ola 2 — 2026-10-10): las Herramientas de
 * siempre y los Trámites que antes eran su propia pestaña (`forestal-tramites`,
 * hoy alias de `?vista=catalogo`). Cada fase se ve sólo si su especialización
 * está prendida (permiso por ORIGEN: `spec:forestal:herramientas` /
 * `spec:forestal:tramites`).
 *
 * El Rendimiento del aserradero salió de acá: vive en Libro CTP › Tablero ›
 * Rendimiento (lee el mismo libro); la cabina deja un acceso en su menú.
 */

export const HERRAMIENTAS_MODULE_ID = "forestal-herramientas";

export type Herramienta = "cubicador" | "trozas" | "resumenes" | "especies";
export type VistaHerramientas = Herramienta | VistaTramite;

/** Todas las vistas, en orden (las valida `?vista=`). */
export const VISTAS_HERRAMIENTAS = ["cubicador", "trozas", "resumenes", "especies", "catalogo", "expediente", "plantaciones"] as const;

export const HERRAMIENTAS: readonly Herramienta[] = ["cubicador", "trozas", "resumenes", "especies"];
export const VISTAS_TRAMITES: readonly VistaTramite[] = ["catalogo", "expediente", "plantaciones"];

export const GRUPO_HERRAMIENTAS: LibroGroup = {
  id: "herramientas",
  label: "Herramientas",
  views: [
    { key: "cubicador", label: "Cubicador de madera", icon: Calculator, hint: "Aserrada: pie tablar + m³ por voz" },
    { key: "trozas", label: "Cubicador de trozas", icon: Ruler, hint: "Rolliza en patio: Smalian (m³, contra la GTF) u Oxapampina (PT)" },
    { key: "resumenes", label: "Resúmenes", icon: BarChart3, hint: "Tablas por especie y tipo del lote cubicado" },
    { key: "especies", label: "Fotos de especies", icon: Trees, hint: "Referencia visual para no confundir dos maderas parecidas" },
  ],
};

export const GRUPO_TRAMITES: LibroGroup = GRUPOS_TRAMITES[0];

export function esVistaDeTramites(v: string): v is VistaTramite {
  return (VISTAS_TRAMITES as readonly string[]).includes(v);
}

export function esHerramienta(v: string): v is Herramienta {
  return (HERRAMIENTAS as readonly string[]).includes(v);
}

/** Dónde vive ahora el Rendimiento del aserradero (antes, una herramienta más). */
export const HREF_RENDIMIENTO = "/admin?tab=ctp-libro-operaciones&vista=tablero&sub=rendimiento";
