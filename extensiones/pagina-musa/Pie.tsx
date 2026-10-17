/**
 * Franja de beneficios + pie de la tienda (contrato §e).
 *
 * El pie (16-10, minimalista): gris muy claro y plano (`--mu-cacao`, que en
 * oscuro es el gris hondo), separado por un filo fino. Arriba la despedida
 * («Gracias, linda») con la firma del manual y la suscripción; después las
 * columnas Tienda · Ayuda · Contacto · Pagos (`PaymentMethodIcon` del DS).
 * Sin cerros, grano ni degradé: la jerarquía la dan el tamaño y el peso.
 */
import { Facebook, Instagram, MessageCircle, ShieldCheck, Truck, Wallet } from "@buleje/design-system/icons";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";
import { BENEFICIOS, CATEGORIAS, CONTACTO, DESPEDIDA, PAGOS } from "./anuncios";
import { enlaceWhatsapp, rellenar, rutas } from "./destinos";
import { avisoEnviosProvincia } from "./preventa";
import { Sello } from "./Sello";
import { Suscripcion } from "./Suscripcion";
import { ANCHO } from "./ui";

const ICONOS = { camion: Truck, pago: Wallet, escudo: ShieldCheck, chat: MessageCircle } as const;

/** Columnas desde 1024 px según cuántos quedan (con 2, la grilla de 4 dejaba media fila vacía). */
const COLUMNAS_LG: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

/**
 * `sin`: los íconos que la vista ya cuenta arriba. En la portada va justo después de
 * «Tu compra está protegida» (garantía + asesoría con el número), así que ahí no se repiten.
 */
export function Beneficios({ pagos, nombre, sin = [] }: { pagos: string | null; nombre: string; sin?: readonly (typeof BENEFICIOS)[number]["icono"][] }) {
  // Envíos: para Navidad, a provincia hasta el 18 dic (manual); después del 18, la línea se va sola.
  const navidad = avisoEnviosProvincia();
  const items = BENEFICIOS.filter((b) => !sin.includes(b.icono))
    .map((b) => {
      const texto = rellenar(b.texto, { pagos });
      return { ...b, texto: texto && b.icono === "camion" && navidad ? `${texto} ${navidad}` : texto };
    })
    .filter((b) => b.texto);
  return (
    <section aria-label={`Por qué comprar en ${nombre}`} className="border-y border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      {/* Celular: una fila que se desliza (con imán y el borde derecho desvanecido); desde 640 px, grilla. */}
      <ul className={`${ANCHO} mu-sin-barra mu-desvanecer mu-desvanecer-sm flex snap-x snap-proximity scroll-px-4 gap-5 overflow-x-auto py-6 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:py-10 ${COLUMNAS_LG[items.length] ?? "lg:grid-cols-4"}`}>
        {items.map((b, i) => {
          const Icono = ICONOS[b.icono];
          return (
            <li key={b.titulo} className={`flex w-[78%] shrink-0 snap-start items-start gap-4 sm:w-auto ${i === items.length - 1 ? "pr-8 sm:pr-0" : ""}`}>
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
                <Icono className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-base font-semibold leading-snug text-[var(--text-primary)]">{b.titulo}</span>
                <span className="mt-1 block text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{b.texto}</span>
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
    "mu-subrayado mu-foco inline-flex min-h-12 items-center text-base leading-snug text-[var(--mu-sobre-cacao-2)] transition-colors duration-[var(--mu-dur-corto)] hover:text-[var(--mu-sobre-cacao)] [--mu-subrayado-abajo:.55rem] [--mu-subrayado:var(--mu-sobre-cacao)]";
  const titulo = "mu-kicker font-semibold text-[var(--mu-sobre-cacao)]";
  const seguro = (u?: string) => (u && /^https:\/\//.test(u) ? u : null);
  const fb = seguro(redes.facebook);
  const ig = seguro(redes.instagram);
  const red = "mu-foco inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--mu-sobre-cacao)]/25 transition-colors hover:bg-[var(--mu-sobre-cacao)]/10";

  return (
    <footer className="border-t border-[var(--rule-soft)] bg-[var(--mu-cacao)] text-[var(--mu-sobre-cacao)]">
      <div className={`${ANCHO} grid gap-8 border-b border-[var(--rule-base)] pb-10 pt-12 sm:pt-16 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-16`}>
        <div>
          <p className="mu-titulo text-[length:var(--mu-t-bloque)] text-[var(--mu-sobre-cacao)]">{DESPEDIDA.script}</p>
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
            <Sello id="pie" claro simple className="h-12 w-12 shrink-0" />
            <span className="mu-serif text-[1.5rem] leading-none">{nombre}</span>
          </a>
          <p className="-mt-1 text-base leading-snug text-[var(--mu-sobre-cacao-2)]">Belleza profesional, cerca de ti</p>
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

      <div className="mt-8 border-t border-[var(--rule-base)]">
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
