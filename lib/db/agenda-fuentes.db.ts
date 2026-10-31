import "server-only";

/**
 * lib/db/agenda-fuentes.db.ts — lo que el sistema YA registra, leído para el
 * motor de la agenda (ADR-501 §3): «¿hubo asistencia, corridas, gastos… ese día?».
 *
 * Una consulta por FUENTE y rango, agrupada por día de Lima (nunca una por día:
 * cada ida a Supabase cuesta ~119 ms). Las columnas `date` van directo; las
 * `timestamp` (sin zona, guardan UTC) pasan por `diaLima()`:
 *   · a medianoche UTC exacta = fecha «sólo día» guardada como `YYYY-MM-DDT00:00Z`
 *     (medido 18-10: ForestCtpEntry.entryDate 46/57, ForestCuentaMov.fecha 99/101)
 *     → se toma la fecha tal cual;
 *   · cualquier otra hora = instante real → se le restan 5 h (Lima es UTC−5 fijo).
 * El WHERE filtra con un margen de ±1 día (usa el índice) y el día exacto se
 * decide afuera, ya calculado.
 *
 * `CashMovement` y `AdelantoEntregaPactada` no tienen tenantId: se unen por su
 * padre (`CashRegister`, `Adelanto`).
 *
 * Caché 60 s: estas tablas las escriben OTROS módulos, así que no hay invalidate
 * en su write; «Actualizar» (?fresco=1) borra `agenda-fuentes:${tenantId}`.
 */
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { ventanaVencimientoReferencial } from "@/lib/tax/obligaciones-peru";
import type { FuentesDelRango, PlataDelDia } from "@/lib/agenda/motor";
import type { FechaKey, VencimientoDelDia } from "@/lib/agenda/tipos";

const TTL_FUENTES = 60;

/** Día de Lima de una columna timestamp. `col` es SIEMPRE un identificador fijo de este archivo. */
function diaLima(col: string): string {
  return `CASE WHEN ${col}::time = '00:00' THEN to_char(${col}, 'YYYY-MM-DD') ELSE to_char(${col} - interval '5 hours', 'YYYY-MM-DD') END`;
}

/** Margen del WHERE sobre timestamps: [$2 − 1 día, $3 + 2 días). */
function enMargen(col: string): string {
  return `${col} >= (($2::text)::date - 1) AND ${col} < (($3::text)::date + 2)`;
}

const fechaADate = (f: FechaKey) => new Date(`${f}T00:00:00Z`);
const dateAFecha = (d: Date) => d.toISOString().slice(0, 10);

function clave(tenantId: string, fuente: string, desde: FechaKey, hasta: FechaKey): string {
  return `agenda-fuentes:${tenantId}:${fuente}:${desde}:${hasta}`;
}

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

export interface ApoyoFacturas {
  /** «Referencial: 2da semana del mes siguiente (RUC termina en 3) — confirma con el cronograma de SUNAT» o null sin RUC. */
  ventana: string | null;
  /** Comprobantes electrónicos que esperan ir a SUNAT (pending/retrying). */
  porEnviar: number;
  /** Gastos del mes con RUC del proveedor (lo que se le lleva al contador). */
  gastosConRuc: number;
}

export const AgendaFuentesDB = {
  /** Marcas vivas por día contra los colaboradores que trabajaban ese día (ingreso ≤ día ≤ cese). */
  async asistenciaPorDia(tenantId: string, desde: FechaKey, hasta: FechaKey): Promise<NonNullable<FuentesDelRango["asistencia"]>> {
    exigirTenant(tenantId);
    return getOrSet(clave(tenantId, "asistencia", desde, hasta), TTL_FUENTES, async () => {
      const [colaboradores, marcas] = await Promise.all([
        prisma.colaborador.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [{ fechaIngreso: null }, { fechaIngreso: { lte: fechaADate(hasta) } }],
            AND: [{ OR: [{ fechaCese: null }, { fechaCese: { gte: fechaADate(desde) } }] }],
          },
          select: { id: true, estado: true, fechaIngreso: true, fechaCese: true },
        }),
        prisma.asistencia.findMany({
          where: { tenantId, deletedAt: null, fecha: { gte: fechaADate(desde), lte: fechaADate(hasta) } },
          select: { fecha: true, colaboradorId: true },
        }),
      ]);
      // Un CESADO sin fecha de cese no se sabe desde cuándo: no se le exige marca.
      const vigentes = colaboradores.filter((c) => !(c.estado === "CESADO" && c.fechaCese === null));
      const marcadosPorDia = new Map<FechaKey, Set<string>>();
      for (const m of marcas) {
        const f = dateAFecha(m.fecha);
        const set = marcadosPorDia.get(f) ?? new Set<string>();
        set.add(m.colaboradorId);
        marcadosPorDia.set(f, set);
      }
      const salida: NonNullable<FuentesDelRango["asistencia"]> = {};
      for (let f = desde; f <= hasta; f = dateAFecha(new Date(fechaADate(f).getTime() + 86_400_000))) {
        const delDia = vigentes.filter(
          (c) =>
            (c.fechaIngreso === null || dateAFecha(c.fechaIngreso) <= f) &&
            (c.fechaCese === null || dateAFecha(c.fechaCese) >= f),
        );
        const marcados = marcadosPorDia.get(f);
        const n = marcados ? delDia.filter((c) => marcados.has(c.id)).length : 0;
        if (delDia.length > 0 || n > 0) salida[f] = { marcados: n, total: delDia.length };
      }
      return salida;
    });
  },

  /** Corridas de producción vivas por día (y cuántas de madera de tercero, ADR-412). */
  async corridasPorDia(tenantId: string, desde: FechaKey, hasta: FechaKey): Promise<NonNullable<FuentesDelRango["corridas"]>> {
    exigirTenant(tenantId);
    return getOrSet(clave(tenantId, "corridas", desde, hasta), TTL_FUENTES, async () => {
      const filas = await prisma.$queryRawUnsafe<Array<{ dia: string; total: number; terceros: number }>>(
        `SELECT dia, count(*)::int AS total, count(*) FILTER (WHERE "duenoMadera" = 'tercero')::int AS terceros
           FROM (
             SELECT ${diaLima(`e."entryDate"`)} AS dia, e."duenoMadera"
               FROM "ForestCtpEntry" e
              WHERE e."tenantId" = $1 AND e.section = 'produccion' AND e."deletedAt" IS NULL
                AND e.status <> 'anulado' AND ${enMargen(`e."entryDate"`)}
           ) x
          WHERE dia BETWEEN $2::text AND $3::text
          GROUP BY dia`,
        tenantId,
        desde,
        hasta,
      );
      return Object.fromEntries(filas.map((f) => [f.dia, { total: f.total, terceros: f.terceros }]));
    });
  },

  /**
   * Plata del día: gastos (`Expense`), ingresos (ventas `Sale` + ingresos manuales de
   * caja; la línea `venta` de caja no se cuenta: ya es la venta), cajas cerradas y
   * movimientos de cuenta forestal. Una sola consulta (UNION ALL).
   */
  async plataPorDia(tenantId: string, desde: FechaKey, hasta: FechaKey): Promise<Record<FechaKey, PlataDelDia>> {
    exigirTenant(tenantId);
    return getOrSet(clave(tenantId, "plata", desde, hasta), TTL_FUENTES, async () => {
      const filas = await prisma.$queryRawUnsafe<Array<{ dia: string; fuente: keyof PlataDelDia; n: number }>>(
        `SELECT dia, fuente, count(*)::int AS n
           FROM (
             SELECT 'gastos' AS fuente, ${diaLima(`g."date"`)} AS dia
               FROM "Expense" g WHERE g."tenantId" = $1 AND ${enMargen(`g."date"`)}
             UNION ALL
             SELECT 'ingresos', ${diaLima(`s."createdAt"`)}
               FROM "Sale" s WHERE s."tenantId" = $1 AND ${enMargen(`s."createdAt"`)}
             UNION ALL
             SELECT 'ingresos', ${diaLima(`m."createdAt"`)}
               FROM "CashMovement" m JOIN "CashRegister" r ON r.id = m."cashRegisterId"
              WHERE r."tenantId" = $1 AND m.type = 'ingreso' AND ${enMargen(`m."createdAt"`)}
             UNION ALL
             SELECT 'cajaCerrada', ${diaLima(`c."closedAt"`)}
               FROM "CashRegister" c WHERE c."tenantId" = $1 AND c."closedAt" IS NOT NULL AND ${enMargen(`c."closedAt"`)}
             UNION ALL
             SELECT 'cuentaForestal', ${diaLima(`f.fecha`)}
               FROM "ForestCuentaMov" f WHERE f."tenantId" = $1 AND f."deletedAt" IS NULL AND ${enMargen(`f.fecha`)}
           ) x
          WHERE dia BETWEEN $2::text AND $3::text
          GROUP BY dia, fuente`,
        tenantId,
        desde,
        hasta,
      );
      const salida: Record<FechaKey, PlataDelDia> = {};
      for (const f of filas) {
        const dia = (salida[f.dia] ??= { gastos: 0, ingresos: 0, cajaCerrada: 0, cuentaForestal: 0 });
        dia[f.fuente] += f.n;
      }
      return salida;
    });
  },

  /** Gestiones de cobranza por día y beneficiario; `*` = de cualquiera. */
  async gestionesAdelantoPorDia(
    tenantId: string,
    desde: FechaKey,
    hasta: FechaKey,
  ): Promise<NonNullable<FuentesDelRango["gestionesAdelanto"]>> {
    exigirTenant(tenantId);
    return getOrSet(clave(tenantId, "gestiones", desde, hasta), TTL_FUENTES, async () => {
      const filas = await prisma.$queryRawUnsafe<Array<{ dia: string; beneficiarioId: string; n: number }>>(
        `SELECT dia, "beneficiarioId", count(*)::int AS n
           FROM (
             SELECT ${diaLima(`g.fecha`)} AS dia, g."beneficiarioId"
               FROM "AdelantoGestion" g WHERE g."tenantId" = $1 AND ${enMargen(`g.fecha`)}
           ) x
          WHERE dia BETWEEN $2::text AND $3::text
          GROUP BY dia, "beneficiarioId"`,
        tenantId,
        desde,
        hasta,
      );
      const salida: NonNullable<FuentesDelRango["gestionesAdelanto"]> = {};
      for (const f of filas) {
        const dia = (salida[f.dia] ??= {});
        dia[f.beneficiarioId] = (dia[f.beneficiarioId] ?? 0) + f.n;
        dia["*"] = (dia["*"] ?? 0) + f.n;
      }
      return salida;
    });
  },

  /**
   * Adelantos abiertos con saldo y vencidos (`fechaVencimiento` antes de hoy), por
   * beneficiario; `*` = todos. Sólo cantidades: los montos viven en Adelantos.
   */
  async saldoAdelantos(tenantId: string, hoy: FechaKey): Promise<Record<string, { conSaldo: number; vencidos: number }>> {
    exigirTenant(tenantId);
    return getOrSet(clave(tenantId, "saldo-adelantos", hoy, hoy), TTL_FUENTES, async () => {
      const filas = await prisma.$queryRawUnsafe<Array<{ beneficiarioId: string; conSaldo: number; vencidos: number }>>(
        `SELECT a."beneficiarioId", count(*)::int AS "conSaldo",
                count(*) FILTER (WHERE a."fechaVencimiento" IS NOT NULL AND ${diaLima(`a."fechaVencimiento"`)} < $2::text)::int AS vencidos
           FROM "Adelanto" a
          WHERE a."tenantId" = $1 AND a."direccion" = 'DADO' AND a.status = 'ABIERTO' AND a."saldoPendiente" > 0
          GROUP BY a."beneficiarioId"`,
        tenantId,
        hoy,
      );
      const salida: Record<string, { conSaldo: number; vencidos: number }> = { "*": { conSaldo: 0, vencidos: 0 } };
      for (const f of filas) {
        salida[f.beneficiarioId] = { conSaldo: f.conSaldo, vencidos: f.vencidos };
        salida["*"].conSaldo += f.conSaldo;
        salida["*"].vencidos += f.vencidos;
      }
      return salida;
    });
  },

  /**
   * Movimientos de la cuenta de cada parte desde la última vez que se marcó «hecha»
   * su actividad `cuenta_tercero`. Sin saldo: el saldo de verdad es el consolidado
   * de Cuentas corrientes y acá no se recalcula.
   */
  async movimientosDesdeRevision(
    tenantId: string,
    actividadIds: string[],
  ): Promise<Record<string, { movimientos: number; ultimaRevision: FechaKey | null }>> {
    exigirTenant(tenantId);
    if (actividadIds.length === 0) return {};
    const filas = await prisma.$queryRawUnsafe<Array<{ id: string; movimientos: number; ultima: Date | null }>>(
      `SELECT a.id, count(m.id)::int AS movimientos, u.ultima
         FROM "AgendaActividad" a
         LEFT JOIN LATERAL (
           SELECT max(o."updatedAt") AS ultima FROM "AgendaOcurrencia" o
            WHERE o."tenantId" = a."tenantId" AND o."actividadId" = a.id AND o.estado = 'hecha'
         ) u ON true
         LEFT JOIN "ForestCuentaMov" m
           ON m."tenantId" = a."tenantId" AND m."parteId" = a."objetivoId" AND m."deletedAt" IS NULL
          AND (u.ultima IS NULL OR m."createdAt" > u.ultima)
        WHERE a."tenantId" = $1 AND a.id = ANY($2::text[])
        GROUP BY a.id, u.ultima`,
      tenantId,
      actividadIds,
    );
    return Object.fromEntries(
      filas.map((f) => [
        f.id,
        { movimientos: f.movimientos, ultimaRevision: f.ultima ? dateAFecha(new Date(f.ultima.getTime() - 5 * 3_600_000)) : null },
      ]),
    );
  },

  /** Apoyo para «llevar las facturas al contador» del mes `YYYY-MM`. Nunca una fecha exacta inventada. */
  async apoyoFacturas(tenantId: string, mes: string): Promise<ApoyoFacturas> {
    exigirTenant(tenantId);
    return getOrSet(clave(tenantId, "facturas", mes, mes), TTL_FUENTES, async () => {
      const inicio = new Date(`${mes}-01T00:00:00Z`);
      const fin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));
      const [settings, porEnviar, gastosConRuc] = await Promise.all([
        prisma.settings.findUnique({ where: { tenantId }, select: { ruc: true } }),
        prisma.sunatInvoice.count({ where: { tenantId, sunatStatus: { in: ["pending", "retrying"] } } }),
        // ±5 h de margen para los gastos con hora real; los de medianoche UTC caen bien igual.
        prisma.expense.count({
          where: {
            tenantId,
            supplierRuc: { not: null },
            NOT: { supplierRuc: "" },
            date: { gte: new Date(inicio.getTime() + 5 * 3_600_000 - 1), lt: new Date(fin.getTime() + 5 * 3_600_000) },
          },
        }),
      ]);
      const v = settings?.ruc ? ventanaVencimientoReferencial(settings.ruc) : null;
      return {
        ventana: v
          ? `Referencial: ${v.rango} (RUC termina en ${v.ultimoDigito}) — confirma con el cronograma de SUNAT`
          : null,
        porEnviar,
        gastosConRuc,
      };
    });
  },

  /**
   * Lo que vence en el rango y ya vive en otros módulos: adelantos con saldo,
   * entregas pactadas sin cumplir, promesas de pago y recordatorios pendientes.
   * Sin montos en el título: el monto se mira en su pantalla.
   */
  async vencimientosDelRango(tenantId: string, desde: FechaKey, hasta: FechaKey): Promise<VencimientoDelDia[]> {
    exigirTenant(tenantId);
    return getOrSet(clave(tenantId, "vencimientos", desde, hasta), TTL_FUENTES, async () => {
      const filas = await prisma.$queryRawUnsafe<
        Array<{ id: string; origen: VencimientoDelDia["origen"]; titulo: string; dia: string }>
      >(
        `SELECT id, origen, titulo, dia FROM (
           SELECT 'adelanto:' || a.id AS id, 'adelanto' AS origen,
                  'Vence el adelanto de ' || b.nombre AS titulo, ${diaLima(`a."fechaVencimiento"`)} AS dia
             FROM "Adelanto" a JOIN "AdelantoBeneficiario" b ON b.id = a."beneficiarioId" AND b."tenantId" = a."tenantId"
            WHERE a."tenantId" = $1 AND a."direccion" = 'DADO' AND a.status = 'ABIERTO' AND a."saldoPendiente" > 0
              AND a."fechaVencimiento" IS NOT NULL AND ${enMargen(`a."fechaVencimiento"`)}
           UNION ALL
           SELECT 'entrega:' || e.id, 'entrega_pactada',
                  'Entrega pactada de ' || b.nombre, ${diaLima(`e."fechaEsperada"`)}
             FROM "AdelantoEntregaPactada" e
             JOIN "Adelanto" a ON a.id = e."adelantoId"
             JOIN "AdelantoBeneficiario" b ON b.id = a."beneficiarioId" AND b."tenantId" = a."tenantId"
            WHERE a."tenantId" = $1 AND a."direccion" = 'DADO' AND a.status = 'ABIERTO' AND e."cumplidaEn" IS NULL
              AND e."fechaEsperada" IS NOT NULL AND ${enMargen(`e."fechaEsperada"`)}
           UNION ALL
           SELECT 'promesa:' || g.id, 'promesa_adelanto',
                  'Promesa de pago de ' || b.nombre, ${diaLima(`g."fechaPrometida"`)}
             FROM "AdelantoGestion" g JOIN "AdelantoBeneficiario" b ON b.id = g."beneficiarioId" AND b."tenantId" = g."tenantId"
            WHERE g."tenantId" = $1 AND g.tipo = 'PROMESA'
              AND g."fechaPrometida" IS NOT NULL AND ${enMargen(`g."fechaPrometida"`)}
           UNION ALL
           SELECT 'recordatorio:' || r.id, 'recordatorio', r.title, ${diaLima(`r."dueDate"`)}
             FROM "Reminder" r
            WHERE r."tenantId" = $1 AND r.status = 'pendiente' AND ${enMargen(`r."dueDate"`)}
         ) x
         WHERE dia BETWEEN $2::text AND $3::text
         ORDER BY dia, titulo`,
        tenantId,
        desde,
        hasta,
      );
      const HREF: Record<VencimientoDelDia["origen"], string> = {
        adelanto: "/admin?tab=plata&vista=adelantos",
        entrega_pactada: "/admin?tab=plata&vista=adelantos",
        promesa_adelanto: "/admin?tab=plata&vista=adelantos",
        recordatorio: "/admin?tab=administracion&vista=hoy",
        // ADR-508: no sale de esta consulta (lo arma AgendaDB.calendario); está para que el mapa siga completo.
        seguimiento_clienta: "/admin?tab=administracion&vista=hoy",
      };
      return filas.map((f) => ({ id: f.id, origen: f.origen, titulo: f.titulo, fecha: f.dia, href: HREF[f.origen] }));
    });
  },

  /** «Actualizar» de la pantalla: las fuentes se vuelven a leer en la próxima llamada. */
  olvidar(tenantId: string): void {
    exigirTenant(tenantId);
    invalidateByPrefix(`agenda-fuentes:${tenantId}:`);
  },
};
