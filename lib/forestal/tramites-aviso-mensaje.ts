/**
 * tramites-aviso-mensaje — los textos de los avisos automáticos del módulo,
 * en un solo lugar para que el botón manual y el cron digan exactamente lo
 * mismo. PURO: sin Prisma ni fetch, importable desde cliente o servidor.
 */
import { diasDesdePresentacion, type TramiteRegistro } from "./tramites-registro";

export function mensajeAvisoTramites(porVencer: (TramiteRegistro & { diasRestantes: number })[]): string {
  const lineas = porVencer.map((t) => {
    const cuando =
      t.diasRestantes < 0
        ? `venció hace ${Math.abs(t.diasRestantes)} ${Math.abs(t.diasRestantes) === 1 ? "día" : "días"}`
        : t.diasRestantes === 0
          ? "vence hoy"
          : `vence en ${t.diasRestantes} ${t.diasRestantes === 1 ? "día" : "días"}`;
    return `• ${t.formatoNombre}${t.expedienteAutoridad ? ` (${t.expedienteAutoridad})` : ""} — ${cuando}`;
  });
  return [
    `⏰ Trámites que vencen pronto (${porVencer.length}):`,
    "",
    ...lineas,
    "",
    "Revisalos en el panel → Trámites y Oficios.",
  ].join("\n");
}

/**
 * El aviso de "N días sin respuesta" (`tramitesSinRespuesta`, cron
 * `tramites-sin-respuesta`) — no es un plazo legal, es el recordatorio de ir
 * a preguntar por el expediente en mesa de partes, mismo texto que ya usa el
 * banner de `TramitesExpediente`.
 */
export function mensajeAvisoSinRespuesta(sinRespuesta: TramiteRegistro[], hoy: Date): string {
  const lineas = sinRespuesta.map((t) => {
    const dias = diasDesdePresentacion(t, hoy) ?? 0;
    return `• ${t.formatoNombre}${t.expedienteAutoridad ? ` (${t.expedienteAutoridad})` : ""} — ${dias} días sin respuesta`;
  });
  return [
    `📋 Trámites sin respuesta de la autoridad (${sinRespuesta.length}):`,
    "",
    ...lineas,
    "",
    "No es un plazo legal, es la señal de ir a preguntar por el expediente en mesa de partes.",
    "Revisalos en el panel → Trámites y Oficios → Expediente.",
  ].join("\n");
}
