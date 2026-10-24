/**
 * Reglas del candado de credenciales del superadmin (compartidas cliente/servidor).
 *
 * El candado protege la pestaña «Credenciales» de la ficha de una tienda: antes de
 * ver los usuarios de ingreso, generar una contraseña nueva o entrar como la tienda,
 * el superadmin abre su candado personal (PIN, patrón o contraseña).
 *
 * Sin `server-only`: el asistente del navegador valida con las MISMAS reglas que el
 * servidor, para avisar antes de mandar. El servidor vuelve a validar siempre.
 */
import { z } from "zod";

export const TIPOS_CANDADO = ["pin", "patron", "contrasena"] as const;
export type TipoCandado = (typeof TIPOS_CANDADO)[number];

export const TipoCandadoSchema = z.enum(TIPOS_CANDADO);

export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const PATRON_MIN = 4;
export const CONTRASENA_MIN = 8;
export const CONTRASENA_MAX = 128;

export const NOMBRE_TIPO: Record<TipoCandado, string> = {
  pin: "PIN",
  patron: "Patrón",
  contrasena: "Contraseña",
};

/**
 * El patrón viaja como los números de las casillas tocadas, en orden, sin
 * separadores: «1475» = arriba-izquierda → centro → abajo-izquierda → centro-abajo.
 * Casillas 1-9 de izquierda a derecha y de arriba abajo; ninguna se repite.
 */
export function patronValido(s: string): boolean {
  if (!/^[1-9]+$/.test(s)) return false;
  if (s.length < PATRON_MIN || s.length > 9) return false;
  return new Set(s).size === s.length;
}

/** `null` = válido; si no, el motivo en palabras del superadmin. */
export function motivoSecretoInvalido(tipo: TipoCandado, secreto: string): string | null {
  if (tipo === "pin") {
    return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(secreto)
      ? null
      : `El PIN lleva de ${PIN_MIN} a ${PIN_MAX} números.`;
  }
  if (tipo === "patron") {
    return patronValido(secreto) ? null : `El patrón une al menos ${PATRON_MIN} puntos distintos.`;
  }
  if (secreto.length < CONTRASENA_MIN) return `La contraseña lleva al menos ${CONTRASENA_MIN} caracteres.`;
  if (secreto.length > CONTRASENA_MAX) return `La contraseña lleva a lo sumo ${CONTRASENA_MAX} caracteres.`;
  return null;
}

export const secretoValido = (tipo: TipoCandado, secreto: string) => motivoSecretoInvalido(tipo, secreto) === null;

/** Reautenticación: contraseña del superadmin y, si tiene 2FA, su código. */
export const ReauthSchema = z.object({
  contrasena: z.string().max(256).optional(),
  totpCode: z.string().max(12).optional(),
});
export type ReauthEntrada = z.infer<typeof ReauthSchema>;

/** Cuerpo del POST /api/superadmin/candado. */
export const CandadoPostSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("configurar"),
    tipo: TipoCandadoSchema,
    secreto: z.string().min(1).max(CONTRASENA_MAX),
    /** El secreto del candado que ya existe (para cambiarlo). */
    actual: z.string().max(CONTRASENA_MAX).optional(),
    /** Primera vez o «Olvidé mi candado»: contraseña (+ 2FA si lo tiene). */
    reauth: ReauthSchema.optional(),
  }),
  z.object({
    accion: z.literal("verificar"),
    secreto: z.string().min(1).max(CONTRASENA_MAX),
  }),
]);

/** Cuerpo del DELETE /api/superadmin/candado: borrar exige reautenticar. */
export const CandadoDeleteSchema = z.object({ reauth: ReauthSchema });

/** Lo que responde GET /api/superadmin/candado. */
export interface EstadoCandadoRespuesta {
  configurado: boolean;
  tipo: TipoCandado | null;
  /** ms epoch hasta el que el candado no acepta intentos (5 fallos seguidos). */
  bloqueadoHasta: number | null;
  /** ms epoch en que vence el desbloqueo vigente de esta sesión; `null` = cerrado. */
  desbloqueadoHasta: number | null;
  /** El superadmin tiene 2FA: la reautenticación pide también el código. */
  totpActivo: boolean;
}

/** «15 minutos», «2 horas»: cuánto dura un bloqueo, para el mensaje. */
export function duracionEnPalabras(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} minuto${min === 1 ? "" : "s"}`;
  const h = Math.ceil(min / 60);
  return `${h} hora${h === 1 ? "" : "s"}`;
}

/** Un usuario de ingreso de la tienda, tal como lo devuelve la ruta de credenciales. */
export interface UsuarioCredencial {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
  activo: boolean;
  /** El correo de la cuenta (sólo el dueño tiene uno: `Tenant.ownerEmail`). */
  correo: string | null;
  debeCambiarContrasena: boolean;
  dobleFactor: boolean;
  /** ISO del último ingreso registrado; `null` = nunca entró (o no quedó registro). */
  ultimoIngreso: string | null;
  /** El admin que el reset sin usuario elegido toma por defecto. */
  principal: boolean;
}

/** Lo que responde GET /api/superadmin/tenants/[slug]/credenciales (200). */
export interface CredencialesRespuesta {
  tienda: { slug: string; nombre: string; activa: boolean; telefonoDueno: string | null };
  ingreso: { url: string; fuente: "dominio" | "principal" | "subdominio" | "ruta" };
  usuarios: UsuarioCredencial[];
  desbloqueadoHasta: number;
  /** Tipo del candado del superadmin (para «Cambiar candado»: pedir el actual con su teclado). */
  tipoCandado: TipoCandado | null;
}
