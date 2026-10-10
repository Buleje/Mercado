/**
 * Modo TV, lo puro: cómo se reparte la pantalla, el código 3-3, qué visor le
 * toca a cada cámara (la regla de «En vivo» del panel) y el foco con flechas.
 */
import { describe, expect, it } from "vitest";
import {
  camarasParaTv,
  columnasMosaico,
  esTeclaAtras,
  filasMosaico,
  separarCodigo,
  siguienteFoco,
  tipoDeVisorTv,
} from "@/components/tv/tv-ui";

describe("mosaico del TV", () => {
  it("1 · 2×1 · 2×2 · 3×3 · 4×4 según cuántas", () => {
    expect([1, 2, 3, 4, 5, 9, 10, 16].map((n) => `${columnasMosaico(n)}x${filasMosaico(n)}`)).toEqual([
      "1x1", "2x1", "2x2", "2x2", "3x2", "3x3", "4x3", "4x4",
    ]);
    expect(filasMosaico(30)).toBe(4); // tope de 16 cuadros: sin scroll
  });

  it("el código se separa 3-3", () => {
    expect(separarCodigo("ABC234")).toBe("ABC 234");
    expect(separarCodigo("AB")).toBe("AB");
  });
});

describe("qué visor le toca (misma regla que «En vivo»)", () => {
  const conexion = { host: "10.0.0.2", puerto: 80, usuario: "admin", https: false, canal: 1, probadaEn: "2026-10-01T10:00:00Z", ultimaFalla: null };
  it("puente > conexión directa > Hik-Connect > sin vivo", () => {
    expect(tipoDeVisorTv({ fuente: "puente_pc", conexion }, true)).toBe("puente");
    expect(tipoDeVisorTv({ conexion }, true)).toBe("propio");
    expect(tipoDeVisorTv({ conexion: null }, true)).toBe("nube");
    expect(tipoDeVisorTv({ conexion: null }, false)).toBe("sin-vivo");
  });
  it("una conexión que falló después de probarse no cuenta como visor propio", () => {
    const fallida = { ...conexion, ultimaFalla: { motivo: "tiempo", detalle: "", en: "2026-10-02T10:00:00Z" } };
    expect(tipoDeVisorTv({ conexion: fallida }, false)).toBe("sin-vivo");
  });
  it("arma la lista del TV: saca las inactivas y elige la nube por `nubeEnlazada`", () => {
    const lista = camarasParaTv([
      { id: "a", nombre: "Portón", conexion: null, nubeEnlazada: true, token: "" },
      { id: "b", nombre: "Vieja", activa: false },
      { id: "c", nombre: "", nubeEnlazada: false },
      /* La conexión llega sin host ni usuario: igual cuenta como visor propio. */
      { id: "d", nombre: "Sierra", conexion: { host: "", usuario: "", probadaEn: "2026-10-01T10:00:00Z", ultimaFalla: null } },
    ]);
    expect(lista).toEqual([
      { id: "a", nombre: "Portón", tipo: "nube", conCodigo: true },
      { id: "c", nombre: "Cámara", tipo: "sin-vivo", conCodigo: true },
      { id: "d", nombre: "Sierra", tipo: "propio", conCodigo: true },
    ]);
  });
});

describe("control remoto", () => {
  /* Un 2×2 de 100×100 con 10 de separación. */
  const caja = (x: number, y: number) => ({ x, y, ancho: 100, alto: 100 });
  const grilla = [caja(0, 0), caja(110, 0), caja(0, 110), caja(110, 110)];
  it("las flechas van al vecino de ese lado, sin saltar en diagonal", () => {
    const otros = grilla.slice(1);
    expect(otros[siguienteFoco(grilla[0], otros, "derecha")]).toBe(grilla[1]);
    expect(otros[siguienteFoco(grilla[0], otros, "abajo")]).toBe(grilla[2]);
    expect(siguienteFoco(grilla[0], otros, "izquierda")).toBe(-1);
    expect(siguienteFoco(grilla[0], otros, "arriba")).toBe(-1);
  });
  it("«Atrás» del control: Escape, Samsung (10009) y LG (461)", () => {
    expect(esTeclaAtras("Escape", 27)).toBe(true);
    expect(esTeclaAtras("Unidentified", 10009)).toBe(true);
    expect(esTeclaAtras("Unidentified", 461)).toBe(true);
    expect(esTeclaAtras("Enter", 13)).toBe(false);
  });
});
