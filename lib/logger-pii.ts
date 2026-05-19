/**
 * lib/logger-pii.ts
 *
 * Helpers de redacción de PII para logs. Ley 29733 PE Art. 16-18 (minimización).
 *
 * Brandon 2026-05-18 (pentest Sprint D #6): centralizar la redacción para que
 * cualquier código que loggee teléfonos, emails, DNIs lo haga consistente.
 * Antes los webhooks WhatsApp/MP loggeaban phone completo → un breach del log
 * filtra PII identificable.
 *
 * Patrón: mantener bastantes chars para correlación en debugging, sin permitir
 * lookup inverso desde el log (no útil para reconstruir identidad).
 *
 *   redactPhone("+51987654321") → "***4321"
 *   redactEmail("brandon@buleje.pe") → "b***@buleje.pe"
 *   redactDni("12345678") → "***5678"
 */

/**
 * Redacta un teléfono dejando solo los últimos 4 dígitos.
 * Acepta cualquier formato (+51 987 654 321, 987654321, etc.).
 */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `***${digits.slice(-4)}`;
}

/**
 * Redacta un email dejando solo la inicial del usuario + dominio.
 * No revela el username completo, pero el dominio queda visible para correlación.
 */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const first = email[0] ?? "*";
  const domain = email.slice(at);
  return `${first}***${domain}`;
}

/**
 * Redacta un DNI/RUC dejando solo los últimos 4 dígitos.
 */
export function redactDni(dni: string | null | undefined): string {
  if (!dni) return "";
  const digits = dni.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `***${digits.slice(-4)}`;
}

/**
 * Trunca texto libre a N chars para logs. Útil para `text` de mensajes
 * WhatsApp o `note` de órdenes. No es redacción semántica — solo evita logs
 * gigantes con todo el body de un mensaje.
 */
export function truncate(text: string | null | undefined, maxChars = 60): string {
  if (!text) return "";
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "…";
}
