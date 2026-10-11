/**
 * Los bloques propios de Musa en la portada (contrato visual 10-10, §e):
 * · `Cabecera` — kicker espaciado + versalitas (+ cursiva o script): la voz del
 *   catálogo impreso. La usan todas las secciones de la portada.
 * · `Mejorar` — la doble página 2 del catálogo: «Hola, linda» (la carta de
 *   Drucila y su WhatsApp) junto a «¿Qué quieres mejorar?» (10 necesidades que
 *   llevan al catálogo filtrado, con cuántos productos hay DE VERDAD).
 * · `BannerOscuro` — el diagnóstico gratis de los sábados, en 3 pasos.
 * · `Protegida` — «Tu compra está protegida» (la garantía del manual) y la
 *   asesoría gratis con el número a la vista.
 * Sin hex: colores, fuentes y escalas salen de `tema.ts` (`--mu-*`, `.mu-*`).
 */
import type { ReactNode } from "react";
import { ArrowRight, CalendarDays, Camera, Droplets, Gift, MessageCircle, Moon, PackageCheck } from "@buleje/design-system/icons";
import { RotateCcw, ShieldCheck, Smile, Sparkles, Sun, User, Wallet, Waves, Wind } from "@buleje/design-system/icons";
import { BANNER_OSCURO, CARTA, MEJORAR, PROTEGIDA } from "./anuncios";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, hrefDestino, numeroVisible } from "./destinos";
import { coincide } from "./filtros";
import { WHATSAPP_MUSA } from "./pedido-whatsapp";
import { Sello } from "./Sello";
import { ANCHO } from "./ui";

export const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * Foco visible de la marca (rosa-tinta, 6,05:1 sobre hueso). Sobre cacao: `FOCO_CLARO` (oro). El color va con `!`:
 * `a:focus-visible` de globals.css (sin capa) pintaba negro #1A1A1A, invisible sobre cacao, y radio 8 px
 * (por eso las píldoras y los arcos repiten su radio con `focus-visible:…!`). Medido 10-10.
 */
export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-foco)]!";
export const FOCO_CLARO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mu-oro)]!";
export const KICKER = "text-xs font-semibold uppercase tracking-[var(--mu-tracking-kicker)]";
/** Botón sobre cacao: nude + negro (9,39:1), igual en claro y oscuro. */
export const BOTON_NUDE = `inline-flex h-12 items-center justify-center gap-2 rounded-full focus-visible:rounded-full! bg-[var(--mu-sello-nude)] px-7 text-base font-semibold text-[var(--mu-sello-m)] transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-translate-y-0.5 active:scale-[.97] ${FOCO_CLARO}`;
/** WhatsApp sobre fondo claro: selva-tinta + blanco (7,43:1). */
export const BOTON_WHATSAPP = `inline-flex h-12 items-center justify-center gap-2 rounded-full focus-visible:rounded-full! bg-[var(--mu-whatsapp-fondo)] px-6 text-base font-semibold text-[var(--mu-whatsapp-texto)] transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-translate-y-0.5 active:scale-[.97] ${FOCO}`;

/**
 * Título de sección: kicker + versalitas. `cursiva`: 1-2 palabras en Cormorant
 * cursiva al final («para *ti*»); `script`: la línea a mano (Great Vibes, ≥28 px,
 * una por vista) que sigue al título, dentro del mismo <h2> para el lector.
 */
export function Cabecera({
  id,
  kicker,
  titulo,
  cursiva,
  script,
  texto,
  accion,
  centrado = false,
  claro = false,
}: {
  id: string;
  kicker: string;
  titulo: string;
  cursiva?: string;
  script?: string;
  texto?: string;
  accion?: ReactNode;
  centrado?: boolean;
  claro?: boolean;
}) {
  return (
    <div className={`mb-8 flex flex-col gap-3 sm:mb-12 ${centrado ? "items-center text-center" : ""}`}>
      <p className={`${KICKER} ${claro ? "text-[var(--mu-oro)]" : "text-[var(--mu-acento-tinta)]"}`}>{kicker}</p>
      <h2 id={id} className={`mu-display max-w-4xl text-[length:var(--mu-t-seccion)] leading-none ${claro ? "text-[var(--mu-sobre-cacao)]" : "text-[var(--text-primary)]"}`}>
        {titulo}
        {cursiva && <span className="mu-cursiva normal-case tracking-normal"> {cursiva}</span>}
        {script && <span className={`mu-script ml-3 inline-block text-[length:var(--mu-t-script)] normal-case tracking-normal ${claro ? "text-[var(--mu-oro)]" : "text-[var(--mu-rosa-tinta)]"}`}>{script}</span>}
      </h2>
      {texto && <p className={`max-w-xl text-[length:var(--mu-t-cuerpo)] leading-relaxed ${claro ? "text-[var(--mu-sobre-cacao-2)]" : "text-[var(--text-secondary)]"}`}>{texto}</p>}
      {accion}
    </div>
  );
}

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

const ICONOS_PROTEGIDA = {
  cambio: PackageCheck,
  foto: Camera,
  devolucion: Wallet,
  abierto: RotateCcw,
  original: ShieldCheck,
} as const;

/** El nombre de Drucila en negrita la primera vez que aparece en la carta. */
function ConFirma({ texto }: { texto: string }) {
  const i = texto.indexOf(CARTA.firma);
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <strong className="font-semibold text-[var(--text-primary)]">{CARTA.firma}</strong>
      {texto.slice(i + CARTA.firma.length)}
    </>
  );
}

type Necesidad = (typeof MEJORAR)[number];

/** Cuántos productos muestra el catálogo con ese filtro (la MISMA búsqueda de `filtros.ts`). */
function cuantos(productos: readonly ProductoSalon[], d: Necesidad["destino"]): number {
  if ("categoria" in d) return productos.filter((p) => p.categoria === d.categoria).length;
  if ("buscar" in d) return productos.filter((p) => coincide(p, d.buscar)).length;
  return 0;
}

function TarjetaNecesidad({ m, slug, productos, whatsapp }: { m: Necesidad; slug: string; productos: readonly ProductoSalon[]; whatsapp: string }) {
  const Icono = ICONOS_MEJORAR[m.icono];
  const n = productos.length ? cuantos(productos, m.destino) : null;
  // Con la vitrina leída y 0 resultados, el enlace no lleva a un catálogo vacío: lleva a Drucila.
  const aDrucila = n === 0;
  const href = aDrucila ? enlaceWhatsapp(whatsapp, `Hola Drucila, quiero mejorar: ${m.titulo.toLowerCase()}. ¿Qué me recomiendas?`) : hrefDestino(m.destino, slug, whatsapp).href;
  const pie = aDrucila ? "Pregúntale a Drucila" : n === null ? "Ver productos" : `Ver ${n} ${n === 1 ? "producto" : "productos"}`;
  return (
    <a
      href={href}
      {...(aDrucila ? externo : {})}
      className={`group mu-sombra-tarjeta flex h-full items-center gap-3 rounded-2xl focus-visible:rounded-2xl! border border-transparent bg-[var(--surface-raised)] p-3 transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-translate-y-0.5 hover:border-[var(--rule-base)] sm:items-start sm:gap-4 sm:p-5 ${FOCO}`}
    >
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--mu-nude)] bg-[var(--mu-nude-claro)] text-[var(--mu-acento-tinta)] transition-colors duration-[var(--mu-dur-corto)] group-hover:bg-[var(--mu-rosa-claro)] sm:h-12 sm:w-12">
        <Icono className="h-5 w-5 transition-transform duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] group-hover:scale-[1.08] sm:h-6 sm:w-6" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold leading-snug text-[var(--text-primary)] sm:text-base">{m.titulo}</span>
        <span className="hidden text-sm text-[var(--text-tertiary)] sm:block">{m.texto}</span>
        <span className="mt-2 hidden items-center gap-1.5 text-sm font-semibold text-[var(--mu-acento-tinta)] sm:inline-flex">
          {pie}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}

/** «Hola, linda» + «¿Qué quieres mejorar?». Con `productos`, cada tarjeta dice cuántos encuentra el catálogo. */
export function Mejorar({ slug, productos = [], whatsapp = null }: { slug: string; productos?: readonly ProductoSalon[]; whatsapp?: string | null }) {
  const numero = whatsapp ?? WHATSAPP_MUSA;
  return (
    <section id="mejorar" aria-labelledby="mu-mejorar" className="scroll-mt-24 py-12 sm:py-24">
      <div className={`${ANCHO} grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-12 xl:gap-16`}>
        <aside aria-label="Carta de Drucila, tu asesora" className="relative flex flex-col rounded-3xl bg-[var(--mu-rosa-claro)] px-6 py-7 sm:px-8 lg:rounded-b-2xl lg:rounded-t-[999px] lg:px-9 lg:pb-10 lg:pt-14">
          <Sello id="carta" className="mx-auto mb-2 hidden h-24 w-24 lg:block" />
          <p className="mu-script text-[length:var(--mu-t-script)] leading-none text-[var(--mu-rosa-tinta)]">{CARTA.saludo}</p>
          <div className="mt-4 space-y-3 text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">
            {CARTA.parrafos.map((t, i) => (
              <p key={t} className={i === 0 ? "line-clamp-3 lg:line-clamp-none" : "hidden lg:block"}>
                {i === 0 ? <ConFirma texto={t} /> : t}
              </p>
            ))}
          </div>
          <p className="mu-script mt-4 text-[length:var(--mu-t-script)] leading-none text-[var(--text-primary)]" aria-hidden="true">
            {CARTA.firma}
          </p>
          <p className={`${KICKER} mt-2 text-[var(--mu-acento-tinta)]`}>{CARTA.cargo}</p>
          <a href={enlaceWhatsapp(numero, CARTA.mensaje)} {...externo} className={`${BOTON_WHATSAPP} mt-6 self-start`}>
            <MessageCircle className="h-5 w-5" aria-hidden="true" /> {CARTA.boton}
          </a>
          <a href="#diagnostico" className={`mt-4 inline-flex min-h-12 items-center gap-2 self-start text-sm font-semibold text-[var(--text-primary)] underline decoration-[var(--mu-rosa)] decoration-2 underline-offset-4 ${FOCO}`}>
            <CalendarDays className="h-4 w-4 text-[var(--mu-rosa-tinta)]" aria-hidden="true" /> Y los sábados, diagnóstico gratis
          </a>
        </aside>
        <div>
          <Cabecera id="mu-mejorar" kicker="Elige por necesidad" titulo="¿Qué quieres mejorar?" texto="Toca lo que te preocupa y te mostramos lo que ayuda con eso." />
          <ul className="grid grid-cols-2 gap-3 sm:gap-4">
            {MEJORAR.map((m) => (
              <li key={m.titulo}>
                <TarjetaNecesidad m={m} slug={slug} productos={productos} whatsapp={numero} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const PASOS_DIAGNOSTICO = [
  { titulo: "Escríbele o ven", texto: "Separa tu sábado por WhatsApp." },
  { titulo: "Drucila te revisa", texto: "Tu piel o tu cabello, sin apuro." },
  { titulo: "Te arma tu rutina", texto: "Solo lo que te sirve." },
];

/** El diagnóstico gratis de los sábados (sin foto de stock: el sello de la marca con su aro que gira). */
export function BannerOscuro({ whatsapp }: { whatsapp: string | null }) {
  const b = BANNER_OSCURO;
  return (
    <section
      id="diagnostico"
      aria-labelledby="mu-diagnostico"
      className="mu-grano relative scroll-mt-24 overflow-clip bg-[radial-gradient(120%_140%_at_85%_0%,var(--mu-cacao)_0%,var(--mu-cacao-hondo)_75%)] text-[var(--mu-sobre-cacao)] dark:border-y dark:border-[var(--rule-base)]"
    >
      <div className={`${ANCHO} relative z-[1] grid items-center gap-10 py-14 sm:py-20 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`}>
        <div>
          <p className={`${KICKER} flex items-center gap-2 text-[var(--mu-oro)]`}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> {b.kicker}
          </p>
          <h2 id="mu-diagnostico" className="mu-display mt-3 max-w-2xl text-[length:var(--mu-t-seccion)] leading-none">
            {b.titulo}
          </h2>
          <p className="mt-4 hidden max-w-lg text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--mu-sobre-cacao-2)] sm:block">{b.texto}</p>
          <ol className="mt-7 grid gap-4 sm:grid-cols-3">
            {PASOS_DIAGNOSTICO.map((p, i) => (
              <li key={p.titulo} className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                <span aria-hidden="true" className="mu-num text-[40px] leading-none text-[var(--mu-oro)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-base font-semibold">{p.titulo}</span>
                  <span className="block text-sm text-[var(--mu-sobre-cacao-2)]">{p.texto}</span>
                </span>
              </li>
            ))}
          </ol>
          <div data-mu-despejar className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href={enlaceWhatsapp(whatsapp ?? WHATSAPP_MUSA, b.mensaje)} {...externo} className={BOTON_NUDE}>
              <MessageCircle className="h-5 w-5" aria-hidden="true" /> Separar mi diagnóstico
            </a>
            <a href="#mejorar" className={`inline-flex h-12 items-center border-b border-[var(--mu-oro)] text-base font-semibold transition-opacity hover:opacity-80 ${FOCO_CLARO}`}>
              ¿Qué quieres mejorar?
            </a>
          </div>
        </div>
        <div aria-hidden="true" className="relative mx-auto hidden aspect-square w-full max-w-[19rem] md:block">
          <svg viewBox="0 0 200 200" className="mu-girar absolute inset-0 h-full w-full text-[var(--mu-oro)]">
            <defs>
              <path id="mu-diag-aro" d="M100,100 m-86,0 a86,86 0 1,1 172,0 a86,86 0 1,1 -172,0" />
            </defs>
            <text fill="currentColor" fontSize="10" fontWeight="600" letterSpacing="2">
              <textPath href="#mu-diag-aro" textLength={535} lengthAdjust="spacing">
                DIAGNÓSTICO GRATIS · PIEL Y CABELLO · CON DRUCILA ·
              </textPath>
            </text>
          </svg>
          <span className="absolute inset-[16%] flex flex-col items-center justify-center rounded-full bg-[var(--mu-sello-nude)] text-[var(--mu-sello-m)] ring-1 ring-[var(--mu-oro)] ring-offset-4 ring-offset-[var(--mu-cacao)]">
            <span className={`${KICKER} text-[var(--mu-sello-m)]`}>Todos los</span>
            <span className="mu-display text-[2.125rem] leading-none">Sábados</span>
            <span className="mu-script mt-1 text-[32px] leading-none">gratis</span>
          </span>
        </div>
      </div>
    </section>
  );
}

/** «Tu compra está protegida»: la garantía del manual en tarjetas (2 columnas) y, al lado, la asesoría con el número a la vista. */
export function Protegida({ whatsapp }: { whatsapp: string | null }) {
  const numero = whatsapp ?? WHATSAPP_MUSA;
  return (
    <section id="protegida" aria-labelledby="mu-protegida" className="scroll-mt-24 py-12 sm:py-24">
      <div className={ANCHO}>
        <Cabecera id="mu-protegida" kicker="Compra tranquila" titulo="Tu compra está" cursiva="protegida" />
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          {/* Las tarjetas van en su propia grilla: la de la asesoría (más alta) ya no estira a sus vecinas ni deja huecos blancos. */}
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:col-span-2">
            {PROTEGIDA.map((p, i) => {
              const Icono = ICONOS_PROTEGIDA[p.icono];
              const sola = i === PROTEGIDA.length - 1 && PROTEGIDA.length % 2 === 1;
              return (
                <li key={p.titulo} className={`mu-sombra-tarjeta flex items-start gap-3 rounded-2xl bg-[var(--surface-raised)] p-4 sm:gap-4 sm:p-5 ${sola ? "sm:col-span-2" : ""}`}>
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mu-selva-claro)] text-[var(--mu-selva-tinta)] sm:h-12 sm:w-12">
                    <Icono className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-[var(--text-primary)]">{p.titulo}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-[var(--text-secondary)] sm:mt-1 sm:text-sm sm:leading-relaxed">{p.texto}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mu-grano relative flex flex-col justify-center overflow-clip rounded-2xl bg-[var(--mu-cacao)] p-6 text-[var(--mu-sobre-cacao)] sm:p-8 dark:ring-1 dark:ring-[var(--rule-base)]">
            <p className={`${KICKER} text-[var(--mu-oro)]`}>Asesoría gratis</p>
            <p className="mu-num mt-2 text-[40px] leading-none">{numeroVisible(numero)}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--mu-sobre-cacao-2)]">Pide por código («Hola, quiero el MU013»). A los 15 días Drucila te escribe para ver cómo vas.</p>
            <a href={enlaceWhatsapp(numero, "Hola Drucila, quiero asesoría para elegir mis productos.")} {...externo} className={`${BOTON_NUDE} mt-6 self-start`}>
              <MessageCircle className="h-5 w-5" aria-hidden="true" /> Escribir a Drucila
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
