import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizarPlacaPeru } from "@/lib/forestal/placa-peru";
import type { RegistroPlaca } from "@/lib/forestal/placa-historial";

/**
 * PlacaHistorialDB — dónde apareció una placa en ESTE negocio (sólo lectura).
 *
 * Cuatro lugares, los mismos que ya guardan un camión con su gente:
 *   · la ficha del Directorio (`ForestVehiculo`, con su transportista);
 *   · las guías del Libro TH (`ForestGtf`: `gtfDatos` o, en las viejas, las
 *     columnas sueltas `placaVehiculo`/`conductor`…);
 *   · los despachos e ingresos del CTP con su guía (`ForestCtpEntry.gtfDatos`);
 *   · las guías consultadas en SERFOR (`ForestGuiaGuardada.serforGtf`), donde
 *     la placa viene como «V2H-901 / -» y «TRANSPORTISTA» es el chofer.
 *
 * Anuladas (también la que SERFOR marca «Anulada») y dadas de baja no cuentan: una guía anulada pudo anularse
 * justamente por el chofer o la placa equivocados.
 *
 * El SQL compara la placa NORMALIZADA por prefijo (`V2H901%` también encuentra
 * «V2H-901 / W3A-123»); la decisión fina —¿es la placa o el remolque?— la toma
 * `juntarLoDelSistema` con `mismaPlaca`. El prefijo sale de `normalizarPlacaPeru`
 * (sólo A-Z y 0-9), así que no lleva comodines del LIKE.
 */

/** Por lugar: alcanza para ver la más nueva y completar huecos con las de antes. */
const TOPE = 40;

type Texto = string | null;

interface FilaGuia {
  referencia: Texto;
  fecha: Texto;
  placa: Texto;
  placaRemolque: Texto;
  modo: Texto;
  tipo: Texto;
  marca: Texto;
  transportista: Texto;
  transportistaDocTipo: Texto;
  transportistaDoc: Texto;
  conductor: Texto;
  conductorDni: Texto;
  licencia: Texto;
}

interface FilaCtp extends FilaGuia {
  section: Texto;
}

function aRegistro(fuente: RegistroPlaca["fuente"], f: FilaGuia): RegistroPlaca {
  return {
    fuente,
    referencia: f.referencia,
    fecha: f.fecha,
    placa: f.placa ?? "",
    placaRemolque: f.placaRemolque,
    modo: f.modo,
    tipo: f.tipo,
    marca: f.marca,
    transportista: f.transportista,
    transportistaDocTipo: f.transportistaDocTipo,
    transportistaDoc: f.transportistaDoc,
    conductor: f.conductor,
    conductorDni: f.conductorDni,
    licencia: f.licencia,
  };
}

export const PlacaHistorialDB = {
  /** Todas las veces que `placa` aparece en el negocio, sin filtrar por campo. */
  async registros(tenantId: string, placa: string): Promise<RegistroPlaca[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = normalizarPlacaPeru(placa);
    if (!/^[A-Z0-9]{5,8}$/.test(n)) return [];
    const prefijo = `${n}%`;

    const [vehiculo, guiasTh, entradasCtp, guardadas] = await Promise.all([
      prisma.forestVehiculo.findFirst({
        where: { tenantId, placa: n, deletedAt: null },
        select: {
          placa: true,
          placaRemolque: true,
          marca: true,
          tipo: true,
          ultimoUso: true,
          updatedAt: true,
          transportista: { select: { nombre: true, docTipo: true, docNumero: true } },
        },
      }),
      prisma.$queryRaw<FilaGuia[]>`
        SELECT "gtfNumber" AS referencia,
               to_char(coalesce("gtfDate", "createdAt"), 'YYYY-MM-DD') AS fecha,
               coalesce(nullif("gtfDatos"->'vehiculo'->>'placa', ''), "placaVehiculo") AS placa,
               "gtfDatos"->'vehiculo'->>'placaRemolque' AS "placaRemolque",
               "gtfDatos"->'vehiculo'->>'modo' AS modo,
               "gtfDatos"->'vehiculo'->>'tipo' AS tipo,
               "gtfDatos"->'vehiculo'->>'marca' AS marca,
               coalesce(nullif("gtfDatos"->'transportista'->>'nombre', ''), "transportista") AS transportista,
               CASE WHEN nullif("gtfDatos"->'transportista'->>'docNumero', '') IS NOT NULL
                    THEN "gtfDatos"->'transportista'->>'docTipo' END AS "transportistaDocTipo",
               coalesce(nullif("gtfDatos"->'transportista'->>'docNumero', ''), "transportistaDoc") AS "transportistaDoc",
               coalesce(nullif("gtfDatos"->'vehiculo'->>'conductor', ''), "conductor") AS conductor,
               "gtfDatos"->'vehiculo'->>'conductorDni' AS "conductorDni",
               coalesce(nullif("gtfDatos"->'vehiculo'->>'licencia', ''), "conductorLicencia") AS licencia
          FROM "ForestGtf"
         WHERE "tenantId" = ${tenantId}
           AND "deletedAt" IS NULL
           AND status <> 'anulada'
           AND upper(regexp_replace(coalesce(nullif("gtfDatos"->'vehiculo'->>'placa', ''), "placaVehiculo", ''), '[^A-Za-z0-9]', '', 'g')) LIKE ${prefijo}
         ORDER BY coalesce("gtfDate", "createdAt") DESC
         LIMIT ${TOPE}`,
      prisma.$queryRaw<FilaCtp[]>`
        SELECT "gtfNumber" AS referencia,
               section,
               to_char("entryDate", 'YYYY-MM-DD') AS fecha,
               "gtfDatos"->'vehiculo'->>'placa' AS placa,
               "gtfDatos"->'vehiculo'->>'placaRemolque' AS "placaRemolque",
               "gtfDatos"->'vehiculo'->>'modo' AS modo,
               "gtfDatos"->'vehiculo'->>'tipo' AS tipo,
               "gtfDatos"->'vehiculo'->>'marca' AS marca,
               "gtfDatos"->'transportista'->>'nombre' AS transportista,
               CASE WHEN nullif("gtfDatos"->'transportista'->>'docNumero', '') IS NOT NULL
                    THEN "gtfDatos"->'transportista'->>'docTipo' END AS "transportistaDocTipo",
               "gtfDatos"->'transportista'->>'docNumero' AS "transportistaDoc",
               "gtfDatos"->'vehiculo'->>'conductor' AS conductor,
               "gtfDatos"->'vehiculo'->>'conductorDni' AS "conductorDni",
               "gtfDatos"->'vehiculo'->>'licencia' AS licencia
          FROM "ForestCtpEntry"
         WHERE "tenantId" = ${tenantId}
           AND "deletedAt" IS NULL
           AND status <> 'anulado'
           AND "gtfDatos" IS NOT NULL
           AND upper(regexp_replace(coalesce("gtfDatos"->'vehiculo'->>'placa', ''), '[^A-Za-z0-9]', '', 'g')) LIKE ${prefijo}
         ORDER BY "entryDate" DESC
         LIMIT ${TOPE}`,
      // SERFOR: «TRANSPORTISTA» es el chofer (lleva DNI y licencia). La empresa
      // de transporte la guía oficial no la separa: no se inventa.
      prisma.$queryRaw<FilaGuia[]>`
        SELECT "gtfNumber" AS referencia,
               to_char(coalesce("gtfDate", "serforConsultadaEn", "createdAt"), 'YYYY-MM-DD') AS fecha,
               "serforGtf"->>'placa' AS placa,
               NULL::text AS "placaRemolque",
               CASE WHEN "serforGtf"->>'tipoTransporte' ILIKE '%fluvial%' THEN 'fluvial' END AS modo,
               "serforGtf"->>'tipoVehiculo' AS tipo,
               NULL::text AS marca,
               NULL::text AS transportista,
               NULL::text AS "transportistaDocTipo",
               NULL::text AS "transportistaDoc",
               "serforGtf"->>'transportista' AS conductor,
               "serforGtf"->>'transportistaDni' AS "conductorDni",
               "serforGtf"->>'licenciaConducir' AS licencia
          FROM "ForestGuiaGuardada"
         WHERE "tenantId" = ${tenantId}
           AND "deletedAt" IS NULL
           AND "serforGtf" IS NOT NULL
           AND coalesce("serforGtf"->>'estado', '') NOT ILIKE 'anulad%'
           AND upper(regexp_replace(coalesce("serforGtf"->>'placa', ''), '[^A-Za-z0-9]', '', 'g')) LIKE ${prefijo}
         ORDER BY coalesce("gtfDate", "serforConsultadaEn", "createdAt") DESC
         LIMIT ${TOPE}`,
    ]);

    const out: RegistroPlaca[] = [];
    if (vehiculo) {
      const cuando = vehiculo.ultimoUso ?? vehiculo.updatedAt;
      out.push({
        fuente: "directorio",
        referencia: null,
        fecha: cuando ? cuando.toISOString().slice(0, 10) : null,
        placa: vehiculo.placa,
        placaRemolque: vehiculo.placaRemolque,
        tipo: vehiculo.tipo,
        marca: vehiculo.marca,
        transportista: vehiculo.transportista?.nombre ?? null,
        transportistaDocTipo: vehiculo.transportista?.docNumero ? vehiculo.transportista.docTipo : null,
        transportistaDoc: vehiculo.transportista?.docNumero ?? null,
      });
    }
    for (const f of guiasTh) out.push(aRegistro("guia_th", f));
    for (const f of entradasCtp) out.push(aRegistro(f.section === "despacho" ? "despacho_ctp" : "ingreso_ctp", f));
    for (const f of guardadas) out.push(aRegistro("guia_serfor", f));
    return out;
  },
};
