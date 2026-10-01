/**
 * Enlace de WhatsApp con el número peruano bien armado.
 *
 * wa.me exige el código de país. El teléfono guardado (Customer.phone,
 * Fiado.customerId) puede venir en 9 dígitos locales O ya con "51" adelante
 * (datos legacy — ver ADR-119 en customers.db.ts) — anteponer "51" a ciegas
 * duplica el prefijo en el segundo caso, y no anteponerlo nunca deja el link
 * sin código de país en el primero.
 *
 * Esta regla (`startsWith("51")`) ya estaba probada en 4 lugares de Fiados
 * (FiadoModals.tsx, FiadosModule.tsx) pero clonada a mano cada vez — otros 3
 * lugares del mismo módulo la reimplementaron mal, sin el chequeo, y abrían
 * wa.me con un número inválido (audit-verificado 2026-08-26).
 */
export function telefonoWhatsAppPE(telefono?: string | null): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.startsWith("51") ? digitos : `51${digitos}`;
}

/** El link listo para un <a href> o window.open, o `null` sin teléfono usable. */
export function waLink(telefono: string | null | undefined, texto: string): string | null {
  const numero = telefonoWhatsAppPE(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
