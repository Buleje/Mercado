import { describe, expect, it } from "vitest";
import { abonosDelCliente, comprasDelCliente, gestionesDelCliente, reciboDeAbono } from "@/components/admin/fiados/cuenta-cliente";
import type { Fiado } from "@/components/admin/fiados/tipos";
import { medioYNota } from "@/lib/fiados/cobro-metodo";

const fiado = (id: string, over: Partial<Fiado>): Fiado => ({
  id,
  customerId: "999111222",
  customerName: "Rosa",
  total: 100,
  saldo: 100,
  status: "ACTIVO",
  cuotas: [],
  createdAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-01T15:00:00.000Z",
  ...over,
} as Fiado);

const cuota = (id: string, fiadoId: string, monto: number, createdAt: string, notas?: string) => ({ id, fiadoId, monto, createdAt, notas });

describe("cuenta del cliente (M32)", () => {
  it("el saldo de cada abono se reconstruye hacia atrás desde el saldo del servidor", () => {
    const f = fiado("f1", {
      total: 100,
      saldo: 30,
      cuotas: [cuota("c1", "f1", 50, "2026-10-02T15:00:00.000Z", "Yape · pagó su hijo"), cuota("c2", "f1", 20, "2026-10-05T15:00:00.000Z", "Efectivo")],
    });
    const abonos = abonosDelCliente([f], "999111222");
    expect(abonos.map((a) => [a.id, a.saldoAntes, a.saldoDespues])).toEqual([
      ["c2", 50, 30],
      ["c1", 100, 50],
    ]);
    expect(abonos[1]).toMatchObject({ metodo: "yape", medio: "Yape", nota: "pagó su hijo" });
  });

  it("si las cuotas no cuadran con el total, manda el saldo del servidor (el de hoy no cambia)", () => {
    const f = fiado("f1", { total: 100, saldo: 45, cuotas: [cuota("c1", "f1", 50, "2026-10-02T15:00:00.000Z")] });
    expect(abonosDelCliente([f], "999111222")[0]).toMatchObject({ saldoAntes: 95, saldoDespues: 45 });
  });

  it("junta los abonos de todas sus compras y deja afuera a otros clientes", () => {
    const a = fiado("a", { saldo: 0, status: "PAGADO", cuotas: [cuota("x", "a", 100, "2026-10-03T15:00:00.000Z")] });
    const b = fiado("b", { saldo: 80, cuotas: [cuota("y", "b", 20, "2026-10-07T15:00:00.000Z")] });
    const otro = fiado("c", { customerId: "000", cuotas: [cuota("z", "c", 5, "2026-10-08T15:00:00.000Z")] });
    expect(abonosDelCliente([a, b, otro], "999111222").map((x) => `${x.id}:${x.fiado.id}`)).toEqual(["y:b", "x:a"]);
  });

  it("compras: las que debe primero (la más vieja arriba), después las pagadas", () => {
    const vieja = fiado("vieja", { createdAt: "2026-09-01T15:00:00.000Z", status: "VENCIDO" });
    const nueva = fiado("nueva", { createdAt: "2026-10-10T15:00:00.000Z" });
    const pagada = fiado("pagada", { createdAt: "2026-10-12T15:00:00.000Z", status: "PAGADO", saldo: 0 });
    expect(comprasDelCliente([pagada, nueva, vieja], "999111222").map((f) => f.id)).toEqual(["vieja", "nueva", "pagada"]);
  });

  it("gestiones del cliente, la más reciente arriba", () => {
    const g = (id: string, customerId: string, fecha: string) => ({ id, customerId, fecha, tipo: "llamada" });
    expect(gestionesDelCliente([g("1", "999111222", "2026-10-01"), g("2", "000", "2026-10-09"), g("3", "999111222", "2026-10-05")], "999111222").map((x) => x.id)).toEqual(["3", "1"]);
  });

  it("el recibo de un abono viejo lleva su monto, sus saldos y su medio", () => {
    const f = fiado("f1", { saldo: 30, cuotas: [cuota("c1", "f1", 70, "2026-10-02T15:00:00.000Z", "Plin")] });
    const r = reciboDeAbono(abonosDelCliente([f], "999111222")[0], { nombre: "Rosa", telefono: "999111222" });
    expect(r).toMatchObject({ clienteNombre: "Rosa", montoPagado: 70, saldoAnterior: 100, saldoActual: 30, metodo: "plin" });
    expect(r.caja).toBeUndefined();
  });

  it("medioYNota: inverso de notasConMetodo; sin medio, la nota tal cual", () => {
    expect(medioYNota("Transferencia · BCP")).toEqual({ metodo: "transferencia", medio: "Transferencia", nota: "BCP" });
    expect(medioYNota("pagó en la feria")).toEqual({ metodo: null, medio: null, nota: "pagó en la feria" });
    expect(medioYNota(undefined)).toEqual({ metodo: null, medio: null, nota: "" });
  });
});
