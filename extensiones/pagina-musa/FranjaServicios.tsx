/**
 * La franja de servicios del catálogo: los servicios del salón NO van al
 * carrito (se reservan por WhatsApp con el mensaje armado). Si la persona
 * buscó algo que el salón hace («keratina»), salen primero esos servicios y
 * el título lo dice; si no, todos.
 * Precio y duración salen de la base (productos de la categoría de servicios).
 */
import Image from "next/image";
import { Clock, MessageCircle } from "@buleje/design-system/icons";
import { Carril } from "./Carril";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, mensajeReserva, rutas, soles } from "./destinos";
import { coincide } from "./filtros";
import { ANCHO, ConAcento, Kicker } from "./ui";

export function FranjaServicios({ servicios, q, whatsapp, slug }: { servicios: ProductoSalon[]; q: string; whatsapp: string | null; slug: string }) {
  if (servicios.length === 0) return null;
  const buscados = q ? servicios.filter((s) => coincide(s, q)) : [];
  const lista = buscados.length ? buscados : servicios;
  return (
    <section aria-labelledby="mu-franja-servicios" className="mu-grano bg-[linear-gradient(180deg,var(--mu-cacao)_0%,var(--mu-cacao-hondo)_100%)] py-10 text-[var(--mu-sobre-cacao)] sm:py-16 dark:border-y dark:border-[var(--rule-base)]">
      <div className={ANCHO}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <Kicker claro>Del salón</Kicker>
            <h2 id="mu-franja-servicios" className="mu-display mt-2 text-[length:var(--mu-t-seccion)] leading-[1]">
              {buscados.length ? `En el salón: “${q}”` : <ConAcento texto="¿Prefieres que lo hagamos por ti?" acento="text-[var(--mu-oro)]" />}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[var(--mu-sobre-cacao-2)] sm:text-lg">
              Elige el servicio y te escribimos por WhatsApp para confirmar el día y la hora. Se paga en el salón.
            </p>
          </div>
          <a
            href={rutas(slug).servicios}
            className="mu-subrayado inline-flex h-11 shrink-0 items-center self-start text-base font-semibold [--mu-subrayado:var(--mu-oro)] sm:self-auto"
          >
            Ver todos los servicios
          </a>
        </div>
        <Carril etiqueta="Servicios del salón" ancho="angosto">
          {lista.map((s) => (
            <article key={s.id} className="flex h-full flex-col overflow-hidden rounded-[var(--mu-radio-tarjeta)] bg-[var(--mu-sobre-cacao)]/[0.06] ring-1 ring-[var(--mu-sobre-cacao)]/15">
              <div className="relative aspect-[16/10] bg-[var(--mu-sobre-cacao)]/10">
                {s.imagen && <Image src={s.imagen} alt="" fill sizes="(min-width: 1024px) 400px, (min-width: 640px) 31vw, 46vw" className="object-cover" />}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-lg font-semibold leading-snug">{s.nombre}</h3>
                <p className="flex flex-wrap items-center gap-x-3 text-base text-[var(--mu-sobre-cacao-2)]">
                  {s.duracion && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                    </span>
                  )}
                  <span className="font-bold tabular-nums text-[var(--mu-sobre-cacao)]">{soles(s.precio)}</span>
                </p>
                <a
                  href={enlaceWhatsapp(whatsapp, mensajeReserva(s))}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Reservar ${s.nombre} por WhatsApp`}
                  className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--mu-sobre-cacao)] px-4 text-base font-semibold text-[var(--mu-cacao)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-oro)]"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {/* En una tarjeta angosta no entra la frase entera; el nombre completo lo lleva `aria-label`. */}
                  <span>
                    Reservar<span className="hidden lg:inline"> por WhatsApp</span>
                  </span>
                </a>
              </div>
            </article>
          ))}
        </Carril>
      </div>
    </section>
  );
}
