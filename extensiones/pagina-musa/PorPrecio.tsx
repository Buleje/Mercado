/**
 * Atajos para elegir rápido (11-10): «Menos de S/ 50», «Todo Musa» y, si el
 * panel marca alguno, «Favoritos de Drucila». Un solo carril con pestañas
 * (antes eran dos secciones de una pantalla cada una).
 *
 * Sin «Más vendidos» ni «Lo nuevo»: el manual prohíbe decir «el más vendido» sin
 * datos (y el pedido va por WhatsApp: el sistema no cuenta ventas) y, hasta el
 * lanzamiento, todo es nuevo. Los kits y dúos tienen su bloque (`Kits.tsx`).
 */
import { CATEGORIAS } from "./anuncios";
import { Carril } from "./Carril";
import type { ProductoSalon } from "./datos";
import { rutas } from "./destinos";
import { Pestanas, type Pestana } from "./Pestanas";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, EnlaceVer, TituloBloque } from "./ui";

/** «Menos de S/ 50»: estrictamente menos (los de S/ 49 entran, uno de S/ 50 no). */
export const TOPE_ECONOMICO = 50;

const ORDEN_CATEGORIA: readonly string[] = CATEGORIAS.map((c) => c.nombre);
const porLinea = (a: ProductoSalon, b: ProductoSalon) =>
  ORDEN_CATEGORIA.indexOf(a.categoria) - ORDEN_CATEGORIA.indexOf(b.categoria) || (a.codigo ?? "").localeCompare(b.codigo ?? "") || a.id - b.id;

function fila(etiqueta: string, lista: readonly ProductoSalon[]) {
  return (
    <Carril etiqueta={etiqueta}>
      {lista.map((p) => (
        <TarjetaProducto key={p.id} p={p} />
      ))}
    </Carril>
  );
}

export function PorPrecio({ productos, slug }: { productos: readonly ProductoSalon[]; slug: string }) {
  const r = rutas(slug);
  const sueltos = productos.filter((p) => !p.kit && p.categoria !== "Kits y ofertas").sort(porLinea);
  if (sueltos.length === 0) return null;
  const economicos = sueltos.filter((p) => p.precio < TOPE_ECONOMICO).sort((a, b) => a.precio - b.precio || porLinea(a, b));
  const favoritos = sueltos.filter((p) => p.etiqueta?.toLowerCase() === "favorito");
  const pestanas: Pestana[] = [
    ...(economicos.length
      ? [{ texto: `Menos de S/ ${TOPE_ECONOMICO}`, cuantos: economicos.length, panel: fila(`Menos de S/ ${TOPE_ECONOMICO}`, economicos), verTodo: <EnlaceVer href={`${r.catalogo}?orden=precio-asc`}>Ver del menor precio</EnlaceVer> }]
      : []),
    { texto: "Todo Musa", cuantos: sueltos.length, panel: fila("Todo Musa", sueltos), verTodo: <EnlaceVer href={r.catalogo}>Ver el catálogo ({productos.length})</EnlaceVer> },
    ...(favoritos.length ? [{ texto: "Favoritos de Drucila", cuantos: favoritos.length, panel: fila("Favoritos de Drucila", favoritos), verTodo: <EnlaceVer href={r.catalogo}>Ver el catálogo</EnlaceVer> }] : []),
  ];
  return (
    <section aria-labelledby="mu-precio" className="py-12 sm:py-16">
      <div className={ANCHO}>
        <TituloBloque id="mu-precio" titulo="Encuentra lo tuyo" acento="rápido" texto="Agrégalo a tu bolsa: Drucila te confirma por WhatsApp." />
        <Pestanas etiqueta="Atajos para elegir" pestanas={pestanas} />
      </div>
    </section>
  );
}
