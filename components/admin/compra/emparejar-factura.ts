/**
 * Empareja lo que dice la factura con tu catálogo por el MEJOR puntaje, no por
 * el primero que contenga el texto: antes «Arroz» caía en cualquier arroz y lo
 * que no encontraba se perdía sin avisar.
 *
 * Puntaje = coeficiente de Dice entre las palabras de los dos nombres (sin
 * tildes, separando «5KG» en «5 kg», sin «x», «de», «und»…). Se empareja solo
 * si el mejor pasa el umbral Y le saca ventaja al segundo; si no, el renglón
 * va a la lista de «no encontrados» con sus sugerencias para que elijas tú.
 */

const PALABRAS_VACIAS = new Set([
  "x", "de", "del", "la", "el", "los", "las", "y", "en", "con", "para", "por",
  "und", "unid", "unidad", "unidades", "un", "uni", "pza", "paq", "pq",
]);

/** Umbral para emparejar solo y ventaja mínima sobre el segundo candidato. */
export const UMBRAL_AUTOMATICO = 0.6;
export const VENTAJA_MINIMA = 0.15;
/** Por debajo de esto ni se sugiere. */
const UMBRAL_SUGERENCIA = 0.25;

export function palabras(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9.]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 0 && !PALABRAS_VACIAS.has(t));
}

export function puntaje(a: string, b: string): number {
  const A = new Set(palabras(a));
  const B = new Set(palabras(b));
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  return (2 * comunes) / (A.size + B.size);
}

export interface Candidato<P> {
  producto: P;
  puntaje: number;
}

export function candidatos<P extends { name: string }>(nombre: string, productos: P[], max = 5): Candidato<P>[] {
  return productos
    .map((producto) => ({ producto, puntaje: puntaje(nombre, producto.name) }))
    .filter((c) => c.puntaje >= UMBRAL_SUGERENCIA)
    .sort((x, y) => y.puntaje - x.puntaje)
    .slice(0, max);
}

/** El mejor candidato solo si es claro (umbral + ventaja sobre el segundo). */
export function mejorClaro<P>(lista: Candidato<P>[]): P | null {
  const [primero, segundo] = lista;
  if (!primero || primero.puntaje < UMBRAL_AUTOMATICO) return null;
  if (segundo && primero.puntaje - segundo.puntaje < VENTAJA_MINIMA) return null;
  return primero.producto;
}

export interface RenglonFactura {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Emparejado<P> {
  renglon: RenglonFactura;
  producto: P;
}

export interface Pendiente<P> {
  renglon: RenglonFactura;
  sugeridos: Candidato<P>[];
}

export function emparejarRenglones<P extends { name: string }>(
  renglones: RenglonFactura[],
  productos: P[],
): { encontrados: Emparejado<P>[]; pendientes: Pendiente<P>[] } {
  const encontrados: Emparejado<P>[] = [];
  const pendientes: Pendiente<P>[] = [];
  for (const renglon of renglones) {
    const lista = candidatos(renglon.nombre, productos);
    const producto = mejorClaro(lista);
    if (producto) encontrados.push({ renglon, producto });
    else pendientes.push({ renglon, sugeridos: lista });
  }
  return { encontrados, pendientes };
}

/** Proveedor por RUC (exacto) y, si no, por nombre con el mismo criterio que los productos. */
export function emparejarProveedor<S extends { name: string; ruc?: string | null }>(
  leido: { nombre: string; ruc?: string },
  proveedores: S[],
): S | null {
  const ruc = (leido.ruc ?? "").replace(/\D/g, "");
  if (ruc.length === 11) {
    const porRuc = proveedores.find((s) => (s.ruc ?? "").replace(/\D/g, "") === ruc);
    if (porRuc) return porRuc;
  }
  if (!leido.nombre.trim()) return null;
  return mejorClaro(candidatos(leido.nombre, proveedores));
}
