"use client";

/** Las líneas de la factura con el producto de tu catálogo que le toca a cada una. */
import { CardTitle } from "@buleje/design-system";
import type { LineaFacturaXml } from "@/lib/compras/factura-xml";
import type { SugerenciaDeLinea } from "@/lib/compras/factura-xml-cruce";
import type { ProductoSugerido } from "@/lib/admin/comandos-ia/papel";
import { SelectorProducto } from "@/components/admin/comandos-ia/papel/SelectorProducto";
import { alternativasDe, costoUnitarioDe, monto, POR_QUE, type Elegidos } from "./compra-desde-factura";

const COLUMNAS = "sm:grid-cols-[minmax(0,1.5fr)_6.5rem_6.5rem_6.5rem_minmax(0,1.5fr)]";
const ETIQUETA_MOVIL = "text-[var(--text-secondary)] sm:hidden";

function cantidad(n: number): string {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 3 });
}

export default function FacturaXmlLineas({
  lineas,
  sugerencias,
  elegidos,
  moneda,
  onCambiar,
}: {
  lineas: readonly LineaFacturaXml[];
  sugerencias: readonly SugerenciaDeLinea[];
  elegidos: Elegidos;
  moneda: string;
  onCambiar: (numero: number, p: ProductoSugerido | null) => void;
}) {
  const porNumero = new Map(sugerencias.map((s) => [s.numero, s]));
  return (
    <section aria-label="Productos de la factura" className="space-y-2">
      <CardTitle>Productos de la factura ({lineas.length})</CardTitle>
      <div aria-hidden className={`hidden gap-3 px-3 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] sm:grid ${COLUMNAS}`}>
        <span>En la factura</span>
        <span className="text-right">Cantidad</span>
        <span className="text-right">Precio c/u</span>
        <span className="text-right">Total</span>
        <span>Tu producto</span>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" data-factura-xml-lineas>
        {lineas.map((l) => {
          const s = porNumero.get(l.numero);
          const p = elegidos[l.numero] ?? null;
          const sugerido = s && p && s.producto?.id === p.id && s.motivo ? POR_QUE[s.motivo] : null;
          const codigos = [l.codigoVendedor && `Cód. ${l.codigoVendedor}`, l.codigoBarras && `Barras ${l.codigoBarras}`, l.gratuita && "Va de regalo"]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={l.numero} className={`grid gap-2 px-3 py-2.5 sm:items-center sm:gap-3 ${COLUMNAS}`} data-linea={l.numero}>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-[var(--text-primary)]">{l.descripcion}</p>
                <p className="text-xs text-[var(--text-secondary)]">{codigos || `Línea ${l.numero}`}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-[var(--text-primary)] sm:contents">
                <span className="sm:text-right"><span className={ETIQUETA_MOVIL}>Cant. </span>{cantidad(l.cantidad)} {l.unidad}</span>
                <span className="sm:text-right"><span className={ETIQUETA_MOVIL}>c/u </span>{monto(costoUnitarioDe(l), moneda)}</span>
                <span className="font-semibold sm:text-right"><span className={ETIQUETA_MOVIL}>Total </span>{monto(l.total, moneda)}</span>
              </div>
              <div className="min-w-0">
                <SelectorProducto
                  valor={p}
                  alternativas={s ? alternativasDe(s) : []}
                  leido={l.descripcion}
                  onCambiar={(nuevo) => onCambiar(l.numero, nuevo)}
                />
                {p
                  ? sugerido && <p className="mt-1 text-xs text-[var(--text-secondary)]">{sugerido}</p>
                  : <p className="mt-1 text-xs font-semibold text-[var(--data-warning-ink)]">Falta elegir el producto</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
