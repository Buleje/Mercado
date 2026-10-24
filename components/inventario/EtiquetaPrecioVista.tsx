import { esGuardaEan13, modulosTotales, tramosDeBarras, type CodigoDeBarras } from "@/lib/etiquetas/codigo-barras";
import {
  infoFormatoPrecio,
  medidaDeBarras,
  type EtiquetaPrecio,
  type FormatoEtiquetaPrecio,
} from "@/lib/etiquetas/precio";

/** 1 punto tipográfico en mm (el PDF mide en puntos; la vista previa, en px). */
const PT_MM = 25.4 / 72;
/** Ancho medio de una cifra de Helvetica negrita respecto del cuerpo. */
const ANCHO_CIFRA = 0.56;

/** Las barras como SVG: los mismos módulos que dibuja el PDF. */
export function BarrasSvg({ codigo, anchoPx, altoPx, digitosPx }: { codigo: CodigoDeBarras; anchoPx: number; altoPx: number; digitosPx: number }) {
  const total = modulosTotales(codigo);
  const ean = codigo.tipo === "ean13";
  const texto = ean ? `${codigo.valor[0]} ${codigo.valor.slice(1, 7)} ${codigo.valor.slice(7)}` : codigo.valor;
  return (
    <div className="flex shrink-0 flex-col items-center" style={{ width: anchoPx }}>
      <svg
        role="img"
        aria-label={`Código de barras ${codigo.valor}`}
        viewBox={`0 0 ${total} 100`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        width={anchoPx}
        height={altoPx}
      >
        {tramosDeBarras(codigo.modulos).map(([inicio, ancho]) => (
          <rect
            key={inicio}
            x={codigo.zonaMudaIzq + inicio}
            y={0}
            width={ancho}
            height={ean && esGuardaEan13(inicio) ? 100 : 92}
            fill="currentColor"
          />
        ))}
      </svg>
      <span className="whitespace-nowrap font-mono leading-none tabular-nums" style={{ fontSize: digitosPx }}>
        {texto}
      </span>
    </div>
  );
}

/**
 * Una etiqueta a escala (`escala` px por mm), con la misma disposición que el
 * PDF: nombre arriba, precio a la izquierda y barras a la derecha (o abajo, a
 * todo el ancho, si en el rollo no entran al costado). Es una aproximación
 * para ver qué sale; el PDF mide el texto de verdad.
 */
export function EtiquetaPrecioVista({ etiqueta: e, formato, escala }: { etiqueta: EtiquetaPrecio; formato: FormatoEtiquetaPrecio; escala: number }) {
  const f = infoFormatoPrecio(formato);
  const px = (mm: number) => mm * escala;
  const pt = (p: number) => p * PT_MM * escala;
  const barras = e.codigo ? medidaDeBarras(e.codigo, formato) : null;
  const abajo = !!barras?.abajo;
  const lateralMm = abajo ? 12 : 0; // unidad y «antes» al costado del monto
  const anchoPrecioMm = f.anchoMm - 2 * f.padMm - (barras && !abajo ? barras.anchoMm + 1.5 : lateralMm);
  const anchoMontoMm = (e.precioTexto.length * ANCHO_CIFRA * f.precioPt + 2 * ANCHO_CIFRA * f.monedaPt) * PT_MM + 0.8;
  const precioPt = Math.max(9, f.precioPt * Math.min(1, anchoPrecioMm / anchoMontoMm, abajo ? 0.8 : 1));

  const monto = (
    <p className="whitespace-nowrap font-bold leading-none tabular-nums">
      <span style={{ fontSize: pt(Math.min(f.monedaPt, precioPt * 0.45)) }}>{e.moneda}</span>
      <span style={{ fontSize: pt(precioPt), marginLeft: px(0.8) }}>{e.precioTexto}</span>
    </p>
  );
  const anterior = e.precioAnteriorTexto && (
    <p className="leading-none line-through" style={{ fontSize: pt(f.anteriorPt), marginBottom: px(1) }}>
      {e.precioAnteriorTexto}
    </p>
  );
  const unidad = (
    <p className="leading-none" style={{ fontSize: pt(f.unidadPt), marginTop: abajo ? 0 : px(1.2) }}>
      {e.unidadTexto}
    </p>
  );
  const codigo = e.codigo && barras && (
    <BarrasSvg codigo={e.codigo} anchoPx={px(barras.anchoMm)} altoPx={px(abajo ? f.barrasAltoMm * 0.75 : f.barrasAltoMm)} digitosPx={pt(f.digitosPt)} />
  );

  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden rounded-sm border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
      style={{ width: px(f.anchoMm), height: px(f.altoMm), padding: px(f.padMm) }}
    >
      <p className="line-clamp-2 font-bold" style={{ fontSize: pt(f.nombrePt), lineHeight: 1.12 }}>
        {e.nombre}
      </p>
      {abajo ? (
        <>
          <div className="flex items-end" style={{ gap: px(1.5), marginTop: px(1) }}>
            {monto}
            <div className="min-w-0">
              {anterior}
              {unidad}
            </div>
          </div>
          <div className="mt-auto flex justify-center">{codigo}</div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-between" style={{ gap: px(1.5) }}>
          <div className="min-w-0">
            {anterior}
            {monto}
            {unidad}
          </div>
          {codigo}
        </div>
      )}
    </div>
  );
}

/** La hoja 1 en miniatura: qué casilleros se llenan. En el rollo no aplica. */
export function HojaMiniatura({ formato, usadas }: { formato: FormatoEtiquetaPrecio; usadas: number }) {
  const f = infoFormatoPrecio(formato);
  if (f.rollo) return null;
  const porHoja = f.columnas * f.filas;
  return (
    <div
      aria-hidden
      className="grid w-16 shrink-0 gap-px rounded-sm border border-[var(--rule-base)] bg-[var(--rule-soft)] p-0.5"
      style={{ gridTemplateColumns: `repeat(${f.columnas}, minmax(0, 1fr))`, aspectRatio: `${f.hojaAnchoMm} / ${f.hojaAltoMm}` }}
    >
      {Array.from({ length: porHoja }, (_, i) => (
        <span key={i} className={i < usadas ? "rounded-[1px] bg-[var(--accent)]" : "rounded-[1px] bg-[var(--surface-raised)]"} />
      ))}
    </div>
  );
}
