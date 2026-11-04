/**
 * «Revisar a todos mis proveedores» (Cumplimiento › Chequeo del período).
 *
 * El botón «Revisar en OSINFOR y SERFOR» mira UN permiso o UNA ficha. Esto
 * hace lo mismo con toda la libreta de una vez: agrupa cada permiso con la
 * ficha de su titular (una persona = una fila), junta las sanciones de SERFOR
 * que salen por su documento, su nombre o el código de cualquiera de sus
 * permisos (la misma resolución una sola vez), y le pone al lado lo que
 * OSINFOR publica de cada permiso (lista roja, PAU).
 *
 * Cálculo puro: las consultas a la red las hace la ruta; acá no hay fetch.
 */

import {
  clavesDeSancion,
  documentoDe,
  nombreComparable,
  personaDelDocumento,
  type CoincidenciaInfractor,
  type MotivoCoincidencia,
  type ResumenInfractores,
} from "./serfor-infractores";
import { codigoConsultable, type NivelOsinfor, type ResumenOsinfor } from "./osinfor-supervisiones";

/** Los papeles de la libreta que compran, venden o mueven madera. El conductor y el cubicador son personas que trabajan, no titulares. */
export const ROLES_REVISADOS = [
  "proveedor",
  "destinatario",
  "transportista",
  "cliente",
  "establecimiento",
] as const;

/** Tope de permisos que se consultan a OSINFOR en una pasada (cada uno ~1,7 s, de a 4). */
export const MAX_PERMISOS_OSINFOR = 60;

export interface ParteRevisable {
  id: string;
  nombre: string;
  docNumero: string | null;
  roles: readonly string[];
}

export interface PermisoRevisable {
  id: string;
  codigo: string;
  titularNombre: string;
  titularId: string | null;
  titularDoc: string | null;
}

/** Una persona (ficha) con sus permisos, o un permiso cuyo titular no tiene ficha. */
export interface GrupoRevision {
  clave: string;
  parteId: string | null;
  nombre: string;
  documento: string | null;
  permisos: PermisoRevisable[];
}

export type CertezaSerfor = ResumenInfractores["certeza"];

export interface PermisoRevisado {
  id: string;
  codigo: string;
  /** null = OSINFOR no respondió o no se llegó a consultar (ver `sinConsultar`). */
  osinfor: {
    nivel: NivelOsinfor;
    enRoja: number;
    pauEnTramite: number;
    esPlantacion: boolean;
  } | null;
  /** true = ni se le preguntó a OSINFOR (pasó el tope, se acabó el tiempo o el código no es consultable). */
  sinConsultar: boolean;
}

/**
 * «rojo» = sanción por su documento/permiso o permiso en lista roja (la pantalla dice «Sancionado» solo
 * si `certeza` es «segura»; si no, «Lista roja OSINFOR») · «ambar» = PAU en trámite o
 * sanción del permiso a otra persona · «nombre» = solo coincide el nombre · «limpio» = se buscó y
 * no hay nada · «sin_datos» = sin documento, nombre útil ni permiso.
 */
export type NivelRevision = "rojo" | "ambar" | "nombre" | "limpio" | "sin_datos";

export interface FilaRevision {
  clave: string;
  parteId: string | null;
  nombre: string;
  documento: string | null;
  nivel: NivelRevision;
  certeza: CertezaSerfor;
  /** Sanciones de SERFOR sin repetir, las más nuevas primero. */
  sanciones: CoincidenciaInfractor[];
  permisos: PermisoRevisado[];
}

export interface ResumenRevision {
  /** Personas o permisos sueltos revisados. */
  revisados: number;
  permisos: number;
  rojo: number;
  ambar: number;
  nombre: number;
  /** Filas sin RUC/DNI: el cruce por nombre es más flojo. */
  sinDocumento: number;
  /** Fichas sin documento ni nombre útil y sin permisos: no hubo con qué buscar. */
  sinDatos: number;
  /** Permisos a los que se les preguntó a OSINFOR y no contestó. */
  osinforSinRespuesta: number;
  /** Permisos a los que ni se les preguntó (pasaron el tope, se acabó el tiempo o el código no es consultable). */
  osinforSinConsultar: number;
}

const ORDEN_NIVEL: Record<NivelRevision, number> = {
  rojo: 0,
  ambar: 1,
  nombre: 2,
  limpio: 3,
  sin_datos: 4,
};
const ORDEN_CERTEZA: Record<CertezaSerfor, number> = {
  segura: 0,
  del_permiso: 1,
  por_nombre: 2,
  ninguna: 3,
  sin_datos: 4,
};
const PESO_MOTIVO: Record<MotivoCoincidencia, number> = {
  documento: 0,
  permiso: 1,
  permiso_otro: 2,
  nombre: 3,
};

function seRevisa(p: ParteRevisable): boolean {
  return p.roles.some((r) => (ROLES_REVISADOS as readonly string[]).includes(r));
}

/** Los dos tienen documento de la misma clase (DNI con DNI, RUC con RUC) y no es la misma persona = homónimos. */
function sonPersonasDistintas(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const pa = personaDelDocumento(a);
  const pb = personaDelDocumento(b);
  return pa.length === pb.length && pa !== pb;
}

/**
 * Cada permiso va con la ficha de su titular: por `titularId`, si no por el mismo RUC/DNI y,
 * si tampoco, por el mismo nombre (salvo que los dos tengan documento y sea otra persona: un homónimo).
 * El que no encaja queda como fila propia.
 */
export function agruparPorTitular(
  partes: ParteRevisable[],
  permisos: PermisoRevisable[],
): GrupoRevision[] {
  const grupos = new Map<string, GrupoRevision>();
  const porDoc = new Map<string, GrupoRevision>();
  const porNombre = new Map<string, GrupoRevision>();
  const porId = new Map<string, GrupoRevision>();

  for (const p of partes) {
    if (!seRevisa(p)) continue;
    const doc = documentoDe(p.docNumero);
    const g: GrupoRevision = {
      clave: `parte:${p.id}`,
      parteId: p.id,
      nombre: p.nombre,
      documento: doc,
      permisos: [],
    };
    grupos.set(g.clave, g);
    porId.set(p.id, g);
    if (doc && !porDoc.has(personaDelDocumento(doc))) porDoc.set(personaDelDocumento(doc), g);
    const n = nombreComparable(p.nombre);
    if (n && !porNombre.has(n)) porNombre.set(n, g);
  }

  for (const k of permisos) {
    const doc = documentoDe(k.titularDoc);
    const nombre = nombreComparable(k.titularNombre);
    const dePorNombre = nombre ? porNombre.get(nombre) : undefined;
    const titular =
      (k.titularId ? porId.get(k.titularId) : undefined) ??
      (doc ? porDoc.get(personaDelDocumento(doc)) : undefined) ??
      (dePorNombre && !sonPersonasDistintas(dePorNombre.documento, doc) ? dePorNombre : undefined);
    if (titular) {
      titular.permisos.push(k);
      if (!titular.documento && doc) titular.documento = doc;
      continue;
    }
    const g: GrupoRevision = {
      clave: `permiso:${k.id}`,
      parteId: null,
      nombre: k.titularNombre,
      documento: doc,
      permisos: [k],
    };
    grupos.set(g.clave, g);
  }
  return [...grupos.values()];
}

/**
 * Junta varios resúmenes de SERFOR de la misma persona: certeza la mejor, sanciones sin repetir
 * (la misma clave que usa `buscarInfractor`: número-año de la resolución + la persona). Primero se
 * ordena por fuerza del motivo y después se quita la repetida, así el orden de los resúmenes no cambia nada.
 */
export function juntarSerfor(resumenes: ResumenInfractores[]): {
  certeza: CertezaSerfor;
  sanciones: CoincidenciaInfractor[];
} {
  let certeza: CertezaSerfor = "sin_datos";
  const candidatas: CoincidenciaInfractor[] = [];
  for (const r of resumenes) {
    if (ORDEN_CERTEZA[r.certeza] < ORDEN_CERTEZA[certeza]) certeza = r.certeza;
    candidatas.push(...r.coincidencias);
  }
  candidatas.sort((a, b) => PESO_MOTIVO[a.motivo] - PESO_MOTIVO[b.motivo]);
  const vistas = new Set<string>();
  const sanciones: CoincidenciaInfractor[] = [];
  for (const c of candidatas) {
    const claves = clavesDeSancion(c);
    if (claves.some((k) => vistas.has(k))) continue;
    for (const k of claves) vistas.add(k);
    sanciones.push(c);
  }
  sanciones.sort(
    (a, b) =>
      PESO_MOTIVO[a.motivo] - PESO_MOTIVO[b.motivo] || (b.fecha ?? "").localeCompare(a.fecha ?? ""),
  );
  return { certeza, sanciones };
}

/** «rojo» no siempre es sanción de SERFOR: sin certeza «segura» viene solo de la lista roja de OSINFOR. */
export function nivelDeFila(certeza: CertezaSerfor, permisos: PermisoRevisado[]): NivelRevision {
  const osinfor = permisos.map((p) => p.osinfor?.nivel).filter((n): n is NivelOsinfor => n != null);
  if (certeza === "segura" || osinfor.includes("rojo")) return "rojo";
  if (certeza === "del_permiso" || osinfor.includes("ambar")) return "ambar";
  if (certeza === "por_nombre") return "nombre";
  if (certeza === "sin_datos" && permisos.length === 0) return "sin_datos";
  return "limpio";
}

/** Arma la fila de un grupo con lo que respondieron SERFOR (sus búsquedas) y OSINFOR (por código). */
export function revisarGrupo(
  grupo: GrupoRevision,
  serfor: ResumenInfractores[],
  osinfor: ReadonlyMap<string, ResumenOsinfor | null>,
): FilaRevision {
  const { certeza, sanciones } = juntarSerfor(serfor);
  const permisos: PermisoRevisado[] = grupo.permisos.map((k) => {
    const clave = codigoConsultable(k.codigo) ?? k.codigo;
    const o = osinfor.get(clave) ?? null;
    return {
      id: k.id,
      codigo: k.codigo,
      osinfor: o
        ? {
            nivel: o.nivel,
            enRoja: o.enRoja,
            pauEnTramite: o.pauEnTramite,
            esPlantacion: o.esPlantacion,
          }
        : null,
      sinConsultar: !osinfor.has(clave),
    };
  });
  return {
    clave: grupo.clave,
    parteId: grupo.parteId,
    nombre: grupo.nombre,
    documento: grupo.documento,
    nivel: nivelDeFila(certeza, permisos),
    certeza,
    sanciones,
    permisos,
  };
}

/** Lo grave primero; dentro del mismo nivel, la sanción más nueva arriba y después por nombre. */
export function ordenarFilas(filas: FilaRevision[]): FilaRevision[] {
  const ultima = (f: FilaRevision) =>
    f.sanciones.reduce((m, s) => ((s.fecha ?? "") > m ? (s.fecha ?? "") : m), "");
  return [...filas].sort(
    (a, b) =>
      ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel] ||
      ultima(b).localeCompare(ultima(a)) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}

export function resumirRevision(filas: FilaRevision[]): ResumenRevision {
  const cuenta = (n: NivelRevision) => filas.filter((f) => f.nivel === n).length;
  return {
    revisados: filas.length,
    permisos: filas.reduce((s, f) => s + f.permisos.length, 0),
    rojo: cuenta("rojo"),
    ambar: cuenta("ambar"),
    nombre: cuenta("nombre"),
    sinDocumento: filas.filter((f) => !f.documento).length,
    sinDatos: cuenta("sin_datos"),
    osinforSinRespuesta: filas.reduce(
      (s, f) => s + f.permisos.filter((p) => !p.osinfor && !p.sinConsultar).length,
      0,
    ),
    osinforSinConsultar: filas.reduce((s, f) => s + f.permisos.filter((p) => p.sinConsultar).length, 0),
  };
}

/** Las filas que hay que mirar (rojo, ámbar, solo nombre). */
export function filasConAlerta(filas: FilaRevision[]): FilaRevision[] {
  return ordenarFilas(
    filas.filter((f) => f.nivel === "rojo" || f.nivel === "ambar" || f.nivel === "nombre"),
  );
}
