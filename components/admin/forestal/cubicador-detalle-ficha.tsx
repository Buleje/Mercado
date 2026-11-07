/**
 * Las piezas que comparten el detalle de una guardada y el comparador: sus
 * datos de papel (cliente, CCNN, permiso, camión…), los chips de lectura y el
 * color de una diferencia.
 *
 * Las cubicaciones viejas no traen ficha: sale sólo lo que haya, nunca una
 * fila «—» por cada campo vacío (doce rayas no dicen nada).
 */
import type { EnLibroDeGuardada } from "@/components/admin/forestal/hooks/use-guardadas-del-cubicador";
import { codigoDeHoja } from "@/components/admin/forestal/cubicador-papel/papel-cubicador";
import { button } from "@/components/ui-system/button-variants";
import { especiesDeCubicacion } from "@/lib/forestal/cubicacion-diferencias";
import { corridasDeCubicacion, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";

export interface DatoDeGuardada {
  id: string;
  etiqueta: string;
  valor: string;
  mono?: boolean;
}

const lineasDelLibro = (e: EnLibroDeGuardada) =>
  [...e.lineas].sort((x, y) => x.lineNo - y.lineNo).map((l) => `N° ${l.lineNo}`).join(", ");

/**
 * Los datos de la guardada que no son medidas, en el orden en que se leen en
 * el patio: de quién y de dónde, con qué papel, en qué camión. `completa`
 * agrega lo de oficina (código, quién guardó, el Libro); sin él, lo de la
 * tarjetita del comparador.
 */
export function datosDeLaGuardada(c: CubicacionRegistro, opciones: { enLibro?: EnLibroDeGuardada; completa?: boolean } = {}): DatoDeGuardada[] {
  const f = c.ficha ?? {};
  const duenos = [...new Set(c.piezas.map((p) => p.dueno?.trim()).filter((d): d is string => Boolean(d)))];
  const todos: (DatoDeGuardada | false)[] = [
    opciones.completa === true && { id: "codigo", etiqueta: "Código de la hoja", valor: codigoDeHoja("aserrada", c.id), mono: true },
    { id: "fecha", etiqueta: "Fecha", valor: fechaDeLaGuardada(c.fecha) },
    Boolean(c.cliente) && { id: "cliente", etiqueta: "Cliente", valor: c.cliente ?? "" },
    Boolean(f.comunidad) && { id: "comunidad", etiqueta: "CCNN de origen", valor: f.comunidad ?? "" },
    !opciones.completa && { id: "especies", etiqueta: "Especie", valor: especiesDeCubicacion(c).join(", ") || "Sin especie" },
    Boolean(f.tituloHabilitante) && { id: "titulo", etiqueta: "Título habilitante", valor: f.tituloHabilitante ?? "" },
    Boolean(c.gtfNumber) && { id: "gtf", etiqueta: "GTF", valor: c.gtfNumber ?? "", mono: true },
    opciones.completa === true && duenos.length > 0 && { id: "duenos", etiqueta: "Dueños de la madera", valor: duenos.join(", ") },
    Boolean(f.placa) && { id: "placa", etiqueta: "Placa", valor: f.placa ?? "", mono: true },
    Boolean(f.chofer) && { id: "chofer", etiqueta: "Chofer", valor: f.chofer ?? "" },
    Boolean(f.destino) && { id: "destino", etiqueta: "Destino", valor: f.destino ?? "" },
    Boolean(f.lugar) && { id: "lugar", etiqueta: "Dónde se cubicó", valor: f.lugar ?? "" },
    opciones.completa === true && Boolean(c.createdBy) && { id: "guardo", etiqueta: "La guardó", valor: c.createdBy ?? "" },
    opciones.completa === true && {
      id: "libro",
      etiqueta: "Libro",
      valor: opciones.enLibro
        ? `En el Libro · ${lineasDelLibro(opciones.enLibro)}`
        : corridasDeCubicacion(c).length > 0 ? "Su línea del Libro ya no está" : "Sin enviar al Libro",
    },
  ];
  return todos.filter((d): d is DatoDeGuardada => Boolean(d));
}

/** Los datos en rejilla: dos o tres columnas en pantalla ancha, una en el celular. */
export function FichaDeGuardada({ datos, notas, columnas = 3 }: { datos: DatoDeGuardada[]; notas?: string; columnas?: 2 | 3 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 ${columnas === 3 ? "lg:grid-cols-3" : ""}`}>
      {datos.map((d) => (
        <div key={d.id} className="min-w-0">
          <dt className="text-xs font-semibold text-[var(--text-tertiary)]">{d.etiqueta}</dt>
          <dd className={`break-words text-sm font-semibold text-[var(--text-primary)] ${d.mono ? "font-mono tabular-nums" : ""}`}>{d.valor}</dd>
        </div>
      ))}
      {notas?.trim() && (
        <div className="min-w-0 sm:col-span-full">
          <dt className="text-xs font-semibold text-[var(--text-tertiary)]">Notas</dt>
          <dd className="whitespace-pre-line break-words text-sm text-[var(--text-primary)]">{notas}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Chips y no un `select`: son cortes del mismo lote que se comparan saltando
 * de uno a otro (la misma decisión que Resúmenes › Agrupado libre).
 */
export function ChipsDeLectura<T extends string>({ opciones, valor, onCambiar, etiqueta }: {
  opciones: readonly { id: T; label: string }[];
  valor: T;
  onCambiar: (id: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onCambiar(o.id)}
          aria-pressed={valor === o.id}
          className={button({ variant: valor === o.id ? "accent" : "secondary", size: "md", className: "px-4" })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Verde si B tiene más, ámbar si tiene menos, neutro si no se movió — con dark explícito. */
export const tonoDelta = (v: number): string =>
  v > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
    : v < 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : "text-[var(--text-tertiary)]";

/** Una diferencia con su signo: «+12», «−3», «0» (sin «−0», que se lee como error). */
export const conSigno = (v: number, fmt: (n: number) => string, epsilon = 0): string =>
  Math.abs(v) <= epsilon ? fmt(0) : v > 0 ? `+${fmt(v)}` : `−${fmt(Math.abs(v))}`;
