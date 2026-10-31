/**
 * permiso-volumen-ui — cómo se escriben en pantalla las cifras del volumen de
 * un permiso (ADR-432). Compartido por «Volumen» y «Trazabilidad» para que las
 * dos digan lo mismo del mismo número.
 *
 * Las tres honestidades de esta pantalla viven acá y no en cada celda:
 *  · lo que no existe es «—», nunca «0,000»;
 *  · el pt de rolliza es un derivado y se escribe «≈… pt aserr.» (el de la
 *    producción es aserrada medida y va sin «≈»);
 *  · un saldo negativo se dice en rojo Y en palabras — el color solo no llega
 *    a quien no lo distingue.
 */

import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateNumeric, formatNumber, formatWeekday, SIN_DATO } from "@/lib/format";
import { TIPOS_PRODUCTO_LOCTP } from "@/lib/forestal/loctp-catalogos";

/** «1 guía» / «3 guías». */
export const plural = (n: number, uno: string, varios: string): string =>
  `${formatNumber(n, 0)} ${n === 1 ? uno : varios}`;

/** m³ con tres decimales, o «—» si no hay dato. */
export const m3 = (v: number | null | undefined): string => (v == null ? SIN_DATO : fmtM3(v));

/** Menos de medio litro es redondeo, no un saldo: no se pinta rojo por eso. */
export const esNegativo = (v: number | null | undefined, tolerancia = 0.0005): boolean =>
  v != null && v < -tolerancia;

/**
 * «jueves 10/09» — como se nombra un día en el aserradero. Si es de otro año,
 * con el año corto («jueves 10/09/25»): un permiso vive más de un año y dos
 * «10/09» de años distintos no son el mismo día.
 *
 * Fecha del libro = date-only: se lee al mediodía UTC para que Lima (−5) no la
 * corra al día anterior.
 */
export function fechaDelLibro(iso: string | null | undefined): string {
  if (!iso) return SIN_DATO;
  const d = `${iso.slice(0, 10)}T12:00:00Z`;
  const numero = formatDateNumeric(d, { soloFecha: true });
  if (numero === SIN_DATO) return SIN_DATO;
  const dia = formatWeekday(d, { largo: true, soloFecha: true }).toLowerCase();
  const [dd, mm, aaaa] = numero.split("/");
  const esteAnio = String(new Date().getUTCFullYear());
  return aaaa === esteAnio ? `${dia} ${dd}/${mm}` : `${dia} ${dd}/${mm}/${aaaa.slice(2)}`;
}

const norm = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const LABEL_POR_TIPO = new Map<string, string>(
  TIPOS_PRODUCTO_LOCTP.map((t) => [norm(t.valor), t.label]),
);

/** «MADERA ASERRADA (COMERCIAL)» → «Aserrada · comercial»; lo que el catálogo no conoce, tal cual. */
export function tipoCorto(tipo: string | null | undefined): string {
  if (!tipo?.trim()) return "Sin tipo";
  return LABEL_POR_TIPO.get(norm(tipo)) ?? tipo.trim();
}

/** Una cifra con su unidad más chica al lado — el número es lo que se lee. */
export function Cifra({ valor, unidad }: { valor: string; unidad: string }) {
  return (
    <span className="whitespace-nowrap font-mono tabular-nums">
      {valor}
      <span className="ml-1 text-[0.7em] font-bold text-[var(--text-secondary)]">{unidad}</span>
    </span>
  );
}

/**
 * Un saldo: normal si es ≥ 0; si es negativo, en rojo y con la palabra que
 * dice qué pasó («de más»).
 */
export function Saldo({
  texto,
  negativo,
  queDice = "de más",
}: {
  texto: string;
  negativo: boolean;
  queDice?: string;
}) {
  if (!negativo) return <span className="whitespace-nowrap font-mono tabular-nums">{texto}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--data-error-ink)]">
        {texto}
      </span>
      <span className="text-xs font-semibold text-[var(--data-error-ink)]">{queDice}</span>
    </span>
  );
}

/** Pastilla de estado: texto neutro sobre un tinte con borde del tono (contraste AA). */
export const PASTILLA =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-semibold text-[var(--text-primary)]";
export const TONO = {
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
  aviso: "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10",
  error: "border-[var(--data-error-500)]/60 bg-[var(--data-error-500)]/10",
  info: "border-[var(--data-info-500)]/50 bg-[var(--data-info-500)]/10",
  ok: "border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/10",
} as const;
