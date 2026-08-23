/**
 * tramites-aviso-mensaje — el texto del aviso de "vence pronto", en un solo
 * lugar para que el botón manual (`TramiteAvisoWhatsApp`) y el cron diario
 * (`tramites-vencimiento`) digan exactamente lo mismo. PURO: sin Prisma ni
 * fetch, importable desde cliente o servidor.
 */
import type { TramiteRegistro } from "./tramites-registro";

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
