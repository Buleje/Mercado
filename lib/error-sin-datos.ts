/**
 * El error de una escritura del log, SIN su mensaje: el de Prisma trae los
 * valores del renglón (el `detail` puede llevar un DNI o un nombre) y los logs
 * van a Sentry. Nombre y código alcanzan para saber qué pasó (security 23-09).
 */
export function errorSinDatos(err: unknown): { nombre: string; codigo?: string } {
  const e = err as { name?: unknown; code?: unknown } | null;
  return {
    nombre: typeof e?.name === "string" ? e.name : typeof err,
    ...(typeof e?.code === "string" ? { codigo: e.code } : {}),
  };
}
