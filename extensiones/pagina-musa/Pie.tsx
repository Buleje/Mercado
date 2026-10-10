/**
 * Franja de beneficios + pie de la tienda (columnas, redes, suscripción y los
 * enlaces legales que ya existen en la tienda: pedidos, reclamaciones,
 * términos y privacidad).
 *
 * En el celular: beneficios en una fila que se desliza; las categorías del pie en una fila que
 * baja de línea, «Salón» y «Ayuda» lado a lado; al final, la firma del salón
 * en grande (decorativa).
 */
import { Facebook, Instagram, MessageCircle, ShieldCheck, Truck, Wallet } from "@buleje/design-system/icons";
import { BENEFICIOS, CATEGORIAS } from "./anuncios";
import { Sello } from "./Sello";
import { enlaceWhatsapp, rellenar, rutas } from "./destinos";
import { Suscripcion } from "./Suscripcion";
import { ANCHO } from "./ui";

const ICONOS = { camion: Truck, pago: Wallet, escudo: ShieldCheck, chat: MessageCircle } as const;

export function Beneficios({ pagos, nombre }: { pagos: string | null; nombre: string }) {
  const items = BENEFICIOS.map((b) => ({ ...b, texto: rellenar(b.texto, { pagos }) })).filter((b) => b.texto);
  return (
    <section aria-label={`Por qué comprar en ${nombre}`} className="border-y border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      {/* Celular: una fila que se desliza (con imán y el borde derecho desvanecido); desde 640 px, grilla. */}
      <ul className={`${ANCHO} mu-sin-barra mu-desvanecer mu-desvanecer-sm flex snap-x snap-proximity scroll-px-4 gap-5 overflow-x-auto py-6 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:py-10 lg:grid-cols-4`}>
        {items.map((b, i) => {
          const Icono = ICONOS[b.icono];
          return (
            <li key={b.titulo} className={`flex w-[78%] shrink-0 snap-start items-start gap-4 sm:w-auto ${i === items.length - 1 ? "pr-8 sm:pr-0" : ""}`}>
              <span className="inline-flex h-12 w-11 shrink-0 items-center justify-center rounded-b-xl rounded-t-full bg-[var(--mu-nude-claro)] text-[var(--mu-acento-tinta)]">
                <Icono className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-base font-semibold leading-snug text-[var(--text-primary)]">{b.titulo}</span>
                <span className="mt-1 block text-sm leading-relaxed text-[var(--text-secondary)]">{b.texto}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Pie({
  nombre,
  descripcion,
  slug,
  whatsapp,
  redes,
  pagos,
}: {
  pagos: string | null;
  nombre: string;
  descripcion: string | null;
  slug: string;
  whatsapp: string | null;
  redes: { facebook?: string; instagram?: string; tiktok?: string };
}) {
  const r = rutas(slug);
  const enlace = "inline-flex min-h-11 items-center text-base text-[var(--mu-sobre-cacao-2)] transition hover:text-[var(--mu-sobre-cacao)] hover:underline";
  const titulo = "text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--mu-sobre-cacao)]";
  const seguro = (u?: string) => (u && /^https:\/\//.test(u) ? u : null);
  const fb = seguro(redes.facebook);
  const ig = seguro(redes.instagram);

  return (
    <footer className="bg-[var(--mu-cacao)] text-[var(--mu-sobre-cacao)]">
      <div className={`${ANCHO} grid grid-cols-2 gap-x-6 gap-y-7 py-10 sm:py-14 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.5fr] lg:gap-8`}>
        <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
          <a href={r.base} className="flex items-center gap-4 leading-none">
            <Sello id="pie" claro className="h-20 w-20 shrink-0" />
            <span className="flex flex-col">
              <span className="mu-display text-4xl tracking-[0.18em]">{nombre}</span>
              <span className="mt-1.5 text-sm text-[var(--mu-sobre-cacao-2)]">Belleza profesional, cerca de ti</span>
            </span>
          </a>
          <p className="line-clamp-3 text-base leading-relaxed text-[var(--mu-sobre-cacao-2)] sm:line-clamp-none">
            {descripcion ?? "Belleza profesional en Ciudad Constitución (Pasco): cabello, rostro y cuerpo, con asesoría gratis de Drucila por WhatsApp."}
          </p>
          {(fb || ig) && (
            <div className="flex gap-2">
              {ig && (
                <a href={ig} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--mu-sobre-cacao)]/25 hover:bg-[var(--mu-sobre-cacao)]/10">
                  <Instagram className="h-5 w-5" aria-hidden="true" />
                </a>
              )}
              {fb && (
                <a href={fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--mu-sobre-cacao)]/25 hover:bg-[var(--mu-sobre-cacao)]/10">
                  <Facebook className="h-5 w-5" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>

        <nav aria-label="Tienda" className="col-span-2 lg:col-span-1">
          <p className={titulo}>Tienda</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 lg:mt-3 lg:block">
            {CATEGORIAS.map((c) => (
              <li key={c.nombre}>
                <a href={r.categoria(c.nombre)} className={enlace}>
                  {c.corto}
                </a>
              </li>
            ))}
            <li>
              <a href={r.ofertas} className={enlace}>
                Ofertas
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Musa">
          <p className={titulo}>Musa</p>
          <ul className="mt-3">
            <li>
              <a href={enlaceWhatsapp(whatsapp, "Hola Drucila, quiero asesoría para elegir mis productos.")} target="_blank" rel="noopener noreferrer" className={enlace}>
                Asesoría gratis · 921 585 006
              </a>
            </li>
            <li>
              <a href={enlaceWhatsapp(whatsapp, "Hola Drucila, quiero separar mi diagnóstico gratis del sábado.")} target="_blank" rel="noopener noreferrer" className={enlace}>
                Diagnóstico gratis los sábados
              </a>
            </li>
            <li>
              <a href={r.mejorar} className={enlace}>
                ¿Qué quieres mejorar?
              </a>
            </li>
            <li>
              <a href={`${r.base}#protegida`} className={enlace}>
                Tu compra está protegida
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Ayuda">
          <p className={titulo}>Ayuda</p>
          <ul className="mt-3">
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
              <a href={`${r.base}/libro-de-reclamaciones`} className={enlace}>
                Libro de reclamaciones
              </a>
            </li>
            <li>
              <a href={`${r.base}/terminos`} className={enlace}>
                Términos y condiciones
              </a>
            </li>
            <li>
              <a href={`${r.base}/privacidad`} className={enlace}>
                Privacidad
              </a>
            </li>
          </ul>
        </nav>

        <div className="col-span-2 lg:col-span-1">
          <p className={titulo}>Suscríbete</p>
          <div className="mt-4">
            <Suscripcion />
          </div>
        </div>
      </div>
      <p aria-hidden="true" className={`${ANCHO} mu-display select-none overflow-hidden whitespace-nowrap text-[19vw] leading-[0.8] text-[var(--mu-sobre-cacao)]/[0.09] lg:text-[13.5rem]`}>
        {nombre}
      </p>
      <div className="border-t border-[var(--mu-sobre-cacao)]/15">
        <div className={`${ANCHO} flex flex-col gap-2 py-5 text-sm sm:py-6 text-[var(--mu-sobre-cacao-2)] sm:flex-row sm:items-center sm:justify-between`}>
          <p>
            © {new Date().getFullYear()} {nombre} · Belleza profesional, cerca de ti. Precios en soles, con IGV.
          </p>
          <p>Envío gratis en Constitución · Yape, Plin, transferencia o contraentrega</p>
        </div>
      </div>
    </footer>
  );
}
