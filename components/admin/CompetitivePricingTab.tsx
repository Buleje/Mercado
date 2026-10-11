"use client";

/**
 * Marketplace › Precios: tu precio en el marketplace al lado del de las otras
 * tiendas que venden el MISMO producto (`/api/pricing/competitive`, ±20 % del
 * promedio decide «Subir» / «Bajar»).
 *
 * No es Productos e inventario › Precios (el historial de tus cambios) ni
 * Compras › Comparar proveedores › Precios del mercado (lo que anotas a mano):
 * los dos quedan en «Más».
 *
 * 11-10, patrón del panel: cabecera en una fila con Indicadores, búsqueda y
 * sugerencia en la fila de la tabla. Salió el gráfico «Mi precio vs promedio»
 * (las mismas dos cifras de la tabla, otra vez) y la «Oportunidad estimada»
 * (sumaba diferencias de precio POR UNIDAD de productos distintos y la llamaba
 * «ingreso extra»). «Aplicar» escribía `{ retailPrice }` en /api/products/[id],
 * cuyo esquema no tiene ese campo: respondía 200 sin cambiar nada y la fila
 * decía «Precio OK». Ahora cambia el precio de tu producto en el marketplace,
 * por el mismo endpoint que Marketplace › Productos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { History, Minus, NotebookPen, RefreshCw, Store, TrendingDown, TrendingUp, HelpCircle } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { BuscadorEnFila, TableSkeleton } from "@/components/admin/marketplace/shared";
import { useAccionesDeVista } from "@/components/admin/marketplace/acciones-de-vista";
import { ENCABEZADOS_14, ErrorDeCarga, FilaDeVista, SelectFiltro, TarjetaCifra, VacioDeUnaFrase, type OpcionFiltro } from "@/components/admin/marketplace/tabs/cabecera-vista";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Suggestion = "Subir" | "Bajar" | "OK" | "Sin datos";

interface PricingProduct {
  /** Id del StoreProduct (tu producto publicado en el marketplace). */
  id: string;
  productId: number;
  name: string;
  myPrice: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  suggestion: Suggestion;
  competitorCount: number;
}

const SUGERENCIA: Record<Suggestion, { rotulo: string; clase: string; icono: typeof TrendingUp }> = {
  Subir: { rotulo: "Subir", clase: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", icono: TrendingUp },
  Bajar: { rotulo: "Bajar", clase: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]", icono: TrendingDown },
  OK: { rotulo: "En el promedio", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", icono: Minus },
  "Sin datos": { rotulo: "Sin otras tiendas", clase: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]", icono: HelpCircle },
};

const HREF_HISTORIAL = "/admin?tab=inventario&vista=precios";
const HREF_ANOTADOS = "/admin?tab=compras&vista=proveedores&sub=comparar";

/** Dónde cae tu precio entre el más barato y el más caro (la raya es el promedio). */
function PriceBar({ myPrice, minPrice, maxPrice, avgPrice }: { myPrice: number; minPrice: number; maxPrice: number; avgPrice: number }) {
  if (maxPrice === minPrice) return null;
  const rango = maxPrice - minPrice;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - minPrice) / rango) * 100));
  return (
    <div className="relative mt-2 h-2 w-full rounded-full bg-[var(--rule-soft)]" aria-hidden>
      <span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--text-tertiary)]" style={{ left: `${pct(avgPrice)}%` }} />
      <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-raised)] bg-primary" style={{ left: `${pct(myPrice)}%` }} />
    </div>
  );
}

export default function CompetitivePricingTab() {
  const [products, setProducts] = useState<PricingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Suggestion | "todas">("todas");
  const { confirm } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pricing/competitive");
      if (!res.ok) throw new Error(`pricing ${res.status}`);
      const data = (await res.json()) as { products?: PricingProduct[] };
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setError("No se pudo cargar la comparación de precios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function aplicar(p: PricingProduct) {
    if (!p.avgPrice) return;
    const nuevo = p.suggestion === "Subir" ? Math.ceil(p.avgPrice * 100) / 100 : Math.floor(p.avgPrice * 100) / 100;
    const ok = await confirm({ title: `¿Cambiar el precio de «${p.name}» en el marketplace a ${formatCurrency(nuevo)}?`, intent: "warning", confirmLabel: "Sí, cambiar" });
    if (!ok) return;
    setApplying(p.id);
    try {
      const res = await fetch(`/api/marketplace/stores/my/products/${encodeURIComponent(p.id)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ retailPrice: nuevo }),
      });
      if (!res.ok) throw new Error(`precio ${res.status}`);
      const actualizado = (await res.json().catch(() => null)) as { retailPrice?: number } | null;
      const precio = typeof actualizado?.retailPrice === "number" ? actualizado.retailPrice : nuevo;
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, myPrice: precio, suggestion: "OK" } : x)));
      toast.success(`«${p.name}» quedó a ${formatCurrency(precio)} en el marketplace`);
    } catch {
      toast.error("No se pudo cambiar el precio. Intenta de nuevo.");
    } finally {
      setApplying(null);
    }
  }

  const cuenta = (s: Suggestion) => products.filter((p) => p.suggestion === s).length;
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return products.filter((p) => (filtro === "todas" || p.suggestion === filtro) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, filtro, busqueda]);

  const kpis = useKpisPlegables({
    claveMemoria: "marketplace-precios",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && products.length === 0,
    resumen: `${cuenta("Subir")} para subir · ${cuenta("Bajar")} para bajar`,
    tarjetas: [
      <TarjetaCifra key="s" rotulo="Debajo del promedio" valor={cuenta("Subir")} icono={TrendingUp} ayuda="Más de 20 % por debajo del promedio de las otras tiendas: podrías subirlo." />,
      <TarjetaCifra key="b" rotulo="Encima del promedio" valor={cuenta("Bajar")} icono={TrendingDown} ayuda="Más de 20 % por encima: el comprador lo encuentra más barato en otra tienda." />,
      <TarjetaCifra key="n" rotulo="Sin otras tiendas" valor={cuenta("Sin datos")} icono={HelpCircle} ayuda="Ninguna otra tienda del marketplace vende ese producto." />,
    ],
  });

  const acciones: MenuAccion[] = [
    { id: "historial", label: "Historial de tus precios", hint: "Productos e inventario › Precios", icon: History, onSelect: () => irAEnlace(HREF_HISTORIAL) },
    { id: "anotados", label: "Precios que anotas a mano", hint: "Compras › Comparar proveedores", icon: NotebookPen, onSelect: () => irAEnlace(HREF_ANOTADOS) },
  ];
  /* Al «⋯ Más» del hub; «Actualizar» ya lo pone el hub (vuelve a montar la vista). */
  useAccionesDeVista(acciones);
  const opciones: OpcionFiltro<Suggestion | "todas">[] = [
    { valor: "todas", rotulo: "Toda sugerencia", cuenta: products.length },
    { valor: "Subir", rotulo: "Subir", cuenta: cuenta("Subir") },
    { valor: "Bajar", rotulo: "Bajar", cuenta: cuenta("Bajar") },
    { valor: "OK", rotulo: "En el promedio", cuenta: cuenta("OK") },
    { valor: "Sin datos", rotulo: "Sin otras tiendas", cuenta: cuenta("Sin datos") },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <FilaDeVista
        titulo="Precios"
        ayuda={{
          what: "Tu precio en el marketplace al lado del de las otras tiendas que venden el mismo producto: el promedio, el más barato y el más caro.",
          affects: "«Aplicar» lleva tu precio del marketplace al promedio; el de tu tienda y tu caja no cambia. El historial de tus cambios está en Productos e inventario › Precios; los precios que anotas a mano, en Compras › Comparar proveedores.",
          example: "Aceite Primor 1 L: tú a S/ 7,50, el promedio de 4 tiendas S/ 10,20 → «Subir».",
        }}
        derecha={kpis.boton}
      >
        {products.length > 0 && (
          <>
            <BuscadorEnFila valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar producto" />
            <SelectFiltro opciones={opciones} activo={filtro} onCambiar={setFiltro} etiqueta="Sugerencia" />
          </>
        )}
      </FilaDeVista>
      {kpis.panel}
      {error && <ErrorDeCarga mensaje={error} onReintentar={() => void load()} />}

      {loading && products.length === 0 ? (
        <TableSkeleton />
      ) : products.length === 0 ? (
        !error && <VacioDeUnaFrase>Publica productos en el marketplace para compararlos con las otras tiendas.</VacioDeUnaFrase>
      ) : visibles.length === 0 ? (
        <VacioDeUnaFrase>Ningún producto coincide con esa búsqueda.</VacioDeUnaFrase>
      ) : (
        <DataTable className={ENCABEZADOS_14}>
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Tu precio</th>
              <th className="text-right">Promedio</th>
              <th className="text-right">Más barato – más caro</th>
              <th className="text-right">Tiendas</th>
              <th>Sugerencia</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const s = SUGERENCIA[p.suggestion];
              const Icono = s.icono;
              const puede = (p.suggestion === "Subir" || p.suggestion === "Bajar") && p.avgPrice !== null;
              return (
                <tr key={p.id}>
                  <td data-label="Producto" className="max-w-[16rem] text-sm font-semibold text-[var(--text-primary)]">{p.name}</td>
                  <td data-label="Tu precio" className="text-right text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(p.myPrice)}</td>
                  <td data-label="Promedio" className="text-right text-sm tabular-nums text-[var(--text-secondary)]">
                    {/* Un div: en la tarjeta de 400 px la celda es flex y partía la cifra de su raya. */}
                    <div className="ml-auto w-32 max-w-full sm:w-auto">
                      {p.avgPrice !== null ? formatCurrency(p.avgPrice) : "—"}
                      {p.avgPrice !== null && p.minPrice !== null && p.maxPrice !== null && (
                        <PriceBar myPrice={p.myPrice} minPrice={p.minPrice} maxPrice={p.maxPrice} avgPrice={p.avgPrice} />
                      )}
                    </div>
                  </td>
                  <td data-label="Más barato – más caro" className="whitespace-nowrap text-right text-sm tabular-nums text-[var(--text-secondary)]">
                    {p.minPrice !== null && p.maxPrice !== null ? `${formatCurrency(p.minPrice)} – ${formatCurrency(p.maxPrice)}` : "—"}
                  </td>
                  <td data-label="Tiendas" className="text-right text-sm tabular-nums text-[var(--text-secondary)]">{p.competitorCount}</td>
                  <td data-label="Sugerencia">
                    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold", s.clase)}>
                      <Icono className="h-3.5 w-3.5" aria-hidden />
                      {s.rotulo}
                    </span>
                  </td>
                  <td className="text-right max-sm:empty:hidden">
                    {puede && (
                      <button
                        type="button"
                        disabled={applying === p.id}
                        onClick={() => void aplicar(p)}
                        title={`Llevar tu precio al promedio: ${formatCurrency(p.avgPrice ?? 0)}`}
                        className={button({ variant: "secondary", className: "h-12 rounded-xl px-4 text-sm" })}
                      >
                        {applying === p.id ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Store className="h-4 w-4" aria-hidden />}
                        Aplicar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
