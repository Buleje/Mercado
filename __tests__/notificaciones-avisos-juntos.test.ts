/**
 * Centro de notificaciones del panel (18-10): los repetidos van en una fila,
 * cada aviso tiene su nivel (cuándo actuar) y dentro del día manda lo sin leer
 * y urgente.
 */
import { describe, expect, it } from "vitest";
import {
  juntarRepetidos,
  nivelDeAviso,
  ordenarDelDia,
  type AvisoBase,
} from "@/components/notifications/avisos-juntos";

const AHORA = Date.parse("2026-10-18T15:00:00.000Z");
const haceDias = (d: number) => new Date(AHORA - d * 86_400_000).toISOString();

const aviso = (o: Partial<AvisoBase> & { id: string }): AvisoBase => ({
  type: "FIADO_REMINDER",
  title: "SUSPENDIDO: Cliente 4455",
  severity: "HIGH",
  createdAt: haceDias(0),
  readAt: null,
  entityId: "c-4455",
  actionUrl: null,
  ...o,
});

describe("nivelDeAviso", () => {
  it("HIGH reciente es urgente; HIGH de hace una semana, importante", () => {
    expect(nivelDeAviso({ type: "FIADO_REMINDER", severity: "HIGH", createdAt: haceDias(1) }, AHORA)).toBe("urgente");
    expect(nivelDeAviso({ type: "FIADO_REMINDER", severity: "HIGH", createdAt: haceDias(7) }, AHORA)).toBe("importante");
  });

  it("MEDIUM de la semana es importante; más viejo, leve; LOW siempre leve", () => {
    expect(nivelDeAviso({ type: "ADELANTO_VENCIDO", severity: "MEDIUM", createdAt: haceDias(2) }, AHORA)).toBe("importante");
    expect(nivelDeAviso({ type: "ADELANTO_VENCIDO", severity: "MEDIUM", createdAt: haceDias(9) }, AHORA)).toBe("leve");
    expect(nivelDeAviso({ type: "DOCUMENTO_VENCIMIENTO", severity: "LOW", createdAt: haceDias(0) }, AHORA)).toBe("leve");
  });

  it("los tipos que sólo cuentan algo son informativos aunque digan HIGH", () => {
    expect(nivelDeAviso({ type: "CLIENTE_NUEVO", severity: "LOW", createdAt: haceDias(0) }, AHORA)).toBe("informativo");
    expect(nivelDeAviso({ type: "forecast_daily", severity: "HIGH", createdAt: haceDias(0) }, AHORA)).toBe("informativo");
  });

  it("una fecha rota no es urgente", () => {
    expect(nivelDeAviso({ type: "X", severity: "HIGH", createdAt: "no-es-fecha" }, AHORA)).toBe("importante");
  });
});

describe("juntarRepetidos", () => {
  it("el mismo recordatorio de tres días es una fila: muestra el más nuevo, cuenta 3 y dice desde cuándo", () => {
    const juntos = juntarRepetidos(
      [
        aviso({ id: "viejo", createdAt: haceDias(2) }),
        aviso({ id: "nuevo", createdAt: haceDias(0) }),
        aviso({ id: "medio", createdAt: haceDias(1), readAt: haceDias(1) }),
      ],
      AHORA,
    );
    expect(juntos).toHaveLength(1);
    expect(juntos[0].aviso.id).toBe("nuevo");
    expect(juntos[0].veces).toBe(3);
    expect(juntos[0].desde).toBe(haceDias(2));
    expect(juntos[0].sinLeer).toBe(true);
    expect(juntos[0].idsSinLeer).toEqual(["nuevo", "viejo"]);
    expect(juntos[0].nivel).toBe("urgente");
  });

  it("otro registro, otro enlace u otro título no se juntan", () => {
    const juntos = juntarRepetidos(
      [
        aviso({ id: "a" }),
        aviso({ id: "b", entityId: "otro-cliente" }),
        aviso({ id: "c", actionUrl: "/admin?tab=pedidos&id=9" }),
        aviso({ id: "d", title: "Otro título" }),
      ],
      AHORA,
    );
    expect(juntos.map((j) => j.veces)).toEqual([1, 1, 1, 1]);
  });

  it("el WhatsApp con el mensaje del día en la consulta sigue siendo el mismo aviso", () => {
    const juntos = juntarRepetidos(
      [
        aviso({ id: "hoy", actionUrl: "https://wa.me/922334455?text=lleva%2078%20dias&f=abc" }),
        aviso({ id: "ayer", createdAt: haceDias(1), actionUrl: "https://wa.me/922334455?text=lleva%2077%20dias&f=xyz" }),
        aviso({ id: "otro", actionUrl: "https://wa.me/900000000?text=lleva%2078%20dias" }),
      ],
      AHORA,
    );
    expect(juntos.map((j) => [j.aviso.id, j.veces])).toEqual([
      ["hoy", 2],
      ["otro", 1],
    ]);
  });

  it("si la copia más nueva ya se leyó, la fila se ve leída aunque queden viejas sin leer", () => {
    const [j] = juntarRepetidos(
      [aviso({ id: "nuevo", readAt: haceDias(0) }), aviso({ id: "viejo", createdAt: haceDias(1) })],
      AHORA,
    );
    expect(j.sinLeer).toBe(false);
    expect(j.idsSinLeer).toEqual(["viejo"]);
  });
});

describe("ordenarDelDia", () => {
  it("sin leer por nivel (urgente primero), lo leído al final; a igual rango, lo más nuevo", () => {
    const fila = (id: string, nivel: "urgente" | "importante" | "leve" | "informativo", sinLeer: boolean, horas: number) => ({
      id,
      nivel,
      sinLeer,
      createdAt: new Date(AHORA - horas * 3_600_000).toISOString(),
    });
    const orden = ordenarDelDia([
      fila("leido-urgente", "urgente", false, 0),
      fila("info", "informativo", true, 1),
      fila("importante", "importante", true, 2),
      fila("urgente-viejo", "urgente", true, 5),
      fila("urgente-nuevo", "urgente", true, 3),
    ]).map((f) => f.id);
    expect(orden).toEqual(["urgente-nuevo", "urgente-viejo", "importante", "info", "leido-urgente"]);
  });
});
