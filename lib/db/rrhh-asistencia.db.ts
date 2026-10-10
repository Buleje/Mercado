import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { dateDeFechaKey, fechaKeyDeDate } from "@/lib/rrhh/fechas";
import {
  esIgualALaViva,
  incluidosEnMasivo,
  revisarMarca,
  type ColaboradorParaMasivo,
  type MarcaNormalizada,
  type OmitidoMasivo,
} from "@/lib/rrhh/asistencia";
import type { AsistenciaRow as DtoAsistenciaRow } from "@/lib/rrhh/dto";
import type { MasivoInput } from "@/lib/rrhh/schemas";
import type { EstadoAsistencia, EstadoColaborador, FechaKey } from "@/lib/rrhh/tipos";

/**
 * AsistenciaDB — la marca de asistencia de cada persona, un día a la vez
 * (ADR-414 §4). `guardar` es la ÚNICA puerta de escritura: recibe marcas YA
 * revisadas por `revisarMarca` (pura) — esta clase no vuelve a decidir si una
 * marca es válida, sólo la persiste con el criterio "corregir = baja lógica +
 * fila nueva".
 *
 * `tenantId` SIEMPRE 1er parámetro. Prisma sólo se usa acá.
 */

export class ColaboradorAjenoError extends Error {
  constructor(public readonly ids: string[]) {
    super("Alguna de estas personas no es de este negocio.");
    this.name = "ColaboradorAjenoError";
  }
}

/**
 * La viva que se iba a dar de baja ya no lo era: otra escritura (otra pestaña,
 * el masivo) la reemplazó o la quitó entre la lectura del batch y esta
 * escritura. `guardar` atrapa esto igual que un P2002 y reintenta UNA vez con
 * una relectura fresca — nunca reporta éxito sobre una fila que ya no es la
 * viva (hallazgo ALTO de revisión, 2026-09-14).
 */
export class VivaCambiadaError extends Error {
  constructor() {
    super("La marca cambió mientras se guardaba: hay que releer.");
    this.name = "VivaCambiadaError";
  }
}

export type AsistenciaRow = DtoAsistenciaRow;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

const toNum = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

type AsistenciaPrismaRow = {
  id: string;
  colaboradorId: string;
  fecha: Date;
  estado: string;
  entradaMin: number | null;
  salidaMin: number | null;
  refrigerioMin: number;
  horas: Prisma.Decimal | null;
  nota: string | null;
  origen: string;
  marcadoPor: string;
  createdAt: Date;
  deletedAt: Date | null;
  reemplazadaPorId: string | null;
  motivoCorreccion: string | null;
};

function mapAsistencia(r: AsistenciaPrismaRow): AsistenciaRow {
  return {
    id: r.id,
    colaboradorId: r.colaboradorId,
    fecha: r.fecha,
    estado: r.estado,
    entradaMin: r.entradaMin,
    salidaMin: r.salidaMin,
    refrigerioMin: r.refrigerioMin,
    horas: r.horas == null ? null : toNum(r.horas),
    nota: r.nota,
    origen: r.origen,
    marcadoPor: r.marcadoPor,
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
    reemplazadaPorId: r.reemplazadaPorId,
    motivoCorreccion: r.motivoCorreccion,
  };
}

/**
 * Escribe UNA marca ya revisada por `revisarMarca`, en el orden que exige el
 * índice único parcial `(tenantId, colaboradorId, fecha) WHERE deletedAt IS
 * NULL`: si hay una viva, se da de baja PRIMERO (sin `reemplazadaPorId`
 * todavía — el índice sólo mira `deletedAt`) y recién después se crea la
 * versión nueva; el puntero `reemplazadaPorId` se completa en un tercer paso,
 * porque no hay FK real sobre esa columna y el `id` de la fila nueva no
 * existe hasta que se crea.
 *
 * BUG medido en QA 2026-09-14: crear la nueva ANTES de dar de baja la viva
 * hace convivir dos filas vivas del mismo (colaboradorId, fecha) dentro de la
 * misma transacción — el índice las rechaza SIEMPRE (503), no sólo en una
 * carrera real entre dos pestañas. Exportada para poder fijar el ORDEN con un
 * mock de `tx` sin tocar una base real.
 */
/**
 * Da de baja la viva de UNA marca — el primer paso de `escribirMarcaEnTx` y
 * el único paso de un `quitar`. `updateMany` con `deletedAt: null` en el
 * `where` (nunca `update` por id pelado): si CERO filas cambian, alguien más
 * ya la tocó entre la lectura del batch y esta escritura — tira
 * `VivaCambiadaError` en vez de reportar éxito sobre una fila que ya no es la
 * viva.
 */
async function darDeBajaVivaEnTx(
  tx: Pick<Prisma.TransactionClient, "asistencia">,
  tenantId: string,
  vivaId: string,
  usuario: string,
  motivo: string | undefined,
): Promise<void> {
  const baja = await tx.asistencia.updateMany({
    where: { id: vivaId, tenantId, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: usuario, motivoCorreccion: motivo ?? null },
  });
  if (baja.count === 0) throw new VivaCambiadaError();
}

export async function escribirMarcaEnTx(
  tx: Pick<Prisma.TransactionClient, "asistencia">,
  tenantId: string,
  m: MarcaNormalizada,
  viva: { id: string } | null,
  ctx: { origen: "manual" | "masivo"; motivo?: string },
): Promise<AsistenciaPrismaRow> {
  if (!m.estado) throw new Error("escribirMarcaEnTx: la marca no tiene estado (¿era un quitar?)");

  if (viva) {
    await darDeBajaVivaEnTx(tx, tenantId, viva.id, m.marcadoPor, ctx.motivo);
  }

  const nueva = await tx.asistencia.create({
    data: {
      tenantId,
      colaboradorId: m.colaboradorId,
      fecha: dateDeFechaKey(m.fecha),
      estado: m.estado,
      entradaMin: m.entradaMin,
      salidaMin: m.salidaMin,
      refrigerioMin: m.refrigerioMin,
      horas: m.horas != null ? new Prisma.Decimal(m.horas) : undefined,
      nota: m.nota,
      origen: ctx.origen,
      marcadoPor: m.marcadoPor,
    },
  });

  if (viva) {
    await tx.asistencia.update({ where: { id: viva.id, tenantId }, data: { reemplazadaPorId: nueva.id } });
  }

  return nueva;
}

const COLABORADOR_MIN_SELECT = { puesto: { select: { id: true, nombre: true } } } satisfies Prisma.ColaboradorInclude;
type ColaboradorMinPrismaRow = Prisma.ColaboradorGetPayload<{ include: typeof COLABORADOR_MIN_SELECT }>;

function mapColaborador(row: ColaboradorMinPrismaRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    apodo: row.apodo,
    tipoDocumento: row.tipoDocumento,
    documento: row.documento,
    celular: row.celular,
    direccion: row.direccion,
    contactoEmergenciaNombre: row.contactoEmergenciaNombre,
    contactoEmergenciaCelular: row.contactoEmergenciaCelular,
    puestoId: row.puestoId,
    puesto: row.puesto,
    estado: row.estado,
    fechaIngreso: row.fechaIngreso,
    fechaCese: row.fechaCese,
    motivoCese: row.motivoCese,
    observaciones: row.observaciones,
    beneficiarioId: row.beneficiarioId,
    adminUserId: row.adminUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
type ColaboradorRow = ReturnType<typeof mapColaborador>;

// ── API ──────────────────────────────────────────────────────────────────────

export const AsistenciaDB = {
  async hoja(tenantId: string, desde: FechaKey, hasta: FechaKey): Promise<{ colaboradores: ColaboradorRow[]; marcas: AsistenciaRow[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [colaboradores, marcas] = await Promise.all([
      prisma.colaborador.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ fechaIngreso: null }, { fechaIngreso: { lte: dateDeFechaKey(hasta) } }],
          AND: [{ OR: [{ fechaCese: null }, { fechaCese: { gte: dateDeFechaKey(desde) } }] }],
        },
        include: COLABORADOR_MIN_SELECT,
        orderBy: { nombre: "asc" },
      }),
      prisma.asistencia.findMany({
        where: { tenantId, deletedAt: null, fecha: { gte: dateDeFechaKey(desde), lte: dateDeFechaKey(hasta) } },
      }),
    ]);
    return {
      colaboradores: colaboradores.map(mapColaborador),
      marcas: marcas.map(mapAsistencia),
    };
  },

  /**
   * Persiste marcas YA revisadas por `revisarMarca`. Una tx: por cada marca,
   * si es igual a la viva no escribe nada (`sinCambio`); si es un `quitar`,
   * da de baja la viva; si no, crea la versión nueva y da de baja la viva
   * apuntándole con `reemplazadaPorId`. Un P2002 por carrera entre dos
   * pestañas se relee y reintenta UNA vez.
   */
  async guardar(
    tenantId: string,
    marcas: MarcaNormalizada[],
    ctx: { usuario: string; motivo?: string; origen: "manual" | "masivo" },
  ): Promise<{ guardadas: AsistenciaRow[]; quitadas: number; sinCambio: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (marcas.length === 0) return { guardadas: [], quitadas: 0, sinCambio: 0 };

    const colaboradorIds = [...new Set(marcas.map((m) => m.colaboradorId))];
    const propios = await prisma.colaborador.findMany({ where: { tenantId, id: { in: colaboradorIds } }, select: { id: true } });
    const propiosSet = new Set(propios.map((c) => c.id));
    const ajenos = colaboradorIds.filter((id) => !propiosSet.has(id));
    if (ajenos.length > 0) throw new ColaboradorAjenoError(ajenos);

    const fechas = [...new Set(marcas.map((m) => dateDeFechaKey(m.fecha)))];

    let resultado: { guardadas: AsistenciaRow[]; quitadas: number; sinCambio: number } | null = null;
    for (let intento = 0; intento < 2; intento++) {
      try {
        resultado = await prisma.$transaction(async (tx) => {
          const guardadas: AsistenciaRow[] = [];
          let quitadas = 0;
          let sinCambio = 0;

          const vivasRaw = await tx.asistencia.findMany({
            where: { tenantId, deletedAt: null, colaboradorId: { in: colaboradorIds }, fecha: { in: fechas } },
          });
          const vivaPorClave = new Map(vivasRaw.map((v) => [`${v.colaboradorId}|${fechaKeyDeDate(v.fecha)}`, v]));

          for (const m of marcas) {
            const viva = vivaPorClave.get(`${m.colaboradorId}|${m.fecha}`) ?? null;
            const comparable = {
              estado: m.estado,
              entradaMin: m.entradaMin,
              salidaMin: m.salidaMin,
              refrigerioMin: m.refrigerioMin,
              horas: m.horas,
              nota: m.nota,
            };
            const vivaComparable = viva
              ? {
                  estado: viva.estado as EstadoAsistencia,
                  entradaMin: viva.entradaMin,
                  salidaMin: viva.salidaMin,
                  refrigerioMin: viva.refrigerioMin,
                  horas: viva.horas == null ? null : toNum(viva.horas),
                  nota: viva.nota,
                }
              : null;

            if (esIgualALaViva(vivaComparable, comparable)) {
              sinCambio++;
              continue;
            }

            if (m.quitar) {
              if (viva) {
                await darDeBajaVivaEnTx(tx, tenantId, viva.id, m.marcadoPor, ctx.motivo);
                quitadas++;
              }
              continue;
            }

            if (!m.estado) continue; // no debería pasar: quitar ya se manejó arriba

            const nueva = await escribirMarcaEnTx(tx, tenantId, m, viva, { origen: ctx.origen, motivo: ctx.motivo });
            guardadas.push(mapAsistencia(nueva));
          }

          return { guardadas, quitadas, sinCambio };
        });
        break;
      } catch (e) {
        if ((isUniqueViolation(e) || e instanceof VivaCambiadaError) && intento === 0) continue;
        throw e;
      }
    }

    return resultado ?? { guardadas: [], quitadas: 0, sinCambio: 0 };
  },

  /**
   * «Todos presentes»: sólo a quien no tiene marca viva ese día
   * (`sobrescribir = false` por defecto, ADR-414 §4). Reusa `guardar` para la
   * escritura real — acá sólo decide QUIÉN entra (`incluidosEnMasivo`, puro).
   */
  async masivo(
    tenantId: string,
    input: MasivoInput,
    ctx: { usuario: string; hoy: FechaKey; ventana: { desde: FechaKey | null; hasta: FechaKey } },
  ): Promise<{ creadas: number; reemplazadas: number; omitidos: OmitidoMasivo[] }> {
    if (!tenantId) throw new Error("tenantId is required");

    const colaboradores = await prisma.colaborador.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, nombre: true, estado: true, fechaIngreso: true },
    });
    const paraMasivo: ColaboradorParaMasivo[] = colaboradores.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      estado: c.estado as EstadoColaborador,
      fechaIngreso: c.fechaIngreso ? fechaKeyDeDate(c.fechaIngreso) : null,
    }));

    const vivasHoy = await prisma.asistencia.findMany({
      where: { tenantId, deletedAt: null, fecha: dateDeFechaKey(input.fecha) },
      select: { colaboradorId: true },
    });
    const vivasSet = new Set(vivasHoy.map((v) => v.colaboradorId));

    const { incluidos, omitidos } = incluidosEnMasivo(paraMasivo, input.fecha, vivasSet, {
      colaboradorIds: input.colaboradorIds ?? null,
      sobrescribir: input.sobrescribir,
    });

    const porId = new Map(paraMasivo.map((c) => [c.id, c]));
    const normalizadas: MarcaNormalizada[] = [];
    for (const id of incluidos) {
      const c = porId.get(id);
      if (!c) continue;
      const revision = revisarMarca(
        {
          colaboradorId: id,
          fecha: input.fecha,
          estado: input.estado,
          entrada: input.entrada ?? null,
          salida: input.salida ?? null,
          nota: input.nota ?? null,
        },
        {
          colaborador: { fechaIngreso: c.fechaIngreso, fechaCese: null, eliminado: false },
          hoy: ctx.hoy,
          ventana: ctx.ventana,
          marcadoPor: ctx.usuario,
          origen: "masivo",
        },
      );
      if (revision.ok) normalizadas.push(revision.marca);
    }

    const { guardadas } = await AsistenciaDB.guardar(tenantId, normalizadas, { usuario: ctx.usuario, origen: "masivo" });
    const reemplazadas = guardadas.filter((row) => vivasSet.has(row.colaboradorId)).length;

    return { creadas: guardadas.length - reemplazadas, reemplazadas, omitidos };
  },

  async historial(tenantId: string, colaboradorId: string, fecha: FechaKey): Promise<AsistenciaRow[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.asistencia.findMany({
      where: { tenantId, colaboradorId, fecha: dateDeFechaKey(fecha) },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapAsistencia);
  },

  async posterioresA(tenantId: string, colaboradorId: string, fecha: FechaKey): Promise<{ n: number; primera: FechaKey | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [n, primera] = await Promise.all([
      prisma.asistencia.count({ where: { tenantId, colaboradorId, deletedAt: null, fecha: { gt: dateDeFechaKey(fecha) } } }),
      prisma.asistencia.findFirst({
        where: { tenantId, colaboradorId, deletedAt: null, fecha: { gt: dateDeFechaKey(fecha) } },
        orderBy: { fecha: "asc" },
        select: { fecha: true },
      }),
    ]);
    return { n, primera: primera ? fechaKeyDeDate(primera.fecha) : null };
  },

  async delPeriodo(tenantId: string, desde: FechaKey, hasta: FechaKey, colaboradorIds?: string[]): Promise<AsistenciaRow[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.AsistenciaWhereInput = {
      tenantId,
      deletedAt: null,
      fecha: { gte: dateDeFechaKey(desde), lte: dateDeFechaKey(hasta) },
    };
    if (colaboradorIds && colaboradorIds.length > 0) where.colaboradorId = { in: colaboradorIds };
    const rows = await prisma.asistencia.findMany({ where, orderBy: { fecha: "asc" } });
    return rows.map(mapAsistencia);
  },
};
