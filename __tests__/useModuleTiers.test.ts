import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModuleTiers, MODULE_TIER_MAP } from "@/hooks/useModuleTiers";

beforeEach(() => {
  localStorage.clear();
});

describe("useModuleTiers", () => {
  // ── Tier selection ────────────────────────────────────────────────────────

  it("should default to avanzado when no saved preference", () => {
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.tier).toBe("avanzado");
  });

  it("should restore saved tier from localStorage", () => {
    localStorage.setItem("buleje-module-tier", "principal");
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.tier).toBe("principal");
  });

  it("should persist tier to localStorage when changed", () => {
    const { result } = renderHook(() => useModuleTiers());

    act(() => result.current.setTier("intermedio"));

    expect(result.current.tier).toBe("intermedio");
    expect(localStorage.getItem("buleje-module-tier")).toBe("intermedio");
  });

  it("should ignore invalid localStorage values and default to avanzado", () => {
    localStorage.setItem("buleje-module-tier", "invalido");
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.tier).toBe("avanzado");
  });

  // ── Module visibility ─────────────────────────────────────────────────────

  it("should show all modules when tier is avanzado", () => {
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.tier).toBe("avanzado");

    // All mapped modules should be visible
    for (const moduleId of Object.keys(MODULE_TIER_MAP)) {
      expect(result.current.isModuleVisible(moduleId)).toBe(true);
    }
  });

  it("should hide avanzado modules when tier is principal", () => {
    localStorage.setItem("buleje-module-tier", "principal");
    const { result } = renderHook(() => useModuleTiers());

    // Principal modules visible
    expect(result.current.isModuleVisible("inventario")).toBe(true);
    expect(result.current.isModuleVisible("productos")).toBe(true);
    expect(result.current.isModuleVisible("asistente-ia")).toBe(true);

    // Intermedio modules hidden
    expect(result.current.isModuleVisible("fiados")).toBe(false);
    expect(result.current.isModuleVisible("prestamos")).toBe(false);

    // Avanzado modules hidden
    expect(result.current.isModuleVisible("analytics-bi")).toBe(false);
    expect(result.current.isModuleVisible("rendimiento")).toBe(false);
  });

  it("should show principal + intermedio modules when tier is intermedio", () => {
    localStorage.setItem("buleje-module-tier", "intermedio");
    const { result } = renderHook(() => useModuleTiers());

    expect(result.current.isModuleVisible("asistente-ia")).toBe(true); // principal
    expect(result.current.isModuleVisible("fiados")).toBe(true); // intermedio
    expect(result.current.isModuleVisible("analytics-bi")).toBe(false); // avanzado
  });

  it("should treat unknown modules as always visible", () => {
    localStorage.setItem("buleje-module-tier", "principal");
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.isModuleVisible("modulo-inexistente")).toBe(true);
  });

  // ── getModuleTier ─────────────────────────────────────────────────────────

  it("should return the correct tier for a module", () => {
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.getModuleTier("asistente-ia")).toBe("principal");
    expect(result.current.getModuleTier("fiados")).toBe("intermedio");
    expect(result.current.getModuleTier("analytics-bi")).toBe("avanzado");
  });

  it("should default unknown modules to avanzado", () => {
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.getModuleTier("xyz-no-existe")).toBe("avanzado");
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  it("should report correct stats for principal tier", () => {
    localStorage.setItem("buleje-module-tier", "principal");
    const { result } = renderHook(() => useModuleTiers());

    const principalCount = Object.values(MODULE_TIER_MAP).filter(t => t === "principal").length;
    expect(result.current.stats.visible).toBe(principalCount);
    expect(result.current.stats.total).toBe(Object.keys(MODULE_TIER_MAP).length);
    expect(result.current.stats.hidden).toBe(result.current.stats.total - principalCount);
  });

  it("should report all modules visible for avanzado tier", () => {
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.stats.visible).toBe(result.current.stats.total);
    expect(result.current.stats.hidden).toBe(0);
  });

  // ── Overrides ─────────────────────────────────────────────────────────────

  it("should start with empty overrides", () => {
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.overrides).toEqual({});
  });

  it("should restore overrides from localStorage", () => {
    const saved = { "analytics-bi": "principal" };
    localStorage.setItem("buleje-module-tier-overrides", JSON.stringify(saved));
    const { result } = renderHook(() => useModuleTiers());
    expect(result.current.overrides).toEqual(saved);
  });

  it("should allow overriding a module tier", () => {
    localStorage.setItem("buleje-module-tier", "principal");
    const { result } = renderHook(() => useModuleTiers());

    // analytics-bi is avanzado by default — hidden in principal tier
    expect(result.current.isModuleVisible("analytics-bi")).toBe(false);

    // Override it to principal
    act(() => result.current.setModuleTier("analytics-bi", "principal"));

    expect(result.current.isModuleVisible("analytics-bi")).toBe(true);
    expect(result.current.getModuleTier("analytics-bi")).toBe("principal");
    expect(result.current.overrides["analytics-bi"]).toBe("principal");
  });

  it("should remove override when set to default tier", () => {
    const { result } = renderHook(() => useModuleTiers());

    // Override
    act(() => result.current.setModuleTier("analytics-bi", "principal"));
    expect(result.current.overrides["analytics-bi"]).toBe("principal");

    // Set back to default (avanzado)
    act(() => result.current.setModuleTier("analytics-bi", "avanzado"));
    expect(result.current.overrides["analytics-bi"]).toBeUndefined();
  });

  it("should persist overrides to localStorage", () => {
    const { result } = renderHook(() => useModuleTiers());

    act(() => result.current.setModuleTier("fiados", "principal"));

    const stored = JSON.parse(localStorage.getItem("buleje-module-tier-overrides") || "{}");
    expect(stored["fiados"]).toBe("principal");
  });

  it("should reset all overrides", () => {
    const { result } = renderHook(() => useModuleTiers());

    act(() => result.current.setModuleTier("fiados", "principal"));
    act(() => result.current.setModuleTier("analytics-bi", "intermedio"));
    expect(Object.keys(result.current.overrides).length).toBe(2);

    act(() => result.current.resetOverrides());

    expect(result.current.overrides).toEqual({});
    expect(localStorage.getItem("buleje-module-tier-overrides")).toBeNull();
  });

  it("should affect visibility when override changes module tier", () => {
    localStorage.setItem("buleje-module-tier", "intermedio");
    const { result } = renderHook(() => useModuleTiers());

    // rendimiento is avanzado — hidden in intermedio
    expect(result.current.isModuleVisible("rendimiento")).toBe(false);

    // Override to intermedio — now visible
    act(() => result.current.setModuleTier("rendimiento", "intermedio"));
    expect(result.current.isModuleVisible("rendimiento")).toBe(true);

    // Override to principal — still visible (principal < intermedio)
    act(() => result.current.setModuleTier("rendimiento", "principal"));
    expect(result.current.isModuleVisible("rendimiento")).toBe(true);
  });
});
