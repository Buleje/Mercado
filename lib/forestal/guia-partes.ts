/**
 * guia-partes — el mismo juez para una parte, la mire el Directorio o la guía.
 *
 * ## Por qué existe
 *
 * `faltantesParaGuia` (en `directorio.ts`) sabe desde hace tiempo qué le falta a
 * un destinatario, a un transportista o a un chofer para poder ir en una guía:
 * documento, dirección, licencia. Pero sólo lo usaba la vista del Directorio
 * para pintar un chip — nunca fue condición de nada. Así que una guía podía
 * imprimirse con un transportista sin RUC y un chofer sin brevete, que son
 * justamente los dos papeles que pide un puesto de control.
 *
 * `faltantesGtf` mira los campos TIPEADOS en la guía (nombre, dirección, placa,
 * conductor) y bloquea la impresión del original. Acá se cierra el hueco que
 * queda entre los dos: se arma la parte tal como quedó en la guía —venga de la
 * libreta o tipeada a mano— y se la juzga con el criterio del Directorio,
 * dejando afuera lo que `faltantesGtf` ya reporta para no decir dos veces lo
 * mismo con dos redacciones distintas.
 *
 * **Avisa, no bloquea.** La guía se imprime igual: el operador puede estar
 * despachando con el chofer todavía sin definir, y un aserradero que nunca
 * emitió una guía no necesita una pared más. Lo que no puede es enterarse en el
 * puesto de control.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import type { FaltanteGtf, GtfDatos } from "./ctp-gtf-datos";
import { faltantesParaGuiaDetalle, type Parte, type RolParte } from "./directorio";

/** Los tres papeles de la guía que el Directorio sabe juzgar. */
export type RolEnGuia = Extract<RolParte, "destinatario" | "transportista" | "conductor">;

const SECCION: Record<RolEnGuia, FaltanteGtf["seccion"]> = {
  destinatario: "destinatario",
  transportista: "transportista",
  // El chofer vive dentro del bloque del vehículo en el formulario de la guía.
  conductor: "vehiculo",
};

const COMO_SE_LLAMA: Record<RolEnGuia, string> = {
  destinatario: "Destinatario",
  transportista: "Transportista",
  conductor: "Conductor",
};

/**
 * Lo que `faltantesGtf` YA reporta: no se repite acá.
 *
 * Se filtra por clave y no por texto justamente porque las redacciones de las
 * dos listas son distintas ("Dirección del destinatario" vs "dirección (es el
 * punto de llegada)") y verlas juntas se lee como dos problemas.
 */
const YA_LO_MIRA_LA_GUIA = new Set(["nombre", "direccion"]);

/**
 * La parte tal como quedó EN la guía, con la forma que el Directorio juzga.
 *
 * Los campos que la guía no tiene van vacíos: `faltantesParaGuiaDetalle` sólo
 * lee nombre, documento, ubicación y licencia. No se inventa nada.
 */
export function parteSegunLaGuia(datos: GtfDatos, rol: RolEnGuia): Parte {
  const base = {
    id: `guia:${rol}`,
    roles: [rol] as RolParte[],
    categoria: null,
    codigoCtp: null,
    zona: null,
    ubigeo: null,
    telefono: null,
    email: null,
    registroMtc: null,
    licencia: null,
    tituloHabilitante: null,
    resolucion: null,
    planManejo: null,
    arffs: null,
    representante: null,
    representanteDni: null,
    notas: null,
    activo: true,
    usos: 0,
    ultimoUso: null,
    logo: null,
    adjuntos: [],
    docTipo: null,
    direccion: null,
    region: null,
    provincia: null,
    distrito: null,
  };

  if (rol === "conductor") {
    return {
      ...base,
      nombre: datos.vehiculo.conductor.trim(),
      docTipo: "DNI" as const,
      docNumero: datos.vehiculo.conductorDni.trim() || null,
      licencia: datos.vehiculo.licencia.trim() || null,
    };
  }

  const p = rol === "destinatario" ? datos.destinatario : datos.transportista;
  return {
    ...base,
    nombre: p.nombre.trim(),
    docTipo: p.docTipo,
    docNumero: p.docNumero.trim() || null,
    direccion: p.direccion.trim() || null,
    // La guía guarda el departamento; la libreta lo llama región. Es el mismo
    // casillero (17)/(26) del formato.
    region: p.departamento.trim() || null,
    provincia: p.provincia.trim() || null,
    distrito: p.distrito.trim() || null,
  };
}

/**
 * Lo que le falta a las PARTES de la guía y `faltantesGtf` no mira: el documento
 * del destinatario y del transportista, la licencia del chofer.
 *
 * Una parte todavía en blanco no se juzga: si el transportista ni siquiera
 * tiene nombre, el faltante que importa es "no hay transportista" —que ya dice
 * `faltantesGtf`— y no "le falta el documento".
 */
export function faltantesDePartes(datos: GtfDatos): FaltanteGtf[] {
  const out: FaltanteGtf[] = [];
  for (const rol of ["destinatario", "transportista", "conductor"] as const) {
    const parte = parteSegunLaGuia(datos, rol);
    if (!parte.nombre) continue;
    for (const f of faltantesParaGuiaDetalle(parte, rol)) {
      if (YA_LO_MIRA_LA_GUIA.has(f.clave)) continue;
      out.push({
        seccion: SECCION[rol],
        campo: `${f.clave === "licencia" ? "Licencia del" : "Documento del"} ${COMO_SE_LLAMA[rol].toLowerCase()}`,
        motivo:
          f.clave === "licencia"
            ? "Es lo primero que pide un puesto de control al chofer, y la guía lo declara"
            : "Sin documento no se puede cruzar a quién se le despachó: el mismo nombre escrito de dos formas son dos empresas",
      });
    }
  }
  return out;
}
