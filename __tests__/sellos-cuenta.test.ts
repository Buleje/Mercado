import { describe, expect, it } from "vitest";
import {
  claveDeTelefono,
  conCanje,
  conConfig,
  ConfigSellosSchema,
  estadoDeSellos,
  leerCanjes,
  leerConfigSellos,
  type CanjeSellos,
} from "@/lib/loyalty/sellos";

const CONFIG = { compras: 10, desde: "2026-10-01" };
const canje = (at: string, sellos = 10): CanjeSellos => ({ sellos, at, por: "qaadmin", premio: "Un pan" });

describe("tarjeta de sellos: la cuenta", () => {
  it("7 compras = 7 de 10, sin premio", () => {
    expect(estadoDeSellos(7, [], CONFIG)).toEqual({ meta: 10, compras: 7, canjeados: 0, premios: 0, siguiente: 7 });
  });

  it("10 compras = le toca el premio; 23 = dos premios y 3 hacia la siguiente", () => {
    expect(estadoDeSellos(10, [], CONFIG)).toMatchObject({ premios: 1, siguiente: 0 });
    expect(estadoDeSellos(23, [], CONFIG)).toMatchObject({ premios: 2, siguiente: 3 });
  });

  it("un canje consume una tarjeta: 13 compras y 1 canje = 3 de 10", () => {
    expect(estadoDeSellos(13, [canje("2026-10-05T15:00:00.000Z")], CONFIG)).toMatchObject({ premios: 0, siguiente: 3, canjeados: 1 });
  });

  it("el canje consume lo que pedía la tarjeta ESE día, aunque después cambie la meta", () => {
    // Canjeó con 10; hoy la tarjeta pide 8: 18 compras − 10 = 8 → un premio.
    expect(estadoDeSellos(18, [canje("2026-10-05T15:00:00.000Z", 10)], { compras: 8, desde: "2026-10-01" })).toMatchObject({ premios: 1, siguiente: 0 });
  });

  it("los canjes de antes de «desde» no restan (cambiar la fecha reinicia las tarjetas)", () => {
    expect(estadoDeSellos(4, [canje("2026-09-30T23:00:00.000Z")], CONFIG)).toMatchObject({ siguiente: 4, canjeados: 0 });
  });

  it("«desde» es el día en Lima: un canje a las 00:30 de Lima del 01-10 cuenta", () => {
    expect(estadoDeSellos(10, [canje("2026-10-01T05:30:00.000Z")], CONFIG)).toMatchObject({ canjeados: 1, premios: 0, siguiente: 0 });
  });

  it("nunca negativo: si se anuló un pedido después del canje, la tarjeta queda en 0", () => {
    expect(estadoDeSellos(8, [canje("2026-10-05T15:00:00.000Z")], CONFIG)).toMatchObject({ premios: 0, siguiente: 0 });
  });

  it("la clave del celular son los últimos 9 dígitos, como en Mis clientes", () => {
    expect(claveDeTelefono("+51 916 409 675")).toBe("916409675");
    expect(claveDeTelefono("51916409675")).toBe("916409675");
  });
});

describe("tarjeta de sellos: lo guardado en los Json del programa", () => {
  const cfg = ConfigSellosSchema.safeParse({ activo: true, compras: 10, premio: "Un pan", desde: "2026-10-01" });

  it("valida la config y pone el mínimo en 0 si no viene", () => {
    expect(cfg.success && cfg.data.minimo).toBe(0);
    expect(ConfigSellosSchema.safeParse({ activo: true, compras: 1, premio: "x", desde: "2026-10-01" }).success).toBe(false);
    expect(ConfigSellosSchema.safeParse({ activo: true, compras: 10, premio: "  ", desde: "2026-10-01" }).success).toBe(false);
  });

  it("guardar la config no pisa otras reglas; leerla de vuelta da lo mismo", () => {
    if (!cfg.success) throw new Error("config inválida");
    const reglas = conConfig({ otraRegla: 1 }, cfg.data);
    expect(reglas.otraRegla).toBe(1);
    expect(leerConfigSellos(reglas)).toEqual(cfg.data);
    expect(leerConfigSellos(null)).toBeNull();
    expect(leerConfigSellos({ sellos: { compras: "diez" } })).toBeNull();
  });

  it("un canje se agrega al cliente sin tocar a los demás ni otras claves", () => {
    const antes = { premiosViejos: [1], sellosCanjes: { "999888777": [canje("2026-10-02T15:00:00.000Z")] } };
    const despues = conCanje(antes, "916409675", canje("2026-10-06T15:00:00.000Z"));
    expect(despues.premiosViejos).toEqual([1]);
    const todos = leerCanjes(despues);
    expect(todos["999888777"]).toHaveLength(1);
    expect(todos["916409675"]).toHaveLength(1);
    expect(leerCanjes({ sellosCanjes: { x: [{ sellos: "10", at: "ayer" }] } })).toEqual({});
  });
});
