/**
 * HeroDoselFondo — capas decorativas del hero «Dosel» de la home (2026-10-10).
 *
 * Todo es `aria-hidden` y server (cero JS). Capas, de atrás hacia adelante:
 *   L0 gradiente del dosel: hondo a la izquierda (donde va el texto: blanco
 *      sobre `--dosel-950` = 15,5:1) y la luz teal entrando por la derecha.
 *   L1 sol coral desenfocado arriba a la derecha.
 *   L2 hojas en 2 profundidades (fondo desenfocado + medio blanco al 8 %).
 *   L3 greca shipibo al pie (receta del carnet de SocioHero).
 * La hoja del FRENTE va aparte (`HeroDoselHojaFrente`) porque se pinta por
 * delante del bodegón. Colores solo por tokens (`--dosel-*`, `--accent*`).
 */
import type { ReactNode } from "react";

// ── Siluetas (origen = base del tallo, apuntan hacia arriba) ────────────────

/** Bijao: hoja larga de punta aguda, partida por la nervadura central. */
const BIJAO =
  "M2.5 -4C62 -36 70 -214 2.5 -300Z M-2.5 -4C-62 -36 -70 -214 -2.5 -300Z M-2.5 -4h5v58h-5z";
/** Nervaduras laterales del bijao (se restan con la máscara). */
const BIJAO_VENAS = [40, 78, 116, 154, 192, 230]
  .map((y) => `M3 -${y}Q30 -${y + 12} 58 -${y + 40}M-3 -${y}Q-30 -${y + 12} -58 -${y + 40}`)
  .join("");

/** Monstera: corazón ancho con cortes que llegan al borde y agujeros. */
const MONSTERA =
  "M0 0C-46 12-112-8-114-84C-116-156-58-206 0-208C58-206 116-156 114-84C112-8 46 12 0 0Z M-3 0h6v46h-6z";
const MONSTERA_CORTES =
  "M-132 -60L-36 -70M-128 -122L-30 -112M-82 -200L-22 -150M132 -58L36 -72M126 -124L30 -114M80 -202L22 -152M0 0V-196";
const MONSTERA_HUECOS: ReadonlyArray<[number, number]> = [
  [-60, -92], [-58, -150], [60, -94], [58, -152], [-66, -38], [66, -40],
];

/** Abanico de palmera de aguaje: foliolos finos que salen de un punto. */
const PALMA_ANGULOS = [-78, -64, -50, -37, -24, -12, 0, 12, 24, 37, 50, 64, 78];
function foliolo(largo: number, curva: number): string {
  return `M0 0C${7 + curva} -${largo * 0.35} ${7 + curva * 2} -${largo * 0.7} ${curva * 3} -${largo}C${-7 + curva * 2} -${largo * 0.7} ${-7 + curva} -${largo * 0.35} 0 0Z`;
}

type HojaProps = { x: number; y: number; giro: number; escala: number };

function Bijao({ id, x, y, giro, escala }: HojaProps & { id: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      <mask id={id} maskUnits="userSpaceOnUse" x="-80" y="-320" width="160" height="390">
        <path d={BIJAO} fill="white" />
        <path d={BIJAO_VENAS} fill="none" stroke="black" strokeWidth="2.6" strokeLinecap="round" />
      </mask>
      <rect x="-80" y="-320" width="160" height="390" mask={`url(#${id})`} />
    </g>
  );
}

function Monstera({ id, x, y, giro, escala }: HojaProps & { id: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      <mask id={id} maskUnits="userSpaceOnUse" x="-140" y="-220" width="280" height="280">
        <path d={MONSTERA} fill="white" />
        <path d={MONSTERA_CORTES} fill="none" stroke="black" strokeWidth="9" strokeLinecap="round" />
        {MONSTERA_HUECOS.map(([cx, cy]) => (
          <ellipse key={`${cx}${cy}`} cx={cx} cy={cy} rx="7" ry="11" fill="black" />
        ))}
      </mask>
      <rect x="-140" y="-220" width="280" height="280" mask={`url(#${id})`} />
    </g>
  );
}

function Palma({ x, y, giro, escala }: HojaProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      <path d="M-3 0h6v130h-6z" />
      {PALMA_ANGULOS.map((a) => (
        <path
          key={a}
          transform={`rotate(${a})`}
          d={foliolo(178 - Math.abs(a) * 0.55, a > 0 ? 1.5 : -1.5)}
        />
      ))}
    </g>
  );
}

function Capa({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 800 400"
      preserveAspectRatio="xMaxYMid slice"
      className={`absolute inset-0 h-full w-full ${className}`}
    >
      {children}
    </svg>
  );
}

export default function HeroDoselFondo() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-clip">
      {/* L0 · dosel: hondo a la izquierda, luz teal por la derecha */}
      <div className="absolute inset-0 bg-[linear-gradient(105deg,var(--dosel-950)_0%,var(--dosel-900)_46%,var(--accent-dark)_80%,var(--accent)_100%)] dark:bg-[linear-gradient(105deg,var(--dosel-950)_0%,var(--dosel-900)_50%,var(--accent-dark)_100%)]" />
      {/* L1 · sol coral */}
      <div className="absolute -right-[50px] -top-[90px] size-[220px] rounded-full bg-[var(--dosel-sol)] opacity-35 blur-3xl sm:-right-[60px] sm:-top-[120px] sm:size-[380px] dark:opacity-[0.22]" />
      {/* L2 · hojas del fondo (desenfocadas) */}
      <Capa className="fill-[var(--dosel-hoja)] opacity-[0.14]">
        <defs>
          <filter id="dosel-desenfoque" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <g filter="url(#dosel-desenfoque)">
          <Palma x={700} y={330} giro={-18} escala={1.9} />
          <Bijao id="dosel-hoja-f1" x={812} y={150} giro={-118} escala={1.15} />
        </g>
      </Capa>
      {/* L2 · hojas del medio */}
      <Capa className="fill-white opacity-[0.08]">
        <Bijao id="dosel-hoja-m1" x={830} y={300} giro={-68} escala={0.76} />
        <Monstera id="dosel-hoja-m2" x={30} y={452} giro={32} escala={1.02} />
      </Capa>
      {/* L3 · greca shipibo al pie */}
      <svg className="absolute inset-x-0 bottom-0 h-[14px] w-full opacity-[0.1]">
        <defs>
          <pattern id="dosel-greca" width="26" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 10.5h6.5v-7H13v7h6.5v-7H26M3.25 7h0M16.25 7h0" fill="none" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          </pattern>
        </defs>
        <rect width="100%" height="14" fill="url(#dosel-greca)" />
      </svg>
    </div>
  );
}

/** Hoja del frente: abajo a la derecha, por delante del bodegón (profundidad). */
export function HeroDoselHojaFrente() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[21] overflow-clip">
      <Capa className="fill-[var(--dosel-950)] opacity-[0.55]">
        <Monstera id="dosel-hoja-frente" x={778} y={470} giro={-38} escala={0.78} />
      </Capa>
    </div>
  );
}
