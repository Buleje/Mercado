import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock server-only ────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock logger ─────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  registerExperiment,
  getPromptVariant,
  recordVariantUsage,
  getABTestResults,
} from "@/lib/ai-ab-testing";

describe("AI A/B Testing", () => {
  beforeEach(() => {
    // Force re-seed by calling getPromptVariant which triggers seedDefaults
  });

  it("returns a variant for a valid experiment", () => {
    const variant = getPromptVariant("coach-tone", "tenant1");
    expect(variant).not.toBeNull();
    expect(["analytical", "motivational"]).toContain(variant!.id);
    expect(variant!.promptModifier).toBeTruthy();
  });

  it("returns null for inactive experiment", () => {
    registerExperiment({
      id: "disabled-test",
      name: "Disabled",
      description: "This is disabled",
      active: false,
      variants: [{ id: "a", name: "A", promptModifier: "test", weight: 50 }],
    });
    const variant = getPromptVariant("disabled-test", "tenant1");
    expect(variant).toBeNull();
  });

  it("returns null for non-existent experiment", () => {
    const variant = getPromptVariant("does-not-exist", "tenant1");
    expect(variant).toBeNull();
  });

  it("records variant usage and updates impressions", () => {
    // Ensure seeds are loaded
    getPromptVariant("assistant-detail", "tenant1");

    recordVariantUsage("assistant-detail", "concise", { tokensUsed: 100 });
    recordVariantUsage("assistant-detail", "concise", { tokensUsed: 200 });
    recordVariantUsage("assistant-detail", "concise", { thumbsUp: true });

    const results = getABTestResults();
    const experiment = results.find(e => e.id === "assistant-detail");
    expect(experiment).toBeDefined();

    const conciseVariant = experiment!.variants.find(v => v.id === "concise");
    expect(conciseVariant).toBeDefined();
    expect(conciseVariant!.impressions).toBeGreaterThanOrEqual(2);
    expect(conciseVariant!.thumbsUp).toBeGreaterThanOrEqual(1);
  });

  it("records negative feedback", () => {
    getPromptVariant("coach-tone", "tenant1");

    recordVariantUsage("coach-tone", "analytical", { thumbsUp: false });

    const results = getABTestResults();
    const experiment = results.find(e => e.id === "coach-tone");
    const variant = experiment!.variants.find(v => v.id === "analytical");
    expect(variant!.thumbsDown).toBeGreaterThanOrEqual(1);
  });

  it("calculates satisfaction rate correctly", () => {
    registerExperiment({
      id: "sat-test",
      name: "Satisfaction test",
      description: "test",
      active: true,
      variants: [{ id: "v1", name: "V1", promptModifier: "test", weight: 100 }],
    });

    // 3 thumbs up, 1 thumbs down = 75% satisfaction
    recordVariantUsage("sat-test", "v1", { thumbsUp: true });
    recordVariantUsage("sat-test", "v1", { thumbsUp: true });
    recordVariantUsage("sat-test", "v1", { thumbsUp: true });
    recordVariantUsage("sat-test", "v1", { thumbsUp: false });

    const results = getABTestResults();
    const experiment = results.find(e => e.id === "sat-test");
    const variant = experiment!.variants.find(v => v.id === "v1");
    expect(variant!.satisfactionRate).toBe(75);
  });

  it("does not declare a winner with fewer than 10 impressions", () => {
    registerExperiment({
      id: "winner-test",
      name: "Winner test",
      description: "test",
      active: true,
      variants: [
        { id: "a", name: "A", promptModifier: "a", weight: 50 },
        { id: "b", name: "B", promptModifier: "b", weight: 50 },
      ],
    });

    // Only 5 impressions each — not enough
    for (let i = 0; i < 5; i++) {
      recordVariantUsage("winner-test", "a", { thumbsUp: true });
      recordVariantUsage("winner-test", "b", { thumbsUp: false });
    }

    const results = getABTestResults();
    const experiment = results.find(e => e.id === "winner-test");
    expect(experiment!.winner).toBeNull();
  });

  it("declares a winner when enough data is collected", () => {
    registerExperiment({
      id: "winner-test-2",
      name: "Winner test 2",
      description: "test",
      active: true,
      variants: [
        { id: "good", name: "Good", promptModifier: "good", weight: 50 },
        { id: "bad", name: "Bad", promptModifier: "bad", weight: 50 },
      ],
    });

    // 12 impressions each — enough to declare
    for (let i = 0; i < 12; i++) {
      recordVariantUsage("winner-test-2", "good", { thumbsUp: true });
      recordVariantUsage("winner-test-2", "bad", { thumbsUp: false });
    }

    const results = getABTestResults();
    const experiment = results.find(e => e.id === "winner-test-2");
    expect(experiment!.winner).toBe("good");
  });

  it("tracks average tokens used", () => {
    registerExperiment({
      id: "token-test",
      name: "Token test",
      description: "test",
      active: true,
      variants: [{ id: "v1", name: "V1", promptModifier: "test", weight: 100 }],
    });

    recordVariantUsage("token-test", "v1", { tokensUsed: 100 });
    recordVariantUsage("token-test", "v1", { tokensUsed: 300 });

    const results = getABTestResults();
    const experiment = results.find(e => e.id === "token-test");
    const variant = experiment!.variants.find(v => v.id === "v1");
    expect(variant!.avgTokensUsed).toBe(200);
  });

  it("returns results for all seeded experiments", () => {
    // Trigger seed
    getPromptVariant("coach-tone", "t1");
    const results = getABTestResults();
    const ids = results.map(r => r.id);
    expect(ids).toContain("coach-tone");
    expect(ids).toContain("assistant-detail");
  });

  it("ignores usage for non-existent experiments", () => {
    // Should not throw
    recordVariantUsage("nonexistent", "v1", { thumbsUp: true });
  });
});
