/**
 * Los bloques propios de Musa en la portada (sin servicios de salón):
 * · `Mejorar` — «¿Qué quieres mejorar?», como el índice del catálogo: diez
 *   tarjetas que llevan a la categoría o a la búsqueda que ayuda con eso.
 * · `BannerOscuro` — el diagnóstico gratis de los sábados, con WhatsApp.
 * · `Protegida` — «Tu compra está protegida» (la garantía del manual) y la
 *   asesoría gratis de Drucila.
 * Los textos viven en `anuncios.ts`.
 */
import {
  Camera,
  CalendarDays,
  Droplets,
  Gift,
  MessageCircle,
  Moon,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Smile,
  Sparkles,
  Sun,
  User,
  Wallet,
  Waves,
  Wind,
} from "@buleje/design-system/icons";
import { BANNER_OSCURO, MEJORAR, PROTEGIDA } from "./anuncios";
import { enlaceWhatsapp, hrefDestino } from "./destinos";
import { fotoResponsiva } from "./imagenes";
import { ANCHO, ConAcento, Kicker, TituloSeccion } from "./ui";

const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

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

const ICONOS_PROTEGIDA = { cambio: PackageCheck, foto: Camera, devolucion: Wallet, abierto: RotateCcw, original: ShieldCheck } as const;

export function Mejorar({ slug }: { slug: string }) {
  return (
    <section id="mejorar" aria-labelledby="mu-mejorar" className="scroll-mt-24 bg-[var(--mu-hueso)] py-9 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-mejorar" kicker="Elige por necesidad" titulo="¿Qué quieres mejorar?" texto="Toca lo que te preocupa y te mostramos lo que ayuda con eso." />
        <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-5">
          {MEJORAR.map((m) => {
            const Icono = ICONOS_MEJORAR[m.icono];
            return (
              <li key={m.titulo}>
                <a
                  href={hrefDestino(m.destino, slug, null).href}
                  className="group flex h-full items-center gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--mu-nude)] bg-[var(--mu-nude-claro)] text-[var(--mu-acento-tinta)]">
                    <Icono className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold leading-snug text-[var(--text-primary)]">{m.titulo}</span>
                    <span className="block text-sm text-[var(--text-secondary)]">{m.texto}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function BannerOscuro({ whatsapp }: { whatsapp: string | null }) {
  const b = BANNER_OSCURO;
  return (
    <section aria-labelledby="mu-diagnostico" className="bg-[var(--mu-cacao)] text-[var(--mu-sobre-cacao)] dark:border-y dark:border-[var(--rule-base)]">
      <div className="grid md:grid-cols-2">
        <div className="relative aspect-[2/1] sm:aspect-[16/10] md:aspect-auto md:min-h-[30rem]">
          {/* eslint-disable-next-line @next/next/no-img-element -- ancho justo desde Unsplash (imagenes.ts); en dev next/image ignora el loader */}
          <img {...fotoResponsiva(b.foto, "(min-width: 768px) 50vw, 100vw")} alt={b.alt} className="absolute inset-0 h-full w-full object-cover" />
          <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-[var(--mu-cacao)] via-transparent to-transparent md:bg-linear-to-l md:from-[var(--mu-cacao)]/70" />
        </div>
        <div className="noise-texture-bg flex flex-col justify-center px-5 pb-9 pt-5 sm:px-10 md:py-16 lg:px-16 xl:pr-[max(4rem,calc((100vw_-_1280px)/2_+_2rem))]">
          <Kicker claro className="relative z-[1]">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> {b.kicker}
          </Kicker>
          <h2 id="mu-diagnostico" className="mu-display relative z-[1] mt-3 text-[2.25rem] leading-[1] sm:text-5xl lg:text-6xl">
            <ConAcento texto={b.titulo} acento="text-[var(--mu-sobre-cacao-2)]" />
          </h2>
          <p className="relative z-[1] mt-4 max-w-lg text-base leading-relaxed text-[var(--mu-sobre-cacao-2)] sm:text-lg">{b.texto}</p>
          <div className="relative z-[1] mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a
              href={enlaceWhatsapp(whatsapp, b.mensaje)}
              {...externo}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--mu-sobre-cacao)] px-7 text-base font-semibold text-[var(--mu-cacao)] transition hover:-translate-y-0.5"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" /> Separar mi diagnóstico
            </a>
            <a href="#mejorar" className="inline-flex h-12 items-center border-b-2 border-[var(--mu-sobre-cacao)] text-base font-semibold transition hover:opacity-80">
              ¿Qué quieres mejorar?
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Protegida({ whatsapp }: { whatsapp: string | null }) {
  return (
    <section id="protegida" aria-labelledby="mu-protegida" className="scroll-mt-24 py-9 sm:py-20">
      <div className={`${ANCHO} grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12`}>
        <div>
          <TituloSeccion id="mu-protegida" kicker="Compra tranquila" titulo="Tu compra está protegida" />
          <ul className="grid gap-4 sm:grid-cols-2">
            {PROTEGIDA.map((p) => {
              const Icono = ICONOS_PROTEGIDA[p.icono];
              return (
                <li key={p.titulo} className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--mu-nude-claro)] text-[var(--mu-acento-tinta)]">
                    <Icono className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-[var(--text-primary)]">{p.titulo}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-[var(--text-secondary)]">{p.texto}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <aside aria-label="Asesoría gratis" className="flex flex-col items-center justify-center rounded-2xl bg-[var(--mu-negro)] px-6 py-9 text-center text-[var(--surface-canvas)] dark:bg-[var(--mu-cacao)] dark:text-[var(--mu-sobre-cacao)]">
          <p className="text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--mu-sello-nude)]">Asesoría gratis</p>
          <p className="mu-num mt-3 text-[2.5rem] leading-none sm:text-5xl">921 585 006</p>
          <p className="mt-3 max-w-xs text-base leading-relaxed opacity-90">
            Escríbele a Drucila por WhatsApp y pide por código (p. ej. «Hola, quiero el MU013»). A los 15 días te escribe para ver cómo vas.
          </p>
          <a
            href={enlaceWhatsapp(whatsapp, "Hola Drucila, quiero asesoría para elegir mis productos.")}
            {...externo}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--mu-sello-nude)] px-7 text-base font-semibold text-[var(--mu-sello-m)] transition hover:-translate-y-0.5"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" /> Escribir a Drucila
          </a>
        </aside>
      </div>
    </section>
  );
}
