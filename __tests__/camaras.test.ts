/**
 * El modelo de cámaras (ADR-411).
 *
 * Lo que se prueba es lo que decide si una foto entra o se pierde: el token por
 * cámara, el tope del historial y la traducción de la jerga del aparato. La
 * cámara del patio manda sola a las 3 de la mañana — no hay nadie mirando si
 * algo falló.
 */

import { describe, expect, it } from "vitest";
import {
  agregarCamara,
  buscarCapturas,
  agregarCaptura,
  estaCallada,
  horasSinVerse,
  MAX_CAPTURAS,
  normalizarEvento,
  nuevoToken,
  quitarCamara,
  rotarToken,
  type Camara,
  type Captura,
} from "@/lib/camaras/camaras";

const ok = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

const camara = (over: Partial<Camara> = {}): Camara => ({
  id: "c1",
  nombre: "Portón",
  lugar: "Entrada",
  token: "t".repeat(32),
  activa: true,
  creadaEn: "2026-09-01T10:00:00.000Z",
  ultimaCapturaEn: null,
  ...over,
});

const captura = (id: string, at: string): Captura => ({
  id,
  camaraId: "c1",
  url: `https://x/${id}.jpg`,
  evento: "movimiento",
  at,
});

describe("alta de cámaras", () => {
  it("da de alta con su token y explica qué hacer", () => {
    const r = ok(agregarCamara([], { nombre: "Patio de trozas" }, { id: "c9", token: "abc" }));
    expect(r.camaras[0]!.nombre).toBe("Patio de trozas");
    expect(r.camaras[0]!.activa).toBe(true);
    expect(r.mensaje).toMatch(/dirección/i);
  });

  it("no deja dos cámaras con el mismo nombre: se confunden en el historial", () => {
    const una = ok(agregarCamara([], { nombre: "Portón" }, { id: "a", token: "x" })).camaras;
    expect(agregarCamara(una, { nombre: "portón" }, { id: "b", token: "y" }).ok).toBe(false);
  });

  it("sin nombre no hay cámara", () => {
    expect(agregarCamara([], { nombre: "   " }, { id: "a", token: "x" }).ok).toBe(false);
  });
});

describe("el token", () => {
  it("sale largo y sin caracteres que rompan una URL de FTP o correo", () => {
    const t = nuevoToken();
    expect(t).toHaveLength(32);
    expect(t).toMatch(/^[a-z0-9]+$/);
  });

  it("rotarlo deja la dirección vieja afuera en el acto", () => {
    const antes = [camara({ token: "viejo" })];
    const r = ok(rotarToken(antes, "c1", "nuevo"));
    expect(r.camaras[0]!.token).toBe("nuevo");
    expect(r.mensaje).toMatch(/dejó de funcionar/i);
  });
});

describe("quitar una cámara", () => {
  it("la saca de la lista y avisa que las fotos quedan", () => {
    const r = ok(quitarCamara([camara()], "c1"));
    expect(r.camaras).toHaveLength(0);
    expect(r.mensaje).toMatch(/siguen en el historial/i);
  });
});

describe("el historial tiene techo", () => {
  it("la nueva va primero", () => {
    const r = agregarCaptura([captura("vieja", "2026-09-01T10:00:00.000Z")], captura("nueva", "2026-09-02T10:00:00.000Z"));
    expect(r.capturas[0]!.id).toBe("nueva");
    expect(r.descartadas).toBe(0);
  });

  it("pasado el tope se caen las más viejas, y dice cuántas", () => {
    const llenas = Array.from({ length: MAX_CAPTURAS }, (_, i) => captura(`c${i}`, "2026-09-01T10:00:00.000Z"));
    const r = agregarCaptura(llenas, captura("ultima", "2026-09-09T10:00:00.000Z"));
    expect(r.capturas).toHaveLength(MAX_CAPTURAS);
    expect(r.capturas[0]!.id).toBe("ultima");
    expect(r.descartadas).toBe(1);
  });
});

describe("la jerga del aparato se traduce, nunca se descarta", () => {
  it("entiende lo que mandan las cámaras", () => {
    expect(normalizarEvento("MOTION")).toBe("movimiento");
    expect(normalizarEvento("humanDetection")).toBe("persona");
    expect(normalizarEvento("vehicleDetection")).toBe("vehiculo");
    expect(normalizarEvento("scheduled")).toBe("programada");
  });

  it("lo desconocido entra como «otro» en vez de perderse", () => {
    expect(normalizarEvento("lo que sea")).toBe("otro");
    expect(normalizarEvento(undefined)).toBe("otro");
  });
});

describe("una cámara que dejó de mandar", () => {
  const ahora = new Date("2026-09-10T12:00:00.000Z");

  it("a las 24 h se la marca callada: sin batería o sin datos, nadie mira", () => {
    expect(estaCallada(camara({ ultimaCapturaEn: "2026-09-09T11:00:00.000Z" }), ahora)).toBe(true);
    expect(estaCallada(camara({ ultimaCapturaEn: "2026-09-10T10:00:00.000Z" }), ahora)).toBe(false);
  });

  it("la que nunca mandó no es «callada»: todavía no se conectó", () => {
    expect(estaCallada(camara({ ultimaCapturaEn: null }), ahora)).toBe(false);
    expect(horasSinVerse(camara({ ultimaCapturaEn: null }), ahora)).toBeNull();
  });

  it("una apagada a propósito no molesta", () => {
    expect(estaCallada(camara({ activa: false, ultimaCapturaEn: "2026-01-01T00:00:00.000Z" }), ahora)).toBe(false);
  });

  it("dice hace cuántas horas se la vio", () => {
    expect(horasSinVerse(camara({ ultimaCapturaEn: "2026-09-10T09:30:00.000Z" }), ahora)).toBe(2.5);
  });
});

describe("buscar en lo que se ve", () => {
  /* El motivo por el que vale la pena que la IA describa cada foto: sin texto,
     encontrar «el camión rojo del martes» es mirar 200 miniaturas a ojo. */
  const conLectura = (id: string, descripcion: string, placa: string | null = null): Captura => ({
    ...captura(id, "2026-09-10T12:00:00.000Z"),
    lectura: {
      descripcion,
      hayPersona: false,
      hayVehiculo: Boolean(placa),
      personas: null,
      placa,
      confianza: "alta",
      motivo: null,
    },
  });

  const historial = [
    conLectura("a", "Camión rojo cargado de trozas en el portón", "ABC-123"),
    conLectura("b", "Patio vacío al atardecer"),
    conLectura("c", "Dos personas junto a la sierra"),
  ];

  it("encuentra por lo que dice la descripción", () => {
    expect(buscarCapturas(historial, "camión").map((c) => c.id)).toEqual(["a"]);
    expect(buscarCapturas(historial, "personas").map((c) => c.id)).toEqual(["c"]);
  });

  it("encuentra por placa", () => {
    expect(buscarCapturas(historial, "abc-123").map((c) => c.id)).toEqual(["a"]);
  });

  it("no se traba con las tildes ni las mayúsculas", () => {
    expect(buscarCapturas(historial, "CAMION").map((c) => c.id)).toEqual(["a"]);
  });

  it("sin texto devuelve todo, no nada", () => {
    expect(buscarCapturas(historial, "   ")).toHaveLength(3);
  });

  it("una foto sin lectura todavía no rompe la búsqueda", () => {
    const sinLeer = [...historial, captura("d", "2026-09-10T13:00:00.000Z")];
    expect(buscarCapturas(sinLeer, "camión").map((c) => c.id)).toEqual(["a"]);
    expect(buscarCapturas(sinLeer, "movimiento").map((c) => c.id)).toContain("d");
  });
});
