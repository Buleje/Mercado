/**
 * Barra de abajo del celular (29-10, «panel cómodo en el celular»): Inicio fijo
 * + las 3 pestañas que esta persona más abre + «Menú». Antes eran siempre
 * Vender / Pedidos / Stock: en el aserradero ninguna de las tres existe y la
 * barra quedaba con Inicio solo.
 *
 * Usa el mismo contador que «Menú en tu orden» (`orden-por-uso.ts`, claves
 * «tab:vista») y la misma regla: sin 7 días de datos, o con «Orden de
 * siempre», van las de siempre. Puro; lo lee `AdminMobileBottomBar`.
 */
import { CLAVE_DESDE, DIAS_MINIMOS, DIAS_RECIENTES, diasDeDatos, type ContadorDeUso } from "@/lib/admin/orden-por-uso";

export const INICIO = "vendor-dashboard";
/** Las de siempre (Brandon 05-28: el día a día del bodeguero). */
export const DE_SIEMPRE = ["ventas-caja", "pedidos", "inventario"] as const;
export const LUGARES_DE_USO = 3;
const DIA_MS = 86_400_000;

/** Aperturas de cada pestaña en los últimos 30 días (todas sus vistas juntas). */
function usoPorPestana(contador: ContadorDeUso, ahora: number): Map<string, number> {
  const uso = new Map<string, number>();
  for (const [clave, v] of Object.entries(contador)) {
    if (clave === CLAVE_DESDE || v.n < 1 || ahora - v.ultima > DIAS_RECIENTES * DIA_MS) continue;
    const corte = clave.indexOf(":");
    const tab = corte < 0 ? clave : clave.slice(0, corte);
    uso.set(tab, (uso.get(tab) ?? 0) + v.n);
  }
  return uso;
}

/**
 * Qué pestañas van en la barra, en el orden del menú (así un lugar no salta de
 * casillero cada vez que cambia el conteo). `ids` = las pestañas que esta
 * persona puede abrir, en el orden del menú.
 */
export function pestanasDeLaBarra<T extends string>(
  ids: readonly T[],
  contador: ContadorDeUso | null,
  porUso: boolean,
  ahora: number = Date.now(),
): T[] {
  const candidatas = ids.filter((id) => id !== INICIO);
  const elegidas: T[] = [];
  if (porUso && contador && diasDeDatos(contador, ahora) >= DIAS_MINIMOS) {
    const uso = usoPorPestana(contador, ahora);
    const usadas = candidatas
      .map((id, i) => ({ id, i, n: uso.get(id) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.i - b.i);
    for (const x of usadas.slice(0, LUGARES_DE_USO)) elegidas.push(x.id);
  }
  /* Faltan lugares (sin datos, o usó menos de 3): las de siempre, después el menú. */
  const relleno = [...DE_SIEMPRE.filter((id) => candidatas.includes(id as T)), ...candidatas] as T[];
  for (const id of relleno) {
    if (elegidas.length >= LUGARES_DE_USO) break;
    if (!elegidas.includes(id)) elegidas.push(id);
  }
  elegidas.sort((a, b) => candidatas.indexOf(a) - candidatas.indexOf(b));
  return ids.includes(INICIO as T) ? [INICIO as T, ...elegidas] : elegidas;
}

const CORTAS: Record<string, string> = {
  "vendor-dashboard": "Inicio",
  "ventas-caja": "Vender",
  pedidos: "Pedidos",
  inventario: "Stock",
  plata: "Plata",
  clientes: "Clientes",
  rrhh: "Equipo",
  "ctp-libro-operaciones": "Libro CTP",
  "loth-libro-operaciones": "Libro TH",
  "forestal-lotes": "Lotes",
  "forestal-herramientas": "Herramientas",
  "forestal-tramites": "Trámites",
  "cacao-acopio": "Acopio",
  "guias-remision": "Guías",
  "notas-credito": "N. crédito",
  turnos: "Turnos",
  "asistente-ia": "IA",
  "metas-logros": "Metas",
  "por-cobrar": "Por cobrar",
  activos: "Activos",
  productos: "Ofertas",
};

/** El rótulo que entra en un casillero de 72-80 px: «Libro Títulos Hab. (Forestal)» → «Libro TH». */
export function etiquetaCorta(id: string, label: string): string {
  const fija = CORTAS[id];
  if (fija) return fija;
  const sinParentesis = label.replace(/\s*\(.*\)\s*$/, "").trim();
  if (sinParentesis.length <= 10) return sinParentesis;
  return sinParentesis.split(/\s+(?:&|y|de|e)\s+|\s+/)[0] ?? sinParentesis;
}
