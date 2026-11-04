"use client";

/**
 * Las líneas de la factura con el producto de tu catálogo que le toca a cada una.
 * En dólares, debajo de cada cifra va su equivalente en soles. Una línea se puede
 * quitar antes de guardar (y volver a poner).
 */
import { CardTitle } from "@buleje/design-system";
import { RotateCcw, Trash2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { LineaFacturaXml } from "@/lib/compras/factura-xml";
import type { SugerenciaDeLinea } from "@/lib/compras/factura-xml-cruce";
import type { ProductoSugerido } from "@/lib/admin/comandos-ia/papel";
import { formatNumber } from "@/lib/format";
import { SelectorProducto } from "@/components/admin/comandos-ia/papel/SelectorProducto";
import {
  alternativasDe,
  costoUnitarioDe,
  costoUnitarioEnSoles,
  monto,
  POR_QUE,
  totalLineaEnSoles,
  type Elegidos,
} from "./compra-desde-factura";

const COLUMNAS = "sm:grid-cols-[minmax(0,1.5fr)_6.5rem_6.5rem_6.5rem_minmax(0,1.5fr)_3rem]";
const ETIQUETA_MOVIL = "text-[var(--text-secondary)] sm:hidden";
const EN_SOLES = "block text-xs font-normal text-[var(--text-secondary)]";

function cantidad(n: number): string {
  return formatNumber(n, { max: 3 });
}

export default function FacturaXmlLineas({
  lineas,
  sugerencias,
  elegidos,
  moneda,
  tipoCambio,
  quitadas,
  onCambiar,
  onQuitar,
}: {
  lineas: readonly LineaFacturaXml[];
  sugerencias: readonly SugerenciaDeLinea[];
  elegidos: Elegidos;
  moneda: string;
  /** Soles por unidad de la moneda; null en soles o mientras no hay tipo de cambio. */
  tipoCambio: number | null;
  quitadas: readonly number[];
  onCambiar: (numero: number, p: ProductoSugerido | null) => void;
  onQuitar: (numero: number) => void;
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
        <span className="sr-only">Quitar</span>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" data-factura-xml-lineas>
        {lineas.map((l) => {
          const s = porNumero.get(l.numero);
          const quitada = quitadas.includes(l.numero);
          const soles = tipoCambio !== null && moneda !== "PEN";
          const p = elegidos[l.numero] ?? null;
          const sugerido = s && p && s.producto?.id === p.id && s.motivo ? POR_QUE[s.motivo] : null;
          const codigos = [l.codigoVendedor && `Cód. ${l.codigoVendedor}`, l.codigoBarras && `Barras ${l.codigoBarras}`, l.gratuita && "Va de regalo"]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={l.numero}
              className={`relative grid gap-2 py-2.5 pl-3 pr-14 sm:items-center sm:gap-3 sm:pr-3 ${COLUMNAS} ${quitada ? "bg-[var(--surface-sunken)]" : ""}`}
              data-linea={l.numero}
              data-quitada={quitada || undefined}
            >
              <div className="min-w-0">
                <p className={`break-words text-sm font-semibold ${quitada ? "text-[var(--text-secondary)] line-through" : "text-[var(--text-primary)]"}`}>
                  {l.descripcion}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">{codigos || `Línea ${l.numero}`}</p>
              </div>
              <div className={`flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums sm:contents ${quitada ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}>
                <span className="sm:text-right"><span className={ETIQUETA_MOVIL}>Cant. </span>{cantidad(l.cantidad)} {l.unidad}</span>
                <span className="sm:text-right">
                  <span className={ETIQUETA_MOVIL}>c/u </span>{monto(costoUnitarioDe(l), moneda)}
                  {soles && <span className={EN_SOLES}>{monto(costoUnitarioEnSoles(l, tipoCambio), "PEN")}</span>}
                </span>
                <span className="font-semibold sm:text-right">
                  <span className={ETIQUETA_MOVIL}>Total </span>{monto(l.total, moneda)}
                  {soles && <span className={EN_SOLES} data-linea-soles>{monto(totalLineaEnSoles(l, tipoCambio), "PEN")}</span>}
                </span>
              </div>
              <div className="min-w-0">
                {quitada ? (
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Quitada: no entra en la compra</p>
                ) : (
                  <>
                  <SelectorProducto
                    valor={p}
                    alternativas={s ? alternativasDe(s) : []}
                    leido={l.descripcion}
                    onCambiar={(nuevo) => onCambiar(l.numero, nuevo)}
                  />
                  {p
                    ? sugerido && <p className="mt-1 text-xs text-[var(--text-secondary)]">{sugerido}</p>
                    : <p className="mt-1 text-xs font-semibold text-[var(--data-warning-ink)]">Falta elegir el producto</p>}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => onQuitar(l.numero)}
                className={`${button({ variant: "ghost", size: "icon" })} absolute right-1 top-1 sm:static`}
                aria-label={quitada ? `Volver a poner la línea ${l.numero}` : `Quitar la línea ${l.numero} de la compra`}
                title={quitada ? "Volver a ponerla" : "Quitar de la compra"}
                data-linea-quitar={l.numero}
              >
                {quitada ? <RotateCcw className="h-5 w-5" aria-hidden /> : <Trash2 className="h-5 w-5" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
