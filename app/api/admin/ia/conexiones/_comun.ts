import { NextResponse } from "next/server";
import { z } from "zod";
import type { AdminRole, SessionPayload } from "@/lib/session";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * Compartido de /api/admin/ia/conexiones (Buleje IA, ADR-528, carril 4).
 *
 * Solo dueño o administrador: `requireAdmin` deja pasar a `manager` siempre
 * (nivel de gerencia), así que se corta otra vez con `soloAdminODueno`. Una
 * conexión opera el negocio con el usuario de quien la crea.
 */
export const ROLES_CONEXIONES: readonly AdminRole[] = ["admin", "owner"];

/** `null` = sigue; si no, el 403 para manager u otro rol que se haya colado. */
export function soloDuenoOAdmin(auth: SessionPayload): NextResponse | null {
  return soloAdminODueno(auth.role, "conectar un asistente de IA al negocio");
}

const nombre = z
  .string()
  .trim()
  .min(1, "Ponle un nombre (por ejemplo «ChatGPT de Brandon»).")
  .max(60, "El nombre va hasta 60 letras.");

export const crearSchema = z.object({ nombre, permiteEscribir: z.boolean().optional() }).strict();

export const editarSchema = z
  .object({ nombre: nombre.optional(), permiteEscribir: z.boolean().optional(), activo: z.boolean().optional() })
  .strict()
  .refine((d) => d.nombre !== undefined || d.permiteEscribir !== undefined || d.activo !== undefined, {
    message: "Nada que cambiar.",
  });

export function idValido(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  return /^[a-z0-9]{8,40}$/i.test(id) ? id : null;
}

export const noExiste = () =>
  NextResponse.json({ error: "not_found", message: "Esa conexión no existe en este negocio." }, { status: 404 });

/** La dirección que se pega en ChatGPT/Claude/Gemini/Cursor. */
export function urlMcp(): string | null {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/api/mcp` : null;
}
