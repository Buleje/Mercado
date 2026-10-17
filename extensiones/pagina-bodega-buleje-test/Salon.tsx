/**
 * El salón: el banner oscuro de un servicio estrella y la lista de servicios
 * reservables por WhatsApp. Precio y duración salen de la base (productos con
 * tipo «servicio» en la categoría de servicios); el mensaje de WhatsApp ya
 * lleva qué se quiere reservar.
 *
 * Los servicios van como la CARTA del salón: foto en arco, nombre, puntos guía
 * y precio en numerales grandes; toda la fila reserva. En el celular, 8 servicios en
 * tarjetas medían ~1.400 px; en carta, ~600.
 */
import Image from "next/image";
import { Clock, MapPin, MessageCircle } from "@buleje/design-system/icons";
import { BANNER_OSCURO, FOTO_SERVICIOS } from "./anuncios";
import type { ProductoSalon } from "./datos";
import { fotoResponsiva } from "./imagenes";
import { enlaceWhatsapp, mensajeReserva, soles } from "./destinos";
import { ANCHO, ConAcento, Kicker, TituloSeccion } from "./ui";

const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

export function BannerOscuro({ servicios, whatsapp }: { servicios: ProductoSalon[]; whatsapp: string | null }) {
  const s = servicios.find((x) => x.nombre === BANNER_OSCURO.servicio);
  const b = BANNER_OSCURO;
  return (
    <section aria-labelledby="bb-ritual" className="bg-[var(--bb-tinta)] text-[var(--bb-sobre-tinta)] dark:border-y dark:border-[var(--rule-base)]">
      <div className="grid md:grid-cols-2">
        <div className="relative aspect-[2/1] sm:aspect-[16/10] md:aspect-auto md:min-h-[32rem] lg:min-h-[36rem]">
          {/* eslint-disable-next-line @next/next/no-img-element -- ancho justo desde Unsplash (imagenes.ts); en dev next/image ignora el loader */}
          <img {...fotoResponsiva(b.foto, "(min-width: 768px) 50vw, 100vw")} alt={b.alt} className="absolute inset-0 h-full w-full object-cover" />
          <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-[var(--bb-tinta)] via-transparent to-transparent md:bg-linear-to-l md:from-[var(--bb-tinta)]/70" />
        </div>
        <div className="noise-texture-bg flex flex-col justify-center px-5 pb-9 pt-5 sm:px-10 md:py-16 lg:px-16 xl:pr-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))]">
          <Kicker claro className="relative z-[1]">
            {b.kicker}
          </Kicker>
          <h2 id="bb-ritual" className="bb-display relative z-[1] mt-3 text-[2.5rem] leading-[0.95] sm:text-5xl lg:text-7xl">
            <ConAcento texto={b.titulo} acento="text-[var(--bb-oro)]" />
          </h2>
          <p className="relative z-[1] mt-4 line-clamp-2 max-w-lg text-base leading-relaxed text-[var(--bb-sobre-tinta-2)] sm:line-clamp-none sm:text-lg">{b.texto}</p>
          {s && (
            <div className="relative z-[1] mt-6 flex items-end gap-4 border-y border-[var(--bb-sobre-tinta)]/15 py-4">
              <p className="min-w-0 flex-1">
                <span className="block text-base font-semibold">{s.nombre}</span>
                {s.duracion && (
                  <span className="mt-1 inline-flex items-center gap-2 text-base text-[var(--bb-sobre-tinta-2)]">
                    <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                  </span>
                )}
              </p>
              <p className="bb-num shrink-0 text-[2.75rem] leading-none lg:text-6xl">{soles(s.precio)}</p>
            </div>
          )}
          <div className="relative z-[1] mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a
              href={enlaceWhatsapp(whatsapp, s ? mensajeReserva(s) : `Hola, quiero reservar: ${b.servicio}.`)}
              {...externo}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--bb-sobre-tinta)] px-7 text-base font-semibold text-[var(--bb-tinta)] transition hover:-translate-y-0.5"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" /> Reservar por WhatsApp
            </a>
            <a href="#servicios" className="inline-flex h-12 items-center border-b-2 border-[var(--bb-sobre-tinta)] text-base font-semibold transition hover:opacity-80">
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
    <section id="servicios" aria-labelledby="bb-servicios" className="noise-texture-bg scroll-mt-24 bg-[var(--bb-papel)] py-9 sm:py-20">
      <div className={`${ANCHO} relative z-[1]`}>
        <TituloSeccion
          id="bb-servicios"
          kicker={`Salón ${nombre}`}
          titulo="Reserva tu cita"
          texto="Elige el servicio y te escribimos por WhatsApp para confirmar el día y la hora."
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <ol className="grid content-start gap-x-10 rounded-[1.75rem] border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2 sm:px-7 sm:py-4 md:grid-cols-2">
            {servicios.map((s) => (
              <li key={s.id} className="border-b border-[var(--rule-soft)] last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                <a
                  href={enlaceWhatsapp(whatsapp, mensajeReserva(s))}
                  {...externo}
                  aria-label={`Reservar ${s.nombre} por WhatsApp, ${soles(s.precio)}`}
                  className="group flex items-center gap-3 rounded-xl py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:gap-4"
                >
                  <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-t-full rounded-b-lg bg-[var(--bb-rubor)]">
                    {s.imagen && <Image src={s.imagen} alt="" fill sizes="48px" className="object-cover" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {/* Si el nombre baja de línea, los puntos guía se encogen a nada: el nombre nunca se corta. */}
                    <span className="flex items-baseline gap-2">
                      <span className="text-base font-semibold leading-snug text-[var(--text-primary)] group-hover:underline">{s.nombre}</span>
                      <span aria-hidden="true" className="bb-puntos text-[var(--text-tertiary)]" />
                      <span className="bb-num shrink-0 text-[1.375rem] leading-none text-[var(--text-primary)]">{soles(s.precio)}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-3 text-base text-[var(--text-secondary)]">
                      {s.duracion && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1.5 font-semibold text-[var(--bb-vino)]">
                        <MessageCircle className="h-4 w-4" aria-hidden="true" /> Reservar
                      </span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
          <aside className="flex flex-col overflow-hidden rounded-[1.75rem] bg-[var(--bb-tinta)] sm:flex-row lg:sticky lg:top-28 lg:flex-col lg:self-start dark:ring-1 dark:ring-[var(--rule-base)]">
            <div className="relative hidden sm:block sm:w-1/2 lg:aspect-[4/3] lg:w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- ancho justo desde Unsplash (imagenes.ts); en dev next/image ignora el loader */}
              <img
                {...fotoResponsiva(FOTO_SERVICIOS.foto, "(min-width: 1024px) 22rem, 50vw")}
                alt={FOTO_SERVICIOS.alt}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col justify-center gap-3 p-6 text-[var(--bb-sobre-tinta)] sm:w-1/2 sm:p-8 lg:w-full lg:p-6">
              <p className="bb-display text-[1.625rem] leading-[1.02] sm:text-[2rem]">
                <ConAcento texto="¿Primera vez en el salón?" acento="text-[var(--bb-oro)]" />
              </p>
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
