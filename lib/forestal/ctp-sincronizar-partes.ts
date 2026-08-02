import "server-only";

/**
 * ctp-sincronizar-partes.ts — lo que se tipea en una guía entra a la libreta.
 *
 * El directorio existe para no re-tipear al destinatario de siempre, pero se
 * llenaba sólo si alguien lo cargaba a mano: una revisión externa encontró tres
 * despachos con destinatario nombrado y la pestaña «Destinatarios» del
 * Directorio en cero. Doble captura del mismo dato, y encima con dos escrituras
 * distintas del mismo nombre.
 *
 * Acá, al guardar los datos de una GTF de salida, cada parte nombrada entra a
 * la libreta con su rol. `guardarParte` ya hace upsert por documento y UNE los
 * roles, así que la misma empresa que es proveedor y destinatario queda en una
 * sola fila con los dos papeles.
 *
 * ── Por qué sólo con documento ───────────────────────────────────────────────
 * Sin RUC ni DNI, la clave natural de la libreta es NULL y Postgres trata cada
 * NULL como distinto: guardar «Cliente de Prueba SAC» diez veces crearía diez
 * filas iguales. Una parte sin documento se sigue pudiendo cargar a mano —lo que
 * no se hace es fabricarla automáticamente en cada guardado.
 */

import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { normalizarDocumento, type DocTipo, type RolParte } from "@/lib/forestal/directorio";
import { logger } from "@/lib/logger";

/** Una parte tal como viaja en los datos de la guía. */
interface ParteDeGuia {
  nombre?: string | null;
  docTipo?: string | null;
  docNumero?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
}

const DOC_VALIDOS: ReadonlyArray<DocTipo> = ["RUC", "DNI", "CE", "PASAPORTE"];

/** Los datos de la guía que traen partes reconocibles. */
export interface GuiaConPartes {
  propietario?: ParteDeGuia | null;
  destinatario?: ParteDeGuia | null;
  vehiculo?: { conductor?: string | null; conductorDni?: string | null; licencia?: string | null } | null;
}

/**
 * Mete en la libreta a las partes nombradas en la guía. Nunca lanza: es una
 * comodidad, y una guía correcta no puede fallar porque el directorio esté
 * ocupado.
 *
 * Devuelve cuántas entraron — el llamador puede decirlo, o ignorarlo.
 */
export async function sincronizarPartesDeGuia(
  tenantId: string,
  datos: GuiaConPartes,
  usuario: string,
): Promise<number> {
  const candidatas: { rol: RolParte; parte: ParteDeGuia }[] = [];
  if (datos.propietario?.nombre) candidatas.push({ rol: "proveedor", parte: datos.propietario });
  if (datos.destinatario?.nombre) candidatas.push({ rol: "destinatario", parte: datos.destinatario });
  if (datos.vehiculo?.conductor) {
    candidatas.push({
      rol: "conductor",
      parte: { nombre: datos.vehiculo.conductor, docTipo: "DNI", docNumero: datos.vehiculo.conductorDni },
    });
  }

  let guardadas = 0;
  for (const { rol, parte } of candidatas) {
    const docTipo = DOC_VALIDOS.includes((parte.docTipo ?? "") as DocTipo)
      ? ((parte.docTipo ?? "") as DocTipo)
      : undefined;
    const docNumero = normalizarDocumento(parte.docNumero ?? "");
    // Sin documento no se crea: ver la nota de arriba sobre los NULL.
    if (!docTipo || !docNumero) continue;

    try {
      await ForestDirectorioDB.guardarParte(
        tenantId,
        {
          roles: [rol],
          nombre: (parte.nombre ?? "").trim(),
          docTipo,
          docNumero,
          direccion: parte.direccion ?? undefined,
          region: parte.departamento ?? undefined,
          provincia: parte.provincia ?? undefined,
          distrito: parte.distrito ?? undefined,
          ...(rol === "conductor" && datos.vehiculo?.licencia
            ? { licencia: datos.vehiculo.licencia }
            : {}),
        },
        usuario,
      );
      guardadas += 1;
    } catch (err) {
      logger.warn("[ctp-sincronizar-partes] no se pudo guardar en la libreta", {
        rol,
        error: String(err),
      });
    }
  }
  return guardadas;
}
