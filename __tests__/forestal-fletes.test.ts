import { describe, it, expect } from "vitest";
import {
  costoPorM3,
  faltantesFlete,
  fleteInputSchema,
  porProveedor,
  porTransportista,
  resumirFletes,
  type Flete,
} from "@/lib/forestal/fletes";

/**
 * Fletes forestales (ADR-318).
 *
 * Lo que se prueba es la regla de oro heredada del costeo: **sin monto es
 * `null`, nunca `0`**. Un flete sin precio no es un flete gratis, y un 0
 * abarataría el S//m³ — la dirección más peligrosa en la que puede mentir un
 * número que se usa para negociar.
 */

const flete = (over: Partial<Flete> = {}): Flete => ({
  id: "f1",
  fecha: "2026-07-10T00:00:00.000Z",
  tipo: "ingreso",
  gtfNumber: "001-0000123",
  vehiculoId: "v1",
  placa: "A2C123",
  transportistaId: "t1",
  transportistaNombre: "Transportes Selva EIRL",
  conductorId: null,
  proveedorId: null,
  proveedorNombre: null,
  volumenM3: 30,
  monto: 1500,
  moneda: "PEN",
  pagaQuien: "ctp",
  estadoPago: "pendiente",
  fechaPago: null,
  notas: null,
  ...over,
});

describe("costo por m³", () => {
  it("es monto sobre volumen, redondeado a céntimos", () => {
    expect(costoPorM3(flete())).toBe(50);
    expect(costoPorM3(flete({ monto: 1000, volumenM3: 3 }))).toBe(333.33);
  });

  it("sin monto o sin volumen es null, no 0", () => {
    expect(costoPorM3(flete({ monto: null }))).toBeNull();
    expect(costoPorM3(flete({ volumenM3: null }))).toBeNull();
    expect(costoPorM3(flete({ volumenM3: 0 }))).toBeNull();
  });
});

describe("resumen del período", () => {
  it("separa quién paga cada viaje", () => {
    const r = resumirFletes([
      flete({ id: "a", monto: 1000, pagaQuien: "ctp" }),
      flete({ id: "b", monto: 500, pagaQuien: "proveedor" }),
      flete({ id: "c", monto: 300, pagaQuien: "destinatario" }),
    ]);
    expect(r.gastoCtp).toBe(1000);
    expect(r.aCargoProveedor).toBe(500);
    expect(r.aCargoDestinatario).toBe(300);
    // El conteo de "los que salen de mi caja" no mezcla los otros dos.
    expect(r.viajesCtp).toBe(1);
  });

  it("los viajes sin monto se cuentan aparte y NO bajan el promedio", () => {
    const r = resumirFletes([
      flete({ id: "a", monto: 1500, volumenM3: 30 }),
      flete({ id: "b", monto: null, volumenM3: 30 }),
    ]);
    expect(r.sinMonto).toBe(1);
    expect(r.gastoCtp).toBe(1500);
    // Si el sin-monto contara como 0, el promedio caería a 25.
    expect(r.costoPorM3).toBe(50);
    // El volumen sí incluye los dos: la madera se movió igual.
    expect(r.volumen).toBe(60);
  });

  it("el S//m³ es ponderado, no promedio de promedios", () => {
    // 3000/30 = 100 · 100/1 = 100 → si fuera promedio simple daría 100.
    // Ponderado: (3000 + 100) / 31 = 100.
    const r = resumirFletes([
      flete({ id: "a", monto: 3000, volumenM3: 30 }),
      flete({ id: "b", monto: 100, volumenM3: 1 }),
    ]);
    expect(r.costoPorM3).toBe(100);

    // Uno caro y chiquito no debe arrastrar el promedio del período.
    const r2 = resumirFletes([
      flete({ id: "a", monto: 3000, volumenM3: 30 }),
      flete({ id: "b", monto: 500, volumenM3: 1 }),
    ]);
    expect(r2.costoPorM3).toBe(112.9); // 3500/31, no (100+500)/2 = 300
  });

  it("pendiente cuenta lo impago sin importar quién paga", () => {
    const r = resumirFletes([
      flete({ id: "a", monto: 1000, estadoPago: "pendiente" }),
      flete({ id: "b", monto: 700, estadoPago: "pagado", pagaQuien: "proveedor" }),
      flete({ id: "c", monto: 300, estadoPago: "pendiente", pagaQuien: "proveedor" }),
    ]);
    expect(r.pendiente).toBe(1300);
  });

  it("una lista vacía no inventa promedios", () => {
    const r = resumirFletes([]);
    expect(r).toMatchObject({ viajes: 0, viajesCtp: 0, gastoCtp: 0, pendiente: 0, volumen: 0, costoPorM3: null });
  });
});

describe("cuentas por transportista", () => {
  it("agrupa y ordena por lo que se debe", () => {
    const cuentas = porTransportista([
      flete({ id: "a", transportistaId: "t1", transportistaNombre: "Selva", monto: 1000, estadoPago: "pagado" }),
      flete({ id: "b", transportistaId: "t2", transportistaNombre: "Oriente", monto: 800, estadoPago: "pendiente" }),
      flete({ id: "c", transportistaId: "t1", transportistaNombre: "Selva", monto: 200, estadoPago: "pendiente" }),
    ]);
    expect(cuentas.map((c) => c.nombre)).toEqual(["Oriente", "Selva"]);
    expect(cuentas[0]).toMatchObject({ viajes: 1, total: 800, pendiente: 800 });
    expect(cuentas[1]).toMatchObject({ viajes: 2, total: 1200, pendiente: 200 });
  });

  it("el tipeado a mano (sin id) tiene su propia fila, no se pierde", () => {
    const cuentas = porTransportista([
      flete({ id: "a", transportistaId: null, transportistaNombre: "Don Pepe" }),
      flete({ id: "b", transportistaId: null, transportistaNombre: null }),
    ]);
    expect(cuentas.map((c) => c.nombre).sort()).toEqual(["Don Pepe", "Sin transportista"]);
  });

  it("cuenta los viajes sin monto aparte de los que suman", () => {
    const cuentas = porTransportista([
      flete({ id: "a", monto: null }),
      flete({ id: "b", monto: 400, estadoPago: "pendiente" }),
    ]);
    expect(cuentas[0]).toMatchObject({ viajes: 2, sinMonto: 1, total: 400, pendiente: 400 });
  });
});

describe("cuentas por proveedor", () => {
  it("sólo mira los fletes que van a su cargo", () => {
    const cuentas = porProveedor([
      flete({ id: "a", pagaQuien: "proveedor", proveedorNombre: "Comunidad X", monto: 900 }),
      flete({ id: "b", pagaQuien: "ctp", proveedorNombre: "Comunidad X", monto: 900 }),
    ]);
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]).toMatchObject({ nombre: "Comunidad X", total: 900, viajes: 1 });
  });
});

describe("faltantes del viaje", () => {
  it("un flete completo no tiene faltantes", () => {
    expect(faltantesFlete(flete())).toEqual([]);
  });

  it("avisa qué le falta sin bloquear: el precio se cierra después", () => {
    const f = faltantesFlete(flete({ monto: null, volumenM3: null, gtfNumber: null }));
    expect(f).toContain("monto");
    expect(f.some((x) => x.startsWith("volumen"))).toBe(true);
    expect(f.some((x) => x.startsWith("guía"))).toBe(true);
  });

  it("con vehículo elegido no reclama la placa (viene del directorio)", () => {
    expect(faltantesFlete(flete({ placa: null, vehiculoId: "v1" }))).toEqual([]);
  });
});

describe("validación del input", () => {
  it("exige fecha del viaje", () => {
    expect(fleteInputSchema.safeParse({ fecha: "" }).success).toBe(false);
    expect(fleteInputSchema.safeParse({ fecha: "2026-07-10" }).success).toBe(true);
  });

  it("acepta monto nulo (todavía no se sabe) y rechaza negativo", () => {
    expect(fleteInputSchema.safeParse({ fecha: "2026-07-10", monto: null }).success).toBe(true);
    expect(fleteInputSchema.safeParse({ fecha: "2026-07-10", monto: -5 }).success).toBe(false);
  });

  it("por defecto lo paga el CTP y queda pendiente", () => {
    const r = fleteInputSchema.safeParse({ fecha: "2026-07-10" });
    expect(r.success && r.data.pagaQuien).toBe("ctp");
    expect(r.success && r.data.estadoPago).toBe("pendiente");
  });
});
