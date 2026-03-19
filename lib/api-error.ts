/**
 * Typed API error classes with structured HTTP response shape.
 * All API routes should use these instead of raw Error objects.
 *
 * Response shape: { error: { code, message, details?, traceId? } }
 */

export interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
    traceId?: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toPayload(traceId?: string): ErrorPayload {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
        ...(traceId && { traceId }),
      },
    };
  }
}

// ── Concrete error types ────────────────────────────────────────────────────

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} no encontrado`, 404);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "No autorizado") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Acceso denegado") {
    super("FORBIDDEN", message, 403);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, 409, details);
  }
}

export class PlanLimitError extends ApiError {
  constructor(resource: string, current: number, limit: number, plan: string) {
    super(
      "PLAN_LIMIT_EXCEEDED",
      `Límite de ${resource} alcanzado para el plan ${plan} (${current}/${limit})`,
      402,
      { resource, current, limit, plan },
    );
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(service = "servicio") {
    super("SERVICE_UNAVAILABLE", `${service} no disponible temporalmente`, 503);
  }
}

/**
 * Build a structured error response from any thrown error.
 * Safe to use in catch blocks — never leaks stack traces to clients.
 */
export function toErrorPayload(
  err: unknown,
  traceId?: string,
): { payload: ErrorPayload; status: number } {
  if (err instanceof ApiError) {
    return { payload: err.toPayload(traceId), status: err.httpStatus };
  }
  // Unknown/unexpected error — do not expose internals
  return {
    payload: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Error interno del servidor",
        ...(traceId && { traceId }),
      },
    },
    status: 500,
  };
}

/** Generate a short trace ID for request correlation. */
export function newTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
