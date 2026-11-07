/**
 * lib/forestal/contactos-envio.server.ts
 *
 * A quién se le puede mandar un papel: los números ya usados + cuentas de
 * Adelantos + directorio forestal + proveedores, uno por número. Lo leen la
 * vista «Documentos del permiso» del Libro TH (`GET
 * /api/admin/forestal/contactos-envio`) y el asistente cuando le piden
 * «manda la resolución a Alex» (`lib/asistente/mandar-papel.server.ts`): la
 * MISMA lista con la MISMA regla de roles en los dos lados.
 *
 * Ley 29733: cada fuente de teléfonos entra sólo si el rol ya la puede leer en
 * su módulo; los números ya usados, sólo si salieron de fuentes que el rol lee
 * (los de antes, sin fuente, sólo admin y dueño).
 */

import { logger } from "@/lib/logger";
import { checkPermission, type Role } from "@/lib/auth/role-permissions";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import {
  guardadosVisibles,
  leerGuardados,
  unirContactos,
  type ContactoEnvio,
  type FuenteContacto,
  type FuenteGuardada,
} from "./contactos-envio";

type Otro = { nombre: string | null | undefined; telefono: string | null | undefined; fuente: Exclude<FuenteContacto, "envio"> };

/** Una fuente que falla no deja sin contactos: se loguea y se sigue con las demás. */
async function fuente(nombre: string, tenantId: string, leer: () => Promise<Otro[]>): Promise<Otro[]> {
  try {
    return await leer();
  } catch (err) {
    logger.warn(`[contactos-envio] no se pudo leer ${nombre}`, { error: String(err), tenantId });
    return [];
  }
}

/** Los contactos que este rol puede ver en este negocio (ya usados primero). Lanza si fallan las preferencias. */
export async function contactosDelNegocio(tenantId: string, role: string): Promise<ContactoEnvio[]> {
  const veAdelantos = checkPermission(role as Role, "adelantos", "read");
  const veProveedores = checkPermission(role as Role, "suppliers", "read");
  const puedeLeer = (f: FuenteGuardada) => (f === "adelantos" ? veAdelantos : f === "proveedor" ? veProveedores : true);
  const adminODueno = role === "admin" || role === "owner";
  const [prefs, adelantos, directorio, proveedores] = await Promise.all([
    AdminPreferencesDB.read(tenantId),
    veAdelantos
      ? fuente("adelantos", tenantId, async () =>
          (await AdelantosDB.listBeneficiarios(tenantId)).map((b) => ({ nombre: b.nombre, telefono: b.telefono, fuente: "adelantos" as const })),
        )
      : Promise.resolve([] as Otro[]),
    fuente("directorio", tenantId, async () =>
      (await ForestDirectorioDB.listarPartes(tenantId)).map((p) => ({ nombre: p.nombre, telefono: p.telefono, fuente: "directorio" as const })),
    ),
    veProveedores
      ? fuente("proveedores", tenantId, async () =>
          (await SuppliersDB.getAll(tenantId)).map((s) => ({ nombre: s.name, telefono: s.phone, fuente: "proveedor" as const })),
        )
      : Promise.resolve([] as Otro[]),
  ]);
  const guardados = guardadosVisibles(leerGuardados(prefs["contactosEnvio"]), { puedeLeer, adminODueno });
  return unirContactos(guardados, [...adelantos, ...directorio, ...proveedores]);
}
