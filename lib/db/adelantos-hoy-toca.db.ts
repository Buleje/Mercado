import "server-only";
import { prisma } from "@/lib/prisma";
import { SOLO_DADOS } from "@/lib/adelantos/direccion";
import { cuentasDelNegocio } from "@/lib/adelantos/cuentas-del-negocio";
import {
  inicioDelMesLima,
  porCobrarConCuentas,
  queHacerHoy,
  totalesDeCuentas,
  type DatosHoyToca,
  type PorMoneda,
  type TareaHoy,
} from "@/lib/adelantos/hoy-toca";

/**
 * Lo que el «Hoy toca» del Resumen y el aviso del lunes necesitan de la base
 * (25-10). La regla vive en `lib/adelantos/hoy-toca.ts`; acá sólo se lee.
 *
 * Aparte de `adelantos.db.ts` (2 500 líneas, de otro carril). Sólo lectura: no
 * escribe, no audita, no invalida. Sin caché a propósito: es lo primero que se
 * mira después de anotar una entrega o una fecha, y una cifra de hace 5 minutos
 * diría «cobrar a Quispe» cuando ya entregó.
 *
 * SIN TOPE DE FILAS, como `sinControl`: un «Hoy toca» que se calla 40 adelantos
 * porque la lista corta en 500 es peor que no decir nada. Por adelanto se trae
 * sólo lo que la regla mira (la última entrega viva, no todas).
 */

const num = (d: { toString(): string } | number | null | undefined): number => Number(d?.toString() ?? 0) || 0;

const redondear = (n: number) => Math.round(n * 100) / 100;

function sumar(m: PorMoneda, moneda: string | null | undefined, n: number): void {
  const k = moneda || "PEN";
  m[k] = redondear((m[k] ?? 0) + n);
}

/**
 * Las cuatro cifras del Resumen. Todas por moneda (ADR-118).
 *
 * «Te deben» y «Le debes» son la cuenta por persona entera (adelantos + madera,
 * `cuentasDelNegocio`): la misma que la lista «Cuenta por persona» de abajo,
 * así arriba y abajo dicen lo mismo (25-10: arriba decía «Le debes S/ 0.00» y
 * abajo «Le debes S/ 6,279.60» por madera).
 */
export interface CifrasHoyToca {
  /** Lo que te deben, persona por persona (adelantos + madera). */
  teDeben: PorMoneda;
  personasQueDeben: number;
  /** Adelantos DADOS y ABIERTOS con saldo. */
  abiertos: number;
  /** Lo que tú debes, persona por persona: madera por pagar, lo entregado de más, lo recibido por devolver. */
  leDebes: PorMoneda;
  personasLeDebes: number;
  /** `true` = el negocio lleva cuenta de madera y entra en «Te deben» / «Le debes». */
  conMadera: boolean;
  /** De lo que te deben, lo quieto o vencido (las tareas «cobrar», topeadas por la cuenta de cada uno). */
  porCobrar: PorMoneda;
  personasPorCobrar: number;
  /** Lo que volvió este mes de Lima: entregas vivas de lo DADO. */
  volvioEsteMes: PorMoneda;
  entregasEsteMes: number;
}

export interface HoyToca {
  cifras: CifrasHoyToca;
  tareas: TareaHoy[];
}

export const AdelantosHoyTocaDB = {
  /** Los datos crudos de la regla: lo DADO y ABIERTO con saldo, y sus personas. */
  async datos(tenantId: string): Promise<DatosHoyToca> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.adelanto.findMany({
      where: { tenantId, status: "ABIERTO", saldoPendiente: { gt: 0 }, ...SOLO_DADOS },
      select: {
        id: true,
        codigoOperacion: true,
        beneficiarioId: true,
        saldoPendiente: true,
        moneda: true,
        fechaAdelanto: true,
        fechaVencimiento: true,
        beneficiario: { select: { id: true, nombre: true, telefono: true } },
        /* ADR-413 §7: una entrega anulada no existe para nadie. */
        entregas: { where: { anuladaAt: null }, select: { fecha: true }, orderBy: { fecha: "desc" }, take: 1 },
        entregasPactadas: { where: { cumplidaEn: null, fechaEsperada: { not: null } }, select: { fechaEsperada: true } },
        /* Firma o huella: con una basta (`filtro-recibos.ts`). */
        firmas: { select: { id: true }, take: 1 },
      },
    });

    const ids = [...new Set(filas.map((f) => f.beneficiarioId))];
    const gestiones =
      ids.length === 0
        ? []
        : await prisma.adelantoGestion.groupBy({
            by: ["beneficiarioId"],
            where: { tenantId, beneficiarioId: { in: ids } },
            _max: { fecha: true },
          });
    const ultimaGestion = new Map(gestiones.map((g) => [g.beneficiarioId, g._max.fecha]));

    const personas = new Map<string, DatosHoyToca["personas"][number]>();
    for (const f of filas) {
      if (personas.has(f.beneficiarioId)) continue;
      personas.set(f.beneficiarioId, {
        id: f.beneficiarioId,
        nombre: f.beneficiario?.nombre ?? "",
        telefono: f.beneficiario?.telefono ?? null,
        ultimaGestion: ultimaGestion.get(f.beneficiarioId) ?? null,
      });
    }

    return {
      adelantos: filas.map((f) => ({
        id: f.id,
        codigoOperacion: f.codigoOperacion,
        beneficiarioId: f.beneficiarioId,
        saldoPendiente: num(f.saldoPendiente),
        moneda: f.moneda,
        fechaAdelanto: f.fechaAdelanto,
        fechaVencimiento: f.fechaVencimiento,
        ultimaEntrega: f.entregas[0]?.fecha ?? null,
        cuotasPendientes: f.entregasPactadas.flatMap((p) => (p.fechaEsperada ? [p.fechaEsperada] : [])),
        firmado: f.firmas.length > 0,
      })),
      personas: [...personas.values()],
    };
  },

  /** Sólo las tareas: lo que usa el aviso del lunes (no necesita las cifras ni la madera). */
  async tareas(tenantId: string, ahora: Date = new Date()): Promise<TareaHoy[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return queHacerHoy(await AdelantosHoyTocaDB.datos(tenantId), ahora);
  },

  /** El «Hoy toca» entero: las cuatro cifras y las tareas, calculadas en el servidor. */
  async hoyToca(tenantId: string, ahora: Date = new Date()): Promise<HoyToca> {
    if (!tenantId) throw new Error("tenantId is required");
    const [datos, cuentas, entregas] = await Promise.all([
      AdelantosHoyTocaDB.datos(tenantId),
      /* La cuenta por persona: de acá salen «Te deben» y «Le debes», igual que la lista. */
      cuentasDelNegocio(tenantId),
      /* Lo que volvió este mes: entregas vivas de lo dado (no de lo anulado). */
      prisma.adelantoEntrega.findMany({
        where: {
          anuladaAt: null,
          fecha: { gte: inicioDelMesLima(ahora) },
          adelanto: { tenantId, ...SOLO_DADOS, status: { not: "CANCELADO" } },
        },
        select: { valor: true, adelanto: { select: { moneda: true } } },
      }),
    ]);

    const tareas = queHacerHoy(datos, ahora);
    const totales = totalesDeCuentas(cuentas.personas);

    const volvioEsteMes: PorMoneda = {};
    for (const e of entregas) sumar(volvioEsteMes, e.adelanto?.moneda, num(e.valor));

    const porCobrar = porCobrarConCuentas(tareas, cuentas.personas);
    return {
      cifras: {
        teDeben: totales.teDeben,
        personasQueDeben: totales.personasTeDeben,
        abiertos: datos.adelantos.length,
        leDebes: totales.leDebes,
        personasLeDebes: totales.personasLeDebes,
        conMadera: cuentas.forestal,
        porCobrar: porCobrar.monto,
        personasPorCobrar: porCobrar.personas,
        volvioEsteMes,
        entregasEsteMes: entregas.length,
      },
      tareas,
    };
  },

  /**
   * Los negocios con algo DADO y ABIERTO con saldo: a quiénes les puede tocar
   * el aviso del lunes. Cruza negocios a propósito (lo llama el cron, que
   * después trabaja uno por uno con su `tenantId`).
   */
  async tenantsConAbiertos(): Promise<string[]> {
    const grupos = await prisma.adelanto.groupBy({
      by: ["tenantId"],
      where: { status: "ABIERTO", saldoPendiente: { gt: 0 }, ...SOLO_DADOS },
    });
    return grupos.map((g) => g.tenantId);
  },
};
