/**
 * Alta y edición de repartidores desde el panel (Reparto › Equipo).
 *
 * Una sola regla para el alta (POST) y la edición (PUT): los mensajes salen
 * por campo para que la ventana los muestre al lado de cada casilla, en vez
 * del «Error al guardar» genérico de antes (17-10, P22).
 */
import { z } from "zod";

/** Celular peruano: 9 dígitos que empiezan con 9. */
export const TELEFONO_REPARTIDOR = /^9\d{8}$/;

const campos = {
  name: z.string().trim().min(1, "Escribe el nombre.").max(100, "Máximo 100 letras."),
  phone: z
    .string()
    .trim()
    .regex(TELEFONO_REPARTIDOR, "Escribe 9 dígitos que empiecen con 9, sin espacios (ej. 987654321)."),
  email: z.union([z.literal(""), z.string().trim().email("Ese correo no es válido.")]).optional(),
  zone: z.string().trim().min(1, "Elige la zona.").max(100),
  vehicleType: z.string().trim().max(50).optional(),
  fee: z
    .number({ error: "Escribe la tarifa en soles." })
    .nonnegative("La tarifa no puede ser negativa.")
    .max(500, "Revisa la tarifa: más de S/ 500 por entrega."),
  isActive: z.boolean().optional(),
};

export const PartnerAltaSchema = z.object({ ...campos, fee: campos.fee.optional() });
/** Editar: cualquier campo, ninguno obligatorio. La calificación no se edita a mano. */
export const PartnerCambioSchema = z.object(campos).partial();

/** Los errores de Zod, uno por campo (el primero de cada uno). */
export function camposConError(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const clave = String(i.path[0] ?? "form");
    if (!out[clave]) out[clave] = i.message;
  }
  return out;
}

/** «Ese teléfono ya es de …»: dice dónde buscarlo si está pausado o postuló. */
export function mensajeTelefonoRepetido(dueno: { name: string; isActive: boolean }): string {
  return dueno.isActive
    ? `Ese teléfono ya es de ${dueno.name}, que está en tu equipo.`
    : `Ese teléfono ya es de ${dueno.name}: está pausado o en Postulantes. Actívalo ahí en vez de darlo de alta otra vez.`;
}

/** El correo vacío se guarda como «sin correo». */
export function limpiarCorreo<T extends { email?: string }>(data: T): Omit<T, "email"> & { email?: string | null } {
  if (data.email === undefined) return data;
  return { ...data, email: data.email === "" ? null : data.email };
}
