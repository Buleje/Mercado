"use client";

/**
 * Caja › Hoy › Movimientos: la lista y la línea de tiempo hablaban de lo
 * mismo y estaban apiladas; ahora son dos vistas del mismo bloque (recordada).
 * Desde el 10-10 es su propia sección: el título y su ⓘ son los de la
 * cabecera, y cómo verlos + los filtros (medio y origen) van en UNA fila
 * pegada a la tabla. Cada fila dice de dónde vino: venta, adelanto, gasto…
 */
import { useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { medioCorregible } from "@/lib/caja/cambiar-medio";
import { origenDeMovimiento, type OrigenClave } from "@/lib/caja/origen-movimiento";
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import { fechaCortaLima } from "@/lib/caja/caja-abierta";
import { formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { CambiarMedioMovimiento } from "../cash-register/CambiarMedioMovimiento";
import { CajaLineaDeTiempo } from "./CajaLineaDeTiempo";
import type { ItemLineaDeTiempo } from "./use-caja-registradora";
import { COLOR_SIGNO, acortarIds, fmt, signoDe, type CashRegister } from "./tipos";
import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";

type Fila = { m: CashRegister["movements"][number]; origen: ReturnType<typeof origenDeMovimiento> };
const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");
const MEDIO_CAP = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

/** Filtros de columna (como Adelantos › Lista): los movimientos de la caja llegan enteros. */
const COLUMNAS: readonly ColumnaFiltro<Fila>[] = [
  { id: "dia", label: "Día", tipo: "fecha", numero: ({ m }) => limaDateKey(m.createdAt), formatearValor: ddmm, soloConVarios: true },
  { id: "origen", label: "Origen", tipo: "multi", valor: ({ origen }) => origen.etiqueta, soloConVarios: true },
  { id: "detalle", label: "Detalle", tipo: "texto", valor: ({ m, origen }) => [m.description, origen.etiqueta, String(m.amount)] },
  { id: "medio", label: "Medio", tipo: "multi", valor: ({ m }) => MEDIO_CAP(medioDeMovimiento(m.method)), soloConVarios: true },
  { id: "monto", label: "Monto", tipo: "rango", numero: ({ m }) => Number(m.amount), unidad: "S/", paso: 0.01 },
];

const ORDEN: Record<string, AccesorOrden<Fila>> = {
  hora: { valor: ({ m }) => new Date(m.createdAt).getTime() },
  origen: { valor: ({ origen }) => origen.etiqueta, texto: true },
  detalle: { valor: ({ m }) => m.description, texto: true },
  medio: { valor: ({ m }) => medioDeMovimiento(m.method), texto: true },
  monto: { valor: ({ m }) => Number(m.amount) },
};

const COLOR_ORIGEN: Partial<Record<OrigenClave, string>> = {
  venta: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  "retiro-dueno": "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  gasto: "bg-[var(--data-error-500)]/12 text-[var(--data-error-500)]",
  proveedor: "bg-[var(--data-error-500)]/12 text-[var(--data-error-500)]",
  adelanto: "bg-[var(--data-8)]/15 text-[var(--text-primary)]",
};

interface Props {
  caja: CashRegister;
  timeline: ItemLineaDeTiempo[];
  efectivoActual: number;
  puedeCambiarMedio: boolean;
  onCambiado: () => void;
  /** Texto con que llega buscado (desde «El esperado da negativo», M26). */
  buscarInicial?: string;
}

export function CajaMovimientos({ caja, timeline, efectivoActual, puedeCambiarMedio, onCambiado, buscarInicial = "" }: Props) {
  const [vista, setVista] = useLocalStorage<"lista" | "tiempo">("caja:movimientos-vista", "lista");
  /* La búsqueda sólo se ve en la lista: si llega un egreso buscado, se abre ahí. */
  useEffect(() => {
    if (buscarInicial) setVista("lista");
  }, [buscarInicial, setVista]);
  /* Sesión de varios días: la hora sola no dice cuándo (M24, caja abierta en junio). */
  const variosDias = limaDateKey(caja.openedAt) !== limaDateKey();

  const conOrigen = useMemo<Fila[]>(() => caja.movements.map((m) => ({ m, origen: origenDeMovimiento(m) })), [caja.movements]);
  const f = useFiltrosTabla(conOrigen, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  /* Llega buscado desde «El esperado da negativo»: cae en el filtro de Detalle. */
  const { setTexto } = f;
  useEffect(() => {
    if (buscarInicial) setTexto("detalle", buscarInicial.trim().replace(/^#/, ""));
  }, [buscarInicial, setTexto]);

  return (
    <section aria-label={`Movimientos de la caja · ${caja.movements.length}`} className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
      {/* Una sola fila: cómo verlos y, en la lista, los filtros pegados a la tabla. */}
      <div className="px-3 sm:px-4 py-2 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-[var(--surface-sunken)]" role="tablist" aria-label="Cómo ver los movimientos">
          {(["lista", "tiempo"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={cn("px-4 min-h-12 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap", vista === v ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]" : "text-[var(--text-secondary)]")}
            >
              {v === "lista" ? "Lista" : "Línea de tiempo"}
            </button>
          ))}
        </div>
      </div>

      {vista === "lista" && <BarraFiltrosTabla excel="Movimientos de caja" vistas="caja-movimientos" f={f} className="px-3 sm:px-4 py-2" />}

      {vista === "tiempo" ? (
        <CajaLineaDeTiempo items={timeline} efectivoActual={efectivoActual} />
      ) : (
        <>
          {conOrigen.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-[var(--text-secondary)]">Sin movimientos en esta caja.</p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <DataTable className="w-full">
                <thead className="sticky top-0">
                  <tr>
                    <ThColumna label={variosDias ? "Día y hora" : "Hora"} ids={["dia"]} f={f} orden={ord} ordenId="hora" />
                    <ThColumna label="Origen" ids={["origen"]} f={f} orden={ord} ordenId="origen" />
                    <ThColumna label="Detalle" ids={["detalle"]} f={f} orden={ord} ordenId="detalle" />
                    <ThColumna label="Medio" ids={["medio"]} f={f} orden={ord} ordenId="medio" />
                    <ThColumna label="Monto" ids={["monto"]} f={f} derecha orden={ord} ordenId="monto" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
                  {filas.map(({ m, origen: o }) => {
                    const signo = signoDe(m.type);
                    return (
                      <tr key={m.id} className="hover:bg-[var(--surface-alt)]">
                        <td className="whitespace-nowrap text-[var(--text-secondary)]">
                          {variosDias && <span className="block text-sm font-semibold text-[var(--text-primary)]">{fechaCortaLima(m.createdAt)}</span>}
                          <span className="font-mono">{formatTime(m.createdAt)}</span>
                        </td>
                        <td>
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-sm font-semibold whitespace-nowrap", COLOR_ORIGEN[o.clave] ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>{o.etiqueta}</span>
                        </td>
                        <td className="max-w-[18rem] truncate text-[var(--text-secondary)]" title={m.description}>
                          {acortarIds(m.description)}
                        </td>
                        <td className="capitalize text-[var(--text-secondary)]">{medioDeMovimiento(m.method)}</td>
                        <td className="text-right">
                          <span className={cn("font-bold tabular-nums whitespace-nowrap", COLOR_SIGNO[signo])}>
                            {signo === 1 ? "+" : signo === -1 ? "−" : ""}
                            {fmt(m.amount)}
                          </span>
                          {/* Un adelanto anotado como efectivo que se pagó por transferencia: corregir el medio mueve el esperado. */}
                          {puedeCambiarMedio && medioCorregible(m.type) && (
                            <div className="mt-1">
                              <CambiarMedioMovimiento cashRegisterId={caja.id} movimiento={m} esperadoActual={efectivoActual} formato={fmt} onCambiado={onCambiado} />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          )}
        </>
      )}
    </section>
  );
}
