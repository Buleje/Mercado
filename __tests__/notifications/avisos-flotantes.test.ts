/**
 * Avisos flotantes de la campana — qué ids son nuevos, el reclamo entre
 * pestañas, qué sale flotando y el «y N más».
 */
import { describe, expect, it } from "vitest";
import {
  armarTanda,
  cuantosPedir,
  cuerpoCorto,
  estiloDe,
  listaGuardada,
  reclamar,
  textoResto,
  totalNuevos,
  TOPE_PEDIDO,
} from "@/components/notifications/avisos-flotantes";

const aviso = (id: string, severity: "HIGH" | "MEDIUM" | "LOW", min = 0) => ({
  id,
  severity,
  createdAt: new Date(Date.parse("2026-10-20T15:00:00Z") - min * 60_000).toISOString(),
});

describe("cuantosPedir", () => {
  it("la primera carga es la base: no pide nada", () => {
    expect(cuantosPedir(null, 12)).toBe(0);
  });
  it("pide tantos como subió, con tope", () => {
    expect(cuantosPedir(10, 11)).toBe(1);
    expect(cuantosPedir(10, 13)).toBe(3);
    expect(cuantosPedir(10, 40)).toBe(TOPE_PEDIDO);
  });
  it("bajar o quedar igual (marcaste leído) no pide", () => {
    expect(cuantosPedir(10, 10)).toBe(0);
    expect(cuantosPedir(10, 7)).toBe(0);
  });
});

describe("reclamar entre pestañas", () => {
  it("lo ya reclamado por otra pestaña no es mío", () => {
    const r = reclamar(["a", "b"], ["c", "b", "d"]);
    expect(r.mios).toEqual(["c", "d"]);
    expect(r.lista).toEqual(["c", "d", "a", "b"]);
  });
  it("la segunda pestaña con la lista de la primera no reclama nada", () => {
    const primera = reclamar([], ["x", "y"]);
    const segunda = reclamar(primera.lista, ["x", "y"]);
    expect(segunda.mios).toEqual([]);
  });
  it("un id repetido en el pedido cuenta una vez", () => {
    expect(reclamar([], ["x", "x"]).mios).toEqual(["x"]);
  });
  it("la lista queda acotada y se van los más viejos", () => {
    const viejos = Array.from({ length: 10 }, (_, i) => `v${i}`);
    const r = reclamar(viejos, ["n1", "n2"], 5);
    expect(r.lista).toEqual(["n1", "n2", "v0", "v1", "v2"]);
  });
  it("lo guardado roto se lee como lista vacía", () => {
    expect(listaGuardada(null)).toEqual([]);
    expect(listaGuardada({ a: 1 })).toEqual([]);
    expect(listaGuardada(["a", 3, "b"])).toEqual(["a", "b"]);
  });
});

describe("armarTanda", () => {
  it("hasta 3 nuevos salen todos, el urgente primero", () => {
    const t = armarTanda([aviso("l", "LOW"), aviso("h", "HIGH"), aviso("m", "MEDIUM")]);
    expect(t.sueltos.map((n) => n.id)).toEqual(["h", "m", "l"]);
    expect(t.resto).toBe(0);
  });
  it("más de 3: los 2 más urgentes y «y N más»", () => {
    const t = armarTanda([aviso("l1", "LOW"), aviso("m1", "MEDIUM"), aviso("h1", "HIGH", 5), aviso("h2", "HIGH", 1)]);
    expect(t.sueltos.map((n) => n.id)).toEqual(["h2", "h1"]);
    expect(t.resto).toBe(2);
  });
  it("el total cuenta los que no se pidieron (subió 12, se pidieron 5)", () => {
    const cinco = ["a", "b", "c", "d", "e"].map((id) => aviso(id, "MEDIUM"));
    const t = armarTanda(cinco, totalNuevos(12, 5, 5));
    expect(t.sueltos).toHaveLength(2);
    expect(t.resto).toBe(10);
  });
  it("si otra pestaña ya mostró 2 de los 3 pedidos, sale uno solo y sin resumen", () => {
    const t = armarTanda([aviso("c", "LOW")], totalNuevos(3, 3, 1));
    expect(t.sueltos.map((n) => n.id)).toEqual(["c"]);
    expect(t.resto).toBe(0);
  });
});

describe("cómo se ve", () => {
  it("color y duración por urgencia", () => {
    expect(estiloDe("HIGH")).toEqual({ tipo: "error", duracion: 15_000 });
    expect(estiloDe("MEDIUM").tipo).toBe("warning");
    expect(estiloDe("LOW").tipo).toBe("info");
    expect(estiloDe("HIGH").duracion).toBeGreaterThan(estiloDe("LOW").duracion);
  });
  it("el cuerpo se corta en la palabra con «…»", () => {
    const largo = "El fiado de Rosa Pérez lleva 78 días sin pagarse y suma S/ 245,50 entre la bodega y el aserradero del patio";
    const corto = cuerpoCorto(largo, 60);
    expect(corto.length).toBeLessThanOrEqual(60);
    expect(corto.endsWith("…")).toBe(true);
    expect(corto).not.toMatch(/\s…$/);
    expect(cuerpoCorto("  dos\n líneas  ")).toBe("dos líneas");
    expect(cuerpoCorto(null)).toBe("");
  });
  it("el resumen en singular y plural", () => {
    expect(textoResto(1)).toBe("Y 1 aviso más sin leer");
    expect(textoResto(4)).toBe("Y 4 avisos más sin leer");
  });
});
