/**
 * aviso-vencimiento — cómo se dice "esto se te vence" para que se entienda.
 *
 * El aviso de vencimiento es la promesa del drive ("te avisa antes de que
 * venzan"), y una licencia vencida en Perú es una multa. Por eso el texto tiene
 * que ser inequívoco: no es lo mismo "vence en 3 días" que "venció hace 3
 * días", y "ya vencido" a secas no dice si fue ayer o hace dos meses.
 *
 * Puro, para poder testearlo sin cron ni base.
 */

/** Días que faltan (negativo = ya pasó). Redondea hacia arriba: hoy = 0. */
export function diasHasta(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

/** "vence en 3 días" · "vence HOY" · "venció hace 5 días". */
export function textoCuando(dias: number): string {
  if (dias < -1) return `venció hace ${Math.abs(dias)} días`;
  if (dias === -1) return "venció ayer";
  if (dias === 0) return "vence HOY";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

/** Versión corta para la lista del WhatsApp: "en 5d" · "vencido hace 5d". */
export function textoCorto(dias: number): string {
  if (dias < 0) return `vencido hace ${Math.abs(dias)}d`;
  if (dias === 0) return "vence hoy";
  return `en ${dias}d`;
}

/**
 * El asunto del aviso. Lo vencido manda sobre lo que está por vencer: si hay
 * un papel ya caído, eso es lo primero que hay que leer.
 */
export function tituloAviso(docs: { dias: number }[]): string {
  const vencidos = docs.filter((d) => d.dias < 0).length;
  const total = docs.length;
  if (vencidos > 0 && vencidos === total) {
    return total === 1 ? "Documento VENCIDO" : `${total} documentos VENCIDOS`;
  }
  if (vencidos > 0) return `${vencidos} vencido${vencidos === 1 ? "" : "s"} y ${total - vencidos} por vencer`;
  return total === 1 ? "Documento por vencer" : `${total} documentos por vencer`;
}
