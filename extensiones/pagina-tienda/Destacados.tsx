/**
 * «Destacados» (como los carriles de Musa): primero lo que el dueño marcó
 * (una etiqueta como «Nuevo» o «Más vendido») y lo que tiene descuento, el
 * mayor descuento antes; si no alcanza, se completa con lo más reciente.
 * Sin ningún marcado, el bloque se llama «Lo más nuevo» (no se finge una
 * selección que nadie hizo).
 */
import type { ProductoTienda } from "./contenido";
import { EnlaceVer, TituloBloque } from "./PortadaPartes";
import { PortadaCarril } from "./PortadaCarril";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, SECCION, rutasTienda } from "./ui";

const CUANTOS = 10;

export function elegirDestacados(productos: readonly ProductoTienda[]): { lista: ProductoTienda[]; marcados: boolean } {
  const marcados = productos
    .filter((p) => p.etiqueta || p.descuento)
    .sort((a, b) => (b.descuento ?? 0) - (a.descuento ?? 0) || b.id - a.id)
    .slice(0, CUANTOS);
  const usados = new Set(marcados.map((p) => p.id));
  const nuevos = productos
    .filter((p) => !usados.has(p.id))
    .sort((a, b) => b.id - a.id)
    .slice(0, CUANTOS - marcados.length);
  return { lista: [...marcados, ...nuevos], marcados: marcados.length > 0 };
}

export function Destacados({
  productos,
  slug,
  nombres,
}: {
  productos: readonly ProductoTienda[];
  slug: string;
  /** Clave de categoría → cómo se lee (el nombre que le puso el dueño). */
  nombres: ReadonlyMap<string, string>;
}) {
  const { lista, marcados } = elegirDestacados(productos);
  if (lista.length < 2) return null;
  const r = rutasTienda(slug);
  const hayOfertas = lista.some((p) => p.descuento);
  const ver = marcados ? (hayOfertas ? r.ofertas : r.catalogo) : `${r.catalogo}?orden=nuevos`;
  return (
    <section aria-labelledby="ti-destacados" className={SECCION}>
      <div className={ANCHO}>
        <TituloBloque
          id="ti-destacados"
          titulo={marcados ? "Destacados" : "Lo más nuevo"}
          accion={<EnlaceVer href={ver}>{marcados && hayOfertas ? "Ver ofertas" : "Ver todo"}</EnlaceVer>}
        />
        <PortadaCarril etiqueta={marcados ? "Productos destacados" : "Lo más nuevo"}>
          {lista.map((p, i) => (
            <TarjetaProducto key={p.id} p={p} nombreCategoria={nombres.get(p.categoria)} prioridad={i < 2} />
          ))}
        </PortadaCarril>
      </div>
    </section>
  );
}
