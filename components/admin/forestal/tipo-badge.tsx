/**
 * TipoBadge — chip del tipo comercial de una pieza aserrada, con el color por
 * familia (comercial=verde, tabla=azul, larga angosta=ámbar, paquetería/otro=gris).
 * Single source del estilo: lo usan la tabla del cubicador y los resúmenes.
 */
import { tipoCorto, tonoTipo, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";

type Tono = "success" | "info" | "warning" | "neutral";

/**
 * Clases del chip EDITABLE (el `<select>` de la tabla del cubicador).
 *
 * Distinto del badge de sólo lectura por una razón medida, no estética: el
 * texto del badge va en el tono de la familia sobre su propio tint, y eso da
 * entre 3,5:1 y 4,3:1 según el tono — por debajo del piso de 4,5:1 para texto
 * chico. En una etiqueta decorativa se tolera; en un control que hay que leer
 * para saber qué se está por cambiar, no.
 *
 * Así que acá el color de familia queda en el FONDO y el BORDE —que sólo
 * necesitan 3:1— y el texto va en `--text-primary`, que da 14:1 en los dos
 * modos. El chip se sigue reconociendo por color y además se lee.
 */
export function tipoChipCls(tono: Tono): string {
  const base = "text-[var(--text-primary)] border";
  if (tono === "success") return `${base} bg-[var(--data-success-500)]/15 border-[var(--data-success-500)]/50`;
  if (tono === "info") return `${base} bg-[var(--data-info-500)]/15 border-[var(--data-info-500)]/50`;
  if (tono === "warning") return `${base} bg-[var(--data-warning-500)]/15 border-[var(--data-warning-500)]/50`;
  return `${base} bg-[var(--surface-sunken)] border-[var(--rule-base)]`;
}

/** Clases del badge según el tono del DS. */
export function tipoBadgeCls(tono: Tono): string {
  if (tono === "success") return "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]";
  if (tono === "info") return "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]";
  if (tono === "warning") return "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";
  return "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
}

export function TipoBadge({ tipo, title }: { tipo: TipoComercial; title?: string }) {
  return (
    <span title={title ?? `Según sus medidas (espesor·ancho·largo): ${tipo}`} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${tipoBadgeCls(tonoTipo(tipo))}`}>
      {tipoCorto(tipo)}
    </span>
  );
}

/**
 * El badge, pero editable: el mismo chip de color que se puede cambiar.
 *
 * Nació de un desborde propio. La primera versión ponía el `<select>` AL LADO
 * del badge y un lápiz al lado del select: tres elementos para un dato, ~90 px
 * que empujaron la columna de acciones fuera de la tabla. Un control que ya
 * muestra el color y el valor hace el trabajo de los tres.
 *
 * `tipo` es el vigente (manual o automático) y `auto` el que dictan las
 * medidas: la opción por defecto lo nombra, así se ve a qué se vuelve.
 */
export function TipoSelect({
  tipo,
  auto,
  manual,
  opciones,
  onCambiar,
  etiqueta,
}: {
  tipo: TipoComercial;
  auto: TipoComercial;
  manual: boolean;
  opciones: readonly TipoComercial[];
  onCambiar: (t: TipoComercial | "") => void;
  etiqueta: string;
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={manual ? tipo : ""}
        onChange={(e) => onCambiar(e.target.value as TipoComercial | "")}
        aria-label={etiqueta}
        title={manual ? `Puesto a mano. Por su medida sería «${auto}».` : `Sale de la medida: ${auto}. Elegí otro para forzarlo.`}
        className={`w-[108px] cursor-pointer appearance-none rounded-full py-1 pl-2.5 pr-5 text-[length:var(--ts-xs)] font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${tipoChipCls(tonoTipo(tipo))} ${manual ? "ring-2 ring-[var(--accent)]" : ""}`}
      >
        {/* La opción automática cambia de NOMBRE según el estado, y no es un
            detalle: cuando está en auto tiene que decir sólo el tipo (si dijera
            "Auto · Paquetería larga" el chip trunca y se lee «Auto · Paq. larg»),
            y cuando está forzado tiene que decir cómo volver — si no, el
            operario no encuentra la salida del modo manual. */}
        <option value="">{manual ? `↺ Automático (${tipoCorto(auto)})` : tipoCorto(auto)}</option>
        {opciones.map((t) => (
          <option key={t} value={t}>{tipoCorto(t)}</option>
        ))}
      </select>
      {/* Un tipo forzado se marca: sin la marca, nadie sabe por qué una 1×4×8
          figura como «Corta» en el Excel que se manda al cliente. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute right-2 h-1.5 w-1.5 rounded-full ${manual ? "bg-[var(--accent)]" : "bg-[var(--text-tertiary)] opacity-60"}`}
      />
    </span>
  );
}
