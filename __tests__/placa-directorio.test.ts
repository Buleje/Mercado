/**
 * Directorio (29-09-2026) — la placa de una ficha sigue la MISMA regla que la
 * guía (`leerPlaca`), sólo al guardar y sólo si CAMBIÓ: una ficha vieja con
 * una placa que ya no pasa tiene que poder editar su capacidad o sus notas.
 * Una embarcación lleva matrícula (ADR-350) y no se valida con el formato.
 *
 * La regla vive en `guardarVehiculo` (sabe cómo está guardada la ficha); el
 * esquema Zod sólo exige que haya placa.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = { id: string; placa: string; placaRemolque: string | null; deletedAt: Date | null };

const H = vi.hoisted(() => ({
  vehiculos: [] as Array<{ id: string; placa: string; placaRemolque: string | null; deletedAt: Date | null }>,
  updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestVehiculo: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        H.vehiculos.find((f) => {
          if (where.id != null && f.id !== where.id) return false;
          if (where.placa != null && f.placa !== where.placa) return false;
          const d = where.deletedAt as null | { not: null } | undefined;
          if (d === null && f.deletedAt !== null) return false;
          if (d && typeof d === "object" && f.deletedAt === null) return false;
          return true;
        }) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        H.updates.push({ id: where.id, data });
        const f = H.vehiculos.find((x) => x.id === where.id);
        return { ...f, ...data, usos: 0, activo: true };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        H.creates.push(data);
        return { id: "nuevo", usos: 0, activo: true, ...data };
      },
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {}, auditCtpEsperando: async () => {} }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ CONSUMO_VIGENTE: {} }));

import { z } from "zod";
import { esEmbarcacion, motivoPlacaVehiculo, placaParaGuia, vehiculoInputSchema } from "@/lib/forestal/directorio";
import { ForestDirectorioDB, PlacaInvalidaError } from "@/lib/db/forest-directorio.db";

const ficha = (f: Partial<Fila> & { id: string; placa: string }): Fila => ({ placaRemolque: null, deletedAt: null, ...f });

beforeEach(() => {
  H.vehiculos.length = 0;
  H.updates.length = 0;
  H.creates.length = 0;
});

describe("motivoPlacaVehiculo — ficha nueva", () => {
  it("W2D-853 y V2H901 con remolque se guardan", () => {
    expect(motivoPlacaVehiculo({ placa: "W2D-853" })).toBeNull();
    expect(motivoPlacaVehiculo({ placa: "V2H901", placaRemolque: "T3A-120" })).toBeNull();
  });

  it.each([
    ["WRFWR242", /sobran/i],
    ["W3242G", /tres últimos/i],
    ["QA-450", /faltan/i],
  ])("%s no se guarda y dice por qué", (placa, motivo) => {
    const m = motivoPlacaVehiculo({ placa });
    expect(m?.campo).toBe("placa");
    expect(m?.motivo).toMatch(motivo);
  });

  it("vacía → «La placa es obligatoria»; remolque inventado → en el remolque; «-» es sin remolque", () => {
    expect(motivoPlacaVehiculo({ placa: "" })).toEqual({ campo: "placa", motivo: "La placa es obligatoria" });
    expect(motivoPlacaVehiculo({ placa: "W2D-853", placaRemolque: "XX-1" })?.campo).toBe("placaRemolque");
    expect(motivoPlacaVehiculo({ placa: "W2D-853", placaRemolque: "-" })).toBeNull();
  });

  it("embarcación: la matrícula no sigue el formato de la placa", () => {
    expect(motivoPlacaVehiculo({ placa: "IQ-12345-BM", tipo: "Embarcación" })).toBeNull();
    expect(motivoPlacaVehiculo({ placa: "CHATA ROSA", tipo: "chata" })).toBeNull();
    expect(motivoPlacaVehiculo({ placa: "X", tipo: "Embarcación" })?.motivo).toMatch(/matrícula/i);
  });
});

describe("motivoPlacaVehiculo — ficha guardada", () => {
  const vieja = { placa: "WRFWR242", placaRemolque: "XX1" };

  it("sin tocar la placa (ni el remolque) no se juzga: se editan las notas", () => {
    expect(motivoPlacaVehiculo({ placa: "WRFWR242", placaRemolque: "XX-1" }, vieja)).toBeNull();
    // El remolque que no viene en el pedido no cambió.
    expect(motivoPlacaVehiculo({ placa: "wrfwr 242" }, vieja)).toBeNull();
  });

  it("cambiar la placa vuelve a exigir el formato", () => {
    expect(motivoPlacaVehiculo({ placa: "WRFWR243" }, vieja)?.campo).toBe("placa");
    expect(motivoPlacaVehiculo({ placa: "W2D-853" }, vieja)).toBeNull();
  });

  it("cambiar sólo el remolque juzga sólo el remolque", () => {
    expect(motivoPlacaVehiculo({ placa: "WRFWR242", placaRemolque: "QA-1" }, vieja)?.campo).toBe("placaRemolque");
  });
});

describe("ForestDirectorioDB.guardarVehiculo — la regla al guardar", () => {
  it("alta con placa inventada → PlacaInvalidaError, sin escribir", async () => {
    await expect(ForestDirectorioDB.guardarVehiculo("t1", { placa: "QA-450", capacidadM3: null }, "qa")).rejects.toBeInstanceOf(PlacaInvalidaError);
    expect(H.creates).toHaveLength(0);
  });

  it("ficha vieja con placa inválida: editar la capacidad se guarda", async () => {
    H.vehiculos.push(ficha({ id: "v1", placa: "WRFWR242" }));
    await ForestDirectorioDB.guardarVehiculo("t1", { id: "v1", placa: "WRFWR242", capacidadM3: 30, notas: "chofer nuevo" }, "qa");
    expect(H.updates).toHaveLength(1);
    expect(H.updates[0].data).toMatchObject({ placa: "WRFWR242", notas: "chofer nuevo" });
  });

  it("ficha vieja: cambiarle la placa por otra inventada → PlacaInvalidaError", async () => {
    H.vehiculos.push(ficha({ id: "v1", placa: "WRFWR242" }));
    await expect(
      ForestDirectorioDB.guardarVehiculo("t1", { id: "v1", placa: "WRFWR243", capacidadM3: null }, "qa"),
    ).rejects.toMatchObject({ name: "PlacaInvalidaError", campo: "placa" });
    expect(H.updates).toHaveLength(0);
  });

  it("alta de una placa válida se crea normalizada", async () => {
    await ForestDirectorioDB.guardarVehiculo("t1", { placa: "w2d-853", capacidadM3: null }, "qa");
    expect(H.creates[0]).toMatchObject({ placa: "W2D853" });
  });
});

describe("esquema y helpers", () => {
  it("el esquema sólo exige que haya placa (el formato lo mira guardarVehiculo); el .extend de la ruta no cambia eso", () => {
    const post = vehiculoInputSchema.extend({ id: z.string().trim().max(40).optional() });
    expect(post.safeParse({ placa: "" }).success).toBe(false);
    expect(post.safeParse({ placa: "WRFWR242", id: "v1" }).success).toBe(true);
    expect(post.safeParse({ placa: "W2D-853", capacidadM3: -1 }).success).toBe(false);
  });

  it("esEmbarcacion por palabra completa", () => {
    expect(esEmbarcacion("Embarcación")).toBe(true);
    expect(esEmbarcacion("Deslizador")).toBe(true);
    expect(esEmbarcacion("Camión pequeño")).toBe(false);
    expect(esEmbarcacion(null)).toBe(false);
  });

  it("placaParaGuia: la del Directorio (W2D853) va con guion; una matrícula o algo que no es placa, como está", () => {
    expect(placaParaGuia("W2D853")).toBe("W2D-853");
    expect(placaParaGuia("CHATADONAR", "Embarcación")).toBe("CHATADONAR");
    expect(placaParaGuia("WRFWR242")).toBe("WRFWR242");
  });
});
