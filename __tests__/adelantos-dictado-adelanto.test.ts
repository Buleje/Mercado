import { describe, expect, it } from "vitest";
import { leerDictadoAdelanto, numerosDeTokens } from "@/lib/adelantos/dictado-adelanto";
import { personaDeLaFrase, soltarLaElegida } from "@/components/admin/adelantos/crear-adelanto/persona-leida";
import type { BeneficiarioConSaldo } from "@/components/admin/adelantos/crear-adelanto/tipos";

/** Domingo 25/10/2026: «ayer» = sábado 24, «el lunes» = 19, «el 20» = 20/10. */
const HOY = { hoy: "2026-10-25" };
const leer = (f: string) => leerDictadoAdelanto(f, HOY);
const num = (f: string) => numerosDeTokens(f.split(" ")).map((n) => n.valor);

describe("numerosDeTokens — la plata dicha en palabras", () => {
  it("mil, centenas, decenas con «y» y veinti-", () => {
    expect(num("mil doscientos")).toEqual([1200]);
    expect(num("dos mil quinientos")).toEqual([2500]);
    expect(num("tres mil setecientos treinta y uno")).toEqual([3731]);
    expect(num("ciento veinticinco")).toEqual([125]);
    expect(num("quinientos")).toEqual([500]);
    expect(num("mil")).toEqual([1000]);
  });

  it("cifras y mezclas como las escribe el dictado", () => {
    expect(num("mil 200")).toEqual([1200]);
    expect(num("2 mil")).toEqual([2000]);
    expect(num("1.200")).toEqual([1200]);
    expect(num("1,731.50")).toEqual([1731.5]);
    expect(num("500 300")).toEqual([500, 300]);
  });

  it("«con cincuenta» son los céntimos; «un adelanto» no es un sol", () => {
    expect(num("quinientos con cincuenta")).toEqual([500.5]);
    expect(num("le di un adelanto de 500")).toEqual([500]);
    expect(num("una luca")).toEqual([1]);
  });
});

describe("leerDictadoAdelanto — las frases de Brandon", () => {
  it("«le di 500 a Wasaco por aserrío» = doy plata, 500, Wasaco, aserrío", () => {
    expect(leer("le di 500 a Wasaco por aserrío")).toEqual({
      modo: "dar", monto: 500, moneda: null, nombre: "Wasaco", nota: "aserrío", fecha: null, metodo: null,
    });
  });

  it("«mil doscientos a la mamá de Alex por la primera carga» = 1200", () => {
    expect(leer("mil doscientos a la mamá de Alex por la primera carga")).toMatchObject({
      monto: 1200, nombre: "Mamá de Alex", nota: "primera carga", modo: null,
    });
  });

  it("«Wasaco me prestó 300» = me prestan (RECIBIDO)", () => {
    expect(leer("Wasaco me prestó 300")).toMatchObject({ modo: "prestamo", monto: 300, nombre: "Wasaco" });
    expect(leer("me prestó Wasaco 300 soles")).toMatchObject({ modo: "prestamo", monto: 300, moneda: "PEN", nombre: "Wasaco" });
    expect(leer("la mamá de Alex me prestó mil")).toMatchObject({ modo: "prestamo", monto: 1000, nombre: "Mamá de Alex" });
  });

  it("los otros dos lados: me devolvió = me pagan lo que me deben; me adelantó = servicio", () => {
    expect(leer("Quispe me devolvió 500 ayer por yape")).toEqual({
      modo: "abono", monto: 500, moneda: null, nombre: "Quispe", nota: null, fecha: "2026-10-24", metodo: "yape",
    });
    expect(leer("Wasaco me adelantó 1731 por el aserrío")).toMatchObject({ modo: "servicio", monto: 1731, nombre: "Wasaco", nota: "aserrío" });
    expect(leer("Wasaco me pagó 300 de lo que me debe")).toMatchObject({ modo: "abono", monto: 300 });
  });
});

describe("leerDictadoAdelanto — fecha, medio y lo que NO es plata", () => {
  it("ayer, anteayer, el lunes, el 20, el 20 de octubre", () => {
    expect(leer("le di 100 a Rosa ayer").fecha).toBe("2026-10-24");
    expect(leer("le di 100 a Rosa anteayer").fecha).toBe("2026-10-23");
    expect(leer("el lunes le di 100 a Rosa").fecha).toBe("2026-10-19");
    expect(leer("le di 100 a Rosa el 20")).toMatchObject({ fecha: "2026-10-20", monto: 100, nombre: "Rosa" });
    expect(leer("le di 100 a Rosa el 3 de octubre")).toMatchObject({ fecha: "2026-10-03", monto: 100 });
    /* Un día que todavía no llegó este mes es del mes pasado: se anota lo que ya pasó. */
    expect(leer("le di 100 a Rosa el 28").fecha).toBe("2026-09-28");
  });

  it("los pt, las piezas y las cargas no son el monto; «soles» gana", () => {
    expect(leer("le di 800 soles a Wasaco por 300 pt")).toMatchObject({ monto: 800, moneda: "PEN", nombre: "Wasaco" });
    expect(leer("por 2 cargas le di 1500 a Quispe")).toMatchObject({ monto: 1500, nombre: "Quispe" });
    expect(leer("le di 200 dólares a Juan").moneda).toBe("USD");
    expect(leer("le di S/ 450 a Juan")).toMatchObject({ monto: 450, moneda: "PEN" });
  });

  it("el medio de pago se saca de la nota", () => {
    expect(leer("le yapeé 200 a Rosa")).toMatchObject({ modo: "dar", metodo: "yape", nombre: "Rosa", monto: 200 });
    expect(leer("le di 500 a Wasaco por plin por el flete")).toMatchObject({ metodo: "plin", nota: "flete" });
    expect(leer("le di 500 a Wasaco en efectivo")).toMatchObject({ metodo: "efectivo", nota: null, nombre: "Wasaco" });
  });

  it("«para gasolina» es la nota; «a cuenta» no es una persona", () => {
    expect(leer("di 300 para la gasolina")).toMatchObject({ modo: "dar", monto: 300, nombre: null, nota: "gasolina" });
    expect(leer("le di 300 para Wasaco")).toMatchObject({ nombre: "Wasaco" });
    expect(leer("Quispe me dio 400 a cuenta")).toMatchObject({ modo: "abono", nombre: "Quispe", monto: 400 });
  });

  it("una frase sin plata no inventa nada", () => {
    expect(leer("hola qué tal")).toEqual({ modo: null, monto: null, moneda: null, nombre: null, nota: null, fecha: null, metodo: null });
    expect(leer("")).toMatchObject({ monto: null, nombre: null });
  });
});

describe("soltarLaElegida — la persona por defecto no se queda con lo de otra", () => {
  const varias = { tipo: "varias" as const, dicho: "Wasaco Servicios", opciones: [{ id: "w", nombre: "Wasaco" }] };
  it("suelta la elegida si lo dicho no calza o calza con otras", () => {
    expect(soltarLaElegida({ tipo: "ninguna", dicho: "Mamá de Alex" }, "qa")).toBe(true);
    expect(soltarLaElegida(varias, "qa")).toBe(true);
  });
  it("la deja si es una de las que calzan, si calzó una o si no se leyó nombre", () => {
    expect(soltarLaElegida(varias, "w")).toBe(false);
    expect(soltarLaElegida({ tipo: "una", dicho: "Wasaco", id: "w", nombre: "Wasaco" }, "qa")).toBe(false);
    expect(soltarLaElegida(null, "qa")).toBe(false);
    expect(soltarLaElegida({ tipo: "ninguna", dicho: "X" }, "")).toBe(false);
  });
});

describe("personaDeLaFrase — el nombre dicho manda sobre la nota (revisión 25-10)", () => {
  const P = (id: string, nombre: string) => ({ id, nombre, activo: true }) as unknown as BeneficiarioConSaldo;
  const PERSONAS = [P("luz", "Luz"), P("martin", "Martín"), P("wasaco", "Wasaco"), P("mama", "Mamá de Alex")];
  const persona = (f: string) => {
    const d = leer(f);
    return personaDeLaFrase(f, d.nombre, d.nota, PERSONAS);
  };
  it("la luz y San Martín de la nota no se vuelven la persona: se ofrece crear a Pedro", () => {
    expect(persona("le di 30 a Pedro para la luz")).toEqual({ tipo: "ninguna", dicho: "Pedro" });
    expect(persona("le di 20 a Pedro por el pasaje a San Martín")).toEqual({ tipo: "ninguna", dicho: "Pedro" });
  });
  it("el nombre dicho sigue calzando, y sin nombre se busca en la frase sin la nota", () => {
    expect(persona("mil doscientos a la mamá de Alex por la primera carga")).toMatchObject({ tipo: "una", id: "mama" });
    expect(persona("Wasaco me prestó 300")).toMatchObject({ tipo: "una", id: "wasaco" });
    expect(persona("Wasaco 500 por aserrío")).toMatchObject({ tipo: "una", id: "wasaco" });
    expect(persona("500 para la luz")).toBeNull();
  });
});
