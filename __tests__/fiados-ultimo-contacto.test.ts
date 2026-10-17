import { describe, expect, it } from "vitest";
import { ultimoContactoDe, ultimosContactos } from "@/lib/fiados/ultimo-contacto";
import { armarMensaje } from "@/lib/fiados/plantillas-cobranza";
import type { Gestion } from "@/lib/fiados/gestion-cobranza";

// Viernes 17/10/2026, 10:00 en Lima (15:00 UTC).
const AHORA = new Date("2026-10-17T15:00:00Z");
const g = (p: Partial<Gestion>): Gestion => ({ id: Math.random().toString(36), customerId: "999111222", fecha: "2026-10-14T16:00:00Z", tipo: "RECORDATORIO", ...p });

describe("último contacto del fiado", () => {
  it("sin gestiones no dice nada", () => {
    expect(ultimoContactoDe([], "999111222", AHORA)).toBeNull();
    expect(ultimoContactoDe([g({ customerId: "otro" })], "999111222", AHORA)).toBeNull();
  });

  it("dice el día, el medio y la promesa vigente", () => {
    const c = ultimoContactoDe(
      [
        g({ tipo: "PROMESA", fecha: "2026-10-13T16:00:00Z", fechaPrometida: "2026-10-20T00:00:00.000Z", montoPrometido: 50 }),
        g({ tipo: "RECORDATORIO", nota: "WhatsApp desde Me deben: «Hola»" }),
      ],
      "999111222",
      AHORA,
    );
    expect(c?.linea).toBe("Último contacto: miércoles 14/10 por WhatsApp · prometió pagar S/ 50.00 el martes 20/10");
    expect(c?.frase).toBe("Te escribí el miércoles 14/10.");
    expect(c?.promesa).toBe("Quedamos en que pagabas S/ 50.00 el martes 20/10.");
    expect(c?.estadoPromesa).toBe("prometio");
  });

  it("promesa vencida dice que no cumplió; un pago posterior la calla", () => {
    const promesa = g({ tipo: "PROMESA", fecha: "2026-10-10T16:00:00Z", fechaPrometida: "2026-10-12T00:00:00.000Z" });
    const vencida = ultimosContactos([promesa], AHORA).get("999111222");
    expect(vencida?.linea).toBe("Último contacto: sábado 10/10 · prometió pagar el lunes 12/10 y no cumplió");
    const conPago = ultimosContactos([promesa, g({ tipo: "PAGO", fecha: "2026-10-15T16:00:00Z" })], AHORA).get("999111222");
    expect(conPago?.linea).toBe("Último contacto: jueves 15/10 pagó");
    expect(conPago?.promesa).toBe("");
  });

  it("hoy y ayer se leen así", () => {
    expect(ultimoContactoDe([g({ tipo: "NO_CONTESTA", fecha: "2026-10-17T14:05:00Z" })], "999111222", AHORA)?.linea).toBe("Último contacto: hoy 09:05 no contestó");
    expect(ultimoContactoDe([g({ tipo: "VISITA", fecha: "2026-10-16T14:05:00Z" })], "999111222", AHORA)?.frase).toBe("Pasé a verte ayer.");
  });
});

describe("plantilla con {ultimo_contacto} y {promesa}", () => {
  const plantilla = "Hola {nombre}, {ultimo_contacto} {promesa} Tienes {saldo} pendiente.";
  it("llena los huecos", () => {
    expect(armarMensaje(plantilla, { nombre: "Juan", saldo: "S/ 80.00", dias: 3, ultimoContacto: "Te escribí el martes 14/10.", promesa: "Quedamos en que pagabas el viernes 17/10." })).toBe(
      "Hola Juan, Te escribí el martes 14/10. Quedamos en que pagabas el viernes 17/10. Tienes S/ 80.00 pendiente.",
    );
  });
  it("sin gestiones quedan vacíos y no deja espacios dobles", () => {
    expect(armarMensaje(plantilla, { nombre: "Juan", saldo: "S/ 80.00", dias: 3 })).toBe("Hola Juan, Tienes S/ 80.00 pendiente.");
  });
  it("una plantilla sin esos huecos no cambia", () => {
    expect(armarMensaje("Hola {nombre},  ok", { nombre: "Ana", saldo: "S/ 1", dias: 0 })).toBe("Hola Ana,  ok");
  });
});
