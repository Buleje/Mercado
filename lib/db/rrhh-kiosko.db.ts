import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { SQL_PISAR_SUBCLAVES_FLAGS, SQL_SUBCLAVE_FLAGS, SettingsDB } from "@/lib/db/settings.db";
import { dateDeFechaKey } from "@/lib/rrhh/fechas";
import {
  CLAVE_KIOSKO,
  leerConfigKiosko,
  type CodigoMarcacion,
  type ConfigKiosko,
  type HorarioPuesto,
  type VivaKiosko,
} from "@/lib/rrhh/kiosko";
import type { EstadoAsistencia, EstadoColaborador, FechaKey } from "@/lib/rrhh/tipos";

/**
 * KioskoAsistenciaDB — lo que necesita el kiosko de asistencia
 * (`lib/rrhh/kiosko.ts`): su configuración dentro de
 * `Settings.featureFlagsJson` y la búsqueda de la persona y de su marca del
 * día. La marca se ESCRIBE por `AsistenciaDB.guardar` (única puerta).
 *
 * `tenantId` SIEMPRE 1er parámetro y en el WHERE: un QR de otro negocio no
 * encuentra a nadie.
 */

export interface ColaboradorKiosko {
  id: string;
  nombre: string;
  estado: EstadoColaborador;
  fechaIngreso: Date | null;
  fechaCese: Date | null;
  horario: HorarioPuesto | null;
}

function claveDelJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>)[CLAVE_KIOSKO] : null;
  } catch {
    return null;
  }
}

/*
 * El kiosko vive en `featureFlagsJson[CLAVE_KIOSKO]` y lo tocan dos lados a la
 * vez (el dueño en el panel, la tablet al atarse): cada escritura pisa SÓLO
 * las subclaves que cambia, en una sentencia (`SettingsDB.pisarSubclavesFlags`).
 * Leer-mezclar-escribir desde Node borraba el aparato atado cuando el dueño
 * apagaba el kiosko en el mismo segundo.
 *
 * Atar la tablet: además, sólo si el enlace es el mismo ($4) y nadie se ató
 * antes. Dos tablets a la vez → una; la condición va en el WHERE.
 */
/* Se arma al usarla (no al importar): un test que mockea settings.db no rompe al cargar este módulo. */
const sqlAtarAparato = () =>
  `${SQL_PISAR_SUBCLAVES_FLAGS} AND (${SQL_SUBCLAVE_FLAGS} ->> 'tokenHash') = $4 AND COALESCE(${SQL_SUBCLAVE_FLAGS} ->> 'aparatoHash', '') = ''`;

type AparatoKiosko = Pick<ConfigKiosko, "aparatoHash" | "aparatoEn" | "aparatoNombre">;

export const KioskoAsistenciaDB = {
  async config(tenantId: string): Promise<ConfigKiosko> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.settings.findUnique({ where: { tenantId }, select: { featureFlagsJson: true } });
    return leerConfigKiosko(claveDelJson(row?.featureFlagsJson));
  },

  /** Pisa sólo las subclaves de `cambios` (el resto del kiosko y de los flags queda como está). */
  async guardarConfig(tenantId: string, cambios: Partial<ConfigKiosko>): Promise<ConfigKiosko> {
    if (!tenantId) throw new Error("tenantId is required");
    await SettingsDB.pisarSubclavesFlags(tenantId, CLAVE_KIOSKO, cambios);
    return KioskoAsistenciaDB.config(tenantId);
  },

  /**
   * Ata el enlace `tokenHash` a esta tablet. `false` = otra se ató primero o el
   * enlace cambió en el medio (la condición va en el WHERE, no en un `if`).
   */
  async atarAparato(tenantId: string, tokenHash: string, aparato: AparatoKiosko): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = await prisma.$executeRawUnsafe(sqlAtarAparato(), CLAVE_KIOSKO, JSON.stringify(aparato), tenantId, tokenHash);
    if (n > 0) invalidateByPrefix(`settings:${tenantId}`);
    return n > 0;
  },

  /** La persona por el id del QR o por su documento — siempre de ESTE negocio y sin dar de baja. */
  async colaborador(tenantId: string, codigo: CodigoMarcacion): Promise<ColaboradorKiosko | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.colaborador.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        ...(codigo.tipo === "id" ? { id: codigo.id } : { documento: codigo.documento }),
      },
      select: {
        id: true,
        nombre: true,
        estado: true,
        fechaIngreso: true,
        fechaCese: true,
        puesto: { select: { horaEntrada: true, toleranciaMin: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      nombre: row.nombre,
      estado: row.estado as EstadoColaborador,
      fechaIngreso: row.fechaIngreso,
      fechaCese: row.fechaCese,
      horario: row.puesto ? { horaEntrada: row.puesto.horaEntrada, toleranciaMin: row.puesto.toleranciaMin } : null,
    };
  },

  /** La marca viva de la persona ese día (una por día, ADR-414 §4). */
  async vivaDelDia(tenantId: string, colaboradorId: string, fecha: FechaKey): Promise<VivaKiosko | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const v = await prisma.asistencia.findFirst({
      where: { tenantId, colaboradorId, fecha: dateDeFechaKey(fecha), deletedAt: null },
      select: {
        estado: true,
        entradaMin: true,
        salidaMin: true,
        refrigerioMin: true,
        horas: true,
        nota: true,
        origen: true,
        marcadoPor: true,
        createdAt: true,
      },
    });
    if (!v) return null;
    return {
      estado: v.estado as EstadoAsistencia,
      entradaMin: v.entradaMin,
      salidaMin: v.salidaMin,
      refrigerioMin: v.refrigerioMin,
      horas: v.horas == null ? null : Number(v.horas),
      nota: v.nota,
      origen: v.origen,
      marcadoPor: v.marcadoPor,
      createdAt: v.createdAt,
    };
  },
};
