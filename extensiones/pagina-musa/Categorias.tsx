/**
 * «Compra por categoría»: un arco por categoría sobre su tinte (cabello nude,
 * rostro rosa, cuerpo salvia, kits arena), con el envase ilustrado de un producto
 * real de esa categoría (el favorito, si hay; si no, el de `REPRESENTANTE`) y
 * cuántos hay hoy. Las vacías no salen. 2 × 2 en el celular, 4 en fila desde 1024 px.
 */
import { ArrowRight } from "@buleje/design-system/icons";
import { CATEGORIAS } from "./anuncios";
import type { ProductoSalon } from "./datos";
import { rutas } from "./destinos";
import { Cabecera, FOCO } from "./Salon";
import { Escenario, Ilustracion } from "./TarjetaProducto";
import { ANCHO } from "./ui";

/** El envase que mejor dice qué hay en cada categoría (catálogo impreso). */
const REPRESENTANTE: Readonly<Record<string, string>> = { Cabello: "MU001", Rostro: "MU012", Cuerpo: "MU017", "Kits y ofertas": "KT04" };

export function Categorias({ productos, servicios = [], slug }: { productos: readonly ProductoSalon[]; servicios?: readonly ProductoSalon[]; slug: string }) {
  const r = rutas(slug);
  const items = CATEGORIAS.map((c) => {
    const de = productos.filter((p) => p.categoria === c.nombre);
    const cara = de.find((p) => p.etiqueta?.toLowerCase() === "favorito") ?? de.find((p) => p.codigo === REPRESENTANTE[c.nombre]) ?? de[0];
    return { ...c, cuantos: de.length, cara, href: r.categoria(c.nombre) };
  }).filter((c) => c.cuantos > 0);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="mu-categorias" className="py-12 sm:py-24">
      <div className={ANCHO}>
        <Cabecera id="mu-categorias" kicker="Encuentra lo tuyo" titulo="Compra por" cursiva="categoría" centrado />
        <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {items.map((c) => (
            <li key={c.nombre}>
              <a href={c.href} className={`group flex h-full flex-col rounded-[var(--mu-radio-tarjeta)] focus-visible:rounded-[var(--mu-radio-tarjeta)]! ${FOCO}`}>
                <Escenario categoria={c.nombre} className="aspect-[4/5] rounded-b-2xl rounded-t-[999px] transition-transform duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)] group-hover:-translate-y-1">
                  {c.cara && (
                    <span className="absolute inset-x-[16%] bottom-[11%] top-[20%] transition-transform duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)] group-hover:-translate-y-1.5 group-hover:rotate-2">
                      <Ilustracion p={c.cara} sello="h-[40%] w-[40%]" />
                    </span>
                  )}
                  <span className="absolute bottom-3 right-3 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[var(--surface-raised)] px-2.5 text-[13px] font-semibold tabular-nums text-[var(--mu-acento-tinta)]">
                    {c.cuantos}
                    <span className="sr-only"> {c.cuantos === 1 ? "producto" : "productos"}</span>
                  </span>
                </Escenario>
                <span className="mt-3 flex items-center justify-between gap-2">
                  <span className="mu-display text-[26px] leading-none text-[var(--text-primary)] sm:text-[30px]">{c.corto}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--mu-acento-tinta)] transition-transform duration-[var(--mu-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
                </span>
                <span className="mt-1.5 hidden text-[length:var(--mu-t-chico)] leading-snug text-[var(--text-tertiary)] sm:line-clamp-2">{c.texto}</span>
              </a>
            </li>
          ))}
        </ul>
        {servicios.length > 0 && (
          <p className="mt-6 text-center text-[15px]">
            <a href="#servicios" className={`font-semibold text-[var(--mu-acento-tinta)] underline underline-offset-4 ${FOCO}`}>
              Ver los {servicios.length} servicios del salón
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
