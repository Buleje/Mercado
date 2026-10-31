import { describe, expect, it } from "vitest";
import { leerComprobante, normalizarTextoOcr } from "@/lib/adelantos/leer-comprobante-yape";
import { buscarPersona, claveFonetica, mismaPalabra, personaEnFrase } from "@/lib/adelantos/leer-comprobante-persona";

/**
 * Textos como los devuelve tesseract.js (spa) de capturas reales de celular:
 * la O por un 0 en el MONTO («S/ 5OO»), espacios finos de iOS, el título
 * partido en dos renglones, el «¡» leído como «i».
 */
const HOY = { hoy: "2026-10-25" };

describe("normalizarTextoOcr — lo que tesseract devuelve de verdad", () => {
  it("«S/ 5OO» con dos letras O es S/ 500", () => {
    expect(normalizarTextoOcr("S/ 5OO")).toBe("S/ 500");
    expect(normalizarTextoOcr("S/5OO.OO")).toBe("S/ 500.00");
    expect(normalizarTextoOcr("s /. 1,2O0.0O")).toBe("S/ 1,200.00");
  });

  it("no toca las O y l de las palabras", () => {
    expect(normalizarTextoOcr("Nro. de operación: lO1")).toBe("Nro. de operación: 101");
    expect(normalizarTextoOcr("Rosa Olinda López")).toBe("Rosa Olinda López");
    expect(normalizarTextoOcr("Destino Yape")).toBe("Destino Yape");
  });

  it("espacios raros (no separable, fino) quedan como espacio normal", () => {
    expect(normalizarTextoOcr("S/ 500   Juan")).toBe("S/ 500 Juan");
  });

  it("«¡Yapeaste» en un renglón y «a Juan…» en el siguiente se juntan", () => {
    expect(normalizarTextoOcr("¡Yapeaste\na Juan Pérez!")).toBe("¡Yapeaste a Juan Pérez!");
    expect(normalizarTextoOcr("Yape aste\na Juan")).toBe("Yapeaste a Juan");
    expect(normalizarTextoOcr("iYapeastea Juan")).toBe("¡Yapeaste a Juan");
  });
});

const YAPE_5OO = `iYapeaste!
S/ 5OO
Wasaco Servicios E.I.R.L.
18 oct. 2026 - O4:32 p. m.
DATOS DE LA TRANSACCIÓN
Nro. de celular
*** *** 4l2
Destino
Yape
Nro. de operación
O2873341`;

const YAPE_PARTIDO = `¡Yapeaste
a Rosa Elena
Quispe Mamani!
S/ 1 200.00
20 oct. 2026 | 09:05 a. m.
Nro. de operación: 41O22987`;

const YAPE_RECIBIDO = `¡Te yapearon!
S/ 300
Juan Pérez Rojas te yapeó
21 oct. 2026 - 07:10 pm
Nro. de operación
55443322`;

const BCP_TRANSFERENCIA = `Transferencia exitosa
Monto transferido
S/ 3,217.00
Para
Wasaco Servicios
Fecha y hora
14 de octubre de 2026, 11:20
Número de operación
00998877
BCP`;

const INTERBANK = `Constancia de Transferencia
Interbank
Monto: S/ 1 731,00
Beneficiario: MAMA DE ALEX
Fecha: 12/10/2026   Hora: 18:45:10
N° de operación: 765432`;

describe("leerComprobante — capturas de cada app", () => {
  it("Yape con «S/ 5OO» y la O en la hora y en la operación", () => {
    const c = leerComprobante(YAPE_5OO, HOY);
    expect(c).toMatchObject({ app: "YAPE", monto: 500, moneda: "PEN", fecha: "2026-10-18", hora: "16:32", operacion: "02873341", sentido: "enviado" });
    expect(c.nombre).toBe("Wasaco Servicios E.I.R.L.");
  });

  it("Yape leído como columna (renglones vacíos entre bloques): el nombre bajo el monto sigue saliendo", () => {
    const columna = "¡Yapeaste!\n\nS/ 500\n\nWasaco Servicios E.I.R.L.\n25 oct. 2026 - 10:32 a. Mm.\n\nDATOS DE LA TRANSACCIÓN\n\nNro. de operación\n02873341\n";
    expect(leerComprobante(columna, HOY)).toMatchObject({
      app: "YAPE", monto: 500, fecha: "2026-10-25", hora: "10:32", operacion: "02873341", sentido: "enviado", nombre: "Wasaco Servicios E.I.R.L.",
    });
  });

  it("Yape con el «Yapeaste a» partido y el nombre en dos renglones", () => {
    const c = leerComprobante(YAPE_PARTIDO, HOY);
    expect(c).toMatchObject({ app: "YAPE", monto: 1200, fecha: "2026-10-20", hora: "09:05", operacion: "41022987", sentido: "enviado" });
    expect(c.nombre).toBe("Rosa Elena");
  });

  it("un Yape que te hicieron: sentido recibido y el nombre de quien te mandó", () => {
    const c = leerComprobante(YAPE_RECIBIDO, HOY);
    expect(c).toMatchObject({ app: "YAPE", monto: 300, sentido: "recibido", operacion: "55443322" });
    expect(c.nombre).toBe("Juan Pérez Rojas");
  });

  it("transferencia BCP y constancia Interbank", () => {
    expect(leerComprobante(BCP_TRANSFERENCIA, HOY)).toMatchObject({
      app: "BCP", monto: 3217, fecha: "2026-10-14", hora: "11:20", operacion: "00998877", nombre: "Wasaco Servicios", sentido: "enviado",
    });
    expect(leerComprobante(INTERBANK, HOY)).toMatchObject({
      app: "INTERBANK", monto: 1731, fecha: "2026-10-12", hora: "18:45", operacion: "765432", nombre: "MAMA DE ALEX", sentido: "enviado",
    });
  });

  it("una foto que no es un comprobante no inventa monto ni persona", () => {
    const c = leerComprobante("Hola, mañana te pago\nVisto 08:15", HOY);
    expect(c.monto).toBeNull();
    expect(c.nombre).toBeNull();
    expect(c.sentido).toBeNull();
  });
});

const PERSONAS = [
  { id: "w", nombre: "Wasaco" },
  { id: "m", nombre: "MAMA DE ALEX" },
  { id: "q", nombre: "Quispe Huamán Rosa Elena" },
  { id: "j", nombre: "Juan Quispe" },
  { id: "p", nombre: "PRUEBA TEST - Juan" },
  { id: "b", nombre: "Wasaco Antiguo", activo: false },
];

describe("buscarPersona — el nombre leído contra tus personas", () => {
  it("la forma societaria y el recorte de Yape no estorban", () => {
    expect(buscarPersona("Wasaco Servicios E.I.R.L.", PERSONAS)).toEqual({ tipo: "una", persona: PERSONAS[0] });
    expect(buscarPersona("MAMA DE ALEX", PERSONAS)).toEqual({ tipo: "una", persona: PERSONAS[1] });
    expect(buscarPersona("Rosa Elena", PERSONAS)).toEqual({ tipo: "una", persona: PERSONAS[2] });
  });

  it("el dictado escribe como suena: «Guasaco» es Wasaco, «Kispe» es Quispe", () => {
    expect(claveFonetica("guasaco")).toBe(claveFonetica("wasaco"));
    expect(mismaPalabra("kispe", "quispe")).toBe(true);
    expect(mismaPalabra("ana", "ama")).toBe(false);
    expect(buscarPersona("Guasaco", PERSONAS)).toEqual({ tipo: "una", persona: PERSONAS[0] });
  });

  it("con una sola palabra en común no elige sola: ofrece opciones", () => {
    const r = buscarPersona("Juan Pérez", PERSONAS);
    expect(r.tipo).toBe("varias");
    expect(r.tipo === "varias" && r.opciones.map((p) => p.id)).toEqual(["j", "p"]);
  });

  it("nadie parecido = ninguna (la pantalla ofrece crearla); una dada de baja no cuenta", () => {
    expect(buscarPersona("Carlos Ruiz Díaz", PERSONAS)).toEqual({ tipo: "ninguna" });
    expect(buscarPersona("Wasaco Antiguo", [PERSONAS[5]])).toEqual({ tipo: "ninguna" });
    expect(buscarPersona("", PERSONAS)).toEqual({ tipo: "ninguna" });
  });
});

describe("personaEnFrase — la persona dicha dentro de una frase", () => {
  it("encuentra a la que tiene todas sus palabras en la frase", () => {
    expect(personaEnFrase("mil doscientos a la mamá de Alex por la primera carga", PERSONAS)).toEqual({ tipo: "una", persona: PERSONAS[1] });
    expect(personaEnFrase("le di 500 a guasaco por aserrío", PERSONAS)).toEqual({ tipo: "una", persona: PERSONAS[0] });
  });

  it("si dos calzan, gana la del nombre más completo", () => {
    expect(personaEnFrase("le di 100 a juan quispe", [{ id: "a", nombre: "Juan" }, ...PERSONAS])).toEqual({ tipo: "una", persona: PERSONAS[3] });
  });

  it("nadie dicho = ninguna", () => {
    expect(personaEnFrase("le di 500 por el flete", PERSONAS)).toEqual({ tipo: "ninguna" });
  });
});
