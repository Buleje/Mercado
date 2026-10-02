/**
 * El salón: el banner oscuro de un servicio estrella y la lista de servicios
 * reservables por WhatsApp. Precio y duración salen de la base (productos con
 * tipo «servicio» en la categoría de servicios); el mensaje de WhatsApp ya
 * lleva qué se quiere reservar.
 */
import Image from "next/image";
import { Clock, MapPin, MessageCircle } from "@buleje/design-system/icons";
import { BANNER_OSCURO, FOTO_SERVICIOS } from "./anuncios";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, soles } from "./destinos";
import { ANCHO, TituloSeccion } from "./ui";

const mensajeReserva = (s: ProductoSalon) =>
  `Hola, quiero reservar: ${s.nombre}${s.duracion ? ` (${s.duracion})` : ""} — ${soles(s.precio)}. ¿Qué horarios tienen disponibles?`;

const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

export function BannerOscuro({ servicios, whatsapp }: { servicios: ProductoSalon[]; whatsapp: string | null }) {
  const s = servicios.find((x) => x.nombre === BANNER_OSCURO.servicio);
  const b = BANNER_OSCURO;
  return (
    <section aria-labelledby="bb-ritual" className="bg-[var(--bb-tinta)] text-[var(--bb-sobre-tinta)] dark:border-y dark:border-[var(--rule-base)]">
      <div className="grid md:grid-cols-2">
        <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[30rem] lg:min-h-[32rem]">
          <Image src={b.foto} alt={b.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="flex flex-col justify-center px-5 py-14 sm:px-10 lg:px-16 xl:pr-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))]">
          <p className="text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--bb-oro)]">{b.kicker}</p>
          <h2 id="bb-ritual" className="bb-serif mt-3 text-5xl italic leading-[1.02] tracking-tight lg:text-6xl">
            {b.titulo}
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--bb-sobre-tinta-2)] sm:text-lg">{b.texto}</p>
          {s && (
            <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-base">
              <span className="font-semibold">{s.nombre}</span>
              {s.duracion && (
                <span className="inline-flex items-center gap-2 text-[var(--bb-sobre-tinta-2)]">
                  <Clock className="h-5 w-5" aria-hidden="true" /> {s.duracion}
                </span>
              )}
              <span className="bb-serif text-3xl">{soles(s.precio)}</span>
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={enlaceWhatsapp(whatsapp, s ? mensajeReserva(s) : `Hola, quiero reservar: ${b.servicio}.`)}
              {...externo}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--bb-sobre-tinta)] px-7 text-base font-semibold text-[var(--bb-tinta)] transition hover:-translate-y-0.5"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" /> Reservar por WhatsApp
            </a>
            <a href="#servicios" className="inline-flex h-12 items-center rounded-full border-2 border-[var(--bb-sobre-tinta)] px-6 text-base font-semibold transition hover:bg-[var(--bb-sobre-tinta)] hover:text-[var(--bb-tinta)]">
              Ver todos los servicios
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Servicios({
  servicios,
  whatsapp,
  horario,
  direccion,
  nombre,
}: {
  nombre: string;
  servicios: ProductoSalon[];
  whatsapp: string | null;
  horario: string | null;
  direccion: string | null;
}) {
  if (servicios.length === 0) return null;
  return (
    <section id="servicios" aria-labelledby="bb-servicios" className="scroll-mt-24 bg-[var(--bb-papel)] py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion
          id="bb-servicios"
          kicker={`Salón ${nombre}`}
          titulo="Reserva tu cita"
          texto="Elige el servicio y te escribimos por WhatsApp para confirmar el día y la hora."
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <ul className="grid gap-4 sm:grid-cols-2">
            {servicios.map((s) => (
              <li key={s.id} className="flex gap-4 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--bb-rubor)]">
                  {s.imagen && <Image src={s.imagen} alt="" fill sizes="96px" className="object-cover" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="text-lg font-semibold leading-snug text-[var(--text-primary)]">{s.nombre}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-base text-[var(--text-secondary)]">
                    {s.duracion && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                      </span>
                    )}
                    <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(s.precio)}</span>
                  </p>
                  {s.descripcion && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">{s.descripcion}</p>}
                  <a
                    href={enlaceWhatsapp(whatsapp, mensajeReserva(s))}
                    {...externo}
                    aria-label={`Reservar ${s.nombre} por WhatsApp`}
                    className="mt-3 inline-flex h-11 items-center gap-2 self-start rounded-full bg-[var(--text-primary)] px-5 text-base font-semibold text-[var(--surface-canvas)] transition hover:-translate-y-0.5"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> Reservar
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <aside className="flex flex-col overflow-hidden rounded-3xl bg-[var(--bb-tinta)] sm:flex-row lg:sticky lg:top-28 lg:flex-col lg:self-start dark:ring-1 dark:ring-[var(--rule-base)]">
            <div className="relative aspect-[4/3] sm:aspect-auto sm:w-1/2 lg:aspect-[4/3] lg:w-full">
              <Image src={FOTO_SERVICIOS.foto} alt={FOTO_SERVICIOS.alt} fill sizes="(min-width: 1024px) 22rem, 100vw" className="object-cover" />
            </div>
            <div className="flex flex-col justify-center gap-3 p-6 text-[var(--bb-sobre-tinta)] sm:w-1/2 sm:p-8 lg:w-full lg:p-6">
              <p className="bb-serif text-3xl leading-tight">¿Primera vez en el salón?</p>
              <p className="text-base leading-relaxed text-[var(--bb-sobre-tinta-2)]">Cuéntanos cómo está tu cabello y te recomendamos el servicio ideal.</p>
              {horario && (
                <p className="inline-flex items-start gap-2 text-base text-[var(--bb-sobre-tinta-2)]">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> {horario}
                </p>
              )}
              {direccion && (
                <p className="inline-flex items-start gap-2 text-base text-[var(--bb-sobre-tinta-2)]">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> {direccion}
                </p>
              )}
              <a
                href={enlaceWhatsapp(whatsapp, "Hola, quiero que me asesoren para elegir un servicio del salón.")}
                {...externo}
                className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--bb-sobre-tinta)] px-6 text-base font-semibold text-[var(--bb-tinta)]"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir asesoría
              </a>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
