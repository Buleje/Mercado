/**
 * El héroe de la portada (rediseño minimalista 16-10, como mi.com): UNO solo,
 * sin carrusel. Izquierda: el título en la sans 600 (sin cursiva ni color), una
 * línea y UN botón, con «Kits desde S/ X» como enlace de texto debajo. Derecha:
 * la vitrina, un panel gris plano con los envases de las tres líneas (cabello,
 * rostro, cuerpo) de pie sobre el borde: la tienda entera de un vistazo. Cada
 * envase abre su ficha y, con mouse o foco, dice nombre y precio DE LA BASE.
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
import { ANCHO, BOTON } from "./ui";

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
          <span className="mu-sombra-flotante pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] opacity-0 transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            {pieza.corto} · <span className="tabular-nums">{solesCortos(p.precio)}</span>
          </span>
        </EnlaceFicha>
      ) : (
        envase
      )}
    </div>
  );
}

/** «Kits desde S/ X»: el menor precio de los kits de la base, como enlace de texto que lleva a los kits (`#ofertas`). */
function EnlaceKits({ desde }: { desde: number }) {
  return (
    <a
      href="#ofertas"
      className="mu-subrayado mu-foco mt-2 inline-flex h-12 items-center gap-1.5 text-[length:var(--mu-t-cuerpo)] font-medium text-[var(--text-secondary)] transition-colors duration-[var(--mu-dur-corto)] hover:text-[var(--text-primary)] [--mu-subrayado-abajo:.6rem]"
    >
      Kits desde <span className="tabular-nums">{solesCortos(desde)}</span>
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
            {HEROE.titulo} <span className="block">{HEROE.acento}</span>
          </h2>
          <p className="mt-5 max-w-md text-pretty text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)] sm:text-lg">{HEROE.texto}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-1">
            <a href={rutas(slug).catalogo} className={BOTON}>
              {HEROE.boton} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            {desde !== null && <EnlaceKits desde={desde} />}
          </div>
        </div>
        {/* La vitrina: un panel gris plano (claro en los dos temas: el panel oscuro se comía las tapas negras). */}
        <div className="relative mx-auto aspect-[16/10] w-full max-w-[36rem] overflow-hidden rounded-[1.5rem] bg-[var(--mu-vitrina)] md:aspect-[4/3]">
          <div className="absolute inset-x-[8%] bottom-[6%] flex items-end justify-between">
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
