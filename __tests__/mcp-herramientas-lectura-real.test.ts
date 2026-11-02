/**
 * Con el catálogo y la matriz REALES (sin mocks de `@/lib/agents`): una conexión
 * de solo consulta («puede anotar» apagado) no ve ninguna herramienta que
 * escriba. Security 01-11: `papeles_liquidacion` estaba como `adelantos:read`
 * y archiva un PDF en Documentos.
 */
import { describe, expect, it } from "vitest";
import { listarHerramientas, claseDe, type ActorMcp } from "@/lib/mcp-servidor/herramientas";
import { ALL_AGENT_TOOLS } from "@/lib/agents";

const actor = (permiteEscribir: boolean): ActorMcp =>
  ({
    rol: "owner",
    conexion: { id: "cx", tenantId: "t-a", nombre: "Gemini", usuario: "dueno", rol: "owner", permiteEscribir },
  }) as unknown as ActorMcp;

const nombres = (permiteEscribir: boolean) => listarHerramientas(actor(permiteEscribir)).map((t) => t.name);

/** Herramientas de papeles/memoria que escriben algo (crean, cambian o borran). */
const ESCRIBEN = ["papeles_liquidacion", "papeles_cotizacion", "memoria_recordar", "memoria_olvidar"];

describe("MCP: conexión de solo consulta con el catálogo real", () => {
  it("no ve papeles_liquidacion ni ninguna de memoria/papeles que escriba", () => {
    const solo = nombres(false);
    for (const n of ESCRIBEN) expect(solo, n).not.toContain(n);
    expect(solo).toContain("papeles_comprobante");
    expect(solo).toContain("memoria_buscar");
  });

  it("con «puede anotar» sí la ve, como escritura", () => {
    expect(nombres(true)).toContain("papeles_liquidacion");
    const tool = ALL_AGENT_TOOLS.find((t) => t.function.name === "papeles_liquidacion");
    expect(tool && claseDe(tool)).not.toBe("lectura");
  });
});
