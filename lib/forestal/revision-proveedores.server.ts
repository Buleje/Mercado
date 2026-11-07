import "server-only";

import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { consultarInfractores } from "@/lib/integrations/serfor-infractores";
import { consultarOsinfor } from "@/lib/integrations/osinfor";
import { codigoConsultable, type ResumenOsinfor } from "@/lib/forestal/osinfor-supervisiones";
import type { ResumenInfractores } from "@/lib/forestal/serfor-infractores";
import {
  MAX_PERMISOS_OSINFOR,
  agruparPorTitular,
  resumirRevision,
  revisarGrupo,
  type FilaRevision,
  type GrupoRevision,
  type ResumenRevision,
} from "@/lib/forestal/revision-proveedores";

/**
 * «Revisar a todos mis proveedores» con la red: toda la libreta de un negocio
 * contra el Registro de Infractores de SERFOR (lista pública en la memoria del
 * servidor) y el mapa de OSINFOR (por código, de a 4, caché 12 h). Lo usan el
 * botón de Cumplimiento (`GET …/serfor-infractores/directorio`) y el vigilante
 * mensual (`/api/cron/vigilante-proveedores`): el mismo cálculo, dos relojes.
 * Solo lee el negocio; a OSINFOR solo viaja el código del permiso.
 */

const DE_A = 4;

export interface OpcionesRevision {
  /** Pasado esto no se piden más permisos a OSINFOR (el botón: 20 s, la función de Vercel corta a los 30). */
  presupuestoOsinforMs: number;
  /** Tope de permisos que se consultan a OSINFOR en una pasada. */
  maxPermisos?: number;
}

export interface RevisionDelNegocio {
  /** Todas las filas (también las limpias): el vigilante necesita saber quién sigue y quién salió. */
  filas: FilaRevision[];
  resumen: ResumenRevision;
  grupos: number;
  /** Permisos con código consultable (sin repetir). */
  permisos: number;
  /** Fecha de la lista de SERFOR (YYYY-MM-DD) o null. */
  corteSerfor: string | null;
  ms: number;
}

/** Las búsquedas en SERFOR de una persona: ella misma y cada uno de sus permisos. */
async function serforDelGrupo(g: GrupoRevision): Promise<ResumenInfractores[] | null> {
  const busquedas = [
    ...(g.parteId ? [{ documento: g.documento, nombre: g.nombre }] : []),
    ...g.permisos.map((k) => ({
      codigo: k.codigo,
      documento: k.titularDoc ?? g.documento,
      nombre: k.titularNombre,
    })),
  ];
  const out: ResumenInfractores[] = [];
  for (const b of busquedas) {
    const r = await consultarInfractores(b);
    if (!r) return null;
    out.push(r);
  }
  return out;
}

/** Los códigos que no entran en el mapa no se consultaron (se acabó el tiempo): la fila lo dice. */
async function osinforDeCodigos(
  codigos: string[],
  inicio: number,
  presupuestoMs: number,
): Promise<Map<string, ResumenOsinfor | null>> {
  const res = new Map<string, ResumenOsinfor | null>();
  for (let i = 0; i < codigos.length; i += DE_A) {
    if (Date.now() - inicio > presupuestoMs) break;
    const tanda = codigos.slice(i, i + DE_A);
    const respuestas = await Promise.all(tanda.map((c) => consultarOsinfor(c)));
    tanda.forEach((c, j) => res.set(c, respuestas[j] ?? null));
  }
  return res;
}

/** null = SERFOR no respondió: sin la lista no hay revisión que valga (ni para avisar ni para dar por limpio). */
export async function revisarProveedoresDelNegocio(
  tenantId: string,
  opts: OpcionesRevision,
): Promise<RevisionDelNegocio | null> {
  if (!tenantId) throw new Error("tenantId is required");
  const inicio = Date.now();
  const [partes, contratos] = await Promise.all([
    ForestDirectorioDB.listarPartes(tenantId),
    ForestContratoDB.list(tenantId),
  ]);
  const grupos = agruparPorTitular(
    partes.map((p) => ({ id: p.id, nombre: p.nombre, docNumero: p.docNumero, roles: p.roles })),
    contratos.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      titularNombre: c.titularNombre,
      titularId: c.titularId,
      titularDoc: c.titularDoc,
    })),
  );

  const codigos = [
    ...new Set(
      grupos
        .flatMap((g) => g.permisos.map((k) => codigoConsultable(k.codigo)))
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  const [serfor, osinfor] = await Promise.all([
    Promise.all(grupos.map(serforDelGrupo)),
    osinforDeCodigos(codigos.slice(0, opts.maxPermisos ?? MAX_PERMISOS_OSINFOR), inicio, opts.presupuestoOsinforMs),
  ]);
  if (serfor.some((s) => s == null)) return null;

  const filas = grupos.map((g, i) => revisarGrupo(g, serfor[i] ?? [], osinfor));
  return {
    filas,
    resumen: resumirRevision(filas),
    grupos: grupos.length,
    permisos: codigos.length,
    corteSerfor: serfor.flat().find((r) => r?.corte)?.corte ?? null,
    ms: Date.now() - inicio,
  };
}
