import "server-only";
import { z } from "zod";
import { TenantPiezaDB, type FilaMatriz, type FilaPieza } from "@/lib/db/tenant-pieza.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { PIEZAS_SERVIDOR } from "@/extensiones/registro.servidor";
import {
  ENCHUFE_PAGINA,
  esEnchufe,
  type EnchufeId,
  type EntradaServidor,
  type ManifiestoPieza,
  type NegocioDePiezas,
  type PiezaAsignada,
} from "@/extensiones/_contrato";
import { reportarFalloPieza } from "./tope";

/**
 * Resolver de piezas del servidor (ADR-457): cruza la tabla `TenantPieza` con
 * el registro estático y deja pasar SÓLO lo que el código conoce y cuyas
 * opciones pasan el Zod del manifiesto. Nunca tira: si algo falla, el negocio
 * ve la versión normal (lista vacía) y se avisa a Sentry.
 */

export const REGISTRO_SERVIDOR: ReadonlyMap<string, EntradaServidor> = new Map(
  PIEZAS_SERVIDOR.map((e) => [e.manifiesto.id, e]),
);

export type ResultadoOpciones =
  | { ok: true; opciones: Record<string, unknown> }
  | { ok: false; issues: z.core.$ZodIssue[] };

/** `safeParse` con el Zod `.strict()` del manifiesto. Lo usan el guardado Y la lectura. */
export function validarOpciones(manifiesto: ManifiestoPieza, raw: unknown): ResultadoOpciones {
  const r = manifiesto.opciones.safeParse(raw ?? {});
  if (!r.success) return { ok: false, issues: r.error.issues };
  const data = r.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, issues: [{ code: "custom", message: "Las opciones deben ser un objeto", path: [], input: raw }] };
  }
  return { ok: true, opciones: data as Record<string, unknown> };
}

/** Una pieza prendida y lista para correr: la asignación validada + su código. */
export interface PiezaResuelta extends PiezaAsignada {
  entrada: EntradaServidor;
}

/**
 * Una fila rota (pieza borrada del código, opciones que ya no pasan) se lee en
 * CADA visita a la portada: se avisa una vez por proceso, no mil veces.
 */
const yaAvisadas = new Set<string>();
function avisarUnaVez(fila: FilaPieza, etapa: string, mensaje: string): void {
  const clave = `${fila.tenantId}:${fila.piezaId}:${fila.enchufe}:${etapa}:${fila.updatedAt.valueOf()}`;
  if (yaAvisadas.has(clave)) return;
  yaAvisadas.add(clave);
  reportarFalloPieza(new Error(mensaje), { piezaId: fila.piezaId, enchufe: fila.enchufe, tenantId: fila.tenantId, etapa });
}

/** Fila → pieza válida, o `null` (pieza que el código ya no tiene, enchufe que no llena, opciones rotas). */
function aPieza(fila: FilaPieza): PiezaResuelta | null {
  const entrada = REGISTRO_SERVIDOR.get(fila.piezaId);
  if (!entrada) {
    avisarUnaVez(fila, "huerfana", `La pieza ${fila.piezaId} está asignada pero no existe en el código`);
    return null;
  }
  if (!esEnchufe(fila.enchufe) || !entrada.manifiesto.enchufes.includes(fila.enchufe)) {
    avisarUnaVez(fila, "enchufe", `La pieza ${fila.piezaId} no llena el enchufe ${fila.enchufe}`);
    return null;
  }
  const op = validarOpciones(entrada.manifiesto, fila.opciones);
  if (!op.ok) {
    avisarUnaVez(fila, "opciones", `Opciones inválidas: ${op.issues.map((i) => i.message).join("; ")}`);
    return null;
  }
  return {
    piezaId: fila.piezaId,
    enchufe: fila.enchufe,
    opciones: op.opciones,
    version: fila.version,
    orden: fila.orden,
    entrada,
  };
}

/** Las piezas prendidas de un negocio en un enchufe, ya validadas y en orden. */
export async function resolverPiezas(tenantId: string, enchufe: EnchufeId): Promise<PiezaResuelta[]> {
  try {
    const filas = await TenantPiezaDB.listarPrendidas(tenantId, enchufe);
    return filas.map(aPieza).filter((p): p is PiezaResuelta => p !== null);
  } catch (err) {
    reportarFalloPieza(err, { enchufe, tenantId, etapa: "leer" });
    return [];
  }
}

export interface PiezasDelPanel {
  piezas: PiezaAsignada[];
  negocio: NegocioDePiezas | null;
}

/**
 * Lo que `/api/admin/me/specializations` suma para el panel: TODAS las
 * prendidas del negocio de la sesión, sin el código (eso lo carga el
 * navegador desde su registro). Falla cerrado: ante cualquier error, ninguna.
 */
export async function piezasDelPanel(tenantId: string): Promise<PiezasDelPanel> {
  try {
    const filas = await TenantPiezaDB.listarPrendidas(tenantId);
    const piezas = filas
      .map(aPieza)
      .filter((p): p is PiezaResuelta => p !== null)
      .map(({ entrada: _entrada, ...asignada }) => asignada);
    if (piezas.length === 0) return { piezas, negocio: null };
    const t = await TenantsDB.getBasicById(tenantId);
    return { piezas, negocio: t ? { tenantId, slug: t.slug } : null };
  } catch (err) {
    reportarFalloPieza(err, { enchufe: "*", tenantId, etapa: "leer" });
    return { piezas: [], negocio: null };
  }
}

// ─── Superadmin ──────────────────────────────────────────────────────────────

export interface PiezaDelCatalogo {
  id: string;
  nombre: string;
  descripcion: string;
  version: string;
  enchufes: readonly EnchufeId[];
  rubros: readonly string[];
  requiere: readonly string[];
  /** JSON Schema (entrada) de las opciones: con esto se arma el formulario. */
  opcionesSchema: unknown;
  /** Lo que vale `{}` después de los `.default()`; `null` si la pieza exige llenar algo. */
  opcionesPorDefecto: Record<string, unknown> | null;
}

function aJsonSchema(schema: z.ZodType): unknown {
  try {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  } catch {
    // Un schema que no se puede describir no rompe el catálogo: el formulario cae a JSON crudo.
    return null;
  }
}

/** El catálogo de piezas que existen en el código, para la pantalla del superadmin. */
export function catalogoDePiezas(): PiezaDelCatalogo[] {
  return PIEZAS_SERVIDOR.map(({ manifiesto: m }) => {
    const porDefecto = validarOpciones(m, {});
    return {
      id: m.id,
      nombre: m.nombre,
      descripcion: m.descripcion,
      version: m.version,
      enchufes: m.enchufes,
      rubros: m.rubros ?? [],
      requiere: m.requiere ?? [],
      opcionesSchema: aJsonSchema(m.opciones),
      opcionesPorDefecto: porDefecto.ok ? porDefecto.opciones : null,
    };
  });
}

/** ADR-458 · de quién es una página propia (`tienda.pagina`): el negocio que tiene su fila, prendida o apagada. */
export interface DuenoDePagina {
  tenantId: string;
  nombre: string;
}

export type PiezaDelCatalogoConDueno = PiezaDelCatalogo & {
  /**
   * Sólo en las piezas que llenan `tienda.pagina`: el negocio que ya la tiene
   * (prendida o apagada) o `null` si está libre. Asignarla a otro da 409.
   */
  duenoPagina?: DuenoDePagina | null;
};

/**
 * Suma `duenoPagina` a las páginas propias del catálogo, leyendo la MISMA
 * matriz que viaja al superadmin (sin otra consulta). Una página propia tiene
 * a lo sumo un dueño: lo garantiza `TenantPiezaDB.guardar`.
 */
export function conDuenoDePagina(
  catalogo: readonly PiezaDelCatalogo[],
  matriz: readonly Pick<FilaMatriz, "piezaId" | "enchufe" | "tenantId" | "tenantNombre" | "tenantSlug">[],
): PiezaDelCatalogoConDueno[] {
  return catalogo.map((p) => {
    if (!p.enchufes.includes(ENCHUFE_PAGINA)) return p;
    const fila = matriz.find((f) => f.piezaId === p.id && f.enchufe === ENCHUFE_PAGINA);
    return { ...p, duenoPagina: fila ? { tenantId: fila.tenantId, nombre: fila.tenantNombre || fila.tenantSlug } : null };
  });
}

export interface FilaDeLaMatriz extends FilaMatriz {
  /** La pieza ya no está en el código: la fila no hace nada. */
  huerfana: boolean;
  /** Se guardó con otra versión del manifiesto que la que corre hoy. */
  desactualizada: boolean;
  /** Las opciones guardadas pasan el Zod de HOY (si no, la pieza no corre). */
  opcionesValidas: boolean;
}

export function anotarFilaDeMatriz(f: FilaMatriz): FilaDeLaMatriz {
  const entrada = REGISTRO_SERVIDOR.get(f.piezaId);
  return {
    ...f,
    huerfana: !entrada,
    desactualizada: Boolean(entrada && entrada.manifiesto.version !== f.version),
    opcionesValidas: Boolean(entrada && validarOpciones(entrada.manifiesto, f.opciones).ok),
  };
}

export type ResultadoAsignacion =
  | { ok: true; manifiesto: ManifiestoPieza; opciones: Record<string, unknown> }
  | { ok: false; status: 400; error: string; mensaje: string; issues?: z.core.$ZodIssue[] };

/**
 * Apagar una pieza: sólo hace falta que la pieza exista y llene el enchufe. Las
 * opciones no se miran — una pieza cuyas opciones viejas ya no validan contra
 * el manifiesto nuevo tiene que poder apagarse igual (revisión 2026-10-01).
 */
export function validarApagado(
  piezaId: string,
  enchufe: EnchufeId,
): { ok: true; manifiesto: ManifiestoPieza } | Extract<ResultadoAsignacion, { ok: false }> {
  const v = validarAsignacion(piezaId, enchufe, undefined);
  if (v.ok || v.error !== "opciones_invalidas") return v.ok ? { ok: true, manifiesto: v.manifiesto } : v;
  const entrada = REGISTRO_SERVIDOR.get(piezaId);
  return entrada ? { ok: true, manifiesto: entrada.manifiesto } : v;
}

/** Pieza que existe + enchufe que llena + opciones que pasan su Zod `.strict()`. */
export function validarAsignacion(piezaId: string, enchufe: EnchufeId, opciones: unknown): ResultadoAsignacion {
  const entrada = REGISTRO_SERVIDOR.get(piezaId);
  if (!entrada) {
    return { ok: false, status: 400, error: "pieza_desconocida", mensaje: `No hay una pieza «${piezaId}» en el código.` };
  }
  if (!entrada.manifiesto.enchufes.includes(enchufe)) {
    return {
      ok: false,
      status: 400,
      error: "enchufe_no_soportado",
      mensaje: `La pieza «${piezaId}» no llena el enchufe «${enchufe}» (llena: ${entrada.manifiesto.enchufes.join(", ")}).`,
    };
  }
  const op = validarOpciones(entrada.manifiesto, opciones);
  if (!op.ok) {
    return { ok: false, status: 400, error: "opciones_invalidas", mensaje: "Las opciones no pasan la validación de la pieza.", issues: op.issues };
  }
  return { ok: true, manifiesto: entrada.manifiesto, opciones: op.opciones };
}
