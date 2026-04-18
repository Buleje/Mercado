import { describe, expect, it } from "vitest";
import {
  canTransition,
  resolveTransition,
  InvalidStateTransitionError,
  allTransitions,
  type ApplicationReviewAction,
  type ApplicationStatus,
} from "@/lib/state-machines/vendor-application-machine";

/**
 * State machine tests — ADR-079.
 *
 * Cada fila enumera una (status, action) y si la transicion es valida o no.
 * Cuando es valida, el test tambien verifica el destino esperado.
 */

type Row = {
  from: ApplicationStatus;
  action: ApplicationReviewAction;
  valid: boolean;
  to?: ApplicationStatus;
};

const CASES: Row[] = [
  // ── Desde pending ──────────────────────────────────────────
  { from: "pending", action: "start_review", valid: true, to: "under_review" },
  { from: "pending", action: "approve", valid: true, to: "approved" },
  { from: "pending", action: "reject", valid: true, to: "rejected" },
  { from: "pending", action: "request_info", valid: false },
  { from: "pending", action: "reopen", valid: false },

  // ── Desde under_review ─────────────────────────────────────
  { from: "under_review", action: "request_info", valid: true, to: "info_requested" },
  { from: "under_review", action: "approve", valid: true, to: "approved" },
  { from: "under_review", action: "reject", valid: true, to: "rejected" },
  { from: "under_review", action: "start_review", valid: false },
  { from: "under_review", action: "reopen", valid: false },

  // ── Desde info_requested ──────────────────────────────────
  { from: "info_requested", action: "approve", valid: true, to: "approved" },
  { from: "info_requested", action: "reject", valid: true, to: "rejected" },
  { from: "info_requested", action: "start_review", valid: false },
  { from: "info_requested", action: "request_info", valid: false },
  { from: "info_requested", action: "reopen", valid: false },

  // ── Desde approved ────────────────────────────────────────
  // approved permite reject (si se descubrio fraude post-aprobacion) pero
  // NO se puede re-iniciar review ni volver a pending.
  { from: "approved", action: "reject", valid: true, to: "rejected" },
  { from: "approved", action: "start_review", valid: false },
  { from: "approved", action: "approve", valid: false },
  { from: "approved", action: "request_info", valid: false },
  { from: "approved", action: "reopen", valid: false },

  // ── Desde tenant_provisioned ──────────────────────────────
  // Estado final. Todas las acciones bloqueadas.
  { from: "tenant_provisioned", action: "start_review", valid: false },
  { from: "tenant_provisioned", action: "request_info", valid: false },
  { from: "tenant_provisioned", action: "approve", valid: false },
  { from: "tenant_provisioned", action: "reject", valid: false },
  { from: "tenant_provisioned", action: "reopen", valid: false },

  // ── Desde rejected ────────────────────────────────────────
  { from: "rejected", action: "reopen", valid: true, to: "pending" },
  { from: "rejected", action: "start_review", valid: false },
  { from: "rejected", action: "approve", valid: false },
  { from: "rejected", action: "reject", valid: false },
  { from: "rejected", action: "request_info", valid: false },
];

describe("vendor-application state machine · canTransition", () => {
  it.each(CASES)(
    "$from + $action -> valid=$valid",
    ({ from, action, valid }) => {
      expect(canTransition(from, action)).toBe(valid);
    },
  );
});

describe("vendor-application state machine · resolveTransition", () => {
  it.each(CASES.filter((c) => c.valid))(
    "$from + $action -> $to",
    ({ from, action, to }) => {
      expect(resolveTransition(from, action)).toBe(to);
    },
  );

  it.each(CASES.filter((c) => !c.valid))(
    "$from + $action throws InvalidStateTransitionError",
    ({ from, action }) => {
      expect(() => resolveTransition(from, action)).toThrowError(
        InvalidStateTransitionError,
      );
    },
  );
});

describe("vendor-application state machine · coverage", () => {
  it("cubre las 5 acciones de revision", () => {
    const actions = new Set(CASES.map((c) => c.action));
    expect(actions.size).toBe(5);
    expect(actions).toContain("start_review");
    expect(actions).toContain("request_info");
    expect(actions).toContain("approve");
    expect(actions).toContain("reject");
    expect(actions).toContain("reopen");
  });

  it("cubre los 6 estados como origen", () => {
    const froms = new Set(CASES.map((c) => c.from));
    expect(froms.size).toBe(6);
    expect(froms).toContain("pending");
    expect(froms).toContain("under_review");
    expect(froms).toContain("info_requested");
    expect(froms).toContain("approved");
    expect(froms).toContain("tenant_provisioned");
    expect(froms).toContain("rejected");
  });

  it("tenant_provisioned es terminal — cero transiciones salientes", () => {
    const outgoing = CASES.filter(
      (c) => c.from === "tenant_provisioned" && c.valid,
    );
    expect(outgoing.length).toBe(0);
  });

  it("allTransitions() enumera cada transicion valida exactamente una vez", () => {
    const all = allTransitions();
    const valid = CASES.filter((c) => c.valid);
    expect(all.length).toBe(valid.length);
    // Cada combinacion del test aparece en allTransitions
    for (const row of valid) {
      const found = all.find(
        (t) => t.from === row.from && t.action === row.action,
      );
      expect(found).toBeDefined();
      expect(found!.to).toBe(row.to);
    }
  });
});
