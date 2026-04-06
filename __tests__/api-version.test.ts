/**
 * Tests for lib/api-version.ts
 */

import { describe, it, expect } from "vitest";
import {
  stripApiVersion,
  getApiVersion,
  deprecatedResponse,
} from "@/lib/api-version";

describe("stripApiVersion", () => {
  it("strips /api/v1/ from the beginning", () => {
    expect(stripApiVersion("/api/v1/products")).toBe("/api/products");
  });

  it("strips /api/v2/ from the beginning", () => {
    expect(stripApiVersion("/api/v2/orders/42")).toBe("/api/orders/42");
  });

  it("strips /api/v10/ (double digit versions)", () => {
    expect(stripApiVersion("/api/v10/admin")).toBe("/api/admin");
  });

  it("leaves unversioned paths unchanged", () => {
    expect(stripApiVersion("/api/products")).toBe("/api/products");
  });

  it("leaves non-api paths unchanged", () => {
    expect(stripApiVersion("/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("handles trailing-only version paths", () => {
    expect(stripApiVersion("/api/v1")).toBe("/api");
  });

  it("does not match /api/version1/ (false version)", () => {
    expect(stripApiVersion("/api/version1/foo")).toBe("/api/version1/foo");
  });

  it("only strips the first version segment", () => {
    // Nested versions shouldn't happen but we verify deterministic behavior
    expect(stripApiVersion("/api/v1/v2/foo")).toBe("/api/v2/foo");
  });
});

describe("getApiVersion", () => {
  it("extracts version 1", () => {
    expect(getApiVersion("/api/v1/products")).toBe(1);
  });

  it("extracts version 2", () => {
    expect(getApiVersion("/api/v2/orders")).toBe(2);
  });

  it("extracts double digit version", () => {
    expect(getApiVersion("/api/v10/admin")).toBe(10);
  });

  it("returns null for unversioned paths", () => {
    expect(getApiVersion("/api/products")).toBeNull();
  });

  it("returns null for non-api paths", () => {
    expect(getApiVersion("/admin/v1/foo")).toBeNull();
  });
});

describe("deprecatedResponse", () => {
  it("adds Deprecation and Link headers", () => {
    const original = new Response(JSON.stringify({ foo: "bar" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const wrapped = deprecatedResponse(original, "/api/v1/products");

    expect(wrapped.headers.get("Deprecation")).toBe("true");
    expect(wrapped.headers.get("Link")).toBe(
      '</api/v1/products>; rel="successor-version"'
    );
    expect(wrapped.headers.get("Content-Type")).toBe("application/json");
  });

  it("preserves the status code", () => {
    const original = new Response("Not Found", { status: 404 });
    const wrapped = deprecatedResponse(original, "/api/v1/foo");
    expect(wrapped.status).toBe(404);
  });

  it("adds optional Sunset header when provided", () => {
    const original = new Response("ok", { status: 200 });
    const wrapped = deprecatedResponse(
      original,
      "/api/v1/products",
      "2027-04-06T00:00:00Z"
    );
    expect(wrapped.headers.get("Sunset")).toBe("2027-04-06T00:00:00Z");
  });

  it("does not add Sunset header when not provided", () => {
    const original = new Response("ok", { status: 200 });
    const wrapped = deprecatedResponse(original, "/api/v1/products");
    expect(wrapped.headers.has("Sunset")).toBe(false);
  });

  it("preserves the body", async () => {
    const payload = { items: [1, 2, 3] };
    const original = new Response(JSON.stringify(payload), { status: 200 });
    const wrapped = deprecatedResponse(original, "/api/v1/items");
    const body = await wrapped.json();
    expect(body).toEqual(payload);
  });
});
