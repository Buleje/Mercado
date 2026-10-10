/**
 * «Armados para que ahorres» (contrato visual 10-10, §e Kits) y, al pie, la
 * franja de la Campaña de Navidad.
 *
 * · El Kit Regalo especial (KT04) va destacado a 2 columnas, como la página 3
 *   del catálogo; los otros kits y los dúos, en grilla de 3 (carril con imán en
 *   el celular, con la siguiente tarjeta asomando). Las tarjetas son las del
 *   catálogo (`TarjetaProducto`: contador al agregar, «En tu bolsa»).
 * · «Por separado» y «ahorras» salen de `p.kit` (la suma de los precios de HOY de
 *   sus componentes, en el servidor) y sólo se muestran con ahorro real. Nunca
 *   se tacha un precio.
 * · Navidad (manual, «Campaña 01»: 9 nov – 31 dic 2026): los dúos con su precio de
 *   la base y el regalo con compra. Antes del 9 dice «Preventa»; después del 31
 *   la franja ya no sale (hora de Lima).
 */
import { ArrowRight, Gift, MessageCircle } from "@buleje/design-system/icons";
import { BotonAgregar } from "./BotonAgregar";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, hoyEnLima, rutas, solesCortos } from "./destinos";
import { EnlaceFicha } from "./EnlaceFicha";
import { imagenDe } from "./imagenes";
import { WHATSAPP_MUSA } from "./pedido-whatsapp";
import { BOTON_NUDE, Cabecera, FOCO, FOCO_CLARO, KICKER, externo } from "./Salon";
import { Escenario, Ilustracion, PildoraAhorro, TarjetaProducto } from "./TarjetaProducto";
import { ANCHO } from "./ui";

const DESTACADO = "KT04";
/** El orden del catálogo impreso (pág. 4): kits y, al final, los dúos de la campaña. */
const ORDEN = ["KT01", "KT02", "KT03", "KT05", "MU016-2", "MU013-2"];

/** Las reglas de la Campaña 01 que NO son precios de la base (manual y catálogo, pág. 3). */
const CAMPANA = {
  inicio: "2026-11-09",
  fin: "2026-12-31",
  /** «Regalo de 1 mascarilla desde S/ 150». */
  regaloDesde: 150,
  /** «Preventa desde el 16 nov (se separa con S/ 20)». */
  sena: 20,
  entregaHasta: "el 23 de diciembre",
  duos: ["MU016-2", "MU013-2"],
} as const;

const posicion = (p: ProductoSalon) => {
  const i = ORDEN.indexOf(p.codigo ?? "");
  return i < 0 ? ORDEN.length : i;
};

/**
 * Mancha orgánica de fondo (la de la pág. 3 del catálogo). Sobresale de la sección: por eso la sección
 * recorta con `overflow-clip` y no `hidden` (con `hidden` es contenedor de scroll y enfocar un botón de
 * abajo la corría 160 px hacia arriba, con un hueco vacío al pie; medido 10-10).
 */
function Mancha({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={`pointer-events-none absolute text-[var(--mu-nude-claro)] ${className}`}>
      <path
        fill="currentColor"
        d="M144.7 39.9C157.1 48.6 166 62.5 170.6 77.9 175.2 93.3 175.5 110.2 169.3 124.1 163.1 138 150.4 148.9 136.3 157.4 122.2 165.9 106.7 172 90.4 173.3 74.1 174.6 57 171.1 45.4 161 33.8 150.9 27.7 134.2 25.9 117.6 24.1 101 26.6 84.5 34.4 71.3 42.2 58.1 55.3 48.2 68.9 39.9 82.5 31.6 96.6 24.9 110.3 25.5 124 26.1 132.3 31.2 144.7 39.9Z"
      />
    </svg>
  );
}

function KitDestacado({ p }: { p: ProductoSalon }) {
  const kit = p.kit && p.kit.ahorro > 0 ? p.kit : null;
  const { src } = imagenDe(p);
  const nombres = p.kit?.componentes.map((c) => (c.cantidad > 1 ? `${c.cantidad} × ${c.nombre}` : c.nombre));
  return (
    <article data-mu-producto aria-labelledby="mu-kit-destacado" className="group mu-sombra-flotante relative grid overflow-clip rounded-[var(--mu-radio-tarjeta)] bg-[var(--surface-raised)] md:grid-cols-2">
      <EnlaceFicha p={p} data-mu-foto tabIndex={-1} aria-hidden="true" className="relative block">
        {/* El escenario ya trae el arco y la sombra del piso (como las tarjetas); cuadrado en el celular para que el kit se vea grande. */}
        <Escenario categoria={p.categoria} className="aspect-square sm:aspect-[4/3] md:aspect-auto md:h-full md:min-h-[27rem]">
          <Ilustracion p={p} sello="h-[36%] w-[36%]" className="transition-transform duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)] group-hover:-translate-y-1.5" />
        </Escenario>
        {kit && (
          <span className="absolute right-4 top-4 flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[var(--mu-boton-fondo)] text-center text-[var(--mu-boton-texto)] sm:right-6 sm:top-6 sm:h-28 sm:w-28">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Ahorra</span>
            <span className="mu-num text-2xl leading-none sm:text-[32px]">{solesCortos(kit.ahorro)}</span>
          </span>
        )}
      </EnlaceFicha>
      <div className="@container flex flex-col justify-center p-6 sm:p-10 lg:p-12">
        <p className={`${KICKER} text-[var(--mu-acento-tinta)]`}>El kit más regalado</p>
        <h3 id="mu-kit-destacado" className="mu-display mt-3 text-[length:var(--mu-t-titulo)] leading-none text-[var(--text-primary)] sm:text-[calc(var(--mu-t-seccion)*0.8)]">
          El regalo que sí se usa
          {/* Cursiva y no script: la script de esta vista ya es «y te llegue todo junto» (una por vista). */}
          <span className="mu-cursiva mt-2 block text-[length:var(--mu-t-script)] leading-tight text-[var(--mu-rosa-tinta)]">para mamá, para ella, para ti</span>
        </h3>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
          <EnlaceFicha p={p} className={`rounded-sm hover:underline hover:underline-offset-4 ${FOCO}`}>
            {p.nombre}
          </EnlaceFicha>
        </p>
        {nombres && <p className="mt-1 text-[length:var(--mu-t-chico)] leading-relaxed text-[var(--text-secondary)]">{nombres.join(" + ")}. En caja de regalo.</p>}
        <p className="mt-1 text-[12px] font-medium text-[var(--mu-acento-tinta)]">
          Cód. {p.codigo}
          {p.kit && ` · incluye ${p.kit.componentes.map((c) => c.codigo).join(", ")}`}
        </p>
        <p className={`${KICKER} mt-6 text-[var(--text-tertiary)]`}>Precio Musa</p>
        <p className="mu-precio mt-1 text-[length:var(--mu-t-precio)] leading-none text-[var(--text-primary)]">{solesCortos(p.precio)}</p>
        {kit && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[length:var(--mu-t-chico)] text-[var(--text-tertiary)]">
            Por separado {solesCortos(kit.porSeparado)} <PildoraAhorro ahorro={kit.ahorro} />
          </p>
        )}
        <div className="mt-6 w-full max-w-[20rem]">
          <BotonAgregar
            variante="grande"
            producto={{
              id: p.id,
              name: p.nombre,
              category: p.categoria,
              price: p.precio,
              image: src ?? "",
              unit: p.unidad,
              ...(p.stock !== null ? { stock: p.stock } : {}),
            }}
          />
        </div>
      </div>
    </article>
  );
}

/** La franja de la Campaña de Navidad (cacao, como el pie de la pág. 3 del catálogo). */
function Navidad({ productos, whatsapp }: { productos: readonly ProductoSalon[]; whatsapp: string }) {
  const hoy = hoyEnLima();
  if (hoy > CAMPANA.fin) return null;
  const antes = hoy < CAMPANA.inicio;
  const duos = CAMPANA.duos.map((c) => productos.find((p) => p.codigo === c)).filter((p): p is ProductoSalon => p !== undefined);
  const celda = "flex h-full flex-col rounded-2xl focus-visible:rounded-2xl! p-4 ring-1 ring-[var(--mu-sobre-cacao)]/15 sm:p-5";
  return (
    <aside aria-labelledby="mu-navidad" className="mu-grano relative mt-10 overflow-clip rounded-[var(--mu-radio-tarjeta)] bg-[var(--mu-cacao)] text-[var(--mu-sobre-cacao)] sm:mt-14 dark:ring-1 dark:ring-[var(--rule-base)]">
      <div className="relative z-[1] grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className={`${KICKER} text-[var(--mu-oro)]`}>{antes ? "Preventa · desde el 9 de noviembre" : "Campaña 01 · hasta el 31 de diciembre"}</p>
          <h3 id="mu-navidad" className="mu-display mt-3 text-[length:var(--mu-t-titulo)] leading-none sm:text-[calc(var(--mu-t-seccion)*0.7)]">
            Ofertas de <span className="mu-cursiva normal-case tracking-normal">Navidad</span>
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--mu-sobre-cacao-2)]">
            Del 9 de noviembre al 31 de diciembre de 2026. Separa tu kit con {solesCortos(CAMPANA.sena)} y recíbelo en caja de regalo hasta {CAMPANA.entregaHasta}.
          </p>
          <a href={enlaceWhatsapp(whatsapp, "Hola Drucila, quiero separar mi pedido de Navidad.")} {...externo} className={`${BOTON_NUDE} mt-6`}>
            <MessageCircle className="h-5 w-5" aria-hidden="true" /> Separar por WhatsApp
          </a>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {duos.map((p) => (
            <li key={p.id}>
              <EnlaceFicha p={p} className={`${celda} group transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-sobre-cacao)]/[.06] ${FOCO_CLARO}`}>
                {/* 2 líneas reservadas en el celular: los precios de las dos celdas quedan a la misma altura. */}
                <span className="min-h-[2lh] text-sm font-semibold leading-snug sm:min-h-0">{p.nombre}</span>
                <span className="mu-precio mt-2 text-[32px] leading-none text-[var(--mu-oro)] sm:text-[36px]">{solesCortos(p.precio)}</span>
                {p.kit && p.kit.ahorro > 0 && (
                  <>
                    <span className="mt-1.5 text-[13px] text-[var(--mu-sobre-cacao-2)]">
                      Por separado <span className="whitespace-nowrap">{solesCortos(p.kit.porSeparado)}</span>
                    </span>
                    <span className="mt-2 self-start rounded-full bg-[var(--mu-oro)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mu-cacao)]">Ahorras {solesCortos(p.kit.ahorro)}</span>
                  </>
                )}
                <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[13px] font-semibold">
                  Ver oferta <ArrowRight className="h-3.5 w-3.5 transition-transform duration-[var(--mu-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </EnlaceFicha>
            </li>
          ))}
          <li className={`${celda} col-span-2 sm:col-span-1`}>
            <Gift className="h-6 w-6 text-[var(--mu-oro)]" strokeWidth={1.6} aria-hidden="true" />
            <span className="mt-2 text-sm font-semibold">De regalo, 1 mascarilla en lámina</span>
            <span className="mt-1 text-[13px] text-[var(--mu-sobre-cacao-2)]">
              con tu compra desde <span className="whitespace-nowrap">{solesCortos(CAMPANA.regaloDesde)}</span>.
            </span>
          </li>
        </ul>
      </div>
    </aside>
  );
}

export function Promos({ productos, slug, whatsapp = null }: { productos: readonly ProductoSalon[]; slug: string; whatsapp?: string | null }) {
  const kits = productos.filter((p) => p.categoria === "Kits y ofertas");
  if (kits.length === 0) return null;
  const destacado = kits.find((p) => p.codigo === DESTACADO);
  const resto = kits.filter((p) => p !== destacado).sort((a, b) => posicion(a) - posicion(b) || a.precio - b.precio);
  const verTodo = (
    <a href={rutas(slug).categoria("Kits y ofertas")} className={`group inline-flex h-11 items-center gap-2 self-start border-b border-[var(--text-primary)] text-[15px] font-semibold text-[var(--text-primary)] ${FOCO}`}>
      Ver todos los kits
      <ArrowRight className="h-4 w-4 transition-transform duration-[var(--mu-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
    </a>
  );
  return (
    <section id="ofertas" aria-labelledby="mu-kits" className="relative scroll-mt-24 overflow-clip bg-[var(--mu-tinte-kits)] py-12 sm:py-24">
      <Mancha className="-right-40 -top-20 h-[36rem] w-[36rem] opacity-70" />
      <Mancha className="-bottom-40 -left-48 h-[30rem] w-[30rem] rotate-90 opacity-60" />
      <div className={`${ANCHO} relative`}>
        <Cabecera id="mu-kits" kicker="Kits de Navidad" titulo="Armados para que ahorres" script="y te llegue todo junto" accion={verTodo} />
        {destacado && <KitDestacado p={destacado} />}
        {resto.length > 0 && (
          <div
            role="region"
            aria-label="Más kits y dúos"
            tabIndex={0}
            className={`mu-sin-barra -mx-4 mt-6 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:mt-8 sm:scroll-px-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0 md:pb-0 ${FOCO}`}
          >
            <ul className="flex gap-4 md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {resto.map((p) => (
                <li key={p.id} className="w-[calc(100%-2.5rem)] shrink-0 snap-start sm:w-[calc(50%-1.5rem)] md:w-auto">
                  <TarjetaProducto p={p} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <Navidad productos={productos} whatsapp={whatsapp ?? WHATSAPP_MUSA} />
      </div>
    </section>
  );
}
