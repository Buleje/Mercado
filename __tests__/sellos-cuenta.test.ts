import { describe, expect, it } from "vitest";
import {
  claveDeTelefono,
  conCanje,
  conConfig,
  ConfigSellosSchema,
  estadoDeSellos,
  leerArchivoSellos,
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

  it("lo que el tope saca va al archivo y sigue restando; un archivo de antes de «desde» no resta", () => {
    const lista = (dia: string) => Array.from({ length: 50 }, (_, i) => canje(`${dia}T${String(10 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`));
    const con51 = conCanje({ sellosCanjes: { k: lista("2026-10-02") } }, "k", canje("2026-10-09T15:00:00.000Z"), "2026-10-01");
    const archivo = leerArchivoSellos(con51).k;
    expect(archivo).toEqual({ canjes: 1, sellos: 10, hasta: "2026-10-02T10:00:00.000Z" });
    expect(leerCanjes(con51).k).toHaveLength(50);
    // 510 compras − 51 tarjetas = 0: sin el archivo daba un premio de más.
    expect(estadoDeSellos(510, leerCanjes(con51).k, CONFIG, archivo)).toMatchObject({ premios: 0, canjeados: 51 });
    expect(estadoDeSellos(510, leerCanjes(con51).k, CONFIG)).toMatchObject({ premios: 1 });
    // Reinicio: «desde» pasa al 05-10 → el archivo (del 02-10) ya no resta, y al archivar de nuevo no se mezcla.
    expect(estadoDeSellos(10, [], { compras: 10, desde: "2026-10-05" }, archivo)).toMatchObject({ premios: 1, canjeados: 0 });
    const otra = conCanje(con51, "k", canje("2026-10-10T15:00:00.000Z"), "2026-10-05");
    expect(leerArchivoSellos(otra).k).toEqual(archivo);
  });
});
