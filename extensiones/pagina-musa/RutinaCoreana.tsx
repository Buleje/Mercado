/**
 * «Tu rutina coreana en 3 pasos» (Limpia → Trata → Protege): 1-2 productos por
 * paso con una línea de para qué sirve, precio de la base y «Agregar» (el mismo
 * contador de las tarjetas). Al pie, la rutina entera en su kit (KT02) con el
 * ahorro real (`p.kit`, cuentas del servidor). Un paso sin productos en la
 * tienda (oculto, borrado) no sale; sin ninguno, no sale el bloque.
 */
import { RUTINA_COREANA } from "./anuncios";
import { BotonAgregar } from "./BotonAgregar";
import type { ProductoSalon } from "./datos";
import { rutas, solesCortos } from "./destinos";
import { EnlaceFicha } from "./EnlaceFicha";
import { imagenDe } from "./imagenes";
import { Escenario, Ilustracion, PildoraAhorro } from "./TarjetaProducto";
import { ANCHO, EnlaceVer, TituloBloque } from "./ui";

const aProducto = (p: ProductoSalon) => ({
  id: p.id,
  name: p.nombre,
  category: p.categoria,
  price: p.precio,
  image: imagenDe(p).src ?? "",
  unit: p.unidad,
  ...(p.stock !== null ? { stock: p.stock } : {}),
});

function Fila({ p, para }: { p: ProductoSalon; para: string }) {
  return (
    <li data-mu-producto className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[5rem_minmax(0,1fr)]">
      <EnlaceFicha p={p} data-mu-foto tabIndex={-1} aria-hidden="true" className="block">
        <Escenario categoria={p.categoria} className="aspect-square rounded-xl">
          <Ilustracion p={p} cerca tamanos="5rem" sello="h-[50%] w-[50%]" />
        </Escenario>
      </EnlaceFicha>
      <div className="@container flex min-w-0 flex-col">
        <EnlaceFicha p={p} className="mu-foco line-clamp-2 rounded-sm font-medium leading-snug text-[var(--text-primary)] hover:underline hover:underline-offset-4">
          {p.nombre}
        </EnlaceFicha>
        <p className="mt-0.5 text-sm leading-snug text-[var(--text-secondary)]">{para}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="mu-precio-chico text-lg text-[var(--text-primary)]">{solesCortos(p.precio)}</span>
          <div className="min-w-[8rem] flex-1">
            <BotonAgregar producto={aProducto(p)} />
          </div>
        </div>
      </div>
    </li>
  );
}

export function RutinaCoreana({ productos, slug }: { productos: readonly ProductoSalon[]; slug: string }) {
  const porCodigo = new Map(productos.map((p) => [p.codigo, p]));
  const pasos = RUTINA_COREANA.pasos
    .map((s) => ({
      ...s,
      items: s.productos.flatMap((x) => {
        const p = porCodigo.get(x.codigo);
        return p ? [{ p, para: x.para }] : [];
      }),
    }))
    .filter((s) => s.items.length > 0);
  if (pasos.length === 0) return null;
  const kit = porCodigo.get(RUTINA_COREANA.kit);
  const ahorro = kit?.kit && kit.kit.ahorro > 0 ? kit.kit : null;
  return (
    <section aria-labelledby="mu-rutina" className="bg-[var(--mu-tinte-rostro)] py-12 sm:py-16">
      <div className={ANCHO}>
        <TituloBloque
          id="mu-rutina"
          titulo="Tu rutina coreana"
          acento="en 3 pasos"
          texto="La que arma Drucila para la piel en la selva: simple, de mañana y de noche."
          accion={
            <EnlaceVer href={rutas(slug).categoria("Rostro")} describe="mu-rutina">
              Ver todo rostro
            </EnlaceVer>
          }
        />
        <ol className="grid gap-4 md:grid-cols-3 md:gap-5">
          {pasos.map((s, i) => (
            <li key={s.verbo} className="mu-sombra-tarjeta rounded-[var(--mu-radio-tarjeta)] bg-[var(--surface-raised)] p-4 sm:p-5">
              <p className="flex items-baseline gap-3">
                <span aria-hidden="true" className="mu-num text-[2.5rem] leading-none text-[var(--mu-rosa-tinta)]">
                  {i + 1}
                </span>
                <span className="mu-titulo text-[2rem] leading-none text-[var(--text-primary)]">
                  <span className="sr-only">Paso {i + 1}: </span>
                  {s.verbo}
                </span>
                <span className="ml-auto text-sm text-[var(--text-tertiary)]">{s.cuando}</span>
              </p>
              <ul className="mt-4 grid gap-4">
                {s.items.map(({ p, para }) => (
                  <Fila key={p.id} p={p} para={para} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {kit && (
          <div data-mu-producto className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:mt-5 sm:p-5">
            <EnlaceFicha p={kit} data-mu-foto tabIndex={-1} aria-hidden="true" className="block w-16 shrink-0 sm:w-20">
              <Escenario categoria={kit.categoria} className="aspect-square rounded-xl">
                <Ilustracion p={kit} cerca tamanos="5rem" sello="h-[50%] w-[50%]" />
              </Escenario>
            </EnlaceFicha>
            <p className="min-w-[12rem] flex-1 leading-snug text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">Los 3 pasos en una caja: </span>
              <EnlaceFicha p={kit} className="mu-foco rounded-sm font-semibold text-[var(--text-primary)] underline decoration-[var(--mu-rosa)] decoration-2 underline-offset-4">
                {kit.nombre}
              </EnlaceFicha>{" "}
              a <span className="mu-precio-chico text-[var(--text-primary)]">{solesCortos(kit.precio)}</span>
              {ahorro && (
                <>
                  {" "}
                  (por separado {solesCortos(ahorro.porSeparado)}) <PildoraAhorro ahorro={ahorro.ahorro} />
                </>
              )}
            </p>
            <div className="w-full sm:w-auto">
              <BotonAgregar producto={aProducto(kit)} variante="grande" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
