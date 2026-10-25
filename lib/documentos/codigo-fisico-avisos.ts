/**
 * ADR-516 — Aviso en la campana: papeles con código que todavía no se anotó en
 * el papel físico (Brandon 24-10: «avisos para ponerlo y ponerme al día»).
 *
 * Uno por día como máximo (la fecha de Lima va en el `entityId`: el de ayer
 * queda resuelto solo con `sincronizarAvisos`) y sólo si hay alguno que lleva
 * `DIAS_AVISO_CODIGO_FISICO` días o más sin marcar: lo recién subido todavía no
 * es un atraso. Sólo campana, sin WhatsApp ni correo. Puro: se testea.
 */

export const TIPO_AVISO_CODIGO_FISICO = "DOC_CODIGO_FISICO_PENDIENTE";

/** Días desde la subida a partir de los cuales un código sin poner ya se avisa. */
export const DIAS_AVISO_CODIGO_FISICO = 2;

/** La vista del Archivo que lista los pendientes. */
export const URL_CODIGO_PENDIENTE = "/admin?tab=documentos&vista=drive&sub=codigo";

export interface AvisoCodigoFisico {
  type: string;
  severity: "MEDIUM";
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  entityId: string;
}

const diaDeLima = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function avisoCodigoFisico(args: { pendientes: number; atrasados: number; hoy: Date }): AvisoCodigoFisico[] {
  const { pendientes, atrasados, hoy } = args;
  if (atrasados <= 0 || pendientes <= 0) return [];
  const papeles = (n: number) => `${n} ${n === 1 ? "papel" : "papeles"}`;
  return [
    {
      type: TIPO_AVISO_CODIGO_FISICO,
      severity: "MEDIUM",
      title: `${papeles(pendientes)} por registrar`,
      body:
        atrasados === pendientes
          ? `Escríbele su código (DOC-…) al papel con la palabra Registrado y márcalo en el Archivo.`
          : `${papeles(atrasados)} llevan ${DIAS_AVISO_CODIGO_FISICO} días o más. Escríbeles su código (DOC-…) con la palabra Registrado y márcalos como registrados.`,
      actionUrl: URL_CODIGO_PENDIENTE,
      actionLabel: "Ver pendientes",
      entityId: `pendientes:${diaDeLima(hoy)}`,
    },
  ];
}
