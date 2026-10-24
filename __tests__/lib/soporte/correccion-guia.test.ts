import { describe, it, expect } from "vitest";
import {
  cambiarEstadoCorreccionSchema,
  crearCorreccionSchema,
  etiquetaEstado,
  leerDetalleCorreccion,
  listarDelNegocioQuerySchema,
  puedePasar,
} from "@/lib/soporte/correccion-guia";

const base = {
  entityType: "loth_gtf",
  entityId: "gtf1",
  cambios: [{ donde: "casillero", clave: "12", correcto: " ABC-123 " }],
  motivo: "La placa está mal escrita",
};

describe("crearCorreccionSchema", () => {
  it("acepta un pedido válido y recorta lo correcto", () => {
    const r = crearCorreccionSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cambios[0].correcto).toBe("ABC-123");
  });

  it("descarta «dice» si lo manda el navegador (lo llena el servidor)", () => {
    const r = crearCorreccionSchema.safeParse({
      ...base,
      cambios: [{ ...base.cambios[0], dice: "lo que yo invento" }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect("dice" in r.data.cambios[0]).toBe(false);
  });

  it.each([
    ["motivo de menos de 5", { ...base, motivo: "mal " }],
    ["sin cambios", { ...base, cambios: [] }],
    ["21 cambios", { ...base, cambios: Array.from({ length: 21 }, (_, i) => ({ donde: "item", clave: `T${i}`, correcto: "x" })) }],
    ["clave de 41", { ...base, cambios: [{ donde: "item", clave: "x".repeat(41), correcto: "x" }] }],
    ["correcto vacío", { ...base, cambios: [{ donde: "item", clave: "T1", correcto: "   " }] }],
    ["donde desconocido", { ...base, cambios: [{ donde: "cabecera", clave: "1", correcto: "x" }] }],
    ["guía que no se corrige así", { ...base, entityType: "factura" }],
    ["el mismo casillero dos veces", { ...base, cambios: [base.cambios[0], { donde: "casillero", clave: "12", correcto: "otro" }] }],
  ])("rechaza: %s", (_nombre, body) => {
    expect(crearCorreccionSchema.safeParse(body).success).toBe(false);
  });
});

describe("estados", () => {
  it("transiciones de la corrección", () => {
    expect(puedePasar("open", "in_review")).toBe(true);
    expect(puedePasar("closed", "in_review")).toBe(true);
    expect(puedePasar("closed", "rejected")).toBe(false);
    expect(puedePasar("replied", "closed")).toBe(false);
  });

  it("cerrar o rechazar pide resolución", () => {
    expect(cambiarEstadoCorreccionSchema.safeParse({ estado: "closed" }).success).toBe(false);
    expect(cambiarEstadoCorreccionSchema.safeParse({ estado: "rejected", resolucion: "  no " }).success).toBe(false);
    expect(cambiarEstadoCorreccionSchema.safeParse({ estado: "closed", resolucion: "Emití la 001-124" }).success).toBe(true);
    expect(cambiarEstadoCorreccionSchema.safeParse({ estado: "in_review" }).success).toBe(true);
    expect(cambiarEstadoCorreccionSchema.safeParse({ estado: "replied" }).success).toBe(false);
  });

  it("etiquetas en español por clase de ticket", () => {
    expect(etiquetaEstado("correccion_guia", "closed")).toBe("Resuelta");
    expect(etiquetaEstado("general", "closed")).toBe("Cerrado");
    expect(etiquetaEstado("general", "replied")).toBe("Respondido");
    expect(etiquetaEstado("general", "raro")).toBe("raro");
  });
});

describe("lectura", () => {
  it("leerDetalleCorreccion tolera basura", () => {
    expect(leerDetalleCorreccion(null)).toBeNull();
    expect(leerDetalleCorreccion({ v: 2 })).toBeNull();
    expect(
      leerDetalleCorreccion({ v: 1, guiaNumero: "1", guiaFecha: null, cambios: [] })?.guiaNumero,
    ).toBe("1");
  });

  it("query del panel: límite numérico desde el query string", () => {
    const r = listarDelNegocioQuerySchema.safeParse({ limite: "20", estado: "open" });
    expect(r.success && r.data.limite).toBe(20);
    expect(listarDelNegocioQuerySchema.safeParse({ limite: "999" }).success).toBe(false);
  });
});
