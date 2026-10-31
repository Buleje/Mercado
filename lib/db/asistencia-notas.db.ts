import "server-only";
import { prisma } from "@/lib/prisma";
import { candadosDelNegocio } from "@/lib/db/candado";
import type { Prisma } from "@/lib/generated/prisma/client";
import { dateDeFechaKey, fechaKeyDeDate } from "@/lib/rrhh/fechas";
import type { FechaKey, NotaAsistenciaDTO } from "@/lib/rrhh/tipos";

/**
 * AsistenciaNotasDB — la nota del día SIN marca (`AsistenciaNota`, 23-10).
 *
 * `Asistencia.estado` es obligatorio (y cambiarlo rompe al Prisma viejo de
 * producción), así que lo que se anota antes de marcar vive acá: una fila por
 * persona y día. Cuando ese día se marca, `AsistenciaDB.guardar` pasa la nota
 * a `Asistencia.nota` y borra la fila en la MISMA tx; al quitar la marca, la
 * nota vuelve acá. Por eso `guardar` rechaza un día que ya tiene marca viva:
 * esa nota se edita en la marca (`DiaMarcadoError` → 409).
 *
 * `tenantId` SIEMPRE 1er parámetro. La FK compuesta (tenantId, colaboradorId)
 * impide apuntar a una persona de otro negocio. Sin caché que invalidar: la
 * hoja se lee en vivo (`Cache-Control: no-store`), igual que `AsistenciaDB`.
 */

/** Ese día ya tiene marca viva: la nota va en la marca, no suelta. */
export class DiaMarcadoError extends Error {
  constructor() {
    super("El día ya tiene marca: la nota se escribe en la marca");
    this.name = "DiaMarcadoError";
  }
}

/** La persona no es de este negocio (o se dio de baja). */
export class ColaboradorNoEncontradoError extends Error {
  constructor() {
    super("Colaborador no encontrado");
    this.name = "ColaboradorNoEncontradoError";
  }
}

interface NotaRow {
  colaboradorId: string;
  fecha: Date;
  nota: string;
  autor: string;
  updatedAt: Date;
}

export function aNotaAsistenciaDTO(row: NotaRow): NotaAsistenciaDTO {
  return {
    colaboradorId: row.colaboradorId,
    fecha: fechaKeyDeDate(row.fecha),
    nota: row.nota,
    autor: row.autor,
    actualizadaEn: row.updatedAt.toISOString(),
  };
}

/**
 * Candado por persona+día (revisión de seguridad 23-10): guardar la nota y
 * marcar ese día leen lo del otro antes de escribir. Sin fila, las dos tx
 * pueden leer «vacío» a la vez y quedar marca + nota suelta invisible. Las dos
 * operaciones (y borrar la nota) lo toman como PRIMERA sentencia de su tx: la
 * segunda espera a que la primera confirme y recién entonces lee.
 */
export async function candadoDeDiasEnTx(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
  dias: readonly { colaboradorId: string; fecha: FechaKey }[],
): Promise<void> {
  await candadosDelNegocio(tx, tenantId, dias.map((d) => `asistencia-dia:${d.colaboradorId}:${d.fecha}`));
}

const SELECT = { colaboradorId: true, fecha: true, nota: true, autor: true, updatedAt: true } as const;

export const AsistenciaNotasDB = {
  async delRango(tenantId: string, desde: FechaKey, hasta: FechaKey): Promise<NotaAsistenciaDTO[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.asistenciaNota.findMany({
      where: { tenantId, fecha: { gte: dateDeFechaKey(desde), lte: dateDeFechaKey(hasta) } },
      select: SELECT,
    });
    return filas.map(aNotaAsistenciaDTO);
  },

  async delDia(tenantId: string, fecha: FechaKey): Promise<NotaAsistenciaDTO[]> {
    return AsistenciaNotasDB.delRango(tenantId, fecha, fecha);
  },

  /**
   * Crea o edita la nota de esa persona ese día (upsert por la única
   * tenantId+colaboradorId+fecha). La persona tiene que ser del negocio y
   * estar viva; el día, sin marca viva.
   */
  async guardar(
    tenantId: string,
    input: { colaboradorId: string; fecha: FechaKey; nota: string; autor: string },
  ): Promise<NotaAsistenciaDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const fecha = dateDeFechaKey(input.fecha);
    return prisma.$transaction(async (tx) => {
      await candadoDeDiasEnTx(tx, tenantId, [{ colaboradorId: input.colaboradorId, fecha: input.fecha }]);
      const persona = await tx.colaborador.findFirst({
        where: { tenantId, id: input.colaboradorId, deletedAt: null },
        select: { id: true },
      });
      if (!persona) throw new ColaboradorNoEncontradoError();
      const viva = await tx.asistencia.findFirst({
        where: { tenantId, colaboradorId: input.colaboradorId, fecha, deletedAt: null },
        select: { id: true },
      });
      if (viva) throw new DiaMarcadoError();
      const fila = await tx.asistenciaNota.upsert({
        where: { tenantId_colaboradorId_fecha: { tenantId, colaboradorId: input.colaboradorId, fecha } },
        create: { tenantId, colaboradorId: input.colaboradorId, fecha, nota: input.nota, autor: input.autor },
        update: { nota: input.nota, autor: input.autor },
        select: SELECT,
      });
      return aNotaAsistenciaDTO(fila);
    });
  },

  /** Borra la nota suelta de esa persona ese día. Devuelve cuántas borró (0 o 1). */
  async borrar(tenantId: string, colaboradorId: string, fecha: FechaKey): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction(async (tx) => {
      await candadoDeDiasEnTx(tx, tenantId, [{ colaboradorId, fecha }]);
      const r = await tx.asistenciaNota.deleteMany({ where: { tenantId, colaboradorId, fecha: dateDeFechaKey(fecha) } });
      return r.count;
    });
  },
};
