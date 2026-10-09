import "server-only";

import { prisma } from "@/lib/prisma";
import { elegirAbierta, fueAccionReal, MARCAS_SIN_ACCION } from "@/lib/churn/intervencion";

/**
 * SuperadminChurnSignalsDB — alertas de abandono (ChurnSignal) que escribe el
 * cron `churn-score`. `tenantId` primero y dentro de cada WHERE.
 *
 * Una alerta ABIERTA por negocio y tipo: el cron diario la actualiza en vez de
 * apilar una fila por día. La intervención (correo/WhatsApp) se reclama con
 * `updateMany … intervention: null` para que dos corridas no manden dos veces;
 * si no salió nada, se libera (vuelve a null) y la próxima corrida reintenta.
 * Sin caché: las lecturas del superadmin van directo (no hay key que invalidar).
 *
 * Sin índice único (no hay migración): dos corridas a la vez pueden crear dos
 * filas; `registrarAbierta` relee tras crear y deja UNA con la misma regla en
 * ambas corridas (`elegirAbierta`), cerrando la otra. Eso también limpia los
 * duplicados viejos (4 pares negocio/tipo con 2-4 abiertas al 2026-10-09).
 */

type SenalNueva = { signalType: string; severity: string; detail: string };

export type AlertaRegistrada = {
  id: string;
  intervention: string | null;
  creada: boolean;
};

/** Filtro Prisma de «hubo acción real»: excluye los textos viejos de «no se envió nada». */
const CON_ACCION_REAL = {
  AND: [
    { intervention: { not: null } },
    ...MARCAS_SIN_ACCION.contiene.map((m) => ({ NOT: { intervention: { contains: m } } })),
    ...MARCAS_SIN_ACCION.empiezaCon.map((m) => ({ NOT: { intervention: { startsWith: m } } })),
  ],
};

function abiertasDelTipo(tenantId: string, signalType: string) {
  return prisma.churnSignal.findMany({
    where: { tenantId, signalType, resolved: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, intervention: true },
  });
}

export const SuperadminChurnSignalsDB = {
  async registrarAbierta(tenantId: string, s: SenalNueva): Promise<AlertaRegistrada> {
    let abiertas = await abiertasDelTipo(tenantId, s.signalType);
    let nuevaId: string | null = null;
    if (abiertas.length === 0) {
      const nueva = await prisma.churnSignal.create({
        data: { tenantId, signalType: s.signalType, severity: s.severity, detail: s.detail, resolved: false },
        select: { id: true },
      });
      nuevaId = nueva.id;
      // Releer: otra corrida pudo crear la suya entre el findMany y el create.
      abiertas = await abiertasDelTipo(tenantId, s.signalType);
    }
    const fila = elegirAbierta(abiertas);
    if (!fila) {
      // Otra corrida la cerró entre el create y la relectura: se informa la creada.
      return { id: nuevaId ?? "", intervention: null, creada: nuevaId !== null };
    }

    const sobrantes = abiertas.filter((a) => a.id !== fila.id).map((a) => a.id);
    if (sobrantes.length > 0) {
      await prisma.churnSignal.updateMany({
        where: { tenantId, id: { in: sobrantes }, resolved: false },
        data: { resolved: true, resolvedAt: new Date(), resolvedBy: "auto" },
      });
    }
    if (fila.id !== nuevaId) {
      await prisma.churnSignal.updateMany({
        where: { id: fila.id, tenantId, resolved: false },
        data: { severity: s.severity, detail: s.detail },
      });
    }

    // Fila vieja con «skip (sin config)» / «Error: …»: no hubo acción → vuelve a null.
    // La condición va en el WHERE: si otra corrida ya la reclamó, no se pisa.
    let intervention = fila.intervention;
    if (intervention !== null && !fueAccionReal(intervention)) {
      await prisma.churnSignal.updateMany({
        where: { id: fila.id, tenantId, intervention },
        data: { intervention: null },
      });
      intervention = null;
    }
    return { id: fila.id, intervention, creada: fila.id === nuevaId };
  },

  /** Cierra («auto») las alertas abiertas del negocio cuyo tipo hoy no apareció. */
  async cerrarAusentes(tenantId: string, tiposVigentes: string[]): Promise<number> {
    const r = await prisma.churnSignal.updateMany({
      where: { tenantId, resolved: false, signalType: { notIn: tiposVigentes } },
      data: { resolved: true, resolvedAt: new Date(), resolvedBy: "auto" },
    });
    return r.count;
  },

  /**
   * Tope de una acción por semana y tipo. Sin columna con la fecha de la acción:
   * `createdAt` es la APERTURA (una alerta dura semanas), así que también cuenta
   * una alerta con acción que se cerró dentro de la ventana. La abierta actual no
   * entra (si tuviera acción, `executePlaybook` ya cortó antes).
   */
  async huboIntervencionDesde(tenantId: string, signalType: string, desde: Date): Promise<boolean> {
    const fila = await prisma.churnSignal.findFirst({
      where: {
        tenantId,
        signalType,
        ...CON_ACCION_REAL,
        OR: [{ createdAt: { gte: desde } }, { resolvedAt: { gte: desde } }],
      },
      select: { id: true },
    });
    return fila !== null;
  },

  /** Marca la alerta como «en curso» sólo si nadie actuó todavía. `false` = otra corrida ganó. */
  async reclamar(tenantId: string, signalId: string, texto: string): Promise<boolean> {
    const r = await prisma.churnSignal.updateMany({
      where: { id: signalId, tenantId, intervention: null },
      data: { intervention: texto },
    });
    return r.count === 1;
  },

  /** Devuelve a null una alerta reclamada cuando no salió nada (sin config, error): se reintenta mañana. */
  async liberar(tenantId: string, signalId: string, textoReclamo: string): Promise<void> {
    await prisma.churnSignal.updateMany({
      where: { id: signalId, tenantId, intervention: textoReclamo },
      data: { intervention: null },
    });
  },

  async anotarIntervencion(tenantId: string, signalId: string, texto: string): Promise<void> {
    await prisma.churnSignal.updateMany({
      where: { id: signalId, tenantId },
      data: { intervention: texto },
    });
  },

  /** Para la pantalla de reglas: alertas abiertas por tipo y severidad (todas las tiendas). */
  async resumenAbiertas() {
    const [grupos, ultima] = await Promise.all([
      prisma.churnSignal.groupBy({
        by: ["signalType", "severity"],
        where: { resolved: false },
        _count: { _all: true },
      }),
      prisma.churnSignal.aggregate({ _max: { createdAt: true } }),
    ]);
    return {
      grupos: grupos.map((g) => ({ signalType: g.signalType, severity: g.severity, total: g._count._all })),
      ultimaSenalAt: ultima._max.createdAt,
    };
  },
};
