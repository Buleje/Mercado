import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { PlatformSettingsDB, PREFIJO_INTERNO } from "@/lib/db/platform-settings.db";
import { ExpensesDB as GastosDB } from "@/lib/db/finance.db";
import { ExpensesDB as ComprobantesDB } from "@/lib/db/expenses.db";
import {
  CONFIG_POR_DEFECTO,
  costoDeVale,
  libroAl,
  problemaDeHorometro,
  rangoCilindros,
  recorrer,
  nivelAlmacen,
  siguienteCilindro,
  type ConfigCuaderno,
  type ConteoCuaderno,
  type DatosCuaderno,
  type IngresoCuaderno,
  type NivelAlmacen,
  type TipoIngreso,
  type ValeCuaderno,
} from "@/lib/combustible/cuaderno";

/**
 * lib/db/cuaderno-combustible.db.ts — Cuaderno de combustible en cilindros (ADR-533).
 *
 * Tres renglones: el INGRESO de cilindros (FuelPurchase, con factura y guía),
 * el VALE por máquina (AssetExpense con `fuelSource = "cilindros"`: así el
 * costo cae en la máquina de Activos sin duplicar nada) y el CONTEO físico
 * (FuelCount). Nada se borra: se anula con motivo, porque el cuaderno se le
 * muestra a SUNAT. Las cuentas son de `lib/combustible/cuaderno.ts`.
 *
 * Patrón Buleje: tenantId 1.er parámetro y en TODO where; la máquina del vale
 * se verifica del negocio antes de escribir.
 */

export const FUENTE_CILINDROS = "cilindros";
const CLAVE_CONFIG = (tenantId: string) => `${PREFIJO_INTERNO}combustible-cuaderno:${tenantId}`;

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const esDuplicado = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";

export interface MaquinaCuaderno {
  id: string;
  nombre: string;
  tipo: string;
  placa: string | null;
  meta: number | null;
  horometro: number | null;
  activa: boolean;
}

export interface CuadernoCompleto extends DatosCuaderno {
  config: ConfigCuaderno;
  maquinas: MaquinaCuaderno[];
  siguienteCilindro: number;
}

/** Lo que devuelve una escritura además del renglón: cómo quedó el almacén. */
export interface Despues {
  saldoGal: number;
  cilindros: number;
  nivel: NivelAlmacen;
}

type FilaIngreso = Awaited<ReturnType<typeof prisma.fuelPurchase.findMany>>[number];
type FilaConteo = Awaited<ReturnType<typeof prisma.fuelCount.findMany>>[number];

function aIngreso(r: FilaIngreso): IngresoCuaderno {
  return {
    id: r.id,
    fecha: r.date.toISOString(),
    tipo: r.kind === "inicial" ? "inicial" : "compra",
    factura: r.invoiceNumber,
    grifo: r.supplierName,
    grifoRuc: r.supplierRuc,
    guia: r.guideNumber,
    cilindros: r.cylinders,
    galones: num(r.gallons),
    precioGal: numOrNull(r.unitPrice),
    monto: num(r.amount),
    primerCilindro: r.firstCylinder,
    anulado: r.annulledAt != null,
    motivoAnulacion: r.annulReason,
    notas: r.notes,
    gastoId: r.expenseId,
  };
}

function aConteo(r: FilaConteo): ConteoCuaderno {
  return {
    id: r.id,
    fecha: r.date.toISOString(),
    cilindrosContados: r.cylindersCounted,
    galonesContados: num(r.gallonsCounted),
    cilindrosLibro: r.cylindersBook,
    galonesLibro: num(r.gallonsBook),
    contadoPor: r.countedBy,
    testigo: r.witness,
    notas: r.notes,
    anulado: r.annulledAt != null,
  };
}

const SELECT_VALE = {
  id: true, voucherNumber: true, date: true, assetId: true, hourMeter: true, gallons: true,
  operatorName: true, amount: true, notes: true, annulledAt: true, annulReason: true,
  // Solo si hay firma, no la firma (pesa ~10 KB por vale): se pide aparte.
  signature: false,
  asset: { select: { name: true, plate: true } },
} as const;

type FilaVale = {
  id: string; voucherNumber: number | null; date: Date; assetId: string; hourMeter: unknown; gallons: unknown;
  operatorName: string | null; amount: unknown; notes: string | null; annulledAt: Date | null; annulReason: string | null;
  asset: { name: string; plate: string | null };
};

function aVale(r: FilaVale, firmado: boolean): ValeCuaderno {
  return {
    id: r.id,
    numero: r.voucherNumber,
    fecha: r.date.toISOString(),
    maquinaId: r.assetId,
    maquina: r.asset.name,
    placa: r.asset.plate,
    horometro: numOrNull(r.hourMeter),
    galones: num(r.gallons),
    operador: r.operatorName,
    firmado,
    monto: num(r.amount),
    notas: r.notes,
    anulado: r.annulledAt != null,
    motivoAnulacion: r.annulReason,
  };
}

function normalizarConfig(raw: unknown): ConfigCuaderno {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<ConfigCuaderno>;
  const proy = Array.isArray(c.proyeccionCilindros) && c.proyeccionCilindros.length === 12 && c.proyeccionCilindros.every((n) => typeof n === "number" && n >= 0)
    ? c.proyeccionCilindros
    : null;
  return {
    producto: typeof c.producto === "string" && c.producto.trim() ? c.producto.trim() : CONFIG_POR_DEFECTO.producto,
    galPorCilindro: typeof c.galPorCilindro === "number" && c.galPorCilindro > 0 ? c.galPorCilindro : CONFIG_POR_DEFECTO.galPorCilindro,
    maxCilindros: typeof c.maxCilindros === "number" && c.maxCilindros > 0 ? Math.floor(c.maxCilindros) : CONFIG_POR_DEFECTO.maxCilindros,
    cupoAnualGal: typeof c.cupoAnualGal === "number" && c.cupoAnualGal > 0 ? c.cupoAnualGal : null,
    proyeccionCilindros: proy,
    responsable: typeof c.responsable === "string" && c.responsable.trim() ? c.responsable.trim() : null,
  };
}

export const CuadernoCombustibleDB = {
  async config(tenantId: string): Promise<ConfigCuaderno> {
    if (!tenantId) throw new Error("tenantId is required");
    return normalizarConfig(await PlatformSettingsDB.get<unknown>(CLAVE_CONFIG(tenantId)));
  },

  async guardarConfig(tenantId: string, cfg: ConfigCuaderno, usuario: string): Promise<ConfigCuaderno> {
    if (!tenantId) throw new Error("tenantId is required");
    const limpio = normalizarConfig(cfg);
    await PlatformSettingsDB.set(CLAVE_CONFIG(tenantId), limpio, usuario);
    return limpio;
  },

  /** Los renglones del cuaderno (vigentes y anulados) para hacer las cuentas. */
  async datos(tenantId: string): Promise<DatosCuaderno> {
    if (!tenantId) throw new Error("tenantId is required");
    const [ingresos, vales, conteos, firmados] = await Promise.all([
      prisma.fuelPurchase.findMany({ where: { tenantId }, orderBy: { date: "asc" } }),
      prisma.assetExpense.findMany({ where: { tenantId, fuelSource: FUENTE_CILINDROS }, select: SELECT_VALE, orderBy: { date: "asc" } }),
      prisma.fuelCount.findMany({ where: { tenantId }, orderBy: { date: "asc" } }),
      prisma.assetExpense.findMany({ where: { tenantId, fuelSource: FUENTE_CILINDROS, signature: { not: null } }, select: { id: true } }),
    ]);
    const conFirma = new Set(firmados.map((f) => f.id));
    return {
      ingresos: ingresos.map(aIngreso),
      vales: vales.map((v) => aVale(v, conFirma.has(v.id))),
      conteos: conteos.map(aConteo),
    };
  },

  async completo(tenantId: string): Promise<CuadernoCompleto> {
    const [d, config, activos] = await Promise.all([
      this.datos(tenantId),
      this.config(tenantId),
      prisma.asset.findMany({
        where: { tenantId },
        select: { id: true, name: true, type: true, plate: true, fuelTargetPerUnit: true, currentHours: true, active: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      ...d,
      config,
      maquinas: activos.map((a) => ({
        id: a.id, nombre: a.name, tipo: a.type, placa: a.plate,
        meta: numOrNull(a.fuelTargetPerUnit), horometro: numOrNull(a.currentHours), activa: a.active,
      })),
      siguienteCilindro: siguienteCilindro(d.ingresos),
    };
  },

  async despues(tenantId: string): Promise<Despues> {
    const [d, config] = await Promise.all([this.datos(tenantId), this.config(tenantId)]);
    const r = recorrer(d);
    return { saldoGal: r.saldoGal, cilindros: r.cilindrosConCombustible, nivel: nivelAlmacen(r.saldoGal, r.cilindrosConCombustible, config) };
  },

  // ── Ingresos ──────────────────────────────────────────────────────────

  /**
   * Anota un ingreso de cilindros y les da número (C-05 a C-08). Si es compra
   * y se pide, deja el gasto en Mi Plata (o enlaza el que ya tenía esa factura,
   * para no contarlo dos veces).
   */
  async crearIngreso(
    tenantId: string,
    data: {
      fecha: Date; tipo: TipoIngreso; factura: string | null; grifo: string | null; grifoRuc: string | null; guia: string | null;
      cilindros: number; galones: number; precioGal: number | null; monto: number | null; notas: string | null; anotarGasto: boolean;
    },
    usuario: string,
  ): Promise<{ ingreso: IngresoCuaderno; gasto: "nuevo" | "ya-estaba" | null; despues: Despues }> {
    if (!tenantId) throw new Error("tenantId is required");
    const monto = data.monto ?? (data.precioGal != null ? Math.round(data.precioGal * data.galones * 100) / 100 : 0);
    const config = await this.config(tenantId);
    let fila: FilaIngreso | null = null;
    for (let intento = 0; intento < 4 && !fila; intento++) {
      const previos = await prisma.fuelPurchase.findMany({ where: { tenantId }, select: { firstCylinder: true, cylinders: true } });
      const primero = previos.reduce((m, p) => Math.max(m, p.firstCylinder + p.cylinders), 1);
      try {
        fila = await prisma.fuelPurchase.create({
          data: {
            tenantId, date: data.fecha, kind: data.tipo, product: config.producto,
            invoiceNumber: data.factura, supplierName: data.grifo, supplierRuc: data.grifoRuc, guideNumber: data.guia,
            cylinders: data.cilindros, gallons: data.galones, unitPrice: data.precioGal, amount: monto,
            firstCylinder: primero, notes: data.notas, createdBy: usuario,
          },
        });
      } catch (err) {
        // Dos ingresos a la vez sacaron el mismo número: el segundo vuelve a contar.
        if (!esDuplicado(err)) throw err;
      }
    }
    if (!fila) throw new Error("No se pudo numerar los cilindros (intenta de nuevo)");

    let gasto: "nuevo" | "ya-estaba" | null = null;
    if (data.tipo === "compra" && data.anotarGasto && monto > 0) {
      try {
        const repetido = data.grifoRuc && data.factura ? await ComprobantesDB.comprobanteRepetido(tenantId, data.grifoRuc, data.factura, "factura") : null;
        let gastoId: string;
        if (repetido) {
          gastoId = repetido.id;
          gasto = "ya-estaba";
        } else {
          const g = await GastosDB.add(tenantId, {
            category: "Combustible",
            description: `${config.producto}: ${data.cilindros} cilindro(s), ${data.galones} gal (${rangoCilindros(fila.firstCylinder, data.cilindros)})`,
            amount: monto,
            date: data.fecha.toISOString(),
            recurring: false,
            supplierName: data.grifo,
            supplierRuc: data.grifoRuc,
            documentType: data.factura ? "factura" : null,
            documentNumber: data.factura,
            createdBy: usuario,
            notes: data.guia ? `Guía de remisión ${data.guia} · cuaderno de combustible` : "Cuaderno de combustible",
          });
          gastoId = g.id;
          gasto = "nuevo";
        }
        fila = await prisma.fuelPurchase.update({ where: { id: fila.id, tenantId }, data: { expenseId: gastoId } });
      } catch (err) {
        // El cuaderno no se cae por el gasto: queda el ingreso y se avisa.
        logger.error("[combustible] gasto de la compra failed", { tenantId, id: fila.id, err: String(err) });
        gasto = null;
      }
    }
    return { ingreso: aIngreso(fila), gasto, despues: await this.despues(tenantId) };
  },

  async anularIngreso(tenantId: string, id: string, motivo: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.fuelPurchase.updateMany({
      where: { id, tenantId, annulledAt: null },
      data: { annulledAt: new Date(), annulReason: motivo, annulledBy: usuario },
    });
    return r.count > 0;
  },

  // ── Vales ─────────────────────────────────────────────────────────────

  /**
   * Vale de salida: la máquina, el horómetro, los galones, el operador y su
   * firma. El costo sale del precio de los cilindros de donde sale (primero
   * en entrar, primero en salir) y cae como gasto de combustible de la máquina.
   */
  async crearVale(
    tenantId: string,
    data: { fecha: Date; maquinaId: string; horometro: number | null; galones: number; operador: string; firma: string | null; notas: string | null },
    usuario: string,
  ): Promise<{ ok: true; vale: ValeCuaderno; deCilindros: string[]; sinRespaldoGal: number; despues: Despues } | { ok: false; error: string; status: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const maquina = await prisma.asset.findFirst({ where: { id: data.maquinaId, tenantId }, select: { id: true, currentHours: true } });
    if (!maquina) return { ok: false, error: "Máquina no encontrada", status: 404 };
    const d = await this.datos(tenantId);
    const problema = problemaDeHorometro(d.vales, data.maquinaId, data.fecha.toISOString(), data.horometro);
    if (problema) return { ok: false, error: problema, status: 409 };
    const c = costoDeVale(d, data.fecha.toISOString(), data.galones);
    const precio = data.galones > 0 ? Math.round((c.costo / data.galones) * 100) / 100 : null;

    let fila: FilaVale | null = null;
    for (let intento = 0; intento < 4 && !fila; intento++) {
      const ultimo = await prisma.assetExpense.aggregate({ where: { tenantId, fuelSource: FUENTE_CILINDROS }, _max: { voucherNumber: true } });
      try {
        fila = await prisma.assetExpense.create({
          data: {
            tenantId, assetId: data.maquinaId, date: data.fecha, category: "combustible", fuelSource: FUENTE_CILINDROS,
            voucherNumber: (ultimo._max.voucherNumber ?? 0) + 1, hourMeter: data.horometro, gallons: data.galones,
            unitPrice: precio, amount: c.costo, operatorName: data.operador, signature: data.firma, notes: data.notas, createdBy: usuario,
          },
          select: SELECT_VALE,
        });
      } catch (err) {
        if (!esDuplicado(err)) throw err;
      }
    }
    if (!fila) return { ok: false, error: "No se pudo numerar el vale (intenta de nuevo)", status: 503 };

    // El horómetro de la ficha de la máquina sigue a la lectura más alta.
    if (data.horometro != null && (maquina.currentHours == null || data.horometro > Number(maquina.currentHours))) {
      await prisma.asset.updateMany({ where: { id: data.maquinaId, tenantId }, data: { currentHours: data.horometro } });
    }
    return { ok: true, vale: aVale(fila, data.firma != null), deCilindros: c.deCilindros, sinRespaldoGal: c.sinRespaldoGal, despues: await this.despues(tenantId) };
  },

  async anularVale(tenantId: string, id: string, motivo: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.assetExpense.updateMany({
      where: { id, tenantId, fuelSource: FUENTE_CILINDROS, annulledAt: null },
      data: { annulledAt: new Date(), annulReason: motivo, annulledBy: usuario },
    });
    return r.count > 0;
  },

  /** La firma del vale (PNG data URL) o null. */
  async firmaDeVale(tenantId: string, id: string): Promise<string | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await prisma.assetExpense.findFirst({ where: { id, tenantId, fuelSource: FUENTE_CILINDROS }, select: { signature: true } });
    return f?.signature ?? null;
  },

  // ── Conteos ───────────────────────────────────────────────────────────

  /** Conteo físico: guarda lo contado y la foto de lo que decía el cuaderno en ese momento. */
  async crearConteo(
    tenantId: string,
    data: { fecha: Date; cilindros: number; galones: number; contadoPor: string; testigo: string | null; notas: string | null },
    usuario: string,
  ): Promise<{ conteo: ConteoCuaderno; difGal: number; difCil: number; despues: Despues }> {
    if (!tenantId) throw new Error("tenantId is required");
    const d = await this.datos(tenantId);
    const libro = libroAl(d, new Date(data.fecha.getTime() + 1).toISOString());
    const fila = await prisma.fuelCount.create({
      data: {
        tenantId, date: data.fecha, cylindersCounted: data.cilindros, gallonsCounted: data.galones,
        cylindersBook: libro.cilindros, gallonsBook: libro.saldoGal, countedBy: data.contadoPor,
        witness: data.testigo, notes: data.notas, createdBy: usuario,
      },
    });
    return {
      conteo: aConteo(fila),
      difGal: Math.round((data.galones - libro.saldoGal) * 100) / 100,
      difCil: data.cilindros - libro.cilindros,
      despues: await this.despues(tenantId),
    };
  },

  async anularConteo(tenantId: string, id: string, motivo: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.fuelCount.updateMany({
      where: { id, tenantId, annulledAt: null },
      data: { annulledAt: new Date(), annulReason: motivo, annulledBy: usuario },
    });
    return r.count > 0;
  },
};

