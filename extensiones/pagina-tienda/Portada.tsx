/**
 * El héroe de la portada (como el de Musa, `pagina-musa/Portada.tsx`): título
 * grande con su segunda línea en el acento, una frase y UN botón lleno al
 * catálogo; al lado, un panel gris plano con la foto.
 *
 * El texto sale de `contenido.heroe` (el editor de la portada o, si falta, el
 * nombre y el lema del negocio). La foto: la del héroe; sin ella, un mosaico
 * con hasta 4 fotos de productos; sin ninguna foto (p. ej. una pizzería que
 * todavía no subió fotos), el sello grande con la inicial: nunca una imagen rota.
 */
import { ArrowRight } from "@buleje/design-system/icons";
import type { ContenidoTienda, NegocioTienda, ProductoTienda } from "./contenido";
import { EnlaceVer } from "./PortadaPartes";
import { Sello } from "./Sello";
import { ANCHO, BOTON, rutasTienda } from "./ui";

const PANEL = "relative mx-auto aspect-[16/10] w-full max-w-[36rem] overflow-hidden rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)] md:aspect-[4/3]";

function Mosaico({ fotos }: { fotos: readonly ProductoTienda[] }) {
  const n = fotos.length;
  const rejilla = n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2";
  return (
    <div className={`absolute inset-0 grid gap-1.5 p-1.5 ${rejilla}`}>
      {fotos.map((p, i) => (
        <a
          key={p.id}
          href={p.href}
          className={`ti-foco group relative overflow-hidden rounded-[var(--ti-radio-control)] bg-[var(--ti-fondo)] ${n === 3 && i === 0 ? "row-span-2" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- foto subida por el dueño (cualquier dominio): sin el paso de /_next/image */}
          <img
            src={p.imagen}
            alt={p.nombre}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--ti-dur-largo)] ease-[var(--ti-ease)] group-hover:scale-[1.03]"
          />
        </a>
      ))}
    </div>
  );
}

export function Portada({
  heroe,
  negocio,
  productos,
  mayorDescuento,
}: {
  heroe: ContenidoTienda["heroe"];
  negocio: Pick<NegocioTienda, "slug" | "nombre" | "logo">;
  productos: readonly ProductoTienda[];
  mayorDescuento: number | null;
}) {
  const r = rutasTienda(negocio.slug);
  const fotos = heroe.imagen ? [] : productos.filter((p) => p.imagen).slice(0, 4);
  return (
    <section aria-labelledby="ti-heroe" className="relative overflow-clip">
      <div className={`${ANCHO} grid items-center gap-6 pb-8 pt-6 md:grid-cols-2 md:gap-10 md:pb-14 md:pt-10 lg:gap-16`}>
        <div className="max-w-xl">
          <h2 id="ti-heroe" className="ti-titulo text-[length:var(--ti-t-heroe)] text-[var(--ti-texto)]">
            {heroe.titulo}
            {heroe.acento && <span className="block text-[var(--ti-acento)]"> {heroe.acento}</span>}
          </h2>
          {heroe.subtitulo && (
            <p className="mt-5 max-w-md text-pretty text-[length:var(--ti-t-cuerpo)] leading-relaxed text-[var(--ti-texto-2)] sm:text-lg">{heroe.subtitulo}</p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-1">
            <a href={r.catalogo} className={BOTON}>
              {heroe.boton} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            {mayorDescuento !== null && <EnlaceVer href={r.ofertas}>Ofertas hasta {mayorDescuento} %</EnlaceVer>}
          </div>
        </div>
        <div className={PANEL}>
          {heroe.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto del héroe subida por el dueño: sin el paso de /_next/image
            <img src={heroe.imagen} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : fotos.length > 0 ? (
            <Mosaico fotos={fotos} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <Sello nombre={negocio.nombre} logo={negocio.logo} className="h-[42%] w-auto aspect-square" />
              {/* Si el título ya es el nombre (héroe sin editar), no se repite debajo del sello. */}
              {heroe.titulo !== negocio.nombre && <p className="ti-nombre text-xl text-[var(--ti-texto-2)]">{negocio.nombre}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
