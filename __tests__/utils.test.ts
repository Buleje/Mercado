import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (classname merge utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("deduplicates tailwind classes", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("handles arrays", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });

  it("ignores null/undefined", () => {
    expect(cn("a", null, undefined, "b")).toBe("a b");
  });
});
