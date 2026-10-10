/**
 * Franja de beneficios + pie de la tienda (contrato §e).
 *
 * El pie va de cacao a cacao hondo, con grano: arriba la despedida en script
 * oro («gracias, linda») con la firma del manual y la suscripción; después
 * las columnas Tienda · Ayuda · Contacto · Pagos (arte propio de los medios
 * de pago, `PaymentMethodIcon` del DS) y, al borde, la línea de cerros y
 * neblina de la selva central. Los enlaces se subrayan creciendo en oro.
 * Ornamentos: la script y los cerros (máximo 2 por vista).
 */
import { Facebook, Instagram, MessageCircle, ShieldCheck, Truck, Wallet } from "@buleje/design-system/icons";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";
import { BENEFICIOS, CATEGORIAS, CONTACTO, DESPEDIDA, PAGOS } from "./anuncios";
import { enlaceWhatsapp, rellenar, rutas } from "./destinos";
import { Sello } from "./Sello";
import { Suscripcion } from "./Suscripcion";
import { ANCHO, Script } from "./ui";

const ICONOS = { camion: Truck, pago: Wallet, escudo: ShieldCheck, chat: MessageCircle } as const;

/** Columnas desde 1024 px según cuántos quedan (con 2, la grilla de 4 dejaba media fila vacía). */
const COLUMNAS_LG: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

/**
 * `sin`: los íconos que la vista ya cuenta arriba. En la portada va justo después de
 * «Tu compra está protegida» (garantía + asesoría con el número), así que ahí no se repiten.
 */
export function Beneficios({ pagos, nombre, sin = [] }: { pagos: string | null; nombre: string; sin?: readonly (typeof BENEFICIOS)[number]["icono"][] }) {
  const items = BENEFICIOS.filter((b) => !sin.includes(b.icono))
    .map((b) => ({ ...b, texto: rellenar(b.texto, { pagos }) }))
    .filter((b) => b.texto);
  return (
    <section aria-label={`Por qué comprar en ${nombre}`} className="border-y border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      {/* Celular: una fila que se desliza (con imán y el borde derecho desvanecido); desde 640 px, grilla. */}
      <ul className={`${ANCHO} mu-sin-barra mu-desvanecer mu-desvanecer-sm flex snap-x snap-proximity scroll-px-4 gap-5 overflow-x-auto py-6 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:py-10 ${COLUMNAS_LG[items.length] ?? "lg:grid-cols-4"}`}>
        {items.map((b, i) => {
          const Icono = ICONOS[b.icono];
          return (
            <li key={b.titulo} className={`flex w-[78%] shrink-0 snap-start items-start gap-4 sm:w-auto ${i === items.length - 1 ? "pr-8 sm:pr-0" : ""}`}>
              <span className="mu-arco inline-flex h-12 w-11 shrink-0 items-center justify-center bg-[var(--mu-nude-claro)] text-[var(--mu-acento-tinta)]">
                <Icono className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[0.9375rem] font-semibold leading-snug text-[var(--text-primary)]">{b.titulo}</span>
                <span className="mt-1 block text-[length:var(--mu-t-chico)] leading-relaxed text-[var(--text-secondary)]">{b.texto}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Los cerros con neblina de la selva central (Oxapampa, Villa Rica, Constitución), en
 * tres planos como se ven al amanecer: el de atrás más claro, el de adelante del color
 * del pie (se funde con el fondo), y bancos de neblina entre ellos. Los filos llevan el
 * trazo fino nude. Todo en tokens: en oscuro sale igual, con el nude claro del tema.
 */
const FILO_ATRAS = "M0 96C80 80 140 52 220 58S360 96 440 72 580 20 680 34 820 88 920 70 1060 30 1160 44 1320 84 1440 64";
const FILO_MEDIO = "M0 120C120 106 200 92 300 100S480 126 600 110 800 82 920 98 1120 128 1240 112 1380 98 1440 104";
const FILO_FRENTE = "M0 136C180 128 320 122 480 128S760 138 900 130 1220 120 1440 128";

function Cerros() {
  const trazo = { fill: "none", strokeWidth: 1.25, vectorEffect: "non-scaling-stroke", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const nude = (opacidad: number) => ({ stopColor: "var(--mu-nude-fuerte)", stopOpacity: opacidad });
  return (
    <svg viewBox="0 0 1440 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" className="block h-24 w-full sm:h-36">
      <defs>
        <linearGradient id="mu-cerro-atras" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={nude(0.16)} />
          <stop offset="1" style={nude(0.04)} />
        </linearGradient>
        <linearGradient id="mu-cerro-medio" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--mu-cacao)" }} />
          <stop offset="1" style={{ stopColor: "var(--mu-cacao-hondo)" }} />
        </linearGradient>
        <radialGradient id="mu-neblina">
          <stop offset="0" style={{ stopColor: "var(--mu-sobre-cacao)", stopOpacity: 0.13 }} />
          <stop offset="1" style={{ stopColor: "var(--mu-sobre-cacao)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <path d={`${FILO_ATRAS}V150H0Z`} fill="url(#mu-cerro-atras)" />
      <path d={`${FILO_MEDIO}V150H0Z`} fill="url(#mu-cerro-medio)" />
      <ellipse cx="250" cy="104" rx="250" ry="14" fill="url(#mu-neblina)" />
      <ellipse cx="860" cy="96" rx="300" ry="16" fill="url(#mu-neblina)" />
      <ellipse cx="1240" cy="112" rx="220" ry="12" fill="url(#mu-neblina)" />
      <path d={`${FILO_FRENTE}V150H0Z`} className="fill-[var(--mu-cacao-hondo)]" />
      <path {...trazo} d={FILO_ATRAS} className="stroke-[var(--mu-nude-fuerte)] opacity-40" />
      <path {...trazo} d={FILO_MEDIO} className="stroke-[var(--mu-nude-fuerte)] opacity-25" />
      <path {...trazo} d={FILO_FRENTE} className="stroke-[var(--mu-nude-fuerte)] opacity-15" />
    </svg>
  );
}

export function Pie({
  nombre,
  descripcion,
  slug,
  whatsapp,
  redes,
}: {
  pagos: string | null;
  nombre: string;
  descripcion: string | null;
  slug: string;
  whatsapp: string | null;
  redes: { facebook?: string; instagram?: string; tiktok?: string };
}) {
  const r = rutas(slug);
  const enlace =
    "mu-subrayado mu-foco inline-flex min-h-11 items-center text-[0.9375rem] leading-snug text-[var(--mu-sobre-cacao-2)] transition-colors duration-[var(--mu-dur-corto)] hover:text-[var(--mu-sobre-cacao)] [--mu-subrayado-abajo:.55rem] [--mu-subrayado:var(--mu-oro)]";
  const titulo = "mu-kicker text-[var(--mu-oro)]";
  const seguro = (u?: string) => (u && /^https:\/\//.test(u) ? u : null);
  const fb = seguro(redes.facebook);
  const ig = seguro(redes.instagram);
  const red = "mu-foco inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--mu-sobre-cacao)]/25 transition-colors hover:bg-[var(--mu-sobre-cacao)]/10";

  return (
    <footer className="mu-grano bg-[linear-gradient(180deg,var(--mu-cacao)_0%,var(--mu-cacao-hondo)_100%)] text-[var(--mu-sobre-cacao)]">
      <div className={`${ANCHO} grid gap-8 border-b border-[var(--mu-sobre-cacao)]/15 pb-10 pt-12 sm:pt-16 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-16`}>
        <div>
          <Script claro grande>
            {DESPEDIDA.script}
          </Script>
          <p className="mt-3 text-[length:var(--mu-t-cuerpo)] text-[var(--mu-sobre-cacao-2)]">{DESPEDIDA.firma}</p>
        </div>
        <div>
          <p className={`${titulo} mb-2`}>Novedades y campañas</p>
          <Suscripcion />
        </div>
      </div>

      <div className={`${ANCHO} grid grid-cols-2 gap-x-6 gap-y-8 pb-2 pt-10 sm:pb-4 sm:pt-14 lg:grid-cols-[1.3fr_1fr_1.05fr_1.3fr_1.05fr] lg:gap-8`}>
        <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
          <a href={r.base} className="mu-foco flex items-center gap-4 self-start rounded-full leading-none">
            <Sello id="pie" claro className="h-[4.5rem] w-[4.5rem] shrink-0" />
            <span className="mu-serif text-[2rem] leading-none">{nombre}</span>
          </a>
          <p className="mu-cursiva -mt-1 text-[1.125rem] leading-snug text-[var(--mu-sobre-cacao-2)]">Belleza profesional, cerca de ti</p>
          <p className="line-clamp-3 max-w-sm text-[length:var(--mu-t-chico)] leading-relaxed text-[var(--mu-sobre-cacao-2)] sm:line-clamp-none">
            {descripcion ?? "Belleza profesional en Ciudad Constitución (Pasco): cabello, rostro y cuerpo, con asesoría gratis de Drucila por WhatsApp."}
          </p>
          {(fb || ig) && (
            <div className="flex gap-2">
              {ig && (
                <a href={ig} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={red}>
                  <Instagram className="h-5 w-5" aria-hidden="true" />
                </a>
              )}
              {fb && (
                <a href={fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={red}>
                  <Facebook className="h-5 w-5" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>

        <nav aria-label="Tienda">
          <p className={titulo}>Tienda</p>
          <ul className="mt-2">
            <li>
              <a href={r.catalogo} className={enlace}>
                Todo Musa
              </a>
            </li>
            {CATEGORIAS.map((c) => (
              <li key={c.nombre}>
                <a href={r.categoria(c.nombre)} className={enlace}>
                  {c.corto}
                </a>
              </li>
            ))}
            <li>
              <a href={r.mejorar} className={enlace}>
                ¿Qué quieres mejorar?
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Ayuda">
          <p className={titulo}>Ayuda</p>
          <ul className="mt-2">
            <li>
              <a href={`${r.base}/mis-pedidos`} className={enlace}>
                Mis pedidos
              </a>
            </li>
            <li>
              <a href={`${r.base}/cuenta`} className={enlace}>
                Mi cuenta
              </a>
            </li>
            <li>
              <a href={`${r.base}#protegida`} className={enlace}>
                Compra protegida
              </a>
            </li>
            <li>
              <a href={`${r.base}/libro-de-reclamaciones`} className={enlace}>
                Libro de reclamaciones
              </a>
            </li>
            <li>
              <a href={`${r.base}/terminos`} className={enlace}>
                Términos
              </a>
            </li>
            <li>
              <a href={`${r.base}/privacidad`} className={enlace}>
                Privacidad
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <p className={titulo}>Contacto</p>
          <ul className="mt-2">
            <li>
              <a href={enlaceWhatsapp(whatsapp, "Hola Drucila, quiero asesoría para elegir mis productos.")} target="_blank" rel="noopener noreferrer" className={enlace}>
                WhatsApp {CONTACTO.telefono}
              </a>
            </li>
            <li>
              <a href={enlaceWhatsapp(whatsapp, "Hola Drucila, quiero separar mi diagnóstico gratis del sábado.")} target="_blank" rel="noopener noreferrer" className={enlace}>
                Diagnóstico gratis (sábados)
              </a>
            </li>
          </ul>
          <p className="mt-2 text-[length:var(--mu-t-chico)] leading-relaxed text-[var(--mu-sobre-cacao-2)]">
            {CONTACTO.horario}
            <br />
            {CONTACTO.lugar}
          </p>
        </div>

        <div>
          <p className={titulo}>Pagos</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {PAGOS.map((p) => (
              <li key={p.metodo} className="flex items-center gap-3 text-[length:var(--mu-t-chico)] text-[var(--mu-sobre-cacao-2)]">
                <PaymentMethodIcon method={p.metodo} size={28} className="shrink-0" />
                {p.texto}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[length:var(--mu-t-chico)] leading-relaxed text-[var(--mu-sobre-cacao-2)]">Por encargo: se paga por adelantado.</p>
        </div>
      </div>

      <Cerros />
      <div className="bg-[var(--mu-cacao-hondo)]">
        {/* En el celular la píldora «Ver bolsa» flota abajo (56 px + 16): el pie deja ese aire para que no tape la última línea. */}
        <div className={`${ANCHO} flex flex-col gap-1.5 pb-24 pt-5 text-[length:var(--mu-t-chico)] text-[var(--mu-sobre-cacao-2)] sm:flex-row sm:items-center sm:justify-between sm:py-6`}>
          <p>
            © {new Date().getFullYear()} {nombre} · Belleza profesional, cerca de ti · Precios finales en soles.
          </p>
          <p>Ilustraciones referenciales · Envío gratis en Constitución</p>
        </div>
      </div>
    </footer>
  );
}
