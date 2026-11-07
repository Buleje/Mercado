/**
 * Leer el cuerpo de un pedido con un tope de bytes.
 *
 * No se confía en `content-length` (puede faltar o mentir): se cuentan los
 * bytes al leer y se corta apenas pasa `max`, sin juntar el resto en memoria.
 * Nació en el comprobante de adelantos (10-10, revisión de `security`); desde
 * el 17-10 lo usan también las inspecciones de planta del superadmin (un PATCH
 * de 8 MB dejó el servidor lento 10 min).
 */

/** `"grande"` = pasó el tope; el lector se cancela. */
export async function cuerpoConTope(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | "grande"> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return "grande";
  if (!req.body) return new Uint8Array(0);
  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => undefined);
      return "grande";
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    todo.set(t, i);
    i += t.byteLength;
  }
  return todo;
}

/**
 * El cuerpo JSON con tope: `{ grande: true }` → 413; `valor: null` = vacío o
 * ilegible (la ruta lo rechaza con su `safeParse`, como antes con
 * `req.json().catch(() => null)`).
 */
export async function jsonConTope(req: Request, max: number): Promise<{ grande: true } | { grande: false; valor: unknown }> {
  const cuerpo = await cuerpoConTope(req, max);
  if (cuerpo === "grande") return { grande: true };
  try {
    return { grande: false, valor: JSON.parse(new TextDecoder().decode(cuerpo)) as unknown };
  } catch {
    return { grande: false, valor: null };
  }
}
