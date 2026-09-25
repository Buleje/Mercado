import { describe, it, expect } from "vitest";
import {
  renderBroadcastBody,
  extractTemplateVars,
  buildBroadcastVars,
  BROADCAST_TEMPLATES,
} from "@/lib/chat/broadcast-templates";

const NOW = new Date("2026-06-17T12:00:00Z").getTime();

describe("renderBroadcastBody", () => {
  it("reemplaza variables conocidas", () => {
    const out = renderBroadcastBody("Hola {{tienda}}, plan {{plan}}", {
      tienda: "Bodega Don José",
      plan: "Pro",
    });
    expect(out).toBe("Hola Bodega Don José, plan Pro");
  });

  it("deja literal las variables sin valor (null/undefined/vacío)", () => {
    expect(renderBroadcastBody("Faltan {{dias_trial}} días", { dias_trial: "" })).toBe(
      "Faltan {{dias_trial}} días",
    );
    expect(renderBroadcastBody("Hola {{tienda}}", {})).toBe("Hola {{tienda}}");
  });

  it("convierte números a string", () => {
    expect(renderBroadcastBody("{{dias_trial}} días", { dias_trial: 5 })).toBe("5 días");
  });
});

describe("extractTemplateVars", () => {
  it("lista variables únicas", () => {
    expect(extractTemplateVars("{{tienda}} {{plan}} {{tienda}}")).toEqual(["tienda", "plan"]);
  });
  it("array vacío sin variables", () => {
    expect(extractTemplateVars("texto plano")).toEqual([]);
  });
});

describe("buildBroadcastVars", () => {
  it("calcula días de trial restantes", () => {
    const v = buildBroadcastVars(
      { name: "Tienda", plan: "pro", trialEndsAt: new Date(NOW + 5 * 86_400_000) },
      NOW,
    );
    expect(v.tienda).toBe("Tienda");
    expect(v.plan).toBe("pro");
    expect(v.dias_trial).toBe(5);
  });

  it("dias_trial vacío cuando no hay trial", () => {
    const v = buildBroadcastVars({ name: "X", plan: "free", trialEndsAt: null }, NOW);
    expect(v.dias_trial).toBe("");
  });

  it("trial vencido → 0 días (no negativo)", () => {
    const v = buildBroadcastVars(
      { name: "X", plan: "pro", trialEndsAt: new Date(NOW - 3 * 86_400_000) },
      NOW,
    );
    expect(v.dias_trial).toBe(0);
  });
});

describe("BROADCAST_TEMPLATES", () => {
  it("toda plantilla renderiza completa con las variables de muestra (sin {{}} sobrante)", () => {
    const vars = buildBroadcastVars(
      { name: "Bodega Don José", plan: "Pro", trialEndsAt: new Date(NOW + 3 * 86_400_000) },
      NOW,
    );
    for (const tpl of BROADCAST_TEMPLATES) {
      const rendered = renderBroadcastBody(tpl.body, vars);
      expect(rendered, `plantilla ${tpl.id}`).not.toMatch(/\{\{|\}\}/);
    }
  });

  it("ids únicos", () => {
    const ids = BROADCAST_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
