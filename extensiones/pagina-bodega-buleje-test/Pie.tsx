/**
 * Franja de beneficios + pie de la tienda (columnas, redes, suscripción y los
 * enlaces legales que ya existen en la tienda: pedidos, reclamaciones,
 * términos y privacidad).
 */
import { Facebook, Instagram, MessageCircle, ShieldCheck, Truck, Wallet } from "@buleje/design-system/icons";
import { BENEFICIOS, CATEGORIAS } from "./anuncios";
import { enlaceWhatsapp, rellenar, rutas } from "./destinos";
import { Suscripcion } from "./Suscripcion";
import { ANCHO } from "./ui";

const ICONOS = { camion: Truck, pago: Wallet, escudo: ShieldCheck, chat: MessageCircle } as const;

export function Beneficios({ pagos, nombre }: { pagos: string | null; nombre: string }) {
  const items = BENEFICIOS.map((b) => ({ ...b, texto: rellenar(b.texto, { pagos }) })).filter((b) => b.texto);
  return (
    <section aria-label={`Por qué comprar en ${nombre}`} className="border-y border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <ul className={`${ANCHO} grid grid-cols-1 gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4`}>
        {items.map((b) => {
          const Icono = ICONOS[b.icono];
          return (
            <li key={b.titulo} className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bb-rubor)] text-[var(--bb-vino)]">
                <Icono className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-base font-semibold text-[var(--text-primary)]">{b.titulo}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-[var(--text-secondary)]">{b.texto}</span>
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
  const [primera, ...resto] = nombre.trim().split(/\s+/);
  const enlace = "inline-flex min-h-11 items-center text-base text-[var(--bb-sobre-tinta-2)] transition hover:text-[var(--bb-sobre-tinta)] hover:underline";
  const titulo = "text-sm font-semibold uppercase tracking-[0.22em] text-[var(--bb-oro)]";
  const seguro = (u?: string) => (u && /^https:\/\//.test(u) ? u : null);
  const fb = seguro(redes.facebook);
  const ig = seguro(redes.instagram);

  return (
    <footer className="bg-[var(--bb-tinta)] text-[var(--bb-sobre-tinta)]">
      <div className={`${ANCHO} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.5fr] lg:gap-8`}>
        <div className="flex flex-col gap-4">
          <a href={r.base} className="flex flex-col leading-none">
            <span className="bb-serif text-4xl">{primera}</span>
            {resto.length > 0 && <span className="mt-1 text-xs font-semibold uppercase tracking-[0.46em] text-[var(--bb-oro)]">{resto.join(" ")}</span>}
          </a>
          <p className="text-base leading-relaxed text-[var(--bb-sobre-tinta-2)]">
            {descripcion ?? "Salón y cosmética capilar: productos profesionales para tu rutina y estilistas que te asesoran."}
          </p>
          {(fb || ig) && (
            <div className="flex gap-2">
              {ig && (
                <a href={ig} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--bb-sobre-tinta)]/25 hover:bg-[var(--bb-sobre-tinta)]/10">
                  <Instagram className="h-5 w-5" aria-hidden="true" />
                </a>
              )}
              {fb && (
                <a href={fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--bb-sobre-tinta)]/25 hover:bg-[var(--bb-sobre-tinta)]/10">
                  <Facebook className="h-5 w-5" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>

        <nav aria-label="Tienda">
          <p className={titulo}>Tienda</p>
          <ul className="mt-3">
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

        <nav aria-label="Salón">
          <p className={titulo}>Salón</p>
          <ul className="mt-3">
            <li>
              <a href="#servicios" className={enlace}>
                Servicios y precios
              </a>
            </li>
            <li>
              <a href={enlaceWhatsapp(whatsapp, "Hola, quiero reservar una cita en el salón.")} target="_blank" rel="noopener noreferrer" className={enlace}>
                Reservar por WhatsApp
              </a>
            </li>
            <li>
              <a href={enlaceWhatsapp(whatsapp, "Hola, quiero ayuda para elegir productos para mi cabello.")} target="_blank" rel="noopener noreferrer" className={enlace}>
                Asesoría de productos
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

        <div>
          <p className={titulo}>Suscríbete</p>
          <div className="mt-4">
            <Suscripcion />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--bb-sobre-tinta)]/15">
        <div className={`${ANCHO} flex flex-col gap-2 py-6 text-sm text-[var(--bb-sobre-tinta-2)] sm:flex-row sm:items-center sm:justify-between`}>
          <p>
            © {new Date().getFullYear()} {nombre}. Precios en soles, con IGV.
          </p>
          {pagos && <p>Paga con {pagos}</p>}
        </div>
      </div>
    </footer>
  );
}
