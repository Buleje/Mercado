/**
 * El pie de la tienda (como el de Musa, `pagina-musa/Pie.tsx`): gris muy claro
 * y plano (`--ti-suave`, que en oscuro es el gris hondo), separado por un filo
 * fino. Arriba el agradecimiento con el nombre del negocio y, si tiene
 * WhatsApp, el botón para escribirle; después las columnas Tienda · Ayuda ·
 * Contacto · Pagos. La jerarquía la dan el tamaño y el peso.
 *
 * Todo sale de `NegocioTienda`; lo que falta no se inventa: sin WhatsApp,
 * horario ni dirección, la columna Contacto no aparece; sin medios de pago,
 * tampoco Pagos; las redes sólo con un enlace `https://`.
 */
import { Facebook, Instagram, MessageCircle, Music } from "@buleje/design-system/icons";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";
import type { MedioDePago, NegocioTienda } from "./contenido";
import { Sello } from "./Sello";
import { ANCHO, BOTON_BORDE, EXTERNO, enlaceWhatsapp, numeroVisible, rutasTienda } from "./ui";

export type CategoriaEnlace = { nombre: string; categoria: string };

type NegocioPie = Pick<NegocioTienda, "slug" | "nombre" | "lema" | "descripcion" | "logo" | "whatsapp" | "horario" | "direccion" | "redes" | "pagos">;

const TEXTO_PAGO: Record<MedioDePago, string> = {
  Yape: "Yape",
  Plin: "Plin",
  Efectivo: "Efectivo",
  Tarjeta: "Tarjeta",
  Transferencia: "Transferencia bancaria",
};

/** Columnas desde 1024 px según cuántas quedan (la marca, un poco más ancha). */
const COLUMNAS_LG: Record<number, string> = {
  3: "lg:grid-cols-[1.3fr_1fr_1fr]",
  4: "lg:grid-cols-[1.3fr_1fr_1.05fr_1.1fr]",
  5: "lg:grid-cols-[1.3fr_1fr_1.05fr_1.3fr_1.05fr]",
};

const seguro = (u?: string): string | null => (u && /^https:\/\//.test(u) ? u : null);

export function Pie({
  negocio,
  categorias,
  politicas = true,
}: {
  negocio: NegocioPie;
  categorias: readonly CategoriaEnlace[];
  /** Hay bloque `#politicas` en la portada (sin envío, pagos ni cambios cargados, no se enlaza a la nada). */
  politicas?: boolean;
}) {
  const r = rutasTienda(negocio.slug);
  const enlace =
    "ti-subrayado ti-foco inline-flex min-h-12 items-center text-base leading-snug text-[var(--ti-texto-2)] transition-colors duration-[var(--ti-dur-corto)] hover:text-[var(--ti-texto)] [--ti-subrayado-abajo:.55rem]";
  const titulo = "ti-kicker font-semibold text-[var(--ti-texto)]";
  const chico = "text-sm leading-relaxed text-[var(--ti-texto-2)]";
  const red = "ti-foco inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--ti-linea)] text-[var(--ti-texto)] transition-colors hover:bg-[var(--ti-fondo)]";
  const redes = [
    { nombre: "Instagram", href: seguro(negocio.redes.instagram), Icono: Instagram },
    { nombre: "Facebook", href: seguro(negocio.redes.facebook), Icono: Facebook },
    { nombre: "TikTok", href: seguro(negocio.redes.tiktok), Icono: Music },
  ].filter((x): x is { nombre: string; href: string; Icono: typeof Instagram } => x.href !== null);
  const wa = negocio.whatsapp ? enlaceWhatsapp(negocio.whatsapp, `Hola ${negocio.nombre}, tengo una consulta.`) : null;
  const hayContacto = Boolean(wa || negocio.horario || negocio.direccion);
  const hayPagos = negocio.pagos.length > 0;
  const columnas = 3 + (hayContacto ? 1 : 0) + (hayPagos ? 1 : 0);

  return (
    <footer className="border-t border-[var(--ti-linea-suave)] bg-[var(--ti-suave)] text-[var(--ti-texto)]">
      <div className={`${ANCHO} grid gap-6 border-b border-[var(--ti-linea)] pb-10 pt-12 sm:pt-16 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-16`}>
        <p className="ti-titulo text-[length:var(--ti-t-bloque)]">Gracias por comprar en {negocio.nombre}</p>
        {wa && (
          <div className="lg:justify-self-end">
            <a href={wa} {...EXTERNO} className={BOTON_BORDE}>
              <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              Escríbenos por WhatsApp
            </a>
          </div>
        )}
      </div>

      <div className={`${ANCHO} grid grid-cols-2 gap-x-6 gap-y-8 pb-2 pt-10 sm:pb-4 sm:pt-14 lg:gap-8 ${COLUMNAS_LG[columnas]}`}>
        <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
          <a href={r.base} className="ti-foco flex items-center gap-4 self-start rounded-full leading-none">
            <Sello nombre={negocio.nombre} logo={negocio.logo} className="h-12 w-12" />
            <span className="ti-nombre text-2xl leading-none">{negocio.nombre}</span>
          </a>
          {negocio.lema && <p className="-mt-1 text-base leading-snug text-[var(--ti-texto-2)]">{negocio.lema}</p>}
          {negocio.descripcion && <p className={`line-clamp-3 max-w-sm sm:line-clamp-none ${chico}`}>{negocio.descripcion}</p>}
          {redes.length > 0 && (
            <div className="flex gap-2">
              {redes.map(({ nombre, href, Icono }) => (
                <a key={nombre} href={href} {...EXTERNO} aria-label={nombre} className={red}>
                  <Icono className="h-5 w-5" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>

        <nav aria-label="Tienda">
          <p className={titulo}>Tienda</p>
          <ul className="mt-2">
            <li>
              <a href={r.catalogo} className={enlace}>
                Ver todo
              </a>
            </li>
            {categorias.slice(0, 8).map((c) => (
              <li key={c.categoria}>
                <a href={r.categoria(c.categoria)} className={enlace}>
                  {c.nombre}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Ayuda">
          <p className={titulo}>Ayuda</p>
          <ul className="mt-2">
            {[
              { texto: "Mis pedidos", href: `${r.base}/mis-pedidos` },
              { texto: "Mi cuenta", href: `${r.base}/cuenta` },
              ...(politicas ? [{ texto: "Envíos, pagos y cambios", href: r.politicas }] : []),
              { texto: "Libro de reclamaciones", href: `${r.base}/libro-de-reclamaciones` },
              { texto: "Términos", href: `${r.base}/terminos` },
              { texto: "Privacidad", href: `${r.base}/privacidad` },
            ].map((e) => (
              <li key={e.href}>
                <a href={e.href} className={enlace}>
                  {e.texto}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {hayContacto && (
          <div>
            <p className={titulo}>Contacto</p>
            {wa && negocio.whatsapp && (
              <ul className="mt-2">
                <li>
                  <a href={wa} {...EXTERNO} className={enlace}>
                    WhatsApp {numeroVisible(negocio.whatsapp)}
                  </a>
                </li>
              </ul>
            )}
            {(negocio.horario || negocio.direccion) && (
              <p className={`mt-2 ${chico}`}>
                {negocio.horario}
                {negocio.horario && negocio.direccion && <br />}
                {negocio.direccion}
              </p>
            )}
          </div>
        )}

        {hayPagos && (
          <div>
            <p className={titulo}>Pagos</p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {negocio.pagos.map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm text-[var(--ti-texto-2)]">
                  <PaymentMethodIcon method={p} size={28} className="shrink-0" />
                  {TEXTO_PAGO[p]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-[var(--ti-linea)]">
        {/* En el celular la píldora de la bolsa flota abajo: el pie deja ese aire para que no tape la última línea. */}
        <div className={`${ANCHO} flex flex-col gap-1.5 pb-24 pt-5 text-sm text-[var(--ti-texto-2)] sm:flex-row sm:items-center sm:justify-between sm:py-6`}>
          <p>
            © {new Date().getFullYear()} {negocio.nombre}
            {negocio.lema ? ` · ${negocio.lema}` : ""}
          </p>
          <p>Precios finales en soles.</p>
        </div>
      </div>
    </footer>
  );
}
