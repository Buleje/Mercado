/**
 * Orden de los locks de plata (ADR-437, revisión 2026-09-26).
 *
 * Antes: el modal de la guía bloqueaba la GUÍA y la liquidación la PERSONA, y
 * ninguno esperaba al otro. Ahora los dos caminos toman primero las guías
 * (ordenadas) y después la persona; y la liquidación bloquea
 * `liq:{tenant}:comprobantes` ANTES de mirar si una foto ya es comprobante de
 * otro pago (dos pagos a dos personas con la misma foto pasaban los dos).
 *
 * Base simulada: se afirma sobre la secuencia de locks y consultas capturada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    pasos: [] as string[],
    movimientos: [] as Record<string, unknown>[],
    yaExiste: null as Record<string, unknown> | null,
  };
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (strings.join("?").includes("pg_advisory_xact_lock")) estado.pasos.push(`lock:${String(vals[0])}`);
      return 1;
    },
    $queryRaw: async () => {
      estado.pasos.push("query:comprobantes-usados");
      return [];
    },
    adelantoBeneficiario: { findFirst: async () => null },
    forestParty: { findFirst: async () => ({ id: "p1", nombre: "Nelly", docNumero: null }) },
    adelanto: { findMany: async () => [] },
    forestCuentaMov: {
      findMany: async () => estado.movimientos,
      groupBy: async () => [{ tipo: "abono", _sum: { monto: 1500 } }],
    },
    liquidacionCuenta: {
      findFirst: async () => {
        estado.pasos.push("idempotencia");
        return estado.yaExiste;
      },
    },
  };
  return { estado, tx };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(H.tx) } }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));

import { LiquidacionCuentaDB, ComprobanteNoValidoError, PlanCambioError } from "@/lib/db/liquidacion-cuenta.db";
import { firmarFoto } from "@/lib/forestal/fotos-carga-firma";
import { urlPrivada } from "@/lib/forestal/fotos-carga";

const T = "tenant-qa";
const mov = (id: string, tipo: string, concepto: string, monto: number, gtfNumber: string | null) => ({
  id,
  tenantId: T,
  parteId: "p1",
  parteNombre: "Nelly",
  fecha: new Date("2026-09-01T00:00:00.000Z"),
  tipo,
  concepto,
  monto,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  gtfNumber,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
});

const entrada = (extra: Record<string, unknown> = {}) => ({
  idempotencyKey: "0b8e6f0e-8f5c-4f4f-9d0e-2b4a3c1d9e7f",
  persona: { parteId: "p1" },
  fecha: "2026-09-20",
  compensar: 0,
  pago: { direccion: "hecho" as const, monto: 100, metodo: "efectivo" as const, moverCaja: false },
  imputacion: { guias: [{ gtfNumber: "GTF-C", monto: 100, paso: "pago" as const }] },
  huella: "no-coincide",
  ...extra,
});

let secreto: string | undefined;
beforeEach(() => {
  secreto = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-prueba-de-32-caracteres!!";
  H.estado.pasos = [];
  H.estado.yaExiste = null;
  H.estado.movimientos = [
    mov("mb", "abono", "madera", 1000, "GTF-B"),
    mov("ma", "abono", "madera", 500, "GTF-A"),
    mov("x", "abono", "aserrio_recibido", 100, null),
  ];
});
afterEach(() => {
  process.env.AUTH_SECRET = secreto;
});

describe("LiquidacionCuentaDB.crear — orden de los locks", () => {
  it("primero las guías de la persona y las imputadas (ordenadas), después la persona", async () => {
    await expect(LiquidacionCuentaDB.crear(T, entrada() as never, "qaadmin")).rejects.toBeInstanceOf(PlanCambioError);
    const locks = H.estado.pasos.filter((p) => p.startsWith("lock:"));
    expect(locks.slice(0, 4)).toEqual([
      `lock:guia-plata:${T}:A`,
      `lock:guia-plata:${T}:B`,
      `lock:guia-plata:${T}:C`,
      `lock:liq:${T}:parte:p1`,
    ]);
  });

  it("el lock de comprobantes se toma ANTES de buscar la foto en otras liquidaciones", async () => {
    const comp = firmarFoto({ url: urlPrivada(`${T}/forestal-carga/a.webp`), subidaEn: "2026-09-20T10:00:00.000Z" }, "comprobante");
    await expect(LiquidacionCuentaDB.crear(T, entrada({ comprobantes: [comp] }) as never, "qaadmin")).rejects.toBeInstanceOf(
      PlanCambioError,
    );
    const iLock = H.estado.pasos.indexOf(`lock:liq:${T}:comprobantes`);
    const iQuery = H.estado.pasos.indexOf("query:comprobantes-usados");
    expect(iLock).toBeGreaterThan(-1);
    expect(iLock).toBeLessThan(iQuery);
  });

  it("una foto subida como foto de la CARGA no pasa como comprobante", async () => {
    const carga = firmarFoto({ url: urlPrivada(`${T}/forestal-carga/b.webp`), subidaEn: "2026-09-20T10:00:00.000Z" });
    await expect(LiquidacionCuentaDB.crear(T, entrada({ comprobantes: [carga] }) as never, "qaadmin")).rejects.toBeInstanceOf(
      ComprobanteNoValidoError,
    );
  });
});
