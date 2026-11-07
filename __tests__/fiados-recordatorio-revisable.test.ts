import { describe, expect, it } from "vitest";
import {
  notaDelEnvio,
  partirRonda,
  recordatoriosDeHoy,
  ultimaGestionDe,
  ultimoContactoLeido,
} from "@/lib/fiados/recordatorio-revisable";
import type { Gestion } from "@/lib/fiados/gestion-cobranza";

const g = (id: string, customerId: string, tipo: string, fecha: string): Gestion => ({ id, customerId, tipo, fecha });
// Viernes 17/10 a las 20:00 de Lima (= sábado 01:00 UTC).
const AHORA = new Date("2026-10-18T01:00:00.000Z");

describe("recordatorio revisable (M36)", () => {
  it("la ronda se salta a quien ya recibió un recordatorio HOY en Lima, no al de anoche ni al que sólo se llamó", () => {
    const gestiones = [
      g("1", "rosa", "RECORDATORIO", "2026-10-17T14:30:00.000Z"), // hoy 09:30 Lima
      g("2", "juan", "RECORDATORIO", "2026-10-17T04:00:00.000Z"), // ayer 23:00 Lima
      g("3", "ana", "LLAMADA", "2026-10-17T15:00:00.000Z"),
    ];
    const deHoy = recordatoriosDeHoy(gestiones, AHORA);
    expect([...deHoy.keys()]).toEqual(["rosa"]);
    const { enviar, yaHoy } = partirRonda([{ id: "rosa" }, { id: "juan" }, { id: "ana" }], deHoy);
    expect(enviar.map((d) => d.id)).toEqual(["juan", "ana"]);
    expect(yaHoy.map((d) => d.id)).toEqual(["rosa"]);
  });

  it("último contacto en palabras: hoy con hora de Lima, ayer, hace N días, ninguno", () => {
    const gestiones = [g("1", "rosa", "RECORDATORIO", "2026-10-17T14:30:00.000Z"), g("2", "rosa", "LLAMADA", "2026-10-14T15:00:00.000Z")];
    expect(ultimoContactoLeido(ultimaGestionDe(gestiones, "rosa"), AHORA)).toMatch(/^Último contacto: .+ hoy a las 09:30$/);
    expect(ultimoContactoLeido(g("x", "a", "LLAMADA", "2026-10-16T20:00:00.000Z"), AHORA)).toMatch(/ ayer$/);
    expect(ultimoContactoLeido(g("x", "a", "LLAMADA", "2026-10-14T15:00:00.000Z"), AHORA)).toMatch(/ hace 3 días$/);
    expect(ultimoContactoLeido(undefined, AHORA)).toBe("Último contacto: ninguno anotado");
  });

  it("la nota del envío guarda el texto que salió en una línea y nunca pasa el tope de la API", () => {
    expect(notaDelEnvio("Hola Rosa,\n\ntu saldo es S/ 50.00")).toBe("WhatsApp desde Me deben: «Hola Rosa, tu saldo es S/ 50.00»");
    const larga = notaDelEnvio("x".repeat(900), "la ronda");
    expect(larga.length).toBeLessThanOrEqual(600);
    expect(larga.endsWith("…»")).toBe(true);
  });
});
