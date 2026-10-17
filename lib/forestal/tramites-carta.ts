/**
 * tramites-carta — la carta que sale de las guías elegidas (ADR-487).
 *
 * Brandon 08-10: «en el documento arriba en el título el título del permiso,
 * debe añadirse el N° de expediente automáticamente … cada carta con un
 * código único que se guardará». Tres piezas, todas puras:
 *
 * 1. QUÉ DECLARA la carta (`contenidoCarta`): sus guías, su permiso y su
 *    expediente. La `huellaCarta` decide si imprimir otra vez es la MISMA
 *    carta (reimprimir no gasta código) u OTRA (cambiaste las guías, el
 *    permiso o el expediente → código nuevo; la anterior queda como salió).
 * 2. El EXPEDIENTE del permiso (`expedienteDelPermiso`): el permiso no tiene
 *    casillero para él; se escribe una vez en la carta y las siguientes del
 *    mismo permiso lo traen solas, de la última carta guardada de ese permiso.
 * 3. El sello de la impresión (`EmisionCarta`): cuándo, quién y qué declaraba.
 *
 * Las cartas son los formatos que se llenan desde las guías elegidas
 * (`aceptaGuias`: la relación y sus cinco hermanos de la barra, ADR-474).
 *
 * PURO: sin Prisma, sin fetch, sin DOM.
 */

import type { DatosTramite, FormatoTramite } from "./tramites-catalogo";
import { parseGuiasInforme } from "./tramites-relacion-guias";
import { clavePermisoOficio } from "./tramites-permiso";

/** El sello que queda guardado la primera vez que la carta sale impresa. */
export interface EmisionCarta {
  /** Cuándo salió impresa por primera vez (ISO). */
  en: string;
  /** Quién la imprimió (usuario del panel). */
  por: string;
  /** Lo que declaraba, resumido: igual = reimpresión, distinto = otra carta. */
  huella: string;
  /** Los N° de GTF que declara (para buscarla por guía en el Expediente). */
  guias: string[];
  permisoCodigo: string | null;
  expediente: string | null;
}

export interface ContenidoCarta {
  guias: string[];
  permisoCodigo: string | null;
  expediente: string | null;
}

/** Los casilleros con N° de guía de los formatos de UNA guía o de un rango (`tramites-desde-guias`). */
const CLAVES_GUIA = [
  "numeroGtfAnulada",
  "numeroGtfPerdida",
  "numeroGtfPerdidaSerfor",
  "serieExtraviada",
  "rangoNumeros",
  "serieActual",
  "ultimoCorrelativo",
] as const;

const limpio = (v: string | null | undefined): string => (v ?? "").replace(/\s+/g, " ").trim();

/** ¿Este formato es una carta con código propio? Los que se llenan desde las guías elegidas. */
export const esCarta = (f: Pick<FormatoTramite, "aceptaGuias"> | null | undefined): boolean => Boolean(f?.aceptaGuias);

/** Lo que la carta declara: las guías (la anulada, marcada), el permiso y el expediente. */
export function contenidoCarta(formato: Pick<FormatoTramite, "tablaGuias">, datos: DatosTramite): ContenidoCarta {
  const guias = formato.tablaGuias
    ? parseGuiasInforme(datos.guiasJson)
        .filter((f) => limpio(f.numero))
        .map((f) => `${limpio(f.numero)}${f.anulada ? " (anulada)" : ""}`)
    : CLAVES_GUIA.map((k) => limpio(datos[k])).filter(Boolean);
  return {
    guias: [...new Set(guias)],
    permisoCodigo: limpio(datos.permisoCodigo) || null,
    expediente: limpio(datos.expediente) || null,
  };
}

/** FNV-1a de 32 bits: corto y estable (no es seguridad, es «¿es la misma carta?»). */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * La huella de lo que la carta declara. No mira la redacción (destinatario,
 * observaciones, firma): corregir una coma no la vuelve otra carta. Sí mira
 * las guías (el orden no importa), el permiso (por su código normalizado) y el
 * expediente.
 */
export function huellaCarta(formato: Pick<FormatoTramite, "id" | "tablaGuias">, datos: DatosTramite): string {
  const c = contenidoCarta(formato, datos);
  const guias = c.guias.map((g) => g.toUpperCase()).sort();
  const texto = [formato.id, clavePermisoOficio(c.permisoCodigo) ?? "", limpio(c.expediente).toUpperCase(), ...guias].join("|");
  return `${guias.length}-${fnv1a(texto)}`;
}

/** El sello de la primera impresión. */
export function sellarEmision(
  formato: Pick<FormatoTramite, "id" | "tablaGuias">,
  datos: DatosTramite,
  en: string,
  por: string,
): EmisionCarta {
  const c = contenidoCarta(formato, datos);
  return { en, por: limpio(por) || "unknown", huella: huellaCarta(formato, datos), ...c };
}

/** ¿La carta ya salió impresa y lo que declara ahora es OTRO? Entonces va con código nuevo. */
export function cartaCambiada(
  formato: Pick<FormatoTramite, "id" | "tablaGuias">,
  datos: DatosTramite,
  emision: EmisionCarta | null | undefined,
): boolean {
  return Boolean(emision) && emision!.huella !== huellaCarta(formato, datos);
}

/** Error del servidor: se quiso cambiar lo que declara una carta ya impresa. */
export class CartaYaImpresaError extends Error {
  constructor(readonly codigo: string) {
    super(
      `La carta ${codigo} ya salió impresa con otras guías, permiso o expediente: tus cambios van en una carta nueva (con su propio código).`,
    );
    this.name = "CartaYaImpresaError";
  }
}

// ─── El expediente del permiso ───────────────────────────────────────────────

/** Lo mínimo de un trámite guardado que mira la búsqueda del expediente. */
export interface TramiteConDatos {
  id: string;
  codigoInterno: string;
  updatedAt: string;
  datos: DatosTramite;
}

export interface ExpedienteSugerido {
  expediente: string;
  /** El código de la carta de donde salió («REL-2026-0001»). */
  desde: string;
}

/**
 * El N° de expediente del permiso, de la última carta guardada de ese mismo
 * permiso que lo traía. Mismo permiso = mismo contrato elegido o mismo código
 * normalizado (nunca el nombre del titular).
 */
export function expedienteDelPermiso(
  tramites: readonly TramiteConDatos[],
  permiso: { contratoId?: string | null; codigo?: string | null },
  excluirId?: string | null,
): ExpedienteSugerido | null {
  const contratoId = limpio(permiso.contratoId);
  const clave = clavePermisoOficio(permiso.codigo);
  if ((!contratoId || contratoId === "sin") && !clave) return null;
  const delPermiso = tramites.filter((t) => {
    if (t.id === excluirId || !limpio(t.datos?.expediente)) return false;
    const mismoContrato = contratoId && contratoId !== "sin" && t.datos?.permisoContratoId === contratoId;
    return mismoContrato || (clave !== null && clavePermisoOficio(t.datos?.permisoCodigo) === clave);
  });
  const ultimo = [...delPermiso].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  return ultimo ? { expediente: limpio(ultimo.datos.expediente), desde: ultimo.codigoInterno } : null;
}

/** «2026-10-08T15:04:00Z» → «jueves 08/10» (hora de Lima): cómo se dice una fecha en el panel. */
export function fechaDeEmision(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("es-PE", { weekday: "long", timeZone: "America/Lima" });
  const dm = d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "America/Lima" });
  return `${dia} ${dm}`;
}
