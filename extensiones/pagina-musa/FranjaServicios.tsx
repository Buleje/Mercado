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
import { ANCHO, BOTON, Kicker } from "./ui";

export function FranjaServicios({ servicios, q, whatsapp, slug }: { servicios: ProductoSalon[]; q: string; whatsapp: string | null; slug: string }) {
  if (servicios.length === 0) return null;
  const buscados = q ? servicios.filter((s) => coincide(s, q)) : [];
  const lista = buscados.length ? buscados : servicios;
  return (
    <section aria-labelledby="mu-franja-servicios" className="border-y border-[var(--rule-soft)] py-12 text-[var(--text-primary)] sm:py-20">
      <div className={ANCHO}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <Kicker>Del salón</Kicker>
            <h2 id="mu-franja-servicios" className="mu-display mt-2 text-[length:var(--mu-t-seccion)] leading-tight">
              {buscados.length ? `En el salón: “${q}”` : "¿Prefieres que lo hagamos por ti?"}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
              Elige el servicio y te escribimos por WhatsApp para confirmar el día y la hora. Se paga en el salón.
            </p>
          </div>
          <a
            href={rutas(slug).servicios}
            className="mu-subrayado inline-flex h-12 shrink-0 items-center self-start text-base font-semibold sm:self-auto"
          >
            Ver todos los servicios
          </a>
        </div>
        <Carril etiqueta="Servicios del salón" ancho="angosto">
          {lista.map((s) => (
            <article key={s.id} className="flex h-full flex-col overflow-hidden rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)]">
              <div className="relative aspect-[16/10] bg-[var(--surface-sunken)]">
                {s.imagen && <Image src={s.imagen} alt="" fill sizes="(min-width: 1024px) 400px, (min-width: 640px) 31vw, 46vw" className="object-cover" />}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-lg font-semibold leading-snug">{s.nombre}</h3>
                <p className="flex flex-wrap items-center gap-x-3 text-base text-[var(--text-secondary)]">
                  {s.duracion && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                    </span>
                  )}
                  <span className="font-semibold tabular-nums text-[var(--text-primary)]">{soles(s.precio)}</span>
                </p>
                <a
                  href={enlaceWhatsapp(whatsapp, mensajeReserva(s))}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Reservar ${s.nombre} por WhatsApp`}
                  className={`${BOTON} mu-foco mt-auto px-4`}
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
