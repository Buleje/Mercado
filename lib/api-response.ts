import { NextResponse } from "next/server";

/**
 * Helpers de respuesta API unificados.
 * Usar en todos los route handlers para formato consistente.
 */

export function apiSuccess(data: unknown, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    { error: message, ...(details !== undefined ? { details } : {}) },
    { status }
  );
}
