/**
 * Grilla de promociones (1 grande + 2 apiladas) y la fila «Ofertas de la
 * semana». El % de cada banner es el mayor descuento REAL de su grupo
 * (historial de precios); si el grupo no tiene rebajas, el banner no promete
 * ninguna.
 *
 * En el celular los tres banners van en una fila que se desliza (apilados
 * medían ~1.200 px); desde 768 px, la grilla de 1 grande + 2 apiladas.
 */
import Image from "next/image";
import { ArrowRight } from "@buleje/design-system/icons";
import { PROMOS, type Promo } from "./anuncios";
import { Carril } from "./Carril";
import { mayorDescuentoDe, type ProductoSalon } from "./datos";
import { conDescuento, rutas } from "./destinos";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, ConAcento, TituloSeccion } from "./ui";

const TONO = {
  tinta: { fondo: "bg-[var(--mu-cacao)]", texto: "text-[var(--mu-sobre-cacao)]", kicker: "text-[var(--mu-acento)]", pastilla: "bg-[var(--mu-sobre-cacao)] text-[var(--mu-cacao)]" },
  rubor: { fondo: "bg-[var(--mu-nude-claro)]", texto: "text-[var(--text-primary)]", kicker: "text-[var(--mu-acento-tinta)]", pastilla: "bg-[var(--mu-acento-tinta)] text-[var(--surface-canvas)]" },
  salvia: { fondo: "bg-[var(--mu-crema)]", texto: "text-[var(--text-primary)]", kicker: "text-[var(--text-secondary)]", pastilla: "bg-[var(--text-primary)] text-[var(--surface-canvas)]" },
} as const;

function Banner({ promo, productos, slug, grande }: { promo: Promo; productos: ProductoSalon[]; slug: string; grande: boolean }) {
  const r = rutas(slug);
  const t = TONO[promo.tono];
  const oferta = conDescuento(promo.oferta, mayorDescuentoDe(productos, promo.grupo));
  const href = "categoria" in promo.grupo ? r.categoria(promo.grupo.categoria) : r.buscar(promo.grupo.marca);
  // Celular: todas iguales (texto a la izquierda, recorte a la derecha). Desde 768 px la grande crece.
  return (
    <a
      href={href}
      className={`noise-texture-bg group relative flex h-full min-h-[16rem] overflow-hidden rounded-[1.75rem] ${t.fondo} ${grande ? "md:row-span-2 md:flex-col lg:min-h-[38rem]" : "md:min-h-[17rem]"} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]`}
    >
      {grande && (
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 hidden h-[28rem] w-[28rem] rounded-full bg-[var(--mu-acento)]/25 blur-3xl md:block" />
      )}
      <div
        className={`relative z-10 flex max-w-[62%] flex-col justify-center p-6 sm:p-10 ${grande ? "md:max-w-none lg:max-w-[26rem] lg:flex-1 lg:justify-between" : ""}`}
      >
        <div>
          <p className={`text-sm font-semibold uppercase tracking-[var(--ls-wider)] ${t.kicker}`}>{promo.kicker}</p>
          <h3
            className={`mu-display mt-3 leading-[0.98] ${t.texto} ${grande ? "text-[2rem] sm:text-4xl md:text-5xl lg:text-6xl" : "text-[2rem] sm:text-4xl md:text-[2rem] lg:text-4xl"}`}
          >
            {promo.titulo}
          </h3>
          {oferta && <p className={`mt-4 inline-flex whitespace-nowrap rounded-full px-4 py-2 text-base font-bold sm:mt-5 sm:text-lg ${t.pastilla}`}>{oferta}</p>}
        </div>
        <span className={`mt-5 inline-flex items-center gap-2 self-start border-b-2 border-current pb-0.5 text-base font-semibold sm:mt-6 ${t.texto}`}>
          {promo.cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 right-0 flex h-full w-[46%] items-end justify-center ${grande ? "md:relative md:-mt-4 md:h-72 md:w-auto md:justify-center lg:absolute lg:mt-0 lg:h-[72%] lg:w-[86%] lg:justify-end" : "md:w-[48%]"}`}
      >
        {promo.imagenes.map((img, i) => (
          <Image
            key={img}
            src={`/demo/salon/${img}-recorte.svg`}
            alt=""
            width={600}
            height={600}
            className={`h-full w-auto max-w-none object-contain transition duration-500 group-hover:scale-[1.03] ${i > 0 ? "-ml-[22%] translate-y-[6%]" : ""}`}
          />
        ))}
      </div>
    </a>
  );
}

export function Promos({ productos, slug }: { productos: ProductoSalon[]; slug: string }) {
  const rebajados = productos.filter((p) => p.descuento).sort((a, b) => (b.descuento ?? 0) - (a.descuento ?? 0));
  const [grande, ...chicas] = PROMOS;
  return (
    <section id="ofertas" aria-labelledby="mu-ofertas" className="scroll-mt-24 py-9 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion
          id="mu-ofertas"
          kicker="Promociones"
          titulo="Ofertas que se notan en tu cabello"
          verTodo={rebajados.length ? { href: rutas(slug).ofertas, texto: "Ver todas las ofertas" } : undefined}
        />
        {grande && (
          <div
            role="region"
            aria-label="Promociones"
            tabIndex={0}
            className="mu-sin-barra -mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0 md:pb-0"
          >
            <div className="flex gap-3 sm:gap-5 md:grid md:grid-cols-2">
              {[grande, ...chicas].map((p, i) => (
                <div key={p.titulo} className={`w-[86%] shrink-0 snap-start sm:w-[60%] md:w-auto ${i === 0 ? "md:row-span-2" : ""}`}>
                  <Banner promo={p} productos={productos} slug={slug} grande={i === 0} />
                </div>
              ))}
            </div>
          </div>
        )}
        {rebajados.length > 0 && (
          <div className="mt-8 sm:mt-14">
            <h3 className="mu-serif mb-4 text-[1.75rem] leading-tight text-[var(--text-primary)] sm:mb-5 sm:text-3xl">
              <ConAcento texto="Ofertas de la semana" />
            </h3>
            <Carril etiqueta="Ofertas de la semana">
              {rebajados.map((p) => (
                <TarjetaProducto key={p.id} p={p} />
              ))}
            </Carril>
          </div>
        )}
      </div>
    </section>
  );
}
