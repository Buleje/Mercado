import { describe, expect, it } from "vitest";
import { abonosDelCliente, cobroDelAbono, comprasDelCliente, gestionesDelCliente, reciboDeAbono } from "@/components/admin/fiados/cuenta-cliente";
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

  it("recibo de un abono de OTRA compra: deuda original = total de esa compra, no de la abierta", () => {
    const a = fiado("a", { total: 300, saldo: 300, createdAt: "2026-10-05T15:00:00.000Z" });
    const b = fiado("b", { total: 80, saldo: 50, cuotas: [cuota("cb", "b", 30, "2026-10-03T15:00:00.000Z", "Yape")] });
    const abonos = abonosDelCliente([a, b], "999111222");
    const r = reciboDeAbono(abonos[0], { nombre: "Rosa", telefono: "999111222" }, { abonos, compras: [a, b] });
    expect(r).toMatchObject({ alcance: "compra", deudaOriginal: 80, saldoAnterior: 80, saldoActual: 50, compraDel: "jueves 01/10" });
  });

  it("un cobro de S/ 60 repartido en dos compras sale como UN recibo con la deuda del cliente", () => {
    // El cobro: 40 cierra la vieja (A) y 20 va a la nueva (B), en la misma transacción.
    const a = fiado("a", { total: 40, saldo: 0, status: "PAGADO", createdAt: "2026-09-20T15:00:00.000Z", cuotas: [cuota("ca", "a", 40, "2026-10-10T15:00:00.120Z", "Efectivo")] });
    const b = fiado("b", { total: 100, saldo: 80, createdAt: "2026-10-01T15:00:00.000Z", cuotas: [cuota("cb", "b", 20, "2026-10-10T15:00:00.180Z", "Efectivo")] });
    // Otra compra abierta que el cobro no tocó: también es deuda del cliente.
    const c = fiado("c", { total: 25, saldo: 25, createdAt: "2026-10-05T15:00:00.000Z" });
    // Un abono aparte, de otro día y a la misma compra: no se junta.
    const compras = [a, b, c];
    const abonos = abonosDelCliente(compras, "999111222");
    const delB = abonos.find((x) => x.id === "cb")!;
    expect(cobroDelAbono(delB, abonos).map((x) => x.id)).toEqual(["ca", "cb"]);
    const r = reciboDeAbono(delB, { nombre: "Rosa", telefono: "999111222" }, { abonos, compras });
    expect(r).toMatchObject({ alcance: "cliente", compras: 2, montoPagado: 60, saldoAnterior: 165, saldoActual: 105 });
    expect(r.deudaOriginal).toBeUndefined();
  });

  it("dos cuotas de la MISMA compra son dos cobros aunque caigan juntas; otro medio tampoco se junta", () => {
    const b = fiado("b", { total: 100, saldo: 70, cuotas: [
      cuota("c1", "b", 10, "2026-10-10T15:00:00.000Z", "Efectivo"),
      cuota("c2", "b", 20, "2026-10-10T15:00:01.000Z", "Efectivo"),
    ] });
    const a = fiado("a", { total: 50, saldo: 45, cuotas: [cuota("c3", "a", 5, "2026-10-10T15:00:00.500Z", "Yape")] });
    const abonos = abonosDelCliente([a, b], "999111222");
    expect(cobroDelAbono(abonos.find((x) => x.id === "c2")!, abonos).map((x) => x.id)).toEqual(["c2"]);
  });
});
