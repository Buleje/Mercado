import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// ── Shared schemas ────────────────────────────────────────────────────────────
// Definidos una sola vez; re-usados en todas las registrations.

/** { error: string; code?: string } — shape estándar de todos los errores */
export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code:  z.string().optional(),
  })
  .openapi("ErrorResponse");

/** Encabezado de autenticación Bearer */
export const AuthHeaderSchema = z
  .object({
    authorization: z.string().regex(/^Bearer .+/),
  })
  .openapi("AuthHeader");

/** Paginación estándar para listados */
export const PaginationSchema = z
  .object({
    page:     z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total:    z.number().int().min(0),
  })
  .openapi("Pagination");
