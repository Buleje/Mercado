/**
 * «Mantener sesión activa» (Brandon 2026-10-09): una rotación cuya respuesta se
 * perdió no debe sacar al usuario; dos copias del mismo acceso sí.
 */
import { describe, expect, it } from "vitest";
import {
  GRACIA_CONCURRENTE_MS,
  VENTANA_PERDIDA_MS,
  anotarSucesor,
  cerrarRefresh,
  anularSucesores,
  decidirReuso,
  type AlmacenJti,
} from "@/lib/auth/refresh-sucesor";

function almacen(): AlmacenJti {
  const m = new Map<string, unknown>();
  return {
    get: <T,>(k: string) => m.get(k) as T | undefined,
    set: <T,>(k: string, v: T) => void m.set(k, v),
  };
}

/** Rota X → devuelve el jti nuevo, como hace la ruta. */
function rotar(a: AlmacenJti, x: string, ahora: number, nuevo: string) {
  const d = decidirReuso(a, x, ahora);
  if (d.tipo === "robo") return { d };
  anotarSucesor(a, x, nuevo);
  if (d.tipo === "respuesta-perdida") anularSucesores(a, d.anular);
  return { d, nuevo };
}

describe("reuso de refresh token", () => {
  const T0 = 1_000_000;

  it("primer uso rota; dentro de 30 s es concurrente", () => {
    const a = almacen();
    expect(rotar(a, "X", T0, "Y1").d.tipo).toBe("primero");
    expect(rotar(a, "X", T0 + 5_000, "Y2").d.tipo).toBe("concurrente");
  });

  it("respuesta perdida: X vuelve a los 4 min y Y nunca se usó → se rota y Y queda anulado", () => {
    const a = almacen();
    rotar(a, "X", T0, "Y");
    const r = rotar(a, "X", T0 + 4 * 60_000, "Z");
    expect(r.d.tipo).toBe("respuesta-perdida");
    // Si después alguien presenta Y (la copia que nunca llegó), es robo.
    expect(decidirReuso(a, "Y", T0 + 5 * 60_000).tipo).toBe("robo");
    // Z (el que sí llegó) sigue normal.
    expect(decidirReuso(a, "Z", T0 + 8 * 60_000).tipo).toBe("primero");
  });

  it("dos respuestas perdidas seguidas siguen siendo el mismo navegador", () => {
    const a = almacen();
    rotar(a, "X", T0, "Y");
    rotar(a, "X", T0 + 4 * 60_000, "Z");
    expect(rotar(a, "X", T0 + 8 * 60_000, "W").d.tipo).toBe("respuesta-perdida");
  });

  it("robo: el sucesor ya se usó y X vuelve fuera de la gracia → 401", () => {
    const a = almacen();
    rotar(a, "X", T0, "Y");
    rotar(a, "Y", T0 + 60_000, "Y2"); // el dueño legítimo siguió con Y
    expect(decidirReuso(a, "X", T0 + GRACIA_CONCURRENTE_MS + 60_000).tipo).toBe("robo");
  });

  it("pasados 10 min ya no es «respuesta perdida»: es robo (revisión de seguridad)", () => {
    const a = almacen();
    rotar(a, "X", T0, "Y");
    expect(decidirReuso(a, "X", T0 + VENTANA_PERDIDA_MS + 1).tipo).toBe("robo");
  });

  it("logout: el token cerrado y su anterior ya no rotan", () => {
    const a = almacen();
    rotar(a, "X", T0, "Y");
    cerrarRefresh(a, "Y"); // el dueño sale con Y en la cookie
    expect(decidirReuso(a, "Y", T0 + 60_000).tipo).toBe("robo");
    expect(decidirReuso(a, "X", T0 + 60_000).tipo).toBe("robo");
  });
});
