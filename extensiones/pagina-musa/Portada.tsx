/**
 * El héroe de la portada (contrato visual 10-10): la tapa del catálogo de Navidad
 * hecha web, sin carrusel ni foto de stock. Izquierda: kicker, titular en versalitas,
 * «esta Navidad» a mano (Great Vibes, oro) y dos botones. Derecha: el arco doble con
 * el Kit Regalo especial (KT04): sérum, caja kraft con moño y sello M (la caja ES
 * empaque de la tienda; los envases no llevan «MUSA»), contorno y mascarillas.
 * Comprable: cada pieza abre su ficha y, con mouse o foco, dice nombre y precio DE LA
 * BASE. Los envases van dibujados acá (colores `--mu-envase-*`) para salir sin esperar
 * fotos (el titular es el LCP); las piezas entran escalonadas cuando llega la vitrina.
 */
import { Suspense, type ReactNode } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { PORTADA } from "./anuncios";
import { cargarVitrina, type ProductoSalon } from "./datos";
import { hrefDestino, solesCortos } from "./destinos";
import { EnlaceFicha } from "./EnlaceFicha";
import { BOTON_NUDE, FOCO_CLARO, KICKER, externo } from "./Salon";
import { ANCHO } from "./ui";

/** Lo que no es texto del dueño: la línea de confianza bajo los botones. */
const CONFIANZA = ["Envío gratis en Constitución", "Asesoría gratis por WhatsApp"];

const T = {
  tapa: "fill-[var(--mu-envase-tapa)]",
  etiqueta: "fill-[var(--mu-envase-etiqueta)]",
  tinta: "fill-[var(--mu-envase-tinta)]",
  blanco: "fill-[var(--mu-envase-blanco)]",
  crema: "fill-[var(--mu-envase-crema)]",
  nude: "fill-[var(--mu-envase-nude)]",
  kraft: "fill-[var(--mu-envase-kraft)]",
  sombraKraft: "fill-[var(--mu-envase-kraft-sombra)]",
};
const LETRA = "'Musa Poppins',Poppins,system-ui,sans-serif";

/** Borde dentado de un sobre de mascarilla (arriba y abajo). */
function dientes(x: number, y: number, w: number, h: number, n = 9): string {
  const paso = w / n;
  const arriba = Array.from({ length: n }, (_, i) => `L${x + paso * (i + 0.5)} ${y - 4} L${x + paso * (i + 1)} ${y}`).join(" ");
  const abajo = Array.from({ length: n }, (_, i) => `L${x + w - paso * (i + 0.5)} ${y + h + 4} L${x + w - paso * (i + 1)} ${y + h}`).join(" ");
  return `M${x} ${y} ${arriba} L${x + w} ${y + h} ${abajo} Z`;
}

function Rotulo({ x, y, w, h, uno, dos, grande = 11 }: { x: number; y: number; w: number; h: number; uno: string; dos: string; grande?: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="2" className={T.etiqueta} />
      <text x={x + w / 2} y={y + h * 0.48} textAnchor="middle" fontFamily={LETRA} fontWeight="600" fontSize={grande} letterSpacing="1" className={T.tinta}>
        {uno}
      </text>
      <text x={x + w / 2} y={y + h * 0.8} textAnchor="middle" fontFamily={LETRA} fontSize={grande * 0.62} className={T.tinta}>
        {dos}
      </text>
    </>
  );
}

const DIBUJOS: Record<string, { viewBox: string; trazo: ReactNode }> = {
  MU012: {
    viewBox: "0 0 100 212",
    trazo: (
      <>
        <rect x="36" y="0" width="28" height="48" rx="14" className={T.tapa} />
        <rect x="28" y="42" width="44" height="24" rx="3" className={T.tapa} />
        <rect x="8" y="66" width="84" height="144" rx="14" className={T.nude} />
        <rect x="14" y="128" width="72" height="76" rx="10" className={`${T.kraft} opacity-30`} />
        <rect x="15" y="76" width="5" height="96" rx="2.5" className={`${T.etiqueta} opacity-40`} />
        <Rotulo x={20} y={116} w={60} h={42} uno="SÉRUM" dos="hialurónico" />
      </>
    ),
  },
  KT04: {
    viewBox: "0 0 240 204",
    trazo: (
      <>
        <path d="M120 54 C92 18 58 22 68 50 C74 64 104 60 120 54 Z M120 54 C148 18 182 22 172 50 C166 64 136 60 120 54 Z" className={T.tapa} />
        <path d="M112 60 L96 88 L108 86 Z M128 60 L144 88 L132 86 Z" className={T.tapa} />
        <rect x="22" y="74" width="168" height="128" className={T.kraft} />
        <path d="M190 74 L224 64 L224 192 L190 202 Z" className={T.sombraKraft} />
        <rect x="14" y="58" width="184" height="22" className={T.kraft} />
        <path d="M198 58 L230 50 L230 72 L198 80 Z" className={T.sombraKraft} />
        <rect x="14" y="78" width="184" height="3" className={`${T.sombraKraft} opacity-70`} />
        <rect x="112" y="58" width="16" height="144" className={T.tapa} />
        <circle cx="120" cy="56" r="9" className={T.tapa} />
        <circle cx="64" cy="142" r="25" className={T.etiqueta} />
        <circle cx="64" cy="142" r="21" fill="none" strokeWidth="1.2" className="stroke-[var(--mu-envase-tinta)]" />
        <text x="64" y="143" textAnchor="middle" dominantBaseline="central" fontFamily="'Musa Cormorant','Cormorant Garamond',Georgia,serif" fontWeight="600" fontSize="28" className={T.tinta}>
          M
        </text>
      </>
    ),
  },
  MU015: {
    viewBox: "0 0 70 190",
    trazo: (
      <>
        <rect x="4" y="0" width="62" height="11" rx="1" className={T.blanco} />
        <path d="M4 11 H66 L58 150 H12 Z" className={T.blanco} />
        <path d="M52 11 H66 L58 150 H48 Z" className={`${T.crema} opacity-80`} />
        <rect x="12" y="148" width="46" height="40" rx="5" className={T.tapa} />
        <text x="33" y="76" textAnchor="middle" fontFamily={LETRA} fontWeight="600" fontSize="10" letterSpacing="1" className={T.tinta}>
          OJOS
        </text>
        <text x="33" y="88" textAnchor="middle" fontFamily={LETRA} fontSize="6.5" className={T.tinta}>
          cafeína
        </text>
      </>
    ),
  },
  MU016: {
    viewBox: "0 0 124 168",
    trazo: (
      <>
        <path d={dientes(30, 10, 84, 130)} transform="rotate(10 72 75)" className={T.nude} />
        <path d={dientes(10, 26, 84, 130)} transform="rotate(-6 52 91)" className={T.kraft} />
        <g transform="rotate(-6 52 91)">
          <ellipse cx="52" cy="72" rx="20" ry="25" className={`${T.nude} opacity-90`} />
          <ellipse cx="44" cy="68" rx="4" ry="1.6" className={T.sombraKraft} />
          <ellipse cx="60" cy="68" rx="4" ry="1.6" className={T.sombraKraft} />
          <ellipse cx="52" cy="82" rx="6" ry="1.8" className={T.sombraKraft} />
          <text x="52" y="122" textAnchor="middle" fontFamily={LETRA} fontWeight="700" fontSize="12" letterSpacing="1" className={T.tinta}>
            MASK
          </text>
          <text x="52" y="134" textAnchor="middle" fontFamily={LETRA} fontSize="7" className={T.tinta}>
            lámina × 5
          </text>
        </g>
      </>
    ),
  },
};

/** Dónde va cada pieza (en % de la composición), su nombre corto y hacia dónde abre el globo (los de los bordes, hacia adentro). */
const PIEZAS = [
  {
    codigo: "KT04",
    corto: "Kit Regalo especial",
    clase: "left-[22%] w-[46%] z-10",
    globo: "left-1/2 -translate-x-1/2",
  },
  {
    codigo: "MU015",
    corto: "Contorno de ojos",
    clase: "left-[66%] w-[15%] z-0 bottom-[3%]",
    globo: "right-0",
  },
  {
    codigo: "MU012",
    corto: "Sérum hialurónico",
    clase: "left-[1%] w-[24%] z-20 bottom-[1%]",
    globo: "left-0",
  },
  {
    codigo: "MU016",
    corto: "Mascarillas en lámina",
    clase: "left-[76%] w-[26%] z-20",
    globo: "right-0",
  },
] as const;

/** El destello de 4 puntas del catálogo (decorativo). */
export function Destello({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 0C12.8 8 16 11.2 24 12C16 12.8 12.8 16 12 24C11.2 16 8 12.8 0 12C8 11.2 11.2 8 12 0Z" fill="currentColor" />
    </svg>
  );
}

function Pieza({ pieza, p, i }: { pieza: (typeof PIEZAS)[number]; p: ProductoSalon | undefined; i: number }) {
  const d = DIBUJOS[pieza.codigo];
  const dibujo = (
    <span className="relative block animate-[mu-flotar_6s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.7}s` }}>
      <svg viewBox={d.viewBox} aria-hidden="true" className="relative block h-auto w-full transition-transform duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] group-hover:-rotate-3 group-focus-visible:-rotate-3">
        {d.trazo}
      </svg>
    </span>
  );
  return (
    <div className={`absolute bottom-0 animate-[mu-entrar_600ms_var(--mu-ease)_both] ${pieza.clase}`} style={{ animationDelay: `${120 + i * 80}ms` }}>
      {/* La sombra elíptica queda en el piso mientras el envase flota. */}
      <span aria-hidden="true" className="absolute inset-x-[8%] -bottom-1.5 h-3 rounded-[50%] bg-[var(--mu-envase-sombra)] blur-xs" />
      {p ? (
        <EnlaceFicha p={p} aria-label={`${p.nombre}, ${solesCortos(p.precio)}: ver la ficha`} className={`group relative block rounded-lg ${FOCO_CLARO}`}>
          {dibujo}
          <span
            className={`pointer-events-none absolute bottom-full z-30 mb-2 ${pieza.globo} translate-y-1 whitespace-nowrap rounded-full bg-[var(--mu-cacao)] px-3 py-1.5 text-[13px] font-medium text-[var(--mu-sobre-cacao)] opacity-0 transition duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100`}
          >
            {pieza.corto} · <span className="tabular-nums">{solesCortos(p.precio)}</span>
          </span>
        </EnlaceFicha>
      ) : (
        dibujo
      )}
    </div>
  );
}

/** «Kits desde S/ X»: el menor precio de los kits de la base (sin vitrina, sin número). */
function SelloKits({ desde }: { desde: number | null }) {
  return (
    <span aria-hidden="true" className="absolute -left-1 top-[2%] z-30 flex h-24 w-24 items-center justify-center sm:-left-4 sm:top-[4%] sm:h-32 sm:w-32 md:-left-6 md:top-auto md:bottom-[57%] md:h-36 md:w-36">
      <svg viewBox="0 0 120 120" className="mu-girar absolute inset-0 h-full w-full text-[var(--mu-oro)]">
        <defs>
          <path id="mu-heroe-aro" d="M60,60 m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0" />
        </defs>
        <text fill="currentColor" fontSize="8.4" fontWeight="600" letterSpacing="1.4">
          <textPath href="#mu-heroe-aro" textLength={322} lengthAdjust="spacing">
            BELLEZA PROFESIONAL · CERCA DE TI ·
          </textPath>
        </text>
      </svg>
      <span className="absolute inset-[15%] flex flex-col items-center justify-center rounded-full bg-[var(--mu-sello-nude)] text-center text-[var(--mu-sello-m)]">
        <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.18em] sm:text-[11px]">Kits</span>
        <span className="text-[10px] uppercase leading-tight tracking-[0.12em] sm:text-[11px]">{desde ? "desde" : "de regalo"}</span>
        {desde && <span className="mu-num whitespace-nowrap text-xl leading-none sm:text-[28px] md:text-[32px]">{solesCortos(desde)}</span>}
      </span>
    </span>
  );
}

function Heroe({ productos, conPiezas, slug }: { productos: readonly ProductoSalon[] | null; conPiezas: boolean; slug: string }) {
  const d = PORTADA[0];
  if (!d) return null;
  const cta = hrefDestino(d.cta.destino, slug, null);
  const cta2 = d.cta2 ? { texto: d.cta2.texto, ...hrefDestino(d.cta2.destino, slug, null) } : null;
  const porCodigo = new Map((productos ?? []).map((p) => [p.codigo, p]));
  const preciosKits = (productos ?? []).filter((p) => /^KT/i.test(p.codigo ?? "")).map((p) => p.precio);
  const desde = preciosKits.length ? Math.min(...preciosKits) : null;
  return (
    <section aria-labelledby="mu-heroe" className="mu-grano relative overflow-clip bg-[radial-gradient(130%_120%_at_75%_10%,var(--mu-cacao)_0%,var(--mu-cacao-hondo)_70%)] text-[var(--mu-sobre-cacao)]">
      <div className={`${ANCHO} relative z-[1] grid pt-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-x-10 md:pt-14`}>
        <div className="order-2 pb-12 pt-8 md:order-1 md:self-center md:pb-20 md:pt-0">
          <p className={`${KICKER} text-[var(--mu-oro)]`}>{d.kicker}</p>
          <h2 id="mu-heroe" className="mu-display mt-4 text-[length:var(--mu-t-heroe)] leading-[0.95]">
            {d.titulo.split(" ").map((l, i) => (
              <span key={`${l}-${i}`} className="block">
                {l}
              </span>
            ))}
            {d.script && (
              <span className="mu-script relative -mt-[0.2em] block pl-[0.5em] text-[length:var(--mu-t-script-xl)] normal-case leading-none tracking-normal text-[var(--mu-oro)]">
                {d.script}
                <Destello className="absolute -top-1 ml-1 inline-block h-[0.3em] w-[0.3em]" />
              </span>
            )}
          </h2>
          <p className="mt-5 max-w-md text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--mu-sobre-cacao)]/85">{d.texto}</p>
          <div data-mu-despejar className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href={cta.href} className={BOTON_NUDE} {...(cta.externo ? externo : {})}>
              {d.cta.texto} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            {cta2 && (
              <a href={cta2.href} {...(cta2.externo ? externo : {})} className={`inline-flex h-12 items-center border-b border-[var(--mu-oro)] text-[15px] font-semibold transition-opacity hover:opacity-80 ${FOCO_CLARO}`}>
                {cta2.texto}
              </a>
            )}
          </div>
          <p className={`${KICKER} mt-8 flex flex-wrap gap-x-3 gap-y-1 text-[var(--mu-sobre-cacao-2)]`}>
            {CONFIANZA.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-3">
                {i > 0 && <Destello className="h-2.5 w-2.5 text-[var(--mu-oro)]" />}
                {c}
              </span>
            ))}
          </p>
        </div>
        <div className="relative order-1 mx-auto h-[300px] w-full max-w-[20rem] self-end sm:h-[400px] sm:max-w-[26rem] md:order-2 md:h-[min(36rem,70vh)] md:max-w-none">
          {/* Arco angosto y envases grandes que lo desbordan, como la tapa del catálogo impreso. Nude en los dos temas
              (el héroe es cacao en los dos): con el arco oscuro, el moño y las tapas negras se perdían en oscuro. */}
          <span aria-hidden="true" className="absolute inset-x-[11%] bottom-0 top-0 rounded-t-[999px] bg-[var(--mu-sello-nude)]" />
          <span aria-hidden="true" className="absolute inset-x-[16%] bottom-0 top-[4.5%] rounded-t-[999px] bg-[var(--mu-envase-nude)]" />
          <Destello className="absolute -right-1 top-2 h-6 w-6 animate-[mu-destello_4s_ease-in-out_infinite] text-[var(--mu-oro)] md:-right-4" />
          <SelloKits desde={desde} />
          <div className="absolute inset-x-0 bottom-[4%] h-[50%]">{conPiezas && PIEZAS.map((pieza, i) => <Pieza key={pieza.codigo} pieza={pieza} p={porCodigo.get(pieza.codigo)} i={i} />)}</div>
        </div>
      </div>
    </section>
  );
}

async function HeroeConVitrina({ tenantId, slug }: { tenantId: string; slug: string }) {
  const v = await cargarVitrina(tenantId, slug);
  return <Heroe productos={v.productos} conPiezas slug={slug} />;
}

/**
 * La portada: sale al instante sin las piezas y, cuando llega la vitrina (ya en
 * camino desde `PaginaSalon`), con sus precios. Con `productos`, usa esos.
 */
export function Portada({ tenantId, slug, productos }: { tenantId: string; slug: string; productos?: readonly ProductoSalon[] }) {
  if (productos) return <Heroe productos={productos} conPiezas slug={slug} />;
  return (
    <Suspense fallback={<Heroe productos={null} conPiezas={false} slug={slug} />}>
      <HeroeConVitrina tenantId={tenantId} slug={slug} />
    </Suspense>
  );
}
