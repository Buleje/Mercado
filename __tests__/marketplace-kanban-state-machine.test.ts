/**
 * M5 — marketplace-kanban-state-machine.test.ts
 *
 * Tests sobre ORDER_STAGES del kanban marketplace.
 * Extrae la lógica de isValidTransition como función pura.
 *
 * ORDER_STAGES (OrdenesTab.tsx lineas 44-92):
 *   pendiente → confirmado → preparando → en_camino → entregado
 *   next: null en "entregado"
 */

import { describe, it, expect } from "vitest";

// ── ORDER_STAGES replicado (estructura pura, sin dependencias React) ───────────
const ORDER_STAGES = [
  { id: "pendiente",  next: "confirmado"  },
  { id: "confirmado", next: "preparando"  },
  { id: "preparando", next: "en_camino"   },
  { id: "en_camino",  next: "entregado"   },
  { id: "entregado",  next: null          },
];

/**
 * isValidTransition: sólo se permite avanzar al `next` directo del stage.
 * No se permiten saltos ni retrocesos.
 */
function isValidTransition(fromStatus: string, toStatus: string): boolean {
  const stage = ORDER_STAGES.find((s) => s.id === fromStatus);
  if (!stage) return false;
  return stage.next === toStatus;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("isValidTransition — kanban marketplace state machine", () => {
  it("pendiente → entregado (salto) retorna false", () => {
    expect(isValidTransition("pendiente", "entregado")).toBe(false);
  });

  it("pendiente → confirmado retorna true", () => {
    expect(isValidTransition("pendiente", "confirmado")).toBe(true);
  });

  it("confirmado → preparando retorna true", () => {
    expect(isValidTransition("confirmado", "preparando")).toBe(true);
  });

  it("preparando → en_camino retorna true", () => {
    expect(isValidTransition("preparando", "en_camino")).toBe(true);
  });

  it("en_camino → entregado retorna true", () => {
    expect(isValidTransition("en_camino", "entregado")).toBe(true);
  });

  it("entregado → pendiente (rollback prohibido) retorna false", () => {
    expect(isValidTransition("entregado", "pendiente")).toBe(false);
  });

  it("confirmado → entregado (salto de 2) retorna false", () => {
    expect(isValidTransition("confirmado", "entregado")).toBe(false);
  });

  it("stage inexistente retorna false", () => {
    expect(isValidTransition("desconocido", "pendiente")).toBe(false);
  });
});
