"use client";

/**
 * «Ofrécele algo»: eliges un cliente, ves lo que le recomienda el negocio y
 * sale el mensaje armado SIN IA con los productos que marques. Lo copias o
 * abres WhatsApp con el texto puesto: nada se envía solo.
 *
 * Venía de Sugerencias IA › Para clientes (TabClientes), que se fusionó acá el
 * 10-10. Autónomo y sin props: lo monta Comandos › A quién escribir.
 */

import { useEffect, useId, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Check, Copy, Loader2, MessageCircle, RefreshCw, RotateCcw, Search } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useOfrecer, type ClienteOfrecer, type ProductoOfrecer } from "./use-ofrecer";

const CHIP = "inline-flex min-h-12 max-w-full items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors";
const CHIP_SI = "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]";
const CHIP_NO = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]";
const CAMPO =
  "w-full rounded-xl border border-[var(--rule-base)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] sm:text-sm";
const AVISO_ERROR = "text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

/** Una línea de error con su «Reintentar» al lado. */
function LineaError({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return (
    <p role="alert" className={cn("mt-3 flex flex-wrap items-center gap-2", AVISO_ERROR)}>
      {texto}
      <button type="button" className={button({ variant: "secondary" })} onClick={onReintentar}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
      </button>
    </p>
  );
}

function ListaClientes({ clientes, onElegir }: { clientes: ClienteOfrecer[]; onElegir: (c: ClienteOfrecer) => void }) {
  return (
    <ul className="mt-2 divide-y divide-[var(--rule-soft)] border-y border-[var(--rule-soft)]" aria-label="Clientes que coinciden">
      {clientes.map((c) => (
        <li key={c.phone}>
          <button
            type="button"
            onClick={() => onElegir(c)}
            className="flex min-h-12 w-full items-center gap-3 px-2 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]">{c.name}</span>
            <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{c.phone}</span>
            {c.totalSpent != null && c.totalSpent > 0 && (
              <span className="hidden shrink-0 tabular-nums text-[var(--text-secondary)] sm:inline">
                compró {formatCurrency(c.totalSpent)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChipsProductos({
  productos,
  marcados,
  onAlternar,
}: {
  productos: ProductoOfrecer[];
  marcados: ReadonlySet<string>;
  onAlternar: (id: string) => void;
}) {
  return (
    <div role="group" aria-label="Productos del mensaje" className="mt-3 flex flex-wrap gap-2">
      {productos.map((p) => {
        const si = marcados.has(p.id);
        return (
          <button key={p.id} type="button" aria-pressed={si} onClick={() => onAlternar(p.id)} className={cn(CHIP, si ? CHIP_SI : CHIP_NO)}>
            {si && <Check className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="min-w-0 truncate">{p.name}</span>
            <span className="shrink-0 tabular-nums">{formatCurrency(p.price)}</span>
          </button>
        );
      })}
    </div>
  );
}

type Copia = "nada" | "hecho" | "fallo";

export default function OfreceleAlgo(): React.JSX.Element {
  const o = useOfrecer();
  const idTitulo = useId();
  const [copia, setCopia] = useState<Copia>("nada");
  const relojCopia = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relojCopia.current) clearTimeout(relojCopia.current); }, []);

  const copiar = async () => {
    if (relojCopia.current) clearTimeout(relojCopia.current);
    try {
      await navigator.clipboard.writeText(o.mensaje);
      setCopia("hecho");
    } catch {
      setCopia("fallo");
    }
    relojCopia.current = setTimeout(() => setCopia("nada"), 2500);
  };

  const hayMensaje = o.mensaje.trim().length > 0;

  return (
    // Sin tarjeta ni título visibles: lo monta «A quién escribir», que ya lo nombra en su selector y
    // explica en su ⓘ. El título queda para lectores de pantalla.
    <section aria-labelledby={idTitulo} data-ofrecele-algo>
      <CardTitle id={idTitulo} as="h3" className="sr-only">Ofrécele algo</CardTitle>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {o.cliente ? (
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
            <span className="min-w-0 truncate text-base font-semibold text-[var(--text-primary)]">{o.cliente.name}</span>
            <span className="shrink-0 text-sm tabular-nums text-[var(--text-secondary)]">{o.cliente.phone}</span>
            <button type="button" className={button({ variant: "secondary", className: "ml-auto shrink-0" })} onClick={o.soltar}>
              Cambiar
            </button>
          </div>
        ) : (
          <label className="relative min-w-0 flex-1 basis-full sm:basis-72">
            <span className="sr-only">Busca al cliente por nombre o celular</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              type="search"
              value={o.texto}
              onChange={(e) => o.cambiarTexto(e.target.value)}
              placeholder="Nombre o celular del cliente"
              autoComplete="off"
              className={cn(CAMPO, "h-12 bg-[var(--surface-raised)] pl-9 pr-10")}
            />
            {o.busqueda === "cargando" && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" aria-hidden />
            )}
          </label>
        )}
      </div>

      {!o.cliente && (
        <>
          <span role="status" className="sr-only">
            {o.busqueda === "cargando" ? "Buscando clientes…" : o.busqueda === "listo" ? `${o.clientes.length} clientes` : ""}
          </span>
          {o.busqueda === "error" && <LineaError texto="No pudimos buscar clientes." onReintentar={o.reintentarBusqueda} />}
          {o.busqueda === "listo" && o.clientes.length === 0 && (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">Ningún cliente tiene ese nombre o celular.</p>
          )}
          {o.clientes.length > 0 && <ListaClientes clientes={o.clientes} onElegir={o.elegir} />}
        </>
      )}

      {o.cliente && o.recs === "cargando" && (
        <div role="status" aria-busy="true" className="mt-3 flex flex-wrap gap-2">
          <span className="sr-only">Buscando qué ofrecerle…</span>
          {[0, 1, 2].map((i) => (
            <span key={i} aria-hidden className="h-12 w-40 animate-pulse rounded-full bg-[var(--surface-sunken)]" />
          ))}
        </div>
      )}
      {o.cliente && o.recs === "error" && <LineaError texto="No pudimos traer qué ofrecerle." onReintentar={o.reintentarRecs} />}
      {o.cliente && o.recs === "listo" && o.productos.length === 0 && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">Todavía no hay productos para recomendarle.</p>
      )}

      {o.cliente && o.recs === "listo" && o.productos.length > 0 && (
        <>
          <ChipsProductos productos={o.productos} marcados={o.marcados} onAlternar={o.alternar} />
          <label className="mt-3 block">
            <span className="sr-only">Mensaje para {o.cliente.name}</span>
            <textarea
              value={o.mensaje}
              onChange={(e) => o.cambiarMensaje(e.target.value)}
              rows={Math.min(12, Math.max(4, o.mensaje.split("\n").length + 1))}
              placeholder="Marca al menos un producto."
              className={cn(CAMPO, "block resize-y bg-[var(--surface-sunken)] p-3 leading-relaxed")}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <span role="status" className={cn("mr-auto text-sm", copia === "fallo" ? AVISO_ERROR : "text-[var(--text-secondary)]")}>
              {copia === "hecho" ? "Copiado." : copia === "fallo" ? "No se pudo copiar: selecciónalo y cópialo a mano." : ""}
            </span>
            {o.editadoAMano && (
              <button type="button" className={button({ variant: "ghost" })} onClick={o.rehacer}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Rehacer mensaje
              </button>
            )}
            <button type="button" className={button({ variant: "secondary" })} onClick={() => void copiar()} disabled={!hayMensaje}>
              <Copy className="h-4 w-4" aria-hidden /> Copiar
            </button>
            {o.enlace ? (
              <a href={o.enlace} target="_blank" rel="noopener noreferrer" className={button({ variant: "primary" })}>
                <MessageCircle className="h-4 w-4" aria-hidden /> Abrir WhatsApp
              </a>
            ) : (
              <button type="button" className={button({ variant: "primary" })} disabled>
                <MessageCircle className="h-4 w-4" aria-hidden /> Abrir WhatsApp
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
