"use client";

/**
 * Entradas y salidas › Pérdidas: las salidas `merma` con su causa y lo que
 * cuestan. Antes era la pestaña «Pérdidas», con un formulario fijo de 300 px,
 * tres tarjetas, un «Motivo principal» que en un empate elegía al azar y un
 * «Impacto acumulado» al pie que repetía la «Pérdida total». Ahora: el mismo
 * modal del kardex (con causa), un panel de indicadores con una cifra por
 * causa y la tabla.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Download, Loader2, Plus, RefreshCw } from "@buleje/design-system/icons";
import { toast } from "sonner";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { BotonRestablecerColumnas, useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";
import { button } from "@/components/ui-system/button-variants";
import { exportToCSV, limaDateKey } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { inicioDeHoy } from "@/lib/fechas/dia-local";
import MovementDetailModal from "../MovementDetailModal";
import { CabeceraVista, CuerpoDeSeccion, type PanelDeSeccion } from "./CabeceraVista";
import { AvisoDeError, Chips, FILTRO_EN_FILA } from "./controles";
import { ModalRegistrarMovimiento } from "./ModalRegistrarMovimiento";
import { SECCION } from "./secciones";
import { COLUMNAS_PERDIDAS, TablaPerdidas, type FilaPerdida } from "./TablaPerdidas";
import { CAUSA, CAUSAS, EN_EL_PERIODO, PERIODOS, causaDe, desdeDe, diaDelMovimiento, metaDeTipo, resumirPerdidas, type Causa, type Periodo, type ProductoDeMovimiento } from "./tipos";
import { usePerdidas } from "./use-datos";
import { useIndicadoresPerdidas } from "./use-indicadores";
import CampoBuscar from "@/components/ui-system/CampoBuscar";

interface Props {
  titulo: string;
  secciones?: ReactNode;
  panel?: PanelDeSeccion;
  productos: ProductoDeMovimiento[];
  recargarProductos: () => void;
}

export function PerdidasSeccion({ titulo, secciones, panel, productos, recargarProductos }: Props) {
  const datos = usePerdidas();
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [causas, setCausas] = useState<string[]>([]);
  const [registrar, setRegistrar] = useState(false);
  const [detalle, setDetalle] = useState<FilaPerdida | null>(null);
  const orden = useOrdenColumnas("mermas-lista", COLUMNAS_PERDIDAS);
  const hoy = limaDateKey();

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const delPeriodo = useMemo(() => {
    const desde = desdeDe(periodo, Date.now(), inicioDeHoy());
    return desde == null ? datos.perdidas : datos.perdidas.filter((p) => Date.parse(p.createdAt) >= desde);
  }, [datos.perdidas, periodo]);

  const filas = useMemo<FilaPerdida[]>(() => {
    const q = busca.trim().toLowerCase();
    return delPeriodo
      .map((p) => {
        const prod = porId.get(p.productId);
        const costo = prod?.costPrice ?? 0;
        return { ...p, productName: p.productName ?? prod?.name ?? `#${p.productId}`, categoria: prod?.category ?? "", costo, perdida: Math.round(costo * p.quantity * 100) / 100 };
      })
      .filter((p) => causas.length === 0 || causas.includes(causaDe(p.lossType)))
      .filter((p) => !q || [p.productName, p.categoria, p.notes, p.createdBy].some((t) => (t ?? "").toLowerCase().includes(q)));
  }, [delPeriodo, porId, causas, busca]);

  // Las cifras son de lo que se está viendo (período + causa + búsqueda), como en Movimientos.
  const resumen = useMemo(() => resumirPerdidas(filas, (id) => porId.get(id)?.costPrice ?? 0), [filas, porId]);
  const kpis = useIndicadoresPerdidas(resumen, periodo, datos.cargando && datos.perdidas.length === 0);

  // La cuenta de cada causa es del período, contra todas (no contra las elegidas).
  const opcionesCausa = useMemo<FacetaOpcion[]>(() => {
    const n = new Map<Causa, number>();
    for (const p of delPeriodo) n.set(causaDe(p.lossType), (n.get(causaDe(p.lossType)) ?? 0) + 1);
    return CAUSAS.filter((c) => n.has(c)).map((c) => ({ value: c, count: n.get(c)! }));
  }, [delPeriodo]);

  const acciones: MenuAccion[] = [
    {
      id: "csv", label: "Descargar para Excel", hint: `${filas.length} pérdidas, con los filtros puestos`, icon: Download, disabled: filas.length === 0,
      onSelect: () => exportToCSV(filas.map((p) => ({
        dia: diaDelMovimiento(p.createdAt, hoy), hora: formatTime(p.createdAt), producto: p.productName, categoria: p.categoria,
        cantidad: p.quantity, costo_unitario_hoy: p.costo, perdida: p.perdida, causa: CAUSA[causaDe(p.lossType)].label, notas: p.notes ?? "", quien: p.createdBy ?? "",
      })), `perdidas_${hoy}.csv`),
    },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => { void datos.recargar(); recargarProductos(); } },
  ];
  const filtrosActivos = causas.length > 0 || busca.trim() !== "";
  const parcial = datos.totalServidor != null && datos.perdidas.length < datos.totalServidor;

  return (
    <div className="space-y-3">
      <CabeceraVista
        titulo={titulo}
        ayuda={SECCION.perdidas.ayuda}
        secciones={secciones}
        indicadores={kpis.boton}
        accion={
          <button type="button" onClick={() => setRegistrar(true)} className={button({ variant: "primary", className: "shrink-0 rounded-xl" })}>
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            <span className="hidden sm:inline">Registrar pérdida</span><span className="sm:hidden">Registrar</span>
          </button>
        }
        acciones={acciones}
        tituloMenu="Descargar y actualizar"
      />
      {kpis.panel}
      <CuerpoDeSeccion panel={panel}>
        {datos.error && <AvisoDeError que="las pérdidas" error={datos.error} onReintentar={() => void datos.recargar()} />}
        {parcial && (
          <p className="flex items-center gap-2 text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Se trajeron las {datos.perdidas.length} más recientes de {datos.totalServidor}: las cifras son de esas.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <CampoBuscar className="basis-56 sm:max-w-sm" valor={busca} onCambiar={setBusca} placeholder="Producto, categoría, nota…" etiqueta="Buscar pérdidas" />
          <Chips opciones={PERIODOS} valor={periodo} onCambiar={setPeriodo} etiqueta="Período" />
          <FiltroColumnaMulti label="Causa" value={causas} options={opcionesCausa} etiqueta={(v) => CAUSA[v as Causa]?.label ?? v} onChange={setCausas} placeholder="Causa: todas" className={FILTRO_EN_FILA} />
          <BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} className="h-12!" />
        </div>

        {datos.cargando && datos.perdidas.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-secondary)]"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando pérdidas…</p>
        ) : filas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-10 text-center text-sm text-[var(--text-secondary)]">
            {filtrosActivos ? "Ninguna pérdida coincide con esos filtros." : `Sin pérdidas ${EN_EL_PERIODO[periodo]}.`}
          </p>
        ) : (
          <TablaPerdidas filas={filas} hoy={hoy} orden={orden} onVer={setDetalle} />
        )}
      </CuerpoDeSeccion>

      {registrar && (
        <ModalRegistrarMovimiento
          productos={productos}
          inicial={{ dir: "out", type: "merma" }}
          onClose={() => setRegistrar(false)}
          onSaved={() => { setRegistrar(false); void datos.recargar(); recargarProductos(); }}
        />
      )}
      {detalle && (
        <MovementDetailModal
          movimiento={{ ...detalle, ...metaDeTipo("merma"), unit: porId.get(detalle.productId)?.unit }}
          perdida={{ causa: CAUSA[causaDe(detalle.lossType)].label, costo: detalle.costo, soles: detalle.perdida }}
          onRevertido={() => { toast.success("Pérdida revertida: el stock volvió"); void datos.recargar(); recargarProductos(); }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
