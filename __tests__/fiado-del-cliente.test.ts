/**
 * El abono tiene que caer en la deuda del cliente que está pagando.
 *
 * Bug medido el 2026-08-12 en el POS: el listado se pedía con `?customerPhone=`,
 * un parámetro que `/api/fiados` no lee. La API lo descartaba en silencio y
 * devolvía TODOS los fiados activos del tenant, ordenados por fecha. La
 * pantalla hacía `.find(f => f.saldo > 0)` — el más reciente, de cualquiera— y
 * a ese le acreditaba el pago.
 *
 * Estos tests corren sobre la lista SIN filtrar del servidor, que es el peor
 * caso real: si el filtro vuelve a romperse, acá no se paga la deuda ajena.
 */

import { describe, expect, it } from "vitest";
import { fiadoDelCliente, esDelCliente } from "@/lib/fiados/fiado-del-cliente";

const JUAN = "987654321";
const PEDRO = "912345678";

/** Como llega hoy del endpoint sin filtro: mezcla de clientes, más nuevo primero. */
const LISTA_SIN_FILTRAR = [
  { id: "f-pedro", saldo: 300, status: "ACTIVO", customerId: PEDRO },
  { id: "f-juan", saldo: 50, status: "ACTIVO", customerId: JUAN },
];

describe("fiadoDelCliente", () => {
  it("no toma el fiado de otro cliente aunque venga primero", () => {
    const elegido = fiadoDelCliente(LISTA_SIN_FILTRAR, JUAN);
    expect(elegido?.id).toBe("f-juan");
    // El bug original devolvía "f-pedro" — el primero con saldo de la lista.
    expect(elegido?.id).not.toBe("f-pedro");
  });

  it("si el cliente no debe nada, no ofrece la deuda de nadie", () => {
    expect(fiadoDelCliente(LISTA_SIN_FILTRAR, "999000111")).toBeNull();
  });

  it("un fiado ya pagado no se vuelve a cobrar", () => {
    const lista = [{ id: "f-1", saldo: 0, status: "PAGADO", customerId: JUAN }];
    expect(fiadoDelCliente(lista, JUAN)).toBeNull();
  });

  it("el vencido sigue siendo cobrable", () => {
    const lista = [{ id: "f-1", saldo: 80, status: "VENCIDO", customerId: JUAN }];
    expect(fiadoDelCliente(lista, JUAN)?.id).toBe("f-1");
  });

  it("con varias deudas del mismo cliente ofrece la más grande, no la primera", () => {
    const lista = [
      { id: "f-chico", saldo: 20, status: "ACTIVO", customerId: JUAN },
      { id: "f-grande", saldo: 240, status: "ACTIVO", customerId: JUAN },
    ];
    expect(fiadoDelCliente(lista, JUAN)?.id).toBe("f-grande");
  });

  it("sin teléfono no elige nada — no hay a quién cobrarle", () => {
    expect(fiadoDelCliente(LISTA_SIN_FILTRAR, "")).toBeNull();
  });

  it("acepta el fiado que trae el teléfono en customerPhone", () => {
    const lista = [{ id: "f-1", saldo: 10, status: "ACTIVO", customerPhone: JUAN }];
    expect(esDelCliente(lista[0]!, JUAN)).toBe(true);
    expect(fiadoDelCliente(lista, JUAN)?.id).toBe("f-1");
  });
});
