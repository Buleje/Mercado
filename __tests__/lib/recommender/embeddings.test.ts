/**
 * Unit tests for lib/recommender/embeddings.ts.
 *
 * Cubre funciones puras (no tocan red ni DB):
 *  - cosineSimilarity: 0/1 identicos, 0 ortogonales, vectores distintos tamaño
 *  - toPgVectorLiteral: formato `[1,2,3]` esperado por pgvector
 *
 * La función `generateEmbedding` hace fetch a OpenAI — mockeada por separado
 * en tests de integración. Aquí sólo verificamos degradación graceful
 * cuando no hay `OPENAI_API_KEY`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  cosineSimilarity,
  toPgVectorLiteral,
  generateEmbedding,
  EMBEDDING_DIM,
} from "@/lib/recommender/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical non-zero vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns negative value for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("returns 0 when lengths mismatch", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 when one vector is empty", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 when one vector is all zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe("toPgVectorLiteral", () => {
  it("formats small vector without spaces", () => {
    expect(toPgVectorLiteral([1, 2, 3])).toBe("[1,2,3]");
  });

  it("handles negative and decimal values", () => {
    expect(toPgVectorLiteral([-0.5, 0.25, 0])).toBe("[-0.5,0.25,0]");
  });

  it("produces a valid literal for empty vector", () => {
    expect(toPgVectorLiteral([])).toBe("[]");
  });

  it("produces correct EMBEDDING_DIM-length literal", () => {
    const vec = Array.from({ length: EMBEDDING_DIM }, (_, i) => i);
    const lit = toPgVectorLiteral(vec);
    expect(lit.startsWith("[0,1,2")).toBe(true);
    expect(lit.endsWith(`${EMBEDDING_DIM - 1}]`)).toBe(true);
  });
});

describe("generateEmbedding (degradation)", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("returns null when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await generateEmbedding("hello");
    expect(result).toBeNull();
  });

  it("returns null when text is empty after trim", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    const result = await generateEmbedding("   ");
    expect(result).toBeNull();
  });

  it("returns null when fetch resolves with non-200", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "nope" }), { status: 500 }),
    );
    const result = await generateEmbedding("some text");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    const result = await generateEmbedding("some text");
    expect(result).toBeNull();
  });

  it("returns null when API returns wrong dimension", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        { status: 200 },
      ),
    );
    const result = await generateEmbedding("some text");
    expect(result).toBeNull();
  });

  it("returns the vector when API returns correct shape", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    const fake = Array.from({ length: EMBEDDING_DIM }, () => 0.01);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ embedding: fake }] }), {
        status: 200,
      }),
    );
    const result = await generateEmbedding("some text");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(EMBEDDING_DIM);
    expect(result?.[0]).toBeCloseTo(0.01);
  });
});
