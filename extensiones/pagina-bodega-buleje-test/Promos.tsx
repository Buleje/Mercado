/**
 * Grilla de promociones (1 grande + 2 apiladas) y la fila «Ofertas de la
 * semana». El % de cada banner es el mayor descuento REAL de su grupo
 * (historial de precios); si el grupo no tiene rebajas, el banner no promete
 * ninguna.
 */
import Image from "next/image";
import { ArrowRight } from "@buleje/design-system/icons";
import { PROMOS, type Promo } from "./anuncios";
import { Carril } from "./Carril";
import { mayorDescuentoDe, type ProductoSalon } from "./datos";
import { conDescuento, rutas } from "./destinos";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, TituloSeccion } from "./ui";

const TONO = {
  tinta: { fondo: "bg-[var(--bb-tinta)]", texto: "text-[var(--bb-sobre-tinta)]", kicker: "text-[var(--bb-oro)]", pastilla: "bg-[var(--bb-sobre-tinta)] text-[var(--bb-tinta)]" },
  rubor: { fondo: "bg-[var(--bb-rubor)]", texto: "text-[var(--text-primary)]", kicker: "text-[var(--bb-vino)]", pastilla: "bg-[var(--bb-vino)] text-[var(--surface-canvas)]" },
  salvia: { fondo: "bg-[var(--bb-salvia)]", texto: "text-[var(--text-primary)]", kicker: "text-[var(--text-secondary)]", pastilla: "bg-[var(--text-primary)] text-[var(--surface-canvas)]" },
} as const;

function Banner({ promo, productos, slug, grande }: { promo: Promo; productos: ProductoSalon[]; slug: string; grande: boolean }) {
  const r = rutas(slug);
  const t = TONO[promo.tono];
  const oferta = conDescuento(promo.oferta, mayorDescuentoDe(productos, promo.grupo));
  const href = "categoria" in promo.grupo ? r.categoria(promo.grupo.categoria) : r.buscar(promo.grupo.marca);
  return (
    <a
      href={href}
      className={`group relative flex overflow-hidden rounded-3xl ${t.fondo} ${grande ? "flex-col md:row-span-2 lg:min-h-[38rem]" : "min-h-[17rem]"} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]`}
    >
      {grande && (
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-[28rem] w-[28rem] rounded-full bg-[var(--bb-oro)]/25 blur-3xl" />
      )}
      <div className={`relative z-10 flex flex-col p-6 sm:p-10 ${grande ? "lg:max-w-[26rem] lg:flex-1 lg:justify-between" : "max-w-[62%] justify-center"}`}>
        <div>
          <p className={`text-sm font-semibold uppercase tracking-[0.22em] ${t.kicker}`}>{promo.kicker}</p>
          <h3 className={`bb-serif mt-3 leading-[1.02] tracking-tight ${t.texto} ${grande ? "text-5xl lg:text-6xl" : "text-[1.75rem] sm:text-4xl md:text-[2rem] lg:text-4xl"}`}>
            {promo.titulo}
          </h3>
          {oferta && <p className={`mt-5 inline-flex whitespace-nowrap rounded-full px-4 py-2 text-base font-bold sm:text-lg ${t.pastilla}`}>{oferta}</p>}
        </div>
        <span className={`mt-6 inline-flex items-center gap-2 border-b-2 border-current pb-0.5 text-base font-semibold ${t.texto} self-start`}>
          {promo.cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none flex items-end ${grande ? "relative -mt-4 h-56 justify-center sm:h-72 lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:h-[72%] lg:w-[86%] lg:justify-end" : "absolute bottom-0 right-0 h-full w-[48%] justify-center"}`}
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
    <section id="ofertas" aria-labelledby="bb-ofertas" className="scroll-mt-24 py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion
          id="bb-ofertas"
          kicker="Promociones"
          titulo="Ofertas que se notan en tu cabello"
          verTodo={rebajados.length ? { href: rutas(slug).ofertas, texto: "Ver todas las ofertas" } : undefined}
        />
        {grande && (
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            <Banner promo={grande} productos={productos} slug={slug} grande />
            {chicas.map((p) => (
              <Banner key={p.titulo} promo={p} productos={productos} slug={slug} grande={false} />
            ))}
          </div>
        )}
        {rebajados.length > 0 && (
          <div className="mt-12">
            <h3 className="bb-serif mb-5 text-3xl text-[var(--text-primary)]">Ofertas de la semana</h3>
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
