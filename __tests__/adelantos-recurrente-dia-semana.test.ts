/**
 * Un adelanto recurrente semanal tiene que caer el día que se pactó.
 *
 * `AdelantoRecurrente.diaSemana` existía en la tabla, documentado como
 * «0-6 (semanal/quincenal)», y no llegaba a ningún lado: el Zod del endpoint no
 * lo aceptaba, `createRecurrente` no lo persistía y `nextProxima` ni lo recibía.
 * El efecto: un recurrente semanal caía **el día en que se creó**, para siempre.
 * Armado un martes, eran todos los martes; si querías los viernes, no había
 * forma de decirlo.
 *
 * Es el patrón que la memoria del proyecto marca como el más caro de encontrar
 * —campo en el schema + soportado en la capa DB + ausente en el Zod del
 * endpoint—: `tsc` no lo ve, los tests no lo ven, y la columna se llena de
 * `null` sin que nadie sospeche. El mismo que dejó el 91% del patio sin costo.
 */
import { describe, expect, it } from "vitest";
import { nextProxima } from "@/lib/db/adelantos.db";

/** 2026-09-08 es un MARTES (getDay() === 2). */
const martes = new Date("2026-09-08T12:00:00");
const DOM = 0, MAR = 2, VIE = 5;
const diaDe = (d: Date) => d.getDay();
const dias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

describe("sin día pactado se conserva el comportamiento viejo, EXACTO", () => {
  it("semanal suma 7 días", () => {
    expect(dias(martes, nextProxima("semanal", null, martes))).toBe(7);
  });

  it("quincenal suma 14", () => {
    expect(dias(martes, nextProxima("quincenal", null, martes))).toBe(14);
  });

  /* Importante: los recurrentes que YA existen tienen diaSemana en null, y este
     arreglo no puede moverles la fecha de entrega. */
  it("y el día resultante sigue siendo el de creación", () => {
    expect(diaDe(nextProxima("semanal", null, martes))).toBe(MAR);
  });
});

describe("con día pactado cae ese día", () => {
  it("un semanal creado el martes, pactado los viernes, cae el viernes", () => {
    const p = nextProxima("semanal", null, martes, VIE);
    expect(diaDe(p)).toBe(VIE);
    expect(dias(martes, p)).toBe(3);
  });

  it("pactado un día ya pasado en la semana, salta a la que viene", () => {
    // Domingo (0) desde un martes: faltan 5 días.
    const p = nextProxima("semanal", null, martes, DOM);
    expect(diaDe(p)).toBe(DOM);
    expect(dias(martes, p)).toBe(5);
  });

  it("pactado HOY no entrega dos veces hoy: salta al ciclo siguiente", () => {
    const p = nextProxima("semanal", null, martes, MAR);
    expect(dias(martes, p)).toBe(7);
    expect(diaDe(p)).toBe(MAR);
  });

  it("quincenal pactado hoy salta 14, no 7", () => {
    expect(dias(martes, nextProxima("quincenal", null, martes, MAR))).toBe(14);
  });

  it("quincenal pactado otro día cae en ese día de esta semana", () => {
    const p = nextProxima("quincenal", null, martes, VIE);
    expect(diaDe(p)).toBe(VIE);
    expect(dias(martes, p)).toBe(3);
  });
});

describe("el mensual no se toca", () => {
  it("sigue yendo al día del mes pedido", () => {
    const p = nextProxima("mensual", 15, martes);
    expect(p.getDate()).toBe(15);
    expect(p.getMonth()).toBe(martes.getMonth() + 1);
  });

  it("y el día de semana lo ignora — no aplica a mensual", () => {
    const conDia = nextProxima("mensual", 15, martes, VIE);
    const sinDia = nextProxima("mensual", 15, martes);
    expect(conDia.getTime()).toBe(sinDia.getTime());
  });

  it("tope 28: no existe el 31 en todos los meses", () => {
    expect(nextProxima("mensual", 31, martes).getDate()).toBe(28);
  });
});

describe("re-programar después de ejecutar no corre el día", () => {
  it("ejecutado un miércoles, el pactado sigue siendo viernes", () => {
    // El cron puede correr con retraso; sin el día pactado, cada retraso
    // arrastraba la fecha y «todos los viernes» derivaba solo.
    const miercoles = new Date("2026-09-09T12:00:00");
    expect(diaDe(nextProxima("semanal", null, miercoles, VIE))).toBe(VIE);
  });
});
