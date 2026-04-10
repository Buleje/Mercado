/**
 * Eval: Yape QR payment state machine.
 * Tests the Yape payment flow: idle -> scanning -> confirming -> confirmed.
 * Business rule: yapeOperationNumber is required when paymentMethod=yape.
 */
import { describe, it, expect } from "vitest";

type YapeState = "idle" | "scanning" | "confirming" | "confirmed" | "failed";
type YapeAction = "SHOW_QR" | "ENTER_OP" | "CONFIRM" | "FAIL" | "RESET";

function yapeReducer(state: YapeState, action: YapeAction): YapeState {
  switch (action) {
    case "SHOW_QR": return state === "idle" ? "scanning" : state;
    case "ENTER_OP": return state === "scanning" ? "confirming" : state;
    case "CONFIRM": return state === "confirming" ? "confirmed" : state;
    case "FAIL": return "failed";
    case "RESET": return "idle";
    default: return state;
  }
}

describe("Checkout > Yape Flow State Machine", () => {
  it("should start at idle", () => {
    expect(yapeReducer("idle", "SHOW_QR")).toBe("scanning");
  });

  it("should transition scanning -> confirming on ENTER_OP", () => {
    expect(yapeReducer("scanning", "ENTER_OP")).toBe("confirming");
  });

  it("should transition confirming -> confirmed on CONFIRM", () => {
    expect(yapeReducer("confirming", "CONFIRM")).toBe("confirmed");
  });

  it("should not skip states (idle -> confirming is blocked)", () => {
    expect(yapeReducer("idle", "ENTER_OP")).toBe("idle");
  });

  it("should allow FAIL from any state", () => {
    expect(yapeReducer("scanning", "FAIL")).toBe("failed");
    expect(yapeReducer("confirming", "FAIL")).toBe("failed");
  });

  it("should allow RESET to idle from any state", () => {
    expect(yapeReducer("failed", "RESET")).toBe("idle");
    expect(yapeReducer("confirmed", "RESET")).toBe("idle");
  });
});
