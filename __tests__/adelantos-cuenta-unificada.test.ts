/**
 * __tests__/adelantos-cuenta-unificada.test.ts
 *
 * ADR-412 §5 — Adelantos y la cuenta corriente forestal en una sola fila por
 * persona. Casos medidos contra el contrato: unión por id/documento, nunca por
 * nombre; las dos patas de la deuda separadas; redondeo a céntimos.
 */
import { describe, expect, it } from "vitest";
import {
  leerNeto,
  unificarCuentas,
  type AdelantoParaUnificar,
  type BeneficiarioParaUnificar,
  type ParteParaUnificar,
} from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const benef = (p: Partial<BeneficiarioParaUnificar>): BeneficiarioParaUnificar => ({
  id: "b1",
  nombre: "Don Juan",
  documento: null,
  telefono: null,
  forestPartyId: null,
  ...p,
});

/** Un grupo (beneficiario, status, moneda) — lo que sale de `saldosPorPersona`. */
const adel = (p: Partial<AdelantoParaUnificar>): AdelantoParaUnificar => ({
  beneficiarioId: "b1",
  status: "ABIERTO",
  saldoPendiente: 100,
  moneda: "PEN",
  cantidad: 1,
  ...p,
});

const parte = (p: Partial<ParteParaUnificar>): ParteParaUnificar => ({
  id: "p1",
  nombre: "Juan Pérez SAC",
  docNumero: "20123456789",
  telefono: null,
  ...p,
});

const mov = (p: Partial<MovimientoCuenta>): MovimientoCuenta => ({
  id: "m1",
  parteId: "p1",
  parteNombre: "Juan Pérez SAC",
  fecha: "2026-09-01",
  tipo: "cargo",
  concepto: "aserrio_prestado",
  monto: 500,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  ...p,
});

describe("unificarCuentas — vínculo explícito por id", () => {
  it("une adelanto + cargo forestal en una sola fila y separa las dos patas", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1", forestPartyId: "p1" })],
      adelantos: [adel({ beneficiarioId: "b1", status: "ABIERTO", saldoPendiente: 200 })],
      partes: [parte({ id: "p1" })],
      movimientos: [mov({ parteId: "p1", monto: 500 })],
    });

    expect(filas).toHaveLength(1);
    const f = filas[0];
    expect(f.vinculo).toBe("id");
    expect(f.beneficiarioId).toBe("b1");
    expect(f.parteId).toBe("p1");
    expect(f.adelantos).toEqual({ teDebe: 200, aFavorSuyo: 0, abiertos: 1 });
    expect(f.madera?.saldo).toBe(500);
    expect(f.neto).toBe(700); // 200 (adelanto) + 500 (aserrío) — se ve por separado y el neto suma
  });

  it("dos beneficiarios con el MISMO forestPartyId no duplican la madera (defensa en profundidad del índice único)", () => {
    // El índice único parcial de la base lo impide al escribir; esto cubre el
    // caso en que la función pura reciba igual datos así (carrera colada,
    // datos de antes de la migración).
    const filas = unificarCuentas({
      beneficiarios: [
        benef({ id: "b1", nombre: "Ana", forestPartyId: "p1" }),
        benef({ id: "b2", nombre: "Beto", forestPartyId: "p1" }),
      ],
      adelantos: [adel({ beneficiarioId: "b2", saldoPendiente: 80 })],
      partes: [parte({ id: "p1" })],
      movimientos: [mov({ parteId: "p1", monto: 500 })],
    });

    expect(filas).toHaveLength(2);
    const a = filas.find((f) => f.beneficiarioId === "b1")!;
    const b = filas.find((f) => f.beneficiarioId === "b2")!;
    expect(a.parteId).toBe("p1");
    expect(a.madera?.saldo).toBe(500);
    // b2 trae el mismo forestPartyId, pero "p1" ya está tomada: se cuenta sin madera.
    expect(b.parteId).toBeNull();
    expect(b.vinculo).toBeNull();
    expect(b.madera).toBeNull();
    expect(b.adelantos).toEqual({ teDebe: 80, aFavorSuyo: 0, abiertos: 1 });
    // El total NO es 500+500+80: el saldo de la parte se cuenta UNA sola vez.
    expect(a.neto + b.neto).toBe(580);
  });
});

describe("unificarCuentas — vínculo por documento", () => {
  it("une por documento normalizado cuando NINGUNO de los dos está vinculado", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1", documento: "20-123456789", forestPartyId: null })],
      adelantos: [adel({ beneficiarioId: "b1", saldoPendiente: 100 })],
      partes: [parte({ id: "p1", docNumero: "20123456789" })], // mismo doc, con guión de menos
      movimientos: [mov({ parteId: "p1", monto: 300 })],
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].vinculo).toBe("documento");
    expect(filas[0].parteId).toBe("p1");
    expect(filas[0].neto).toBe(400);
  });

  it("NUNCA une por nombre parecido — sin documento en común quedan como dos filas", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1", nombre: "Juan Pérez SAC", documento: null })],
      adelantos: [adel({ beneficiarioId: "b1", saldoPendiente: 100 })],
      partes: [parte({ id: "p1", nombre: "Juan Pérez SAC", docNumero: "20123456789" })],
      movimientos: [mov({ parteId: "p1", monto: 300 })],
    });

    expect(filas).toHaveLength(2);
    const conParte = filas.find((f) => f.parteId === "p1");
    const conBenef = filas.find((f) => f.beneficiarioId === "b1");
    expect(conParte?.beneficiarioId).toBeNull();
    expect(conBenef?.parteId).toBeNull();
  });

  it("una parte YA vinculada a otro beneficiario no se re-usa por documento", () => {
    const filas = unificarCuentas({
      beneficiarios: [
        benef({ id: "b1", forestPartyId: "p1" }),
        benef({ id: "b2", nombre: "Otro", documento: "20123456789" }),
      ],
      adelantos: [adel({ beneficiarioId: "b2", saldoPendiente: 50 })],
      partes: [parte({ id: "p1", docNumero: "20123456789" })],
      movimientos: [mov({ parteId: "p1", monto: 100 })],
    });

    const f1 = filas.find((f) => f.beneficiarioId === "b1")!;
    const f2 = filas.find((f) => f.beneficiarioId === "b2")!;
    expect(f1.parteId).toBe("p1"); // se quedó con el vínculo explícito
    expect(f2.parteId).toBeNull(); // b2 no le puede robar la parte a b1
    expect(f2.madera).toBeNull();
  });
});

describe("unificarCuentas — grupos ya agregados (sin tope de filas)", () => {
  it("un grupo con cantidad > 1 (ej. 600 adelantos ABIERTOS del mismo tenant) suma como uno solo", () => {
    // Esto es lo que devuelve `saldosPorPersona` (groupBy): NUNCA una fila por
    // adelanto — así que da igual si detrás hay 3 o 3.000.
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1" })],
      adelantos: [adel({ beneficiarioId: "b1", status: "ABIERTO", saldoPendiente: 45000, cantidad: 600 })],
      partes: [],
      movimientos: [],
    });
    expect(filas[0].adelantos).toEqual({ teDebe: 45000, aFavorSuyo: 0, abiertos: 600 });
    expect(filas[0].neto).toBe(45000);
  });
});

describe("unificarCuentas — CANCELADO/LIQUIDADO no cuentan, EXCEDIDO va a favor", () => {
  it("un adelanto CANCELADO o LIQUIDADO no suma en teDebe", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1" })],
      adelantos: [
        adel({ beneficiarioId: "b1", status: "CANCELADO", saldoPendiente: 9000 }),
        adel({ beneficiarioId: "b1", status: "LIQUIDADO", saldoPendiente: 0 }),
      ],
      partes: [],
      movimientos: [],
    });
    // Sin nada abierto ni movimientos, la fila ni siquiera aparece.
    expect(filas).toHaveLength(0);
  });

  it("EXCEDIDO resta del neto como aFavorSuyo, no se mezcla con teDebe", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1" })],
      adelantos: [
        adel({ beneficiarioId: "b1", status: "ABIERTO", saldoPendiente: 300 }),
        adel({ beneficiarioId: "b1", status: "EXCEDIDO", saldoPendiente: -50 }),
      ],
      partes: [],
      movimientos: [],
    });
    expect(filas[0].adelantos).toEqual({ teDebe: 300, aFavorSuyo: 50, abiertos: 1 });
    expect(filas[0].neto).toBe(250);
  });
});

describe("unificarCuentas — otras monedas fuera del neto", () => {
  it("un adelanto en USD no entra al neto (la cuenta forestal es en soles)", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1" })],
      adelantos: [
        adel({ beneficiarioId: "b1", status: "ABIERTO", saldoPendiente: 200, moneda: "PEN" }),
        adel({ beneficiarioId: "b1", status: "ABIERTO", saldoPendiente: 40, moneda: "USD" }),
      ],
      partes: [],
      movimientos: [],
    });
    expect(filas[0].neto).toBe(200);
    expect(filas[0].otrasMonedas).toEqual({ USD: 40 });
    expect(filas[0].adelantos?.abiertos).toBe(2); // cuenta operaciones, no plata
  });
});

describe("unificarCuentas — redondeo a céntimos", () => {
  it("no arrastra el resto de punto flotante (0.1 + 0.2)", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1", forestPartyId: "p1" })],
      adelantos: [],
      partes: [parte({ id: "p1" })],
      movimientos: [
        mov({ id: "m1", parteId: "p1", monto: 0.1, concepto: "flete" }),
        mov({ id: "m2", parteId: "p1", monto: 0.2, concepto: "flete" }),
      ],
    });
    expect(filas[0].madera?.saldo).toBe(0.3);
    expect(filas[0].madera?.porConcepto.flete).toBe(0.3);
    expect(filas[0].neto).toBe(0.3);
  });
});

describe("unificarCuentas — parte suelta sin ficha en Adelantos", () => {
  it("una parte con movimientos y sin beneficiario vinculado igual aparece", () => {
    const filas = unificarCuentas({
      beneficiarios: [],
      adelantos: [],
      partes: [parte({ id: "p1", nombre: "Aserradero El Roble" })],
      movimientos: [mov({ parteId: "p1", tipo: "abono", concepto: "pago", monto: 150 })],
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].beneficiarioId).toBeNull();
    expect(filas[0].parteId).toBe("p1");
    expect(filas[0].neto).toBe(-150);
  });

  it("una parte dada de baja del directorio (sólo vive en el movimiento) no pierde su plata", () => {
    const filas = unificarCuentas({
      beneficiarios: [],
      adelantos: [],
      partes: [], // ya no está en el directorio vivo
      movimientos: [mov({ parteId: "p9", parteNombre: "Parte de baja", monto: 80 })],
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].nombre).toBe("Parte de baja");
    expect(filas[0].neto).toBe(80);
  });
});

describe("unificarCuentas — inclusión y orden", () => {
  it("excluye a quien no tiene neto, ni movimientos, ni abiertos", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1" })], // sin adelantos, sin madera
      adelantos: [],
      partes: [],
      movimientos: [],
    });
    expect(filas).toHaveLength(0);
  });

  it("ordena por |neto| descendente, empatando por nombre", () => {
    const filas = unificarCuentas({
      beneficiarios: [
        benef({ id: "b1", nombre: "Zoraida" }),
        benef({ id: "b2", nombre: "Ana" }),
        benef({ id: "b3", nombre: "Beto" }),
      ],
      adelantos: [
        adel({ beneficiarioId: "b1", saldoPendiente: 100 }),
        adel({ beneficiarioId: "b2", saldoPendiente: 100 }),
        adel({ beneficiarioId: "b3", saldoPendiente: 500 }),
      ],
      partes: [],
      movimientos: [],
    });
    expect(filas.map((f) => f.nombre)).toEqual(["Beto", "Ana", "Zoraida"]);
  });
});

describe("unificarCuentas — teléfono para WhatsApp", () => {
  it("usa el de la persona si lo tiene", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1", telefono: "987654321", forestPartyId: "p1" })],
      adelantos: [],
      partes: [parte({ id: "p1", telefono: "999999999" })],
      movimientos: [mov({ parteId: "p1", monto: 100 })],
    });
    expect(filas[0].telefono).toBe("987654321");
  });

  it("si la persona no tiene, cae al de la parte forestal vinculada", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1", telefono: null, forestPartyId: "p1" })],
      adelantos: [],
      partes: [parte({ id: "p1", telefono: "999999999" })],
      movimientos: [mov({ parteId: "p1", monto: 100 })],
    });
    expect(filas[0].telefono).toBe("999999999");
  });

  it("sin ninguno de los dos, queda null (no inventa un número)", () => {
    const filas = unificarCuentas({
      beneficiarios: [benef({ id: "b1", telefono: null })],
      adelantos: [adel({ beneficiarioId: "b1", saldoPendiente: 50 })],
      partes: [],
      movimientos: [],
    });
    expect(filas[0].telefono).toBeNull();
  });

  it("una parte suelta (sin beneficiario) usa el teléfono del directorio", () => {
    const filas = unificarCuentas({
      beneficiarios: [],
      adelantos: [],
      partes: [parte({ id: "p1", telefono: "911222333" })],
      movimientos: [mov({ parteId: "p1", monto: 100 })],
    });
    expect(filas[0].telefono).toBe("911222333");
  });
});

describe("leerNeto", () => {
  it("las tres lecturas", () => {
    expect(leerNeto(0, "Juan")).toBe("Juan está al día.");
    expect(leerNeto(0.001, "Juan")).toBe("Juan está al día.");
    expect(leerNeto(150, "Juan")).toBe("Juan te debe S/ 150.00.");
    expect(leerNeto(-75.5, "Juan")).toBe("Le debes S/ 75.50 a Juan.");
  });

  it("los miles llevan separador — mismo formato que el chip de al lado (fmtMon)", () => {
    // Bug visto en el navegador: la fila decía "S/ 17000.00" mientras el chip
    // de Adelantos, con `fmtMon`, decía "S/ 17,000.00" — dos formatos de la
    // misma cifra en la misma fila.
    expect(leerNeto(17000, "Quispe Galindo Victor")).toBe("Quispe Galindo Victor te debe S/ 17,000.00.");
    expect(leerNeto(-2500.5, "Ana")).toBe("Le debes S/ 2,500.50 a Ana.");
  });
});
