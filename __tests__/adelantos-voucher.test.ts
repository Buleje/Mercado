import { describe, expect, it } from "vitest";
import { aNumero, comoNombre, leerVoucher, metodoDeVoucher, nombresSeParecen, notaDeVoucher } from "@/lib/adelantos/voucher";

/**
 * Textos como los devuelve tesseract.js (spa) de capturas reales: renglones
 * sueltos, el «¡» leído como «i», la O por un 0, el «S/» pegado al número.
 */
const HOY = { hoy: "2026-10-08" };

const YAPE = `¡Yapeaste!
S/ 150
Juan Carlos Pérez R.
07 oct. 2026 - 08:15 pm
DATOS DE LA TRANSACCIÓN
Nro. de celular
*** *** 789
Destino
Yape
Nro. de operación
12345678`;

const YAPE_RUIDO = `iYapeaste!
S/ 1.250,0O
Rosa Elena Ñaupari Huamán
07 oct. 2026 | O8:15 p. m.
Nro. de operación: O1234567`;

const PLIN = `Interbank
¡Plineaste!
S/ 300.00
Enviado a
María Fernández Ríos
Fecha y hora
07/10/2026 08:15 AM
Código de operación
004512
Desde tu cuenta Simple`;

const BCP = `Transferencia exitosa
Monto transferido
S/ 1,250.00
Para
José Ángel Quispe Mamani
Cuenta destino
Ahorro Soles ****5678
Fecha y hora
07 de octubre de 2026, 20:15
Número de operación
00123456
BCP`;

const INTERBANK = `Constancia de Transferencia
Interbank
Monto: S/1 250,00
Beneficiario: ROSA ELENA ÑAUPARI
Fecha: 07/10/2026   Hora: 20:15:33
N° de operación: 987654`;

const BBVA = `BBVA
Operación realizada con éxito
Importe transferido
S/. 300
Titular de la cuenta destino: LUIS ALBERTO SÁNCHEZ
Fecha de operación 07-10-2026
Hora 08.15 p.m.
Número de operación: 1234567890
Comisión S/ 0.00`;

const BCP_DOLARES = `BCP
Transferencia a terceros
Monto
US$ 100.00
Para: Carlos Ruiz Díaz
Fecha: 05 oct. 2026 10:30 a. m.
Nro. de operación: 55667788`;

const SIN_MONTO = `Hola, te mando el voucher
mañana te pago
Visto 08:15`;

describe("leerVoucher — un voucher de cada app", () => {
  it.each([
    ["Yape", YAPE, { app: "YAPE", monto: 150, moneda: "PEN", fecha: "2026-10-07", hora: "20:15", operacion: "12345678", destinatario: "Juan Carlos Pérez R." }],
    ["Yape con ruido del OCR", YAPE_RUIDO, { app: "YAPE", monto: 1250, moneda: "PEN", fecha: "2026-10-07", hora: "20:15", operacion: "01234567", destinatario: "Rosa Elena Ñaupari Huamán" }],
    ["Plin (Interbank)", PLIN, { app: "PLIN", monto: 300, moneda: "PEN", fecha: "2026-10-07", hora: "08:15", operacion: "004512", destinatario: "María Fernández Ríos" }],
    ["BCP", BCP, { app: "BCP", monto: 1250, moneda: "PEN", fecha: "2026-10-07", hora: "20:15", operacion: "00123456", destinatario: "José Ángel Quispe Mamani" }],
    ["Interbank, miles con espacio", INTERBANK, { app: "INTERBANK", monto: 1250, moneda: "PEN", fecha: "2026-10-07", hora: "20:15", operacion: "987654", destinatario: "ROSA ELENA ÑAUPARI" }],
    ["BBVA con S/. y comisión", BBVA, { app: "BBVA", monto: 300, moneda: "PEN", fecha: "2026-10-07", hora: "20:15", operacion: "1234567890", destinatario: "LUIS ALBERTO SÁNCHEZ" }],
    ["BCP en dólares", BCP_DOLARES, { app: "BCP", monto: 100, moneda: "USD", fecha: "2026-10-05", hora: "10:30", operacion: "55667788", destinatario: "Carlos Ruiz Díaz" }],
  ])("%s", (_n, texto, esperado) => {
    expect(leerVoucher(texto, HOY)).toEqual(esperado);
  });

  it("sin monto no inventa uno (y entonces la pantalla no prellena nada)", () => {
    const v = leerVoucher(SIN_MONTO, HOY);
    expect(v.monto).toBeNull();
    expect(v.app).toBeNull();
  });

  it("el monto es un número con dos decimales, nunca el texto", () => {
    expect(typeof leerVoucher(YAPE_RUIDO, HOY).monto).toBe("number");
    expect(leerVoucher("Yape\nS/ 33.333", HOY).monto).toBe(33333);
    expect(leerVoucher("Yape\nS/ 12.5", HOY).monto).toBe(12.5);
  });

  it("sin año toma el de hoy, salvo que caiga en el futuro", () => {
    expect(leerVoucher("¡Yapeaste!\nS/ 20\n28 dic. - 08:15 pm", { hoy: "2027-01-03" }).fecha).toBe("2026-12-28");
    expect(leerVoucher("¡Yapeaste!\nS/ 20\n02 ene. - 08:15 pm", { hoy: "2027-01-03" }).fecha).toBe("2027-01-02");
  });

  it("«Operación realizada» y «Fecha de operación» no son el N° de operación", () => {
    expect(leerVoucher("Operación realizada con éxito\nS/ 10\nFecha de operación 07-10-2026", HOY).operacion).toBeNull();
  });
});

describe("piezas", () => {
  it.each([
    ["1,250.00", 1250],
    ["1.250,00", 1250],
    ["1 250,00", 1250],
    ["300", 300],
    ["1,5", 1.5],
    ["1,250", 1250],
  ])("aNumero(%s) = %s", (t, n) => expect(aNumero(t)).toBe(n));

  it("comoNombre descarta rótulos y números", () => {
    expect(comoNombre("Nro. de celular")).toBeNull();
    expect(comoNombre("*** *** 789")).toBeNull();
    expect(comoNombre("Yape")).toBeNull();
    expect(comoNombre("Juan C. Pérez R.")).toBe("Juan C. Pérez R.");
  });

  it("nombresSeParecen tolera el recorte de Yape y las tildes", () => {
    expect(nombresSeParecen("Juan C. Perez R.", "JUAN CARLOS PÉREZ RAMOS")).toBe(true);
    expect(nombresSeParecen("María Fernández", "Luis Sánchez")).toBe(false);
  });

  it("la nota del adelanto: app, N° de operación, día y para quién", () => {
    expect(notaDeVoucher(leerVoucher(YAPE, HOY))).toBe("Yape N° op 12345678 · miércoles 07/10 20:15 · para Juan Carlos Pérez R.");
    expect(notaDeVoucher({ app: null, monto: 5, moneda: "PEN", fecha: null, hora: null, operacion: null, destinatario: null })).toBe("Voucher");
  });

  it("el medio de la caja sale de la app", () => {
    expect(metodoDeVoucher("YAPE")).toBe("yape");
    expect(metodoDeVoucher("PLIN")).toBe("plin");
    expect(metodoDeVoucher("BBVA")).toBe("transferencia");
    expect(metodoDeVoucher(null)).toBeNull();
  });
});
