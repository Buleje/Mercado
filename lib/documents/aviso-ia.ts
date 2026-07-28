/**
 * aviso-ia — el error crudo del proveedor de IA, dicho para quien atiende la
 * bodega.
 *
 * Sin esto, quedarse sin cupo diario se ve como "no pasó nada": el botón
 * termina, el contador de documentos sin describir no baja y nadie sabe por
 * qué. El mensaje tiene que decir tres cosas: qué pasó, qué NO se perdió, y
 * cuándo volver a intentar.
 *
 * Puro (sin red ni DB) para poder testearlo.
 */

/** "45m11.626s" → "45m11s": la precisión de milésimas no le sirve a nadie. */
function esperaLegible(bruto: string): string {
  return bruto.trim().replace(/(\d+)\.\d+s/g, "$1s");
}

export function motivoDeFalloIA(err: string): string {
  // El proveedor lo dice así: "Please try again in 45m11.626s."
  const espera = /try again in (.+?)\.(?:\s|$)/i.exec(err)?.[1];
  if (/rate limit|tokens per day|\bTPD\b|429/i.test(err)) {
    const cuando = espera ? ` (se libera en ${esperaLegible(espera)})` : "";
    return `El servicio de IA llegó a su tope por hoy${cuando}. El texto quedó guardado; volvé a describir más tarde.`;
  }
  if (/api key|unauthorized|\b401\b|\b403\b/i.test(err)) {
    return "El servicio de IA rechazó la credencial: revisá la API key configurada.";
  }
  return "El servicio de IA no respondió. El texto quedó guardado; probá de nuevo en un rato.";
}
