/**
 * El canal de WhatsApp del bot que anota (ADR-391).
 *
 * Dos cosas que, mal hechas, no dan error y se descubren tarde:
 *
 *  1. **El cableado del dominio nuevo.** Un dominio sin entrada en
 *     `permissions.ts` o sin palabras en `tool-routing.ts` no falla: el modelo
 *     contesta «no puedo hacer eso» y parece una decisión suya.
 *  2. **La frase de vinculación.** Es lo único que se mira ANTES de decidir si
 *     quien escribe es dueño o cliente. Si el patrón fuera ancho, un cliente
 *     escribiendo normal caería en el bot que escribe plata.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dominiosMencionados, toolsParaMensaje } = await import("@/lib/agents/tool-routing");
const { AGENT_ACTION_PERMISSIONS } = await import("@/lib/agents/permissions");
const { ALL_AGENT_TOOLS, resolveToolCall, isToolApprovalRequired } = await import(
  "@/lib/agents/tool-definitions"
);
const { agendaAgent } = await import("@/lib/agents/domains/agenda.agent");
const { pareceVinculacion } = await import("@/lib/whatsapp/anotar");

describe("el dominio agenda quedó cableado en los 5 lugares", () => {
  it("tiene permisos para TODAS sus acciones (sin esto responde «no tengo permiso»)", () => {
    const mapa = AGENT_ACTION_PERMISSIONS.agenda;
    expect(mapa).toBeDefined();
    for (const accion of agendaAgent.actions) {
      expect(mapa[accion], `falta el permiso de agenda.${accion}`).toBeDefined();
    }
  });

  it("sus tools resuelven a una acción que el agente sabe ejecutar", () => {
    const tools = ALL_AGENT_TOOLS.filter((t) => t.function.name.startsWith("agenda_"));
    expect(tools.length).toBe(3);
    for (const t of tools) {
      const r = resolveToolCall(t.function.name);
      expect(r?.domain).toBe("agenda");
      expect(agendaAgent.actions, `${t.function.name} → acción inexistente`).toContain(r?.action);
    }
  });

  it("las dos escrituras piden confirmación humana; consultar no", () => {
    expect(isToolApprovalRequired("agenda_agendar")).toBe(true);
    expect(isToolApprovalRequired("agenda_completar")).toBe(true);
    expect(isToolApprovalRequired("agenda_ver")).toBe(false);
  });
});

describe("el ruteo por vocabulario alcanza al dominio agenda", () => {
  it("«recordame el lunes llamar al ingeniero» activa agenda", () => {
    expect(dominiosMencionados("recordame el lunes a las 8 llamar al ingeniero")).toContain("agenda");
  });

  it("aguanta el dictado sin tildes", () => {
    expect(dominiosMencionados("agendame una reunion con el contador")).toContain("agenda");
  });

  it("la frase llega con las tools de agenda cargadas", () => {
    const nombres = toolsParaMensaje("recordame mañana pagar el seguro").map((t) => t.function.name);
    expect(nombres).toContain("agenda_agendar");
  });

  it("«el lunes cobré 300» NO es agenda: un día suelto no es una cita", () => {
    expect(dominiosMencionados("el lunes cobré 300 soles")).not.toContain("agenda");
  });
});

describe("la frase que engancha un teléfono al negocio", () => {
  it("reconoce la frase y devuelve el código en mayúsculas", () => {
    expect(pareceVinculacion("vincular ab34cd")).toBe("AB34CD");
    expect(pareceVinculacion("/vincular AB34CD")).toBe("AB34CD");
    expect(pareceVinculacion("  vincular  AB34CD  ")).toBe("AB34CD");
  });

  it("un cliente escribiendo normal NUNCA cae acá", () => {
    for (const frase of [
      "hola, tienen gaseosa?",
      "quiero vincular mi cuenta",
      "vincular",
      "vincular por favor el codigo",
      "me pueden vincular AB34CD5 con el sistema",
      "necesito vincular esto",
    ]) {
      expect(pareceVinculacion(frase), `«${frase}» no debería vincular`).toBeNull();
    }
  });

  it("un código de largo equivocado no pasa", () => {
    expect(pareceVinculacion("vincular AB34")).toBeNull();
    expect(pareceVinculacion("vincular AB34CD77")).toBeNull();
  });
});
