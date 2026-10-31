/**
 * Quién figura como actor en lo que LEE EL NEGOCIO (su registro de actividad,
 * avisos, chat con la plataforma, comprobantes). El usuario real del superadmin
 * es su usuario de ENTRADA: sólo va en el registro de la PLATAFORMA
 * (`logSuperadminAction`). Revisión de seguridad 23-10.
 */
export const EQUIPO_BULEJE = "Equipo Buleje";

/** Actor que ve el negocio, sea quien sea el superadmin que actuó. */
export function actorVisibleParaNegocio(): string {
  return EQUIPO_BULEJE;
}
