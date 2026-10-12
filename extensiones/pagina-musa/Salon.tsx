/**
 * Dos bloques propios de la portada de Musa (11-10, más corta y más clara):
 * · `Mejorar` (`#mejorar`) — «¿Qué quieres mejorar?»: 10 necesidades en botones
 *   compactos que llevan al catálogo filtrado, con cuántos productos hay DE VERDAD
 *   (la MISMA búsqueda de `filtros.ts`); con 0, a Drucila por WhatsApp.
 * · `Confianza` — las 3 señales del manual (originales con NSO, asesoría de
 *   Drucila, entrega en Constitución), cómo se paga y la garantía entera a un
 *   toque (`<details>`, sin JavaScript). Reemplaza a la carta «Hola, linda», al
 *   banner del diagnóstico, a «Tu compra está protegida» y a los beneficios,
 *   que repetían lo mismo en cuatro pantallas.
 * Sin hex: colores, fuentes y escalas salen de `tema.ts` (`--mu-*`, `.mu-*`).
 */
import { ArrowRight, ChevronDown, Droplets, Gift, MapPin, MessageCircle, Moon, ShieldCheck } from "@buleje/design-system/icons";
import { Smile, Sparkles, Sun, User, Waves, Wind } from "@buleje/design-system/icons";
import { CARTA, CONFIANZA, MEJORAR, PAGOS, PROTEGIDA } from "./anuncios";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, hrefDestino } from "./destinos";
import { coincide } from "./filtros";
import { WHATSAPP_MUSA } from "./pedido-whatsapp";
import { ANCHO, BOTON_WHATSAPP, TituloBloque } from "./ui";

export const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

const ICONOS_MEJORAR = {
  manchas: Sparkles,
  granitos: Smile,
  seca: Droplets,
  ojeras: Moon,
  frizz: Waves,
  caida: Wind,
  danado: ShieldCheck,
  sol: Sun,
  regalos: Gift,
  cuerpo: User,
} as const;

const ICONOS_CONFIANZA = { original: ShieldCheck, asesoria: MessageCircle, entrega: MapPin } as const;

type Necesidad = (typeof MEJORAR)[number];

/** Cuántos productos muestra el catálogo con ese filtro (la MISMA búsqueda de `filtros.ts`). */
function cuantos(productos: readonly ProductoSalon[], d: Necesidad["destino"]): number {
  if ("categoria" in d) return productos.filter((p) => p.categoria === d.categoria).length;
  if ("buscar" in d) return productos.filter((p) => coincide(p, d.buscar)).length;
  return 0;
}

function BotonNecesidad({ m, slug, productos, whatsapp }: { m: Necesidad; slug: string; productos: readonly ProductoSalon[]; whatsapp: string }) {
  const Icono = ICONOS_MEJORAR[m.icono];
  const n = cuantos(productos, m.destino);
  // 0 resultados: el enlace no lleva a un catálogo vacío, lleva a Drucila.
  const aDrucila = n === 0;
  const href = aDrucila ? enlaceWhatsapp(whatsapp, `Hola Drucila, quiero mejorar: ${m.titulo.toLowerCase()}. ¿Qué me recomiendas?`) : hrefDestino(m.destino, slug, whatsapp).href;
  return (
    <a
      href={href}
      {...(aDrucila ? externo : {})}
      className="group mu-foco flex h-full min-h-14 items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 transition-colors duration-[var(--mu-dur-corto)] hover:border-[var(--text-primary)]"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mu-nude-claro)] text-[var(--mu-acento-tinta)] transition-colors duration-[var(--mu-dur-corto)] group-hover:bg-[var(--mu-rosa-claro)]">
        <Icono className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium leading-snug text-[var(--text-primary)]">{m.titulo}</span>
        <span className="text-sm text-[var(--text-tertiary)]">{aDrucila ? "Pregúntale a Drucila" : `${n} ${n === 1 ? "producto" : "productos"}`}</span>
      </span>
    </a>
  );
}

/** «¿Qué quieres mejorar?»: cada botón dice cuántos productos encuentra el catálogo. */
export function Mejorar({ slug, productos, whatsapp = null }: { slug: string; productos: readonly ProductoSalon[]; whatsapp?: string | null }) {
  const numero = whatsapp ?? WHATSAPP_MUSA;
  return (
    <section id="mejorar" aria-labelledby="mu-mejorar" className="scroll-mt-24 border-t border-[var(--rule-soft)] py-12 sm:py-16">
      <div className={ANCHO}>
        <TituloBloque id="mu-mejorar" titulo="¿Qué quieres" acento="mejorar?" texto="Toca lo que te preocupa y te mostramos lo que ayuda con eso." />
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {MEJORAR.map((m) => (
            <li key={m.titulo}>
              <BotonNecesidad m={m} slug={slug} productos={productos} whatsapp={numero} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Las 3 señales de confianza + cómo pagas + la garantía (manual: «publicar en web y redes»). */
export function Confianza({ whatsapp }: { whatsapp: string | null }) {
  const numero = whatsapp ?? WHATSAPP_MUSA;
  return (
    <section aria-labelledby="mu-confianza" className="bg-[var(--mu-crema)] py-12 sm:py-16">
      <div className={ANCHO}>
        <TituloBloque id="mu-confianza" titulo="Compra" acento="tranquila" />
        <ul className="grid gap-6 md:grid-cols-3 md:gap-8">
          {CONFIANZA.map((c) => {
            const Icono = ICONOS_CONFIANZA[c.icono];
            return (
              <li key={c.titulo} className="flex gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--mu-acento-tinta)] ring-1 ring-[var(--rule-base)]">
                  <Icono className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold leading-snug text-[var(--text-primary)]">{c.titulo}</h3>
                  <p className="mt-1 leading-relaxed text-[var(--text-secondary)]">{c.texto}</p>
                  {c.icono === "asesoria" && (
                    <a href={enlaceWhatsapp(numero, CARTA.mensaje)} {...externo} className={`${BOTON_WHATSAPP} mt-4`}>
                      <MessageCircle className="h-5 w-5" aria-hidden="true" /> {CARTA.boton}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 flex flex-col gap-4 border-t border-[var(--rule-base)] pt-6 lg:flex-row lg:items-start lg:justify-between">
          <p className="leading-relaxed text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">Pagas como prefieras: </span>
            {PAGOS.map((p) => p.texto).join(" · ")}.
          </p>
          <details className="group lg:max-w-[36rem]">
            <summary className="mu-foco inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
              Tu compra está protegida: ver la garantía
              <ChevronDown className="h-4 w-4 transition-transform duration-[var(--mu-dur-corto)] group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="mt-2 grid gap-2">
              {PROTEGIDA.map((g) => (
                <li key={g.titulo} className="flex gap-2 leading-relaxed text-[var(--text-secondary)]">
                  <ArrowRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-[var(--mu-acento-tinta)]" aria-hidden="true" />
                  <span>
                    <span className="font-semibold text-[var(--text-primary)]">{g.titulo}. </span>
                    {g.texto}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </section>
  );
}
