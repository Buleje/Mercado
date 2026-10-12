/**
 * Los 5 círculos bajo el héroe (como Sephora y Natura): las 4 categorías del
 * panel con el envase que mejor las dice, sobre el tinte de su categoría, y la
 * asesoría de Drucila (el sello M, abre WhatsApp). Las vacías no salen. Los 5
 * en una fila (64 px en el celular, 112 px en la compu), sólo con su nombre:
 * cuántos hay lo dice el catálogo al entrar (menos texto en la 1.ª pantalla).
 */
import { CARTA, CIRCULOS } from "./anuncios";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, rutas } from "./destinos";
import { tinteDe } from "./imagenes";
import { WHATSAPP_MUSA } from "./pedido-whatsapp";
import { externo } from "./Salon";
import { Sello } from "./Sello";
import { Ilustracion } from "./TarjetaProducto";
import { ANCHO } from "./ui";

const DISCO =
  "relative block h-16 w-16 overflow-hidden rounded-full ring-1 ring-[var(--rule-soft)] transition-transform duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)] group-hover:-translate-y-1 sm:h-24 sm:w-24 lg:h-28 lg:w-28";
const ETIQUETA = "mt-2 text-center text-sm font-medium leading-tight text-[var(--text-primary)] sm:text-base";
const ENLACE = "group mu-foco flex w-full flex-col items-center rounded-2xl pb-1";

export function Circulos({ productos, slug, whatsapp }: { productos: readonly ProductoSalon[]; slug: string; whatsapp: string | null }) {
  const r = rutas(slug);
  const items = CIRCULOS.map((c) => {
    const de = productos.filter((p) => p.categoria === c.categoria);
    return { ...c, cuantos: de.length, cara: de.find((p) => p.codigo === c.codigo) ?? de[0] };
  }).filter((c) => c.cuantos > 0);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="mu-circulos" className="border-y border-[var(--rule-soft)] py-6 sm:py-10">
      <h2 id="mu-circulos" className="sr-only">
        Compra por categoría
      </h2>
      <ul className={`${ANCHO} grid grid-cols-5 items-start gap-2 sm:gap-6 lg:max-w-[64rem]`}>
        {items.map((c) => (
          <li key={c.categoria}>
            <a href={r.categoria(c.categoria)} className={ENLACE}>
              <span className={`${DISCO} ${tinteDe(c.categoria)}`}>
                {c.cara && <Ilustracion p={c.cara} cerca tamanos="7rem" sello="h-[56%] w-[56%]" />}
              </span>
              <span className={ETIQUETA}>{c.texto}</span>
            </a>
          </li>
        ))}
        <li>
          <a href={enlaceWhatsapp(whatsapp ?? WHATSAPP_MUSA, CARTA.mensaje)} {...externo} className={ENLACE}>
            <span className={`${DISCO} flex items-center justify-center bg-[var(--mu-rosa-claro)]`}>
              <Sello id="circulo" simple className="h-[64%] w-[64%]" />
            </span>
            <span className={ETIQUETA}>Asesoría gratis</span>
          </a>
        </li>
      </ul>
    </section>
  );
}
