"use client";

/**
 * Un valor de la guía sobre la hoja del diseñador. Se dibuja con la MISMA
 * geometría que el papel (`gtf-matricial-print`): borde superior en `y`, ancho
 * máximo, Courier New negrita al tamaño de letra del campo.
 *
 * No se arrastra solo: avisa que lo presionaron y el arrastre lo lleva la
 * selección (`useSeleccionTalonario`), que mueve a todos los elegidos juntos.
 * Las flechas corren 0,5 mm (con Shift, 5 mm) a todo el grupo.
 *
 * Vacío: muestra el nombre del campo en gris para poder ubicarlo, pero al
 * imprimir no sale nada.
 *
 * `nombre` (con «Ver nombres»): el nombre corto encima del valor, chico y
 * tenue, del lado al que se alinea el texto. Es de la pantalla: el papel sale
 * de `gtf-matricial-print`, que no lo dibuja.
 *
 * `noEntra` (lo decide la hoja con `revisarEncaje`): contorno amarillo, el
 * valor no entra en su renglón ni achicado. `letraValorPt` menor que la del
 * campo: el valor sale achicado para entrar (Brandon 16-10), en un `<span>`
 * con su letra; el renglón lo sigue marcando la del campo, así la base de la
 * letra no se mueve (igual que en el papel). `discreto` (con el formato
 * impreso dibujado debajo): sin contorno punteado ni nombre hasta pasar el
 * mouse o elegirlo — el rótulo impreso ya dice qué es, y los dos encimados se
 * tapaban. `soloValores`: la hoja como sale el papel — sin vacíos, contornos
 * ni nombres (lo elegido y el foco del teclado sí se ven).
 */

import { PASO_GRANDE_MM, PASO_MM, type Alineacion } from "@/lib/forestal/gtf-matricial-disposicion";
import { INTERLINEA, ptAMm } from "@/lib/forestal/gtf-matricial-edicion";
import { alineaCss } from "@/lib/forestal/gtf-matricial-print";
import { enUnaLinea } from "@/lib/forestal/gtf-salida-geometria";
import { fmtMm } from "./gtf-matricial-controles";

export { ptAMm };

const FLECHAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** El nombre va del lado al que se alinea el valor: así queda encima de la letra, no del aire. */
const LADO_NOMBRE: Record<Alineacion, React.CSSProperties> = {
  izq: { left: 0 },
  der: { right: 0 },
  centro: { left: "50%", transform: "translateX(-50%)" },
};

export interface CampoTalonarioProps {
  etiqueta: string;
  texto: string;
  x: number;
  y: number;
  anchoMm: number;
  letraPt: number;
  alinea: Alineacion;
  /** px por mm de la hoja en pantalla. */
  escala: number;
  seleccionado: boolean;
  /** El primero elegido: alinear e igualar toman su medida. Lleva la etiqueta con X/Y. */
  referencia?: boolean;
  /** Campo de «Partir en varios renglones»; sin esto, un renglón (como sale en el papel). */
  varias?: boolean;
  /** La letra con la que sale el valor (`encajarValor`); menor que `letraPt` = achicado para entrar. */
  letraValorPt?: number;
  /** «Sólo valores»: el vacío no se dibuja y no hay contornos ni nombres. */
  soloValores?: boolean;
  /** Nombre corto encima del valor («(7) Titular», «D1»); null = «Ver nombres» apagado. */
  nombre?: string | null;
  /** Más ancho que su renglón (o, en una columna, alguna de sus filas): contorno amarillo. */
  noEntra?: boolean;
  /** Formato impreso dibujado debajo: el contorno sólo al pasar el mouse o con el teclado. */
  discreto?: boolean;
  onPresionar: (e: React.PointerEvent) => void;
  /** Llega por Tab (no por clic): si no estaba elegido, queda elegido solo. */
  onFocoTeclado: () => void;
  onFlecha: (dx: number, dy: number) => void;
}

export default function CampoTalonario({
  etiqueta, texto, x, y, anchoMm, letraPt, alinea, escala, seleccionado, referencia = false, varias = false, letraValorPt = letraPt, nombre: nombreCampo = null,
  noEntra = false, discreto = false, soloValores = false, onPresionar, onFocoTeclado, onFlecha,
}: CampoTalonarioProps) {
  const vacio = !texto.trim();
  if (soloValores && vacio && !seleccionado) return null;
  const nombre = soloValores ? null : nombreCampo;
  const achicado = !vacio && letraValorPt < letraPt;
  const ayuda = noEntra
    ? `${etiqueta} · no entra en su renglón ni a la letra más chica: ensánchalo`
    : achicado
      ? `${etiqueta} · letra ${fmtMm(letraValorPt)} pt para que entre`
      : etiqueta;
  /* Con el nombre encima, el vacío queda en blanco (el recuadro punteado ya lo ubica): repetir «vacío» en cada casillero era ruido. */
  const relleno = nombre ? "" : etiqueta;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={seleccionado}
      aria-label={`${etiqueta}${vacio ? " (vacío: no se imprime)" : `: ${texto}`}. X ${fmtMm(x)} mm, Y ${fmtMm(y)} mm`}
      data-campo={etiqueta}
      data-no-entra={noEntra || undefined}
      data-letra-valor={achicado ? letraValorPt : undefined}
      title={ayuda}
      onPointerDown={onPresionar}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const f = FLECHAS[e.key];
        if (!f) return;
        e.preventDefault();
        const paso = e.shiftKey ? PASO_GRANDE_MM : PASO_MM;
        onFlecha(f[0] * paso, f[1] * paso);
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) onFocoTeclado();
      }}
      /* `outline` y no `border`: el borde le comería ancho al texto y la pantalla dejaría de ser el papel. */
      className={`group absolute cursor-grab touch-none select-none rounded-[2px] active:cursor-grabbing ${
        seleccionado
          ? `z-20 bg-[var(--accent-muted)] outline-solid outline-[var(--accent)] ${referencia ? "outline-[3px]" : "outline-2"}`
          : soloValores
            ? "z-10 outline-1 outline-solid outline-transparent focus-visible:outline-[var(--accent)]"
            : noEntra
            ? "z-10 outline-2 outline-dashed outline-[var(--data-warning-500)]"
            : discreto
              ? "z-10 outline-1 outline-dashed outline-transparent hover:outline-[var(--accent)] focus-visible:outline-[var(--accent)]"
              : "z-10 outline-1 outline-dashed outline-[var(--rule-base)] hover:outline-[var(--accent)]"
      }`}
      style={{
        left: x * escala,
        top: y * escala,
        width: anchoMm * escala,
        minHeight: ptAMm(letraPt) * INTERLINEA * escala,
        fontSize: ptAMm(letraPt) * escala,
        lineHeight: INTERLINEA,
        textAlign: alineaCss(alinea) as React.CSSProperties["textAlign"],
        fontFamily: '"Courier New", Courier, monospace',
        fontWeight: 700,
        whiteSpace: varias ? "pre-wrap" : "nowrap",
        overflowWrap: varias ? "anywhere" : undefined,
      }}
    >
      {/* El nombre de un campo vacío va en un renglón con «…»: partido en una casilla de 6 mm tapaba a los vecinos. */}
      <span
        className={vacio ? "block truncate italic text-[var(--text-tertiary)] opacity-70" : "text-[var(--text-primary)]"}
        style={achicado ? { fontSize: ptAMm(letraValorPt) * escala } : undefined}
      >
        {vacio ? relleno : varias ? texto : enUnaLinea(texto)}
      </span>
      {nombre && !referencia && (
        <span
          aria-hidden
          data-nombre-campo=""
          className={`pointer-events-none absolute bottom-full mb-px overflow-hidden text-ellipsis whitespace-nowrap font-sans font-semibold not-italic leading-none text-[var(--text-tertiary)] ${
            discreto && !seleccionado ? "invisible group-hover:visible group-focus-visible:visible" : ""
          }`}
          style={{
            fontSize: Math.min(12, Math.max(8, 2.4 * escala)),
            maxWidth: Math.max(anchoMm, 20) * escala,
            ...LADO_NOMBRE[alinea],
          }}
        >
          {nombre}
        </span>
      )}
      {referencia && (
        <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-md bg-[var(--brand-ink)] px-1.5 py-0.5 font-sans text-xs font-bold not-italic text-white">
          {nombre ? `${nombre} · ` : ""}X {fmtMm(x)} · Y {fmtMm(y)} mm
        </span>
      )}
    </div>
  );
}
