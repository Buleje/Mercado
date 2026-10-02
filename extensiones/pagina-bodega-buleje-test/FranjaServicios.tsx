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
import { enlaceWhatsapp, rutas, soles } from "./destinos";
import { coincide } from "./filtros";
import { ANCHO } from "./ui";

const mensajeReserva = (s: ProductoSalon) =>
  `Hola, quiero reservar: ${s.nombre}${s.duracion ? ` (${s.duracion})` : ""} — ${soles(s.precio)}. ¿Qué horarios tienen disponibles?`;

export function FranjaServicios({ servicios, q, whatsapp, slug }: { servicios: ProductoSalon[]; q: string; whatsapp: string | null; slug: string }) {
  if (servicios.length === 0) return null;
  const buscados = q ? servicios.filter((s) => coincide(s, q)) : [];
  const lista = buscados.length ? buscados : servicios;
  return (
    <section aria-labelledby="bb-franja-servicios" className="bg-[var(--bb-tinta)] py-14 text-[var(--bb-sobre-tinta)] sm:py-16 dark:border-y dark:border-[var(--rule-base)]">
      <div className={ANCHO}>
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--bb-oro)]">Del salón</p>
            <h2 id="bb-franja-servicios" className="bb-serif mt-2 text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              {buscados.length ? `En el salón: “${q}”` : "¿Prefieres que lo hagamos por ti?"}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[var(--bb-sobre-tinta-2)] sm:text-lg">
              Elige el servicio y te escribimos por WhatsApp para confirmar el día y la hora. Se paga en el salón.
            </p>
          </div>
          <a
            href={rutas(slug).servicios}
            className="inline-flex h-11 shrink-0 items-center self-start border-b-2 border-current text-base font-semibold sm:self-auto"
          >
            Ver todos los servicios
          </a>
        </div>
        <Carril etiqueta="Servicios del salón" ancho="angosto">
          {lista.map((s) => (
            <article key={s.id} className="flex h-full flex-col overflow-hidden rounded-2xl bg-[var(--bb-sobre-tinta)]/[0.06] ring-1 ring-[var(--bb-sobre-tinta)]/15">
              <div className="relative aspect-[16/10] bg-[var(--bb-sobre-tinta)]/10">
                {s.imagen && <Image src={s.imagen} alt="" fill sizes="(min-width: 1024px) 400px, (min-width: 640px) 31vw, 46vw" className="object-cover" />}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-lg font-semibold leading-snug">{s.nombre}</h3>
                <p className="flex flex-wrap items-center gap-x-3 text-base text-[var(--bb-sobre-tinta-2)]">
                  {s.duracion && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                    </span>
                  )}
                  <span className="font-bold tabular-nums text-[var(--bb-sobre-tinta)]">{soles(s.precio)}</span>
                </p>
                <a
                  href={enlaceWhatsapp(whatsapp, mensajeReserva(s))}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Reservar ${s.nombre} por WhatsApp`}
                  className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--bb-sobre-tinta)] px-4 text-base font-semibold text-[var(--bb-tinta)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-sobre-tinta)]"
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
