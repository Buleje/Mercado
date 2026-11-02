/**
 * Piezas comunes de `/api/admin/ia/proveedores/**` (Buleje IA, ADR-528):
 * roles, esquemas Zod y la prueba de una clave antes de guardarla.
 */
import "server-only";
import type { AdminRole, SessionPayload } from "@/lib/session";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PROVEEDORES_IA, type ProveedorIaId, type ResultadoPrueba } from "@/lib/ia-proveedores/tipos";
import { conexionDe, listarModelos } from "@/lib/ia-proveedores/adaptador";

export const ROLES_IA: readonly AdminRole[] = ["admin", "owner"];

/**
 * `requireAdmin` deja pasar a `manager` siempre (nivel de gerencia). Ver la
 * lista sí; pegar, probar, cambiar o borrar la clave NO: con ella se gasta la
 * plata del negocio en el proveedor. `null` = sigue.
 */
export function soloDuenoOAdminIa(auth: SessionPayload): NextResponse | null {
  return soloAdminODueno(auth.role, "cambiar la clave de IA del negocio");
}

const texto = (max: number) => z.string().trim().max(max);
const clave = z.string().trim().min(1, "Pega la clave").max(500);
const modelo = z.string().trim().min(1, "Elige un modelo").max(200);
const baseUrl = z.string().trim().max(500);

export const probarSchema = z.object({
  proveedor: z.enum(PROVEEDORES_IA),
  clave: clave.optional(),
  configId: z.string().trim().min(1).max(40).optional(),
  baseUrl: baseUrl.optional(),
});

export const crearSchema = z.object({
  proveedor: z.enum(PROVEEDORES_IA),
  nombre: texto(80).optional(),
  modelo,
  modeloVision: modelo.nullable().optional(),
  baseUrl: baseUrl.nullable().optional(),
  clave,
  principal: z.boolean().optional(),
});

export const editarSchema = z
  .object({
    nombre: texto(80).optional(),
    modelo: modelo.optional(),
    modeloVision: modelo.nullable().optional(),
    baseUrl: baseUrl.nullable().optional(),
    clave: clave.optional(),
    principal: z.boolean().optional(),
    activo: z.boolean().optional(),
  })
  .strict();

export function idValido(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  return id && id.length <= 40 ? id : null;
}

export const noExiste = () =>
  NextResponse.json({ error: "not_found", message: "Ese modelo no está conectado en este negocio." }, { status: 404 });

/** Prueba una clave contra el `/models` del proveedor. No guarda nada. */
export async function probarClave(
  proveedor: ProveedorIaId,
  claveTexto: string,
  url?: string | null,
): Promise<ResultadoPrueba> {
  const con = conexionDe(proveedor, claveTexto, url);
  if (!con.ok) return { ok: false, estado: con.estado, mensaje: con.mensaje, modelos: [], latenciaMs: 0 };
  return listarModelos(con.conexion);
}

/**
 * ¿El modelo elegido está en la lista REAL? Lista vacía (Ollama a veces no la
 * da) = no se puede juzgar → pasa. Lección Groq: un modelo dado de baja falla
 * callado, mejor frenarlo al guardar.
 */
export function modeloFaltante(prueba: ResultadoPrueba, ...modelos: Array<string | null | undefined>): string | null {
  if (!prueba.ok || prueba.modelos.length === 0) return null;
  const ids = new Set(prueba.modelos.map((m) => m.id));
  return modelos.find((m) => m && !ids.has(m)) ?? null;
}
