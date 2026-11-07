/**
 * «Elige por precio» (como «Encuentra lo tuyo» de Musa, `pagina-musa/PorPrecio.tsx`):
 * un carril con pestañas «Menos de S/ N» y «Todo». Los topes salen de los
 * precios reales del negocio: un tope vale si deja al menos 4 productos debajo
 * y alguno encima (si todo cuesta menos de S/ 20, «Menos de S/ 20» no ayuda a
 * elegir). Sin ningún tope que valga, no hay bloque.
 */
import type { ProductoTienda } from "./contenido";
import { EnlaceVer, TituloBloque } from "./PortadaPartes";
import { PortadaCarril } from "./PortadaCarril";
import { PortadaPestanas, type Pestana } from "./PortadaPestanas";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, SECCION, rutasTienda } from "./ui";

const TOPES = [10, 20, 30, 50, 100, 200, 500] as const;
const MINIMO = 4;
const POR_CARRIL = 12;
const MAX_TOPES = 2;

/** Los topes que ayudan a elegir: cada uno deja más productos que el anterior y no los deja a todos. */
export function topesDe(productos: readonly ProductoTienda[]): number[] {
  const elegidos: number[] = [];
  let anterior = 0;
  for (const t of TOPES) {
    const n = productos.filter((p) => p.precio < t).length;
    if (n >= MINIMO && n < productos.length && n > anterior) {
      elegidos.push(t);
      anterior = n;
      if (elegidos.length === MAX_TOPES) break;
    }
  }
  return elegidos;
}

export function PorPrecio({
  productos,
  slug,
  nombre,
  nombres,
}: {
  productos: readonly ProductoTienda[];
  slug: string;
  /** Nombre del negocio («Todo Pizza Pucallpa»). */
  nombre: string;
  nombres: ReadonlyMap<string, string>;
}) {
  const topes = topesDe(productos);
  if (topes.length === 0) return null;
  const r = rutasTienda(slug);
  const fila = (etiqueta: string, lista: readonly ProductoTienda[]) => (
    <PortadaCarril etiqueta={etiqueta}>
      {lista.slice(0, POR_CARRIL).map((p) => (
        <TarjetaProducto key={p.id} p={p} nombreCategoria={nombres.get(p.categoria)} />
      ))}
    </PortadaCarril>
  );
  const pestanas: Pestana[] = topes.map((t) => {
    const lista = productos.filter((p) => p.precio < t).sort((a, b) => a.precio - b.precio || a.id - b.id);
    const texto = `Menos de S/ ${t}`;
    return { texto, cuantos: lista.length, panel: fila(texto, lista), verTodo: <EnlaceVer href={r.porPrecio}>Ver del menor precio</EnlaceVer> };
  });
  const todos = [...productos].sort((a, b) => a.precio - b.precio || a.id - b.id);
  pestanas.push({
    texto: `Todo ${nombre}`.length > 28 ? "Todo" : `Todo ${nombre}`,
    cuantos: productos.length,
    panel: fila(`Todo ${nombre}`, todos),
    verTodo: <EnlaceVer href={r.catalogo}>Ver el catálogo ({productos.length})</EnlaceVer>,
  });
  return (
    <section aria-labelledby="ti-precio" className={SECCION}>
      <div className={ANCHO}>
        <TituloBloque id="ti-precio" titulo="Elige por precio" />
        <PortadaPestanas etiqueta="Elige por precio" pestanas={pestanas} />
      </div>
    </section>
  );
}
