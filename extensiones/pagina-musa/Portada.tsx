/**
 * El héroe de la portada (11-10, «más general y más creativo»): UNO solo, sin
 * carrusel, sobre el papel de la tienda. Izquierda: el título en la serif
 * del par de letras con su cursiva, una línea y UN botón. Derecha: la vitrina
 * de Musa, un arco nude con una repisa kraft y cinco envases de las tres líneas
 * (cabello, rostro, cuerpo): la tienda entera de un vistazo, no sólo la campaña.
 * Cada envase abre su ficha y, con mouse o foco, dice nombre y precio DE LA BASE;
 * el sello «Kits desde S/ X» (el menor precio de los kits) lleva a los kits.
 *
 * Rápido: el título es el LCP (texto, sin esperar fotos ni la script); los envases
 * son los webp de 480 px (5-6 KB cada uno) y salen sin esperar la vitrina. Con la
 * vitrina llegan los enlaces, los precios y el sello. Nada se mueve solo: sólo
 * el envase que tocas sube un poco (y nada con «reducir movimiento»).
 */
import { Suspense, type CSSProperties } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { HEROE } from "./anuncios";
import { cargarVitrina, type ProductoSalon } from "./datos";
import { rutas, solesCortos } from "./destinos";
import { EnlaceFicha } from "./EnlaceFicha";
import { anchosIlustracion, CARPETA_ILUSTRACIONES } from "./imagenes";
import { ANCHO, BOTON, Destello } from "./ui";

/**
 * Los envases de la repisa, de izquierda a derecha (cabello, rostro, cuerpo,
 * rostro: alto, medio, ancho, alto). El webp es cuadrado con mucho aire
 * transparente: cada uno se recorta a su `ventana` (fracciones del cuadrado,
 * medidas con sharp sobre el canal alfa, con la sombra del piso) para que los
 * envases se vean grandes sin que el aire de uno tape el clic del vecino. Todos
 * con la misma escala: el ancho de cada caja es proporcional a su ventana.
 */
const REPISA = [
  { codigo: "MU001", corto: "Shampoo sin sal", ventana: { x0: 0.32, x1: 0.68, y0: 0.24 } },
  { codigo: "MU010", corto: "Sérum de vitamina C", ventana: { x0: 0.32, x1: 0.68, y0: 0.27 } },
  { codigo: "MU017", corto: "Crema corporal", ventana: { x0: 0.21, x1: 0.81, y0: 0.42 } },
  { codigo: "MU013", corto: "Protector FPS 50", ventana: { x0: 0.31, x1: 0.69, y0: 0.25 } },
] as const;

/** Hasta dónde llega el dibujo abajo (incluye la sombra del piso). */
const PISO = 0.97;
/** Lo que queda para los envases después de los huecos entre ellos (3 × 4 %). */
const LIBRE = 88;
const ANCHO_TOTAL = REPISA.reduce((t, r) => t + r.ventana.x1 - r.ventana.x0, 0);

type EnvaseRepisa = (typeof REPISA)[number];

function estiloCaja({ ventana: v }: EnvaseRepisa): CSSProperties {
  const w = v.x1 - v.x0;
  return { width: `${((w / ANCHO_TOTAL) * LIBRE).toFixed(2)}%`, aspectRatio: `${w} / ${PISO - v.y0}` };
}

function estiloImagen({ ventana: v }: EnvaseRepisa): CSSProperties {
  const w = v.x1 - v.x0;
  return { width: `${(100 / w).toFixed(2)}%`, left: `${((-v.x0 / w) * 100).toFixed(2)}%`, top: `${((-v.y0 / (PISO - v.y0)) * 100).toFixed(2)}%` };
}

const TAMANOS_REPISA = "(min-width: 768px) 15rem, 46vw";

function Envase({ pieza, prioridad }: { pieza: EnvaseRepisa; prioridad: boolean }) {
  const src = `${CARPETA_ILUSTRACIONES}${pieza.codigo}.webp`;
  const srcSet = anchosIlustracion(src);
  return (
    <span className="relative block h-full w-full overflow-hidden transition-transform duration-[var(--mu-dur-medio)] ease-[var(--mu-ease)] group-hover:-translate-y-2 group-focus-visible:-translate-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- envase propio de /public con srcSet de 480/800 (igual que `Ilustracion`) */}
      <img
        src={`${CARPETA_ILUSTRACIONES}480/${pieza.codigo}.webp`}
        {...(srcSet ? { srcSet, sizes: TAMANOS_REPISA } : {})}
        alt=""
        width={480}
        height={480}
        loading="eager"
        decoding="async"
        fetchPriority={prioridad ? "high" : "low"}
        style={estiloImagen(pieza)}
        className="absolute h-auto max-w-none"
      />
    </span>
  );
}

function Pieza({ pieza, p, i }: { pieza: EnvaseRepisa; p: ProductoSalon | undefined; i: number }) {
  const envase = <Envase pieza={pieza} prioridad={i === 0} />;
  return (
    <div className="relative" style={estiloCaja(pieza)}>
      {p ? (
        <EnlaceFicha p={p} aria-label={`${p.nombre}, ${solesCortos(p.precio)}: ver la ficha`} className="group mu-foco block h-full rounded-xl">
          {envase}
          <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full bg-[var(--mu-cacao)] px-3 py-1.5 text-sm font-medium text-[var(--mu-sobre-cacao)] opacity-0 transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            {pieza.corto} · <span className="tabular-nums">{solesCortos(p.precio)}</span>
          </span>
        </EnlaceFicha>
      ) : (
        envase
      )}
    </div>
  );
}

/** «Kits desde S/ X»: el menor precio de los kits de la base; lleva a los kits (`#ofertas`). */
function SelloKits({ desde }: { desde: number }) {
  return (
    <a
      href="#ofertas"
      aria-label={`Kits desde ${solesCortos(desde)}: ver los kits`}
      className="mu-foco group absolute -top-3 left-0 z-20 flex h-24 w-24 flex-col sm:top-[2%] items-center justify-center rounded-full bg-[var(--mu-cacao)] text-center text-[var(--mu-sobre-cacao)] outline outline-1 outline-offset-[-6px] outline-[var(--mu-oro)]/60 transition-transform duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] hover:-rotate-6 sm:h-28 sm:w-28 md:-left-2"
    >
      <span className="text-xs font-semibold uppercase leading-tight tracking-[0.06em] text-[var(--mu-oro)] sm:tracking-[0.16em]">Kits desde</span>
      <span className="mu-num mt-0.5 whitespace-nowrap text-[1.75rem] leading-none sm:text-[2.125rem]">{solesCortos(desde)}</span>
    </a>
  );
}

function Heroe({ productos, slug }: { productos: readonly ProductoSalon[] | null; slug: string }) {
  const porCodigo = new Map((productos ?? []).map((p) => [p.codigo, p]));
  // Sin vitrina, los cinco envases (sin enlace); con ella, sólo los que la tienda muestra hoy.
  const piezas = productos ? REPISA.filter((r) => porCodigo.has(r.codigo)) : REPISA;
  const kits = (productos ?? []).filter((p) => /^KT/i.test(p.codigo ?? "")).map((p) => p.precio);
  const desde = kits.length ? Math.min(...kits) : null;
  return (
    <section aria-labelledby="mu-heroe" className="relative overflow-clip">
      <div className={`${ANCHO} grid items-center gap-6 pb-8 pt-6 md:grid-cols-2 md:gap-10 md:pb-14 md:pt-10 lg:gap-16`}>
        <div className="max-w-xl">
          <h2 id="mu-heroe" className="mu-titulo text-[length:var(--mu-t-heroe)] text-[var(--text-primary)]">
            {HEROE.titulo} <span className="block italic text-[var(--mu-acento-tinta)]">{HEROE.acento}</span>
          </h2>
          <p className="mt-4 max-w-md text-pretty text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)] sm:text-lg">{HEROE.texto}</p>
          <a href={rutas(slug).catalogo} className={`${BOTON} mt-6`}>
            {HEROE.boton} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        {/* La vitrina: nude en los dos temas (el arco oscuro se comía las tapas negras de los envases). */}
        <div className="relative mx-auto aspect-[16/10] w-full max-w-[34rem] md:aspect-[4/3]">
          <span aria-hidden="true" className="absolute inset-x-[4%] bottom-0 top-0 rounded-t-[999px] bg-[var(--mu-sello-nude)]" />
          <span aria-hidden="true" className="absolute inset-x-[9%] bottom-0 top-[6%] rounded-t-[999px] bg-[var(--mu-envase-nude)]" />
          <Destello className="absolute right-[3%] top-[6%] h-5 w-5 text-[var(--mu-oro)] sm:h-6 sm:w-6" />
          <Destello className="absolute right-[12%] top-[17%] h-2.5 w-2.5 text-[var(--mu-oro)]" />
          {desde !== null && <SelloKits desde={desde} />}
          {/* La repisa: tabla kraft con su canto en sombra; los envases se apoyan encima. */}
          <span aria-hidden="true" className="absolute inset-x-0 bottom-[9%] h-2.5 rounded-sm bg-[var(--mu-envase-kraft)] sm:h-3" />
          <span aria-hidden="true" className="absolute inset-x-[1%] bottom-[calc(9%-0.375rem)] h-1.5 rounded-b-sm bg-[var(--mu-envase-kraft-sombra)]" />
          <div className="absolute inset-x-[7%] bottom-[calc(9%+0.5rem)] flex items-end justify-between sm:bottom-[calc(9%+0.625rem)]">
            {piezas.map((pieza, i) => (
              <Pieza key={pieza.codigo} pieza={pieza} p={porCodigo.get(pieza.codigo)} i={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

async function HeroeConVitrina({ tenantId, slug }: { tenantId: string; slug: string }) {
  const v = await cargarVitrina(tenantId, slug);
  return <Heroe productos={v.productos} slug={slug} />;
}

/**
 * La portada: sale al instante con los envases sin enlace y, cuando llega la
 * vitrina (ya en camino desde `PaginaSalon`), con sus precios y el sello de kits.
 */
export function Portada({ tenantId, slug }: { tenantId: string; slug: string }) {
  return (
    <Suspense fallback={<Heroe productos={null} slug={slug} />}>
      <HeroeConVitrina tenantId={tenantId} slug={slug} />
    </Suspense>
  );
}
