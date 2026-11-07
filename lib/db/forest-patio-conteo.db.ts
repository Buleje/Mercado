import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { ConteoPatio } from "@/lib/forestal/conteo-patio";
import {
  actaParaGuardar,
  conteoPatioSchema,
  type ActaConteoDetalle,
  type FaltanteConteo,
  type GuardarConteoInput,
  type ResumenActaConteo,
  type SobranteConteo,
  type SorpresaConteo,
} from "@/lib/forestal/conteo-patio-guardado";

/**
 * ForestPatioConteoDB — las actas de los conteos físicos del patio
 * (Brandon 2026-09-26, sobre ADR-436).
 *
 * El conteo se hace en la tablet (localStorage mientras se cuenta); al
 * terminar se guarda acá para que el historial y las diferencias los vea todo
 * el negocio. Es un ACTA, no un asiento: no mueve saldos, no la frena el cierre.
 *
 * Idempotente por `(tenantId, iniciadoEn)`: el mismo conteo guardado otra vez
 * —doble toque, o «Seguir contando» y terminar de nuevo— ACTUALIZA su acta.
 * Toda lectura y escritura lleva `tenantId` en el WHERE.
 *
 * Nunca hacia atrás (2026-09-26): la tablet puede subir desde su cola una
 * versión VIEJA del acta después de la nueva (v1 quedó encolada, v2 entró
 * directo). Un acta cuyo `terminadoEn` es anterior al guardado —o sin terminar
 * contra una terminada— no pisa: se responde el acta vigente con
 * `obsoleta: true`. La condición va en el mismo UPDATE (atómica: dos tablets a
 * la vez no la saltean).
 */

const CACHE_PREFIX = "forest-patio-conteo";
const TTL_LISTA_SEG = 15;

/** Tope del historial: medio año de conteos semanales, de sobra para mirar tendencia. */
export const LIMITE_HISTORIAL_CONTEOS = 50;

const num = (v: unknown) => (v == null ? null : Number(v));
const isoONulo = (d: Date | null) => (d ? d.toISOString() : null);

/** Lee un JSON guardado como lista; lo que no sea array (dato viejo o roto) = vacío. */
const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function esChoqueUnico(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/** El UPDATE condicional no encontró la fila: el acta guardada es más nueva. */
function esSinFila(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";
}

/**
 * Cuándo el acta que llega PUEDE pisar a la guardada: la guardada no terminó, o
 * terminó antes (o a la vez: el mismo envío dos veces) que la que llega. Una
 * sin terminar nunca pisa a una terminada.
 */
function puedePisar(terminadoEn: Date | null): { OR: Prisma.ForestPatioConteoWhereInput[] } | { terminadoEn: null } {
  return terminadoEn
    ? { OR: [{ terminadoEn: null }, { terminadoEn: { lte: terminadoEn } }] }
    : { terminadoEn: null };
}

type Fila = NonNullable<Awaited<ReturnType<typeof prisma.forestPatioConteo.findFirst>>>;

function aResumen(
  f: Omit<Fila, "faltantes" | "sobrantes" | "sorpresas" | "detalle" | "tenantId">,
  cuentas: { faltan: number; sobrantes: number; sorpresas: number },
): ResumenActaConteo {
  return {
    id: f.id,
    fecha: f.fecha.toISOString().slice(0, 10),
    hechoPor: f.hechoPor,
    registradoPor: f.registradoPor,
    iniciadoEn: f.iniciadoEn.toISOString(),
    terminadoEn: isoONulo(f.terminadoEn),
    truncado: f.truncado,
    esperadas: f.esperadas,
    contadas: f.contadas,
    faltan: cuentas.faltan,
    sobrantes: cuentas.sobrantes,
    sorpresas: cuentas.sorpresas,
    m3Esperado: num(f.m3Esperado),
    m3Contado: num(f.m3Contado),
    notas: f.notas,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

export const ForestPatioConteoDB = {
  /**
   * Guarda (o actualiza) el acta. Los totales los recalcula `actaParaGuardar`
   * sobre la foto del patio que usó el equipo — la de ESE momento.
   */
  async guardar(
    tenantId: string,
    input: GuardarConteoInput,
    usuario: string,
  ): Promise<{ acta: ResumenActaConteo; creada: boolean; obsoleta: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const c: ConteoPatio = input.conteo;
    const acta = actaParaGuardar(c);
    const iniciadoEn = new Date(acta.iniciadoEn);
    const datos = {
      fecha: new Date(`${acta.fecha}T00:00:00.000Z`),
      hechoPor: c.quien.trim() || usuario,
      registradoPor: usuario,
      terminadoEn: acta.terminadoEn ? new Date(acta.terminadoEn) : null,
      fotoEn: new Date(acta.fotoEn),
      truncado: acta.truncado,
      esperadas: acta.esperadas,
      contadas: acta.contadas,
      m3Esperado: acta.m3Esperado,
      m3Contado: acta.m3Contado,
      faltantes: acta.faltantes as unknown as Prisma.InputJsonValue,
      sobrantes: acta.sobrantes as unknown as Prisma.InputJsonValue,
      sorpresas: acta.sorpresas as unknown as Prisma.InputJsonValue,
      detalle: c as unknown as Prisma.InputJsonValue,
      notas: input.notas?.trim() || null,
    };
    const clave = { tenantId_iniciadoEn: { tenantId, iniciadoEn } };

    type Escrito = { fila: Fila; creada: boolean; obsoleta: boolean };
    const escribir = async (): Promise<Escrito> => {
      const previa = await prisma.forestPatioConteo.findUnique({ where: clave, select: { id: true } });
      if (previa) {
        try {
          const fila = await prisma.forestPatioConteo.update({
            where: { ...clave, ...puedePisar(datos.terminadoEn) },
            data: datos,
          });
          return { fila, creada: false, obsoleta: false };
        } catch (err) {
          if (!esSinFila(err)) throw err;
          /* La guardada es más nueva: se deja como está y se devuelve ella. */
          return {
            fila: await prisma.forestPatioConteo.findUniqueOrThrow({ where: clave }),
            creada: false,
            obsoleta: true,
          };
        }
      }
      return {
        fila: await prisma.forestPatioConteo.create({ data: { tenantId, iniciadoEn, ...datos } }),
        creada: true,
        obsoleta: false,
      };
    };
    let r: Escrito;
    try {
      r = await escribir();
    } catch (err) {
      /* Doble toque: las dos llegaron a la vez y la segunda chocó con el
         índice único al crear. Ya existe — se actualiza. */
      if (!esChoqueUnico(err)) throw err;
      r = await escribir();
    }

    if (r.obsoleta) {
      logger.info("[forest-patio-conteo] llegó una versión vieja del acta: no pisa la guardada", {
        tenantId,
        actaId: r.fila.id,
        terminadoEnLlega: acta.terminadoEn,
        terminadoEnGuardado: isoONulo(r.fila.terminadoEn),
      });
      const faltantes = lista<FaltanteConteo>(r.fila.faltantes);
      const sobrantes = lista<SobranteConteo>(r.fila.sobrantes);
      const sorpresas = lista<SorpresaConteo>(r.fila.sorpresas);
      return {
        acta: aResumen(r.fila, { faltan: faltantes.length, sobrantes: sobrantes.length, sorpresas: sorpresas.length }),
        creada: false,
        obsoleta: true,
      };
    }

    auditCtp({
      tenantId,
      action: "ctp_patio_conteo",
      entity: "ForestPatioConteo",
      entityId: r.fila.id,
      detail:
        `${r.creada ? "Guardó" : "Actualizó"} el acta del conteo del patio del ${acta.fecha} (contó ${datos.hechoPor}): ` +
        `${acta.contadas} de ${acta.esperadas} encontradas (${fmtM3(acta.m3Contado)} de ${fmtM3(acta.m3Esperado)} m³) · ` +
        `faltan ${acta.faltantes.length} · sobran ${acta.sobrantes.length} · códigos desconocidos ${acta.sorpresas.length}`,
      user: usuario,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.warn("[forest-patio-conteo] no se pudo invalidar la caché", { error: String(err) });
    }

    return {
      acta: aResumen(r.fila, {
        faltan: acta.faltantes.length,
        sobrantes: acta.sobrantes.length,
        sorpresas: acta.sorpresas.length,
      }),
      creada: r.creada,
      obsoleta: false,
    };
  },

  /** El historial: los últimos conteos, del más nuevo al más viejo, sin las listas. */
  async listar(tenantId: string, limite = LIMITE_HISTORIAL_CONTEOS): Promise<ResumenActaConteo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = Math.min(Math.max(Math.trunc(limite) || 1, 1), LIMITE_HISTORIAL_CONTEOS);
    return getOrSet(`${CACHE_PREFIX}:${tenantId}:lista:${n}`, TTL_LISTA_SEG, async () => {
      /* Las listas se CUENTAN en la base (`jsonb_array_length`): traerlas para
         contarlas pagaría cientos de filas por acta en un historial de 50. */
      const filas = await prisma.$queryRaw<
        {
          id: string;
          fecha: string;
          hechoPor: string;
          registradoPor: string | null;
          iniciadoEn: string;
          terminadoEn: string | null;
          truncado: boolean;
          esperadas: number;
          contadas: number;
          nFaltantes: number;
          nSobrantes: number;
          nSorpresas: number;
          m3Esperado: unknown;
          m3Contado: unknown;
          notas: string | null;
          createdAt: string;
          updatedAt: string;
        }[]
      >`
        SELECT "id",
               to_char("fecha", 'YYYY-MM-DD') AS "fecha",
               "hechoPor", "registradoPor",
               to_char("iniciadoEn", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "iniciadoEn",
               to_char("terminadoEn", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "terminadoEn",
               "truncado", "esperadas", "contadas",
               CASE WHEN jsonb_typeof("faltantes") = 'array' THEN jsonb_array_length("faltantes") ELSE 0 END AS "nFaltantes",
               CASE WHEN jsonb_typeof("sobrantes") = 'array' THEN jsonb_array_length("sobrantes") ELSE 0 END AS "nSobrantes",
               CASE WHEN jsonb_typeof("sorpresas") = 'array' THEN jsonb_array_length("sorpresas") ELSE 0 END AS "nSorpresas",
               "m3Esperado", "m3Contado", "notas",
               to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
               to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
        FROM "ForestPatioConteo"
        WHERE "tenantId" = ${tenantId}
        ORDER BY "fecha" DESC, "iniciadoEn" DESC
        LIMIT ${n}
      `;
      return filas.map((f) => ({
        id: f.id,
        fecha: f.fecha,
        hechoPor: f.hechoPor,
        registradoPor: f.registradoPor,
        iniciadoEn: f.iniciadoEn,
        terminadoEn: f.terminadoEn,
        truncado: f.truncado,
        esperadas: Number(f.esperadas),
        contadas: Number(f.contadas),
        faltan: Number(f.nFaltantes),
        sobrantes: Number(f.nSobrantes),
        sorpresas: Number(f.nSorpresas),
        m3Esperado: num(f.m3Esperado),
        m3Contado: num(f.m3Contado),
        notas: f.notas,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));
    });
  },

  /**
   * El acta entera: las tres listas y el conteo del equipo para reimprimirla
   * con `actaDelConteo`. Un `detalle` que ya no valide (formato viejo) viaja
   * en `null`: las listas siguen, lo que no se puede es reimprimir igual.
   */
  async porId(tenantId: string, id: string): Promise<ActaConteoDetalle | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await prisma.forestPatioConteo.findFirst({ where: { tenantId, id } });
    if (!f) return null;
    const faltantes = lista<FaltanteConteo>(f.faltantes);
    const sobrantes = lista<SobranteConteo>(f.sobrantes);
    const sorpresas = lista<SorpresaConteo>(f.sorpresas);
    const conteo = conteoPatioSchema.safeParse(f.detalle);
    return {
      resumen: aResumen(f, { faltan: faltantes.length, sobrantes: sobrantes.length, sorpresas: sorpresas.length }),
      faltantes,
      sobrantes,
      sorpresas,
      conteo: conteo.success ? conteo.data : null,
    };
  },
};
