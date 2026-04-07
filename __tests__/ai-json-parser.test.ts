import { describe, it, expect } from "vitest";
import { z } from "zod";
import { safeParseJSON, cleanJSONResponse } from "@/lib/ai-json-parser";

const Schema = z.object({
  status: z.enum(["ok", "error"]),
  message: z.string(),
  count: z.number().optional(),
});

describe("safeParseJSON", () => {
  it("happy path: clean JSON matches schema", () => {
    const raw = '{"status": "ok", "message": "hello", "count": 42}';
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("ok");
      expect(result.data.count).toBe(42);
    }
  });

  it("strips markdown code fences (```json)", () => {
    const raw = '```json\n{"status": "ok", "message": "hi"}\n```';
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(true);
  });

  it("strips plain code fences (```)", () => {
    const raw = '```\n{"status": "ok", "message": "hi"}\n```';
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(true);
  });

  it("extracts JSON from text with preamble", () => {
    const raw = 'Aquí tienes el JSON:\n{"status": "ok", "message": "hi"}';
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(true);
  });

  it("extracts JSON with trailing text", () => {
    const raw = '{"status": "ok", "message": "hi"}\nEspero haber ayudado.';
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(true);
  });

  it("handles trailing commas", () => {
    const raw = '{"status": "ok", "message": "hi",}';
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(true);
  });

  it("returns error on invalid JSON", () => {
    const raw = "not json at all";
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("JSON.parse failed");
      expect(result.raw).toBe(raw);
    }
  });

  it("returns error on schema mismatch", () => {
    const raw = '{"status": "invalid_value", "message": "hi"}';
    const result = safeParseJSON(raw, Schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("schema validation failed");
    }
  });

  it("returns error on empty string", () => {
    const result = safeParseJSON("", Schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("empty response");
  });

  it("parses arrays with schema", () => {
    const ArraySchema = z.array(z.object({ name: z.string() }));
    const raw = '```json\n[{"name": "a"}, {"name": "b"}]\n```';
    const result = safeParseJSON(raw, ArraySchema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(2);
  });
});

describe("cleanJSONResponse", () => {
  it("returns clean input unchanged", () => {
    expect(cleanJSONResponse('{"a":1}')).toBe('{"a":1}');
  });

  it("strips markdown fences", () => {
    expect(cleanJSONResponse('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("removes preamble text", () => {
    expect(cleanJSONResponse('Result: {"a":1}')).toBe('{"a":1}');
  });

  it("removes trailing text", () => {
    expect(cleanJSONResponse('{"a":1}\nend')).toBe('{"a":1}');
  });

  it("removes trailing commas", () => {
    expect(cleanJSONResponse('{"a":1,}')).toBe('{"a":1}');
  });
});
