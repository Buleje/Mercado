/**
 * Lote de Pedidos revisable (P09, 17-10): `components/admin/OrdersTab/lote-pedidos.ts`.
 * Antes del envío, cuáles van y cuáles no; después, qué le pasó a CADA pedido
 * según `POST /api/orders/bulk-status`, sin decir «salió bien» cuando no se
 * sabe. Reintentar manda sólo los pendientes.
 */
import { describe, expect, it } from "vitest";
import {
  contarResultados,
  juntarResultados,
  pendientesDe,
  porDecidir,
  resultadoDelLote,
  revisarLote,
  type FilaLote,
} from "@/components/admin/OrdersTab/lote-pedidos";

describe("revisarLote", () => {
  it("separa los que van, los que ya estaban y los que no pueden saltar", () => {
    const r = revisarLote(
      [
        { id: "a", status: "confirmado" },
        { id: "b", status: "preparando" },
        { id: "c", status: "pendiente" },
        { id: "d", status: "entregado" },
      ],
      "preparando",
    );
    expect(r.elegibles).toEqual(["a"]);
    expect(r.excluidos).toEqual([
      { id: "b", resultado: "ya-estaba", motivo: "Ya estaba en Preparando" },
      { id: "c", resultado: "rechazado", motivo: expect.stringMatching(/^De .+ no se pasa a Preparando$/) },
      { id: "d", resultado: "rechazado", motivo: expect.stringMatching(/no se pasa a/) },
    ]);
  });
});

describe("resultadoDelLote", () => {
  const ids = ["a", "b", "c", "d"];

  it("200 con ids: cada uno con lo suyo", () => {
    const filas = resultadoDelLote(
      ids,
      200,
      {
        updated: 1,
        actualizados: ["a"],
        rechazados: [{ id: "b", desde: "entregado" }],
        sinCambio: 1,
        sinCambioIds: ["c"],
        noEncontrados: ["d"],
      },
      "en_camino",
    );
    expect(filas.map((f) => [f.id, f.resultado])).toEqual([
      ["a", "cambiado"],
      ["b", "rechazado"],
      ["c", "ya-estaba"],
      ["d", "no-encontrado"],
    ]);
    expect(filas[1].motivo).toMatch(/^De .+ no se pasa a/);
  });

  it("el que no vino en ningún grupo cambió mientras tanto: pendiente", () => {
    const filas = resultadoDelLote(["a", "b"], 200, { updated: 1, actualizados: ["a"] }, "preparando");
    expect(filas[1]).toMatchObject({ resultado: "pendiente", motivo: expect.stringMatching(/mientras tanto/) });
  });

  it("servidor viejo sin ids: cambiado sólo si las cifras cierran", () => {
    expect(
      resultadoDelLote(["a", "b"], 200, { updated: 2, sinCambio: 0 }, "preparando").map((f) => f.resultado),
    ).toEqual(["cambiado", "cambiado"]);
    expect(
      resultadoDelLote(["a", "b"], 200, { updated: 1, sinCambio: 0 }, "preparando").map((f) => f.resultado),
    ).toEqual(["pendiente", "pendiente"]);
  });

  it("422 = nadie cambió; los rechazados con su motivo", () => {
    const filas = resultadoDelLote(
      ["a", "b"],
      422,
      { error: "x", actualizados: [], rechazados: [{ id: "a", desde: "cancelado" }], sinCambioIds: ["b"] },
      "entregado",
    );
    expect(filas.map((f) => f.resultado)).toEqual(["rechazado", "ya-estaba"]);
  });

  it.each([
    [null, "pendiente", /Sin conexión/],
    [503, "pendiente", /503/],
    [429, "pendiente", /espera/],
    [401, "pendiente", /sesión/],
    [403, "rechazado", /rol/],
    [404, "no-encontrado", /negocio/],
    [400, "rechazado", /malo/],
  ] as const)("status %s → todos %s", (status, resultado, motivo) => {
    const filas = resultadoDelLote(["a", "b"], status, { error: "Pedido malo" }, "preparando");
    expect(filas.every((f) => f.resultado === resultado)).toBe(true);
    expect(filas[0].motivo).toMatch(motivo);
  });
});

describe("después del informe", () => {
  const primero: FilaLote[] = [
    { id: "a", resultado: "cambiado", motivo: "" },
    { id: "b", resultado: "pendiente", motivo: "Sin conexión" },
    { id: "c", resultado: "rechazado", motivo: "De Entregado no se pasa a Preparando" },
    { id: "d", resultado: "pendiente", motivo: "Sin conexión" },
  ];

  it("reintentar manda sólo los pendientes y lo nuevo pisa lo viejo en el mismo orden", () => {
    expect(pendientesDe(primero)).toEqual(["b", "d"]);
    const junto = juntarResultados(primero, [
      { id: "d", resultado: "cambiado", motivo: "" },
      { id: "b", resultado: "ya-estaba", motivo: "Ya estaba en Preparando" },
    ]);
    expect(junto.map((f) => [f.id, f.resultado])).toEqual([
      ["a", "cambiado"],
      ["b", "ya-estaba"],
      ["c", "rechazado"],
      ["d", "cambiado"],
    ]);
    expect(pendientesDe(junto)).toEqual([]);
    expect(contarResultados(junto)).toEqual({
      cambiado: 2,
      "ya-estaba": 1,
      rechazado: 1,
      pendiente: 0,
      "no-encontrado": 0,
    });
  });

  it("al cerrar quedan elegidos los que falta decidir", () => {
    expect(porDecidir(primero)).toEqual(["b", "c", "d"]);
  });
});
