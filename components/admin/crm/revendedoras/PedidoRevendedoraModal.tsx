"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Copy, Search, ShoppingBag } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import type { ConfigRevendedoras, CotizacionRevendedora, ProductoPrecios, RevendedoraFila } from "@/lib/revendedoras/reglas";
import { cotizarPedido, leerPrecios } from "./use-revendedoras";
import { pct, soles, textoParaWhatsApp } from "./formato";
import ResumenPedido from "./ResumenPedido";

const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const VISIBLES = 80;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lista de precios por nivel + armar el pedido de una revendedora. La pantalla
 * sólo junta cantidades: el precio, el nivel y los totales los calcula el
 * servidor (POST cotizar) con el costo y el precio de la base.
 */
export default function PedidoRevendedoraModal({
  open,
  onClose,
  revendedoras,
  inicial,
}: {
  open: boolean;
  onClose: () => void;
  revendedoras: RevendedoraFila[];
  inicial: string | null;
}) {
  const [precios, setPrecios] = useState<{ config: ConfigRevendedoras; productos: ProductoPrecios[] } | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [clienta, setClienta] = useState<string>(inicial ?? "");
  const [buscar, setBuscar] = useState("");
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [cotizacion, setCotizacion] = useState<CotizacionRevendedora | null>(null);
  const [faltan, setFaltan] = useState(0);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedidoN = useRef(0);

  useEffect(() => {
    leerPrecios()
      .then(setPrecios)
      .catch((e: unknown) => setErrorLista(e instanceof Error ? e.message : "No se pudo leer la lista de precios."));
  }, []);

  const items = useMemo(
    () => Object.entries(cantidades).filter(([, c]) => c > 0).map(([id, cantidad]) => ({ productId: Number(id), cantidad })),
    [cantidades],
  );
  const pedido = useDebounce(useMemo(() => ({ clienta, items }), [clienta, items]), 350);

  useEffect(() => {
    const n = ++pedidoN.current;
    if (pedido.items.length === 0) {
      setCotizacion(null);
      setFaltan(0);
      setCalculando(false);
      return;
    }
    setCalculando(true);
    cotizarPedido(pedido.clienta || null, pedido.items)
      .then((r) => {
        if (n !== pedidoN.current) return; // llegó tarde: ya hay un pedido más nuevo
        setCotizacion(r.cotizacion);
        setFaltan(r.faltan.length);
        setError(null);
      })
      .catch((e: unknown) => n === pedidoN.current && setError(e instanceof Error ? e.message : "No se pudo calcular."))
      .finally(() => n === pedidoN.current && setCalculando(false));
  }, [pedido]);

  const filas = useMemo(() => {
    const todos = precios?.productos ?? [];
    const q = sinTildes(buscar.trim());
    const hallados = q ? todos.filter((p) => sinTildes(`${p.nombre} ${p.codigo ?? ""} ${p.categoria}`).includes(q)) : todos;
    // Lo que ya tiene cantidad, arriba: no se pierde al buscar otra cosa.
    const elegidos = todos.filter((p) => (cantidades[p.productId] ?? 0) > 0 && !hallados.includes(p));
    return [...elegidos, ...hallados];
  }, [precios, buscar, cantidades]);

  const nombre = revendedoras.find((r) => r.customerId === clienta)?.nombre ?? null;

  async function copiar() {
    if (!cotizacion) return;
    try {
      await navigator.clipboard.writeText(textoParaWhatsApp(cotizacion, nombre));
      toast.success("Pedido copiado: pégalo en el WhatsApp");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  const niveles = precios?.config.niveles ?? [];

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Armar un pedido"
      icon={ShoppingBag}
      size="xl"
      claveVentana="revendedoras-pedido"
      footer={
        <ModalFooter error={error ?? errorLista} nota={faltan > 0 ? `${faltan} producto${faltan === 1 ? "" : "s"} ya no está${faltan === 1 ? "" : "n"} en el catálogo` : undefined}>
          <button type="button" onClick={() => setCantidades({})} disabled={items.length === 0} className={button({ variant: "ghost" })}>Vaciar</button>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cerrar</button>
          <button type="button" onClick={() => void copiar()} disabled={!cotizacion || calculando} className={button({ variant: "primary", className: "gap-1.5" })}>
            <Copy className="h-4 w-4" aria-hidden /> Copiar para WhatsApp
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-3")}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label>
            <span className="sr-only">Revendedora</span>
            <select value={clienta} onChange={(e) => setClienta(e.target.value)} className={CAMPO} data-testid="pedido-clienta">
              <option value="">Sin elegir (precio de entrada)</option>
              {revendedoras.map((r) => (
                <option key={r.customerId} value={r.customerId}>
                  {r.nombre} · hoy {pct(r.nivel.descuento)}
                </option>
              ))}
            </select>
          </label>
          <label className="relative">
            <span className="sr-only">Buscar producto</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Producto, código o categoría" className={cn(CAMPO, "pl-9")} />
          </label>
        </div>

        <ResumenPedido c={cotizacion} calculando={calculando} />

        {!precios ? (
          <div className="py-6 text-center text-sm text-[var(--text-tertiary)]">{errorLista ? "Sin lista de precios." : "Cargando la lista de precios…"}</div>
        ) : filas.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--text-secondary)]">{buscar ? "Ningún producto con ese nombre o código." : "No tienes productos activos."}</div>
        ) : (
          <div>
            {/* Cantidad pegada al nombre: en el celular los niveles se corren de costado y lo que se tipea queda a la vista. */}
            <DataTable wrapperClassName="rounded-xl" className="w-full" data-testid="tabla-precios-revendedora">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="w-24 text-right">Cantidad</th>
                  <th className="text-right">Catálogo</th>
                  {niveles.map((n) => (
                    <th key={n.desde} className="whitespace-nowrap text-right">
                      {pct(n.descuento)}{n.desde > 0 ? ` (desde ${soles(n.desde)})` : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filas.slice(0, VISIBLES).map((p) => (
                  <tr key={p.productId} data-producto={p.productId}>
                    <td className="min-w-40">
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--text-primary)]">{p.nombre}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">{[p.codigo, p.categoria].filter(Boolean).join(" · ")}</div>
                      </div>
                    </td>
                    <td className="text-right">
                      <input
                        inputMode="numeric"
                        aria-label={`Cantidad de ${p.nombre}`}
                        value={cantidades[p.productId] ? String(cantidades[p.productId]) : ""}
                        placeholder="0"
                        onChange={(e) => {
                          const v = Math.min(10_000, Math.max(0, Math.trunc(Number(e.target.value.replace(/\D/g, "")) || 0)));
                          setCantidades((c) => ({ ...c, [p.productId]: v }));
                        }}
                        className={cn(CAMPO, "w-20 text-right tabular-nums")}
                      />
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{soles(p.precioCatalogo)}</td>
                    {p.porNivel.map((x, i) => (
                      <td key={i} className="whitespace-nowrap text-right tabular-nums">
                        <div>
                          <div className={cn(x.motivo && "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>{soles(x.precio)}</div>
                          {x.motivo && <div className="text-xs text-[var(--text-tertiary)]">{x.motivo === "oferta" ? "oferta" : x.motivo === "margen" ? `tope ${pct(x.descuento)}` : "sin descuento"}</div>}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {filas.length > VISIBLES && (
              <div className="px-3 py-2 text-sm text-[var(--text-tertiary)]">
                Y {filas.length - VISIBLES} productos más: búscalos por nombre o código.
              </div>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
