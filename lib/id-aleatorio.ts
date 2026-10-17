/**
 * UUID v4 que funciona también en `http://` por IP local (el celular en la red
 * de la casa abriendo `http://192.168.x.x:3000`): `crypto.randomUUID` sólo
 * existe en contextos seguros y ahí tiraba `TypeError`; `getRandomValues` está
 * en todos (revisión 08-10, firma de recibos y alta de adelantos).
 */
export function idAleatorio(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
