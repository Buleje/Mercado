/**
 * El enlace de WhatsApp para hablarle a alguien del módulo.
 *
 * Estaba clonado en tres pantallas —Personas, Cobranza y Estado de cuenta— cada
 * una con su copia del prefijo 51 y su propio texto. Tres copias de una regla
 * de negocio (cómo se escribe un número peruano) son tres lugares donde
 * arreglarla, y el día que alguien cambie el mensaje va a cambiar uno solo.
 */

/**
 * Un celular peruano en el formato que espera wa.me: sólo dígitos, con código
 * de país. Los 9 dígitos locales llevan `51` adelante; lo que ya viene con
 * código se respeta tal cual.
 *
 * Devuelve `null` si no hay número usable: sin esto se armaba
 * `https://wa.me/?text=…`, un enlace que abre WhatsApp en la nada.
 */
export function telefonoWhatsApp(telefono?: string | null): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 9) return null;
  return digitos.length === 9 ? `51${digitos}` : digitos;
}

/**
 * Qué se le dice. Con saldo, el recordatorio de cobranza; sin saldo, un saludo
 * — mandarle «tenés pendiente S/ 0.00» a quien está al día es peor que no
 * escribirle.
 */
export function mensajeRecordatorio(nombre: string, saldo: number, moneda = "PEN"): string {
  if (!(saldo > 0)) return `Hola ${nombre}, ¿cómo estás?`;
  const monto =
    moneda === "USD"
      ? `$ ${saldo.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `S/ ${saldo.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Hola ${nombre}, te recuerdo que tenés un saldo pendiente de ${monto} por liquidar. ¡Gracias!`;
}

/** El enlace listo, o `null` si esa persona no tiene teléfono cargado. */
export function enlaceWhatsApp(telefono: string | null | undefined, nombre: string, saldo: number, moneda = "PEN"): string | null {
  const numero = telefonoWhatsApp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeRecordatorio(nombre, saldo, moneda))}`;
}

/** El mismo enlace, pero con un texto ya armado (estado de cuenta, por ejemplo). */
export function enlaceWhatsAppConTexto(telefono: string | null | undefined, texto: string): string | null {
  const numero = telefonoWhatsApp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
