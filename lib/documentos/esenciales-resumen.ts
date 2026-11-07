/**
 * Tarjeta «Esenciales» del Inicio (Brandon 24-10): cuántos papeles de tus
 * carpetas esenciales vencieron o vencen en 30 días, y esas carpetas a un clic.
 *
 * Cuenta SÓLO lo que el rol de quien mira puede ver, como la lista del
 * Archivo: la carpeta entra si el rol pasa por TODA su cadena de carpetas
 * (`allowedRoles` de cada madre, candado de dueño incluido) y cada papel,
 * además, por sus propios roles. Las cifras por carpeta salen de
 * `armarEsenciales`, la misma cuenta que dibuja la pestaña Esenciales: el
 * número del Inicio es el que ves al hacer clic.
 *
 * Puro y sin `server-only`: lo usan `/api/admin/documents/esenciales/resumen` y su test.
 */
import { canRoleSeeEnCadena, rolesDeLaCadena, type CarpetaConRoles } from "@/lib/documents/doc-access";
import type { AdminRole } from "@/lib/session";
import { armarEsenciales, ordenarEsenciales, type DocEsencial } from "./esenciales";

/** Quién ve la tarjeta: la gestión, los mismos que ven el aviso `DOC_ESENCIAL_VENCE` de la campana. */
export const ROLES_RESUMEN_ESENCIALES: readonly AdminRole[] = ["admin", "owner", "manager"];

export interface CarpetaDelResumen {
  id: string;
  name: string;
  parentId: string | null;
  tags: string[];
  allowedRoles: string[];
  icon: string | null;
  color: string | null;
  emoji: string | null;
}

export interface DocDelResumen {
  id: string;
  folderId: string | null;
  allowedRoles: string[];
  expiresAt: Date | string | null;
  uploadedAt: Date | string;
}

export interface EsencialDelResumen {
  id: string;
  nombre: string;
  icon: string | null;
  color: string | null;
  emoji: string | null;
  /** De la raíz a su carpeta madre («Contratos › 2026»). Vacío = en la raíz. */
  ruta: string[];
  /** Papeles adentro, con los de sus subcarpetas. */
  papeles: number;
  vencidos: number;
  /** Vencen en 30 días o menos. */
  porVencer: number;
}

export interface ResumenEsenciales {
  carpetas: EsencialDelResumen[];
  /** Papeles distintos: una esencial dentro de otra no cuenta dos veces lo mismo. */
  total: { carpetas: number; papeles: number; vencidos: number; porVencer: number };
  /** ¿El rol ve alguna carpeta del Archivo? Sin esenciales y sin carpetas, la tarjeta no se muestra. */
  hayCarpetas: boolean;
}

const DIA = 86_400_000;
const iso = (v: Date | string | null): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : v);

/** Lo vencido primero, después lo que vence; dentro de cada grupo, «Mi orden» del negocio. */
const urgencia = (e: { vencidos: number; porVencer: number }): number => (e.vencidos > 0 ? 0 : e.porVencer > 0 ? 1 : 2);

export function resumenDeEsenciales(args: {
  carpetas: readonly CarpetaDelResumen[];
  docs: readonly DocDelResumen[];
  rol: string;
  /** «Mi orden» guardado por el negocio (`admin_prefs.esencialesOrden`). */
  orden?: readonly string[] | null;
  hoy?: Date;
}): ResumenEsenciales {
  const { carpetas, docs, rol } = args;
  const hoy = args.hoy ?? new Date();
  // El árbol ENTERO para subir por la cadena: una madre que el rol no ve corta a sus hijas.
  const mapa = new Map<string, CarpetaConRoles>(carpetas.map((c) => [c.id, { parentId: c.parentId, allowedRoles: c.allowedRoles }]));
  const ve = (propios: string[], folderId: string | null) => canRoleSeeEnCadena(rol, propios, rolesDeLaCadena(folderId, mapa));

  const visibles = carpetas.filter((c) => ve([], c.id));
  const docsVisibles: DocEsencial[] = docs
    .filter((d) => d.folderId && ve(d.allowedRoles, d.folderId))
    .map((d) => ({ id: d.id, folderId: d.folderId, name: "", uploadedAt: iso(d.uploadedAt) ?? "", expiresAt: iso(d.expiresAt) }));

  const armadas = ordenarEsenciales(armarEsenciales({ carpetas: visibles, docs: docsVisibles, hoy }), "manual", args.orden ?? []);
  const ordenadas = [...armadas].sort((a, b) => urgencia(a) - urgencia(b));

  const adentro = new Set<string>();
  for (const e of armadas) for (const id of e.carpetaIds) adentro.add(id);
  const total = { carpetas: armadas.length, papeles: 0, vencidos: 0, porVencer: 0 };
  const ahora = hoy.getTime();
  for (const d of docsVisibles) {
    if (!d.folderId || !adentro.has(d.folderId)) continue;
    total.papeles++;
    const vence = d.expiresAt ? Date.parse(d.expiresAt) : NaN;
    if (!Number.isFinite(vence)) continue;
    if (vence < ahora) total.vencidos++;
    else if (vence - ahora <= 30 * DIA) total.porVencer++;
  }

  return {
    carpetas: ordenadas.map(({ carpeta, ruta, docs: papeles, vencidos, porVencer }) => ({
      id: carpeta.id,
      nombre: carpeta.name,
      icon: carpeta.icon,
      color: carpeta.color,
      emoji: carpeta.emoji,
      ruta,
      papeles,
      vencidos,
      porVencer,
    })),
    total,
    hayCarpetas: visibles.length > 0,
  };
}
