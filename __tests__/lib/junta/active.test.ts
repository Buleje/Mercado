// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getActiveJunta,
  setActiveJunta,
  clearActiveJunta,
} from "@/lib/junta/active";

beforeEach(() => {
  // limpiar cookies entre tests
  document.cookie = "junta-activa=; path=/; max-age=0";
});

describe("junta activa (cookie)", () => {
  it("sin cookie → null", () => {
    expect(getActiveJunta()).toBeNull();
  });

  it("set → get devuelve el code", () => {
    setActiveJunta("BARRIO-AB12");
    expect(getActiveJunta()).toBe("BARRIO-AB12");
  });

  it("clear → vuelve a null", () => {
    setActiveJunta("BARRIO-AB12");
    clearActiveJunta();
    expect(getActiveJunta()).toBeNull();
  });

  it("decodifica valores con caracteres especiales", () => {
    setActiveJunta("BARRIO-XY 9");
    expect(getActiveJunta()).toBe("BARRIO-XY 9");
  });
});
