/**
 * Campos frecuentes de la emisión (F40): los clientes a los que ya les
 * emitiste ese tipo de comprobante, para elegirlos con un clic EN VEZ de
 * reescribir el RUC. Nunca se copian solos: la persona elige la sugerencia y
 * revisa antes de confirmar. Y si el RUC/DNI escrito ya salió antes con otro
 * nombre, se avisa junto al campo. Puro: se prueba solo.
 */
import type { DatosCliente } from "./emision-reglas";
import type { EDocument } from "./tipos";

export interface ClienteFrecuente {
  nombre: string;
  documento: string;
  veces: number;
}

const LARGO: Record<DatosCliente["tipo"], number> = { factura: 11, boleta: 8 };
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Clientes del mismo tipo, por documento; el nombre es el del comprobante más reciente. */
function agrupar(docs: readonly EDocument[], tipo: DatosCliente["tipo"]): ClienteFrecuente[] {
  const largo = LARGO[tipo];
  const porDoc = new Map<string, ClienteFrecuente>();
  for (const d of docs) {
    if (d.type !== tipo) continue;
    const documento = (d.clientRUC ?? "").replace(/\D/g, "");
    const nombre = (d.clientName ?? "").trim();
    if (documento.length !== largo || nombre.length < 2) continue;
    const previo = porDoc.get(documento);
    if (previo) previo.veces += 1;
    else porDoc.set(documento, { nombre, documento, veces: 1 }); // la lista llega de la más reciente a la más vieja
  }
  return [...porDoc.values()];
}

/**
 * Hasta `tope` sugerencias para lo escrito (nombre o número). Sin nada escrito,
 * los más frecuentes. No sugiere lo que ya está puesto tal cual.
 */
export function clientesFrecuentes(docs: readonly EDocument[], datos: DatosCliente, tope = 3): ClienteFrecuente[] {
  const todos = agrupar(docs, datos.tipo);
  const numero = datos.documento.replace(/\D/g, "");
  const texto = normal(datos.nombre);
  const yaPuesto = (c: ClienteFrecuente) => c.documento === numero && normal(c.nombre) === texto;
  const coincide = (c: ClienteFrecuente) => {
    if (numero) return c.documento.startsWith(numero);
    if (texto.length >= 2) return normal(c.nombre).includes(texto) || texto.includes(normal(c.nombre));
    return true;
  };
  return todos
    .filter((c) => !yaPuesto(c) && coincide(c))
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre))
    .slice(0, tope);
}

/** Si ese RUC/DNI completo ya salió con OTRO nombre, ese nombre (para avisar junto al campo). */
export function nombreAnteriorDistinto(docs: readonly EDocument[], datos: DatosCliente): string | null {
  const numero = datos.documento.replace(/\D/g, "");
  if (numero.length !== LARGO[datos.tipo] || datos.nombre.trim().length < 2) return null;
  const previo = agrupar(docs, datos.tipo).find((c) => c.documento === numero);
  if (!previo) return null;
  return normal(previo.nombre) === normal(datos.nombre) ? null : previo.nombre;
}
