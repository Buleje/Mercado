// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos).
// El probador (29-10) nunca abre la ventana de OK ni escribe fuera del negocio de prueba.
import { describe, it, expect } from "vitest";
import { prepararLlamada } from "../../tools/mcp-buleje/probar.mjs";

const lectura = { annotations: { readOnlyHint: true } };
const escritura = { annotations: { readOnlyHint: false, destructiveHint: false } };
const pideOk = { annotations: { destructiveHint: true } };

describe("probar.mjs", () => {
  it("lecturas tal cual; lo que pide OK y `confirmar` siempre a seco, aun con --real", () => {
    expect(prepararLlamada({ herramienta: "ventas_listar", args: { negocio: "bodega" } }, lectura, true)).toEqual({ args: { negocio: "bodega" } });
    expect(prepararLlamada({ herramienta: "adelanto_dar", args: { negocio: "qa-forestal" } }, pideOk, true).args.seco).toBe(true);
    expect(prepararLlamada({ herramienta: "confirmar", args: { token: "x" } }, { annotations: {} }, true).args.seco).toBe(true);
  });

  it("escrituras: a seco sin --real; con --real solo en qa-forestal", () => {
    expect(prepararLlamada({ herramienta: "tarea_crear", args: { negocio: "bodega" } }, escritura, false).args.seco).toBe(true);
    expect(prepararLlamada({ herramienta: "tarea_crear", args: { negocio: "bodega" } }, escritura, true).error).toMatch(/solo en qa-forestal/);
    expect(prepararLlamada({ herramienta: "tarea_crear", args: {} }, escritura, true).error).toMatch(/bodega/);
    expect(prepararLlamada({ herramienta: "tarea_crear", args: { negocio: "qa-forestal" } }, escritura, true)).toEqual({ args: { negocio: "qa-forestal" } });
  });

  it("herramienta que no existe", () => {
    expect(prepararLlamada({ herramienta: "nada" }, undefined, false).error).toMatch(/no existe/);
  });
});
