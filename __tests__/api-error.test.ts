/**
 * __tests__/api-error.test.ts
 *
 * Unit tests for lib/api-error.ts — ApiError hierarchy, toPayload, toErrorPayload, newTraceId.
 */

import { describe, it, expect } from "vitest";
import {
  ApiError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  PlanLimitError,
  ServiceUnavailableError,
  toErrorPayload,
  newTraceId,
} from "@/lib/api-error";

// ── ApiError base class ───────────────────────────────────────────────────────

describe("ApiError — base class", () => {
  it("creates error with correct code, message and httpStatus", () => {
    const err = new ApiError("MY_CODE", "algo salió mal", 422);
    expect(err.code).toBe("MY_CODE");
    expect(err.message).toBe("algo salió mal");
    expect(err.httpStatus).toBe(422);
    expect(err.name).toBe("ApiError");
  });

  it("defaults httpStatus to 400", () => {
    const err = new ApiError("CODE", "msg");
    expect(err.httpStatus).toBe(400);
  });

  it("toPayload returns correct shape without traceId", () => {
    const err = new ApiError("E001", "error de prueba", 400);
    const payload = err.toPayload();
    expect(payload.error.code).toBe("E001");
    expect(payload.error.message).toBe("error de prueba");
    expect(payload.error.traceId).toBeUndefined();
  });

  it("toPayload includes traceId when provided", () => {
    const err = new ApiError("E001", "msg", 400);
    const payload = err.toPayload("trace-xyz");
    expect(payload.error.traceId).toBe("trace-xyz");
  });

  it("toPayload includes details when present", () => {
    const err = new ApiError("E001", "msg", 400, { field: "email" });
    const payload = err.toPayload();
    expect(payload.error.details).toEqual({ field: "email" });
  });

  it("toPayload does NOT include details key when details is undefined", () => {
    const err = new ApiError("E001", "msg", 400);
    const payload = err.toPayload();
    expect("details" in payload.error).toBe(false);
  });
});

// ── Concrete error types ──────────────────────────────────────────────────────

describe("ValidationError", () => {
  it("has code VALIDATION_ERROR and status 400", () => {
    const err = new ValidationError("campo requerido");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.httpStatus).toBe(400);
  });

  it("accepts optional details", () => {
    const err = new ValidationError("error", { field: "name" });
    expect(err.details).toEqual({ field: "name" });
  });
});

describe("NotFoundError", () => {
  it("has code NOT_FOUND and status 404", () => {
    const err = new NotFoundError("Producto");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.httpStatus).toBe(404);
    expect(err.message).toContain("Producto");
  });
});

describe("UnauthorizedError", () => {
  it("has code UNAUTHORIZED and status 401", () => {
    const err = new UnauthorizedError();
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.httpStatus).toBe(401);
  });

  it("accepts custom message", () => {
    const err = new UnauthorizedError("Token inválido");
    expect(err.message).toBe("Token inválido");
  });
});

describe("ForbiddenError", () => {
  it("has code FORBIDDEN and status 403", () => {
    const err = new ForbiddenError();
    expect(err.code).toBe("FORBIDDEN");
    expect(err.httpStatus).toBe(403);
  });
});

describe("ConflictError", () => {
  it("has code CONFLICT and status 409", () => {
    const err = new ConflictError("ya existe");
    expect(err.code).toBe("CONFLICT");
    expect(err.httpStatus).toBe(409);
  });
});

describe("PlanLimitError", () => {
  it("has code PLAN_LIMIT_EXCEEDED and status 402", () => {
    const err = new PlanLimitError("productos", 50, 50, "free");
    expect(err.code).toBe("PLAN_LIMIT_EXCEEDED");
    expect(err.httpStatus).toBe(402);
  });

  it("includes limit details in the details payload", () => {
    const err = new PlanLimitError("pedidos", 200, 200, "free");
    expect(err.details).toMatchObject({ resource: "pedidos", current: 200, limit: 200, plan: "free" });
  });
});

describe("ServiceUnavailableError", () => {
  it("has code SERVICE_UNAVAILABLE and status 503", () => {
    const err = new ServiceUnavailableError();
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
    expect(err.httpStatus).toBe(503);
  });

  it("uses provided service name in message", () => {
    const err = new ServiceUnavailableError("base de datos");
    expect(err.message).toContain("base de datos");
  });
});

// ── toErrorPayload helper ─────────────────────────────────────────────────────

describe("toErrorPayload", () => {
  it("maps ApiError correctly", () => {
    const err = new ValidationError("campo inválido");
    const { payload, status } = toErrorPayload(err);
    expect(status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.message).toBe("campo inválido");
  });

  it("wraps unknown Error as INTERNAL_ERROR 500", () => {
    const err = new Error("crash");
    const { payload, status } = toErrorPayload(err);
    expect(status).toBe(500);
    expect(payload.error.code).toBe("INTERNAL_ERROR");
    expect(payload.error.message).toBe("Error interno del servidor");
  });

  it("wraps non-Error thrown values as INTERNAL_ERROR 500", () => {
    const { payload, status } = toErrorPayload("something unexpected");
    expect(status).toBe(500);
    expect(payload.error.code).toBe("INTERNAL_ERROR");
  });

  it("forwards traceId when provided", () => {
    const err = new NotFoundError("Cliente");
    const { payload } = toErrorPayload(err, "tid-abc");
    expect(payload.error.traceId).toBe("tid-abc");
  });
});

// ── newTraceId ────────────────────────────────────────────────────────────────

describe("newTraceId", () => {
  it("returns a non-empty string", () => {
    const id = newTraceId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newTraceId()));
    expect(ids.size).toBe(20);
  });

  it("contains a dash separator", () => {
    expect(newTraceId()).toContain("-");
  });
});
