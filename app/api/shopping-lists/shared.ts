import type { AdminRole } from "@/lib/session";
import { z } from "zod";

/**
 * Quién usa las listas de compra en el panel: la fila `shopping-lists` de
 * `lib/auth/role-permissions.ts` (read = cajero, almacenero, analista y la
 * gerencia; write = la gerencia). `requireAdmin` deja pasar siempre a
 * admin/owner/manager.
 */
export const LEEN_LISTAS: readonly AdminRole[] = [
  "admin",
  "owner",
  "manager",
  "cajero",
  "almacenero",
  "analista",
];

export const ESCRIBEN_LISTAS: readonly AdminRole[] = ["admin", "owner", "manager"];

/** Alta de una lista (antes el cuerpo iba directo a la DB sin validar). */
export const ListaSchema = z.object({
  customerPhone: z.string().trim().min(6).max(20),
  name: z.string().trim().min(1).max(100),
  items: z
    .array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive() }))
    .max(200)
    .default([]),
});
