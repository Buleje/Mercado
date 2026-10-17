"use client";

/**
 * Entradas y salidas › Movimientos: el kardex de todo el negocio.
 *
 * Cabecera en una fila (título · secciones · Indicadores · Registrar · Más),
 * filtros en una fila pegada a la tabla (buscador · período · tipo) y la tabla
 * de 15 en 15: con «7 días» abiertos eran 32 filas de 3 líneas y la vista medía
 * 3,12 pantallas.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Download, Loader2, Package, Plus, RefreshCw } from "@buleje/design-system/icons";
import { toast } from "sonner";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
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
import { TablaMovimientos, rotuloDe, type FilaMovimiento } from "./TablaMovimientos";
import { CAUSA, EN_EL_PERIODO, PERIODOS, causaDe, desdeDe, diaDelMovimiento, metaDeTipo, totalesDe, type Periodo, type ProductoDeMovimiento } from "./tipos";
import { useMovimientos } from "./use-datos";
import { useIndicadoresMovimientos } from "./use-indicadores";
import CampoBuscar from "@/components/ui-system/CampoBuscar";

const DE_A = 15;

const perdidaDe = (m: FilaMovimiento, costo: number) => ({ causa: CAUSA[causaDe(m.lossType)].label, costo, soles: Math.round(costo * m.quantity * 100) / 100 });

interface Props {
  titulo: string;
  secciones?: ReactNode;
  panel?: PanelDeSeccion;
  productos: ProductoDeMovimiento[];
  recargarProductos: () => void;
}

export function MovimientosSeccion({ titulo, secciones, panel, productos, recargarProductos }: Props) {
  const datos = useMovimientos();
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [tipos, setTipos] = useState<string[]>([]);
  const [visibles, setVisibles] = useState(DE_A);
  const [registrar, setRegistrar] = useState(false);
  const [detalle, setDetalle] = useState<FilaMovimiento | null>(null);
  const hoy = limaDateKey();

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const filas = useMemo<FilaMovimiento[]>(() =>
    datos.movimientos
      .map((m) => {
        const p = porId.get(m.productId);
        return { ...m, productName: m.productName ?? p?.name ?? `#${m.productId}`, unit: p?.unit ?? "und", ...metaDeTipo(m.type) };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  [datos.movimientos, porId]);

  /* Período primero: los conteos del filtro «Tipo» son del período elegido. */
  const delPeriodo = useMemo(() => {
    const desde = desdeDe(periodo, Date.now(), inicioDeHoy());
    return desde == null ? filas : filas.filter((m) => Date.parse(m.createdAt) >= desde);
  }, [filas, periodo]);

  const opcionesTipo = useMemo<FacetaOpcion[]>(() => {
    const n = new Map<string, number>();
    for (const m of delPeriodo) n.set(m.type, (n.get(m.type) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  }, [delPeriodo]);

  const filtradas = useMemo(() => {
    let lista = delPeriodo;
    if (tipos.length > 0) lista = lista.filter((m) => tipos.includes(m.type));
    const q = busca.trim().toLowerCase();
    if (q) {
      // Por producto, motivo, referencia, quién y tipo: «factura 0034» o el nombre de quien ajustó.
      lista = lista.filter((m) =>
        [m.productName, m.notes, m.reference, m.createdBy, rotuloDe(m)].some((t) => (t ?? "").toLowerCase().includes(q)));
    }
    return lista;
  }, [delPeriodo, tipos, busca]);

  const totales = useMemo(() => totalesDe(filtradas), [filtradas]);
  const kpis = useIndicadoresMovimientos(totales, periodo, datos.cargando && datos.movimientos.length === 0);
  const filtrosActivos = tipos.length > 0 || busca.trim() !== "";

  const acciones: MenuAccion[] = [
    {
      id: "csv", label: "Descargar para Excel", hint: `${filtradas.length} movimientos, con los filtros puestos`, icon: Download, disabled: filtradas.length === 0,
      onSelect: () => exportToCSV(filtradas.map((m) => ({
        dia: diaDelMovimiento(m.createdAt, hoy), hora: formatTime(m.createdAt),
        producto: m.productName, tipo: rotuloDe(m), cantidad: m.dir === "in" ? m.quantity : m.dir === "out" ? -m.quantity : 0,
        stock_resultado: m.newStock, motivo: m.notes ?? "", referencia: m.reference ?? "", quien: m.createdBy ?? "",
      })), `movimientos_${hoy}.csv`),
    },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => { void datos.recargar(); recargarProductos(); } },
  ];

  const mostradas = filtradas.slice(0, visibles);
  const quedanCargadas = filtradas.length - mostradas.length;
  const traidoParcial = datos.totalServidor != null && datos.movimientos.length < datos.totalServidor;

  return (
    <div className="space-y-3">
      <CabeceraVista
        titulo={titulo}
        ayuda={SECCION.movimientos.ayuda}
        secciones={secciones}
        indicadores={kpis.boton}
        accion={
          /* «Registrar movimiento» entero sólo donde sobra lugar: a 1280 px le quitaba el titular a Indicadores. */
          <button type="button" onClick={() => setRegistrar(true)} aria-label="Registrar movimiento" title="Registrar una entrada o salida de stock" className={button({ variant: "primary", className: "shrink-0 rounded-xl" })}>
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            Registrar<span className="hidden 2xl:inline">&nbsp;movimiento</span>
          </button>
        }
        acciones={acciones}
        tituloMenu="Descargar y actualizar"
      />
      {kpis.panel}
      <CuerpoDeSeccion panel={panel}>
        {datos.error && <AvisoDeError que="los movimientos" error={datos.error} onReintentar={() => void datos.recargar()} />}

        <div className="flex flex-wrap items-center gap-2">
          <CampoBuscar className="basis-56 sm:max-w-sm" valor={busca} onCambiar={(v) => { setBusca(v); setVisibles(DE_A); }} placeholder="Producto, motivo o quién…" etiqueta="Buscar movimientos" />
          <Chips opciones={PERIODOS} valor={periodo} onCambiar={(v) => { setPeriodo(v); setVisibles(DE_A); }} etiqueta="Período" />
          <FiltroColumnaMulti label="Tipo" value={tipos} options={opcionesTipo} etiqueta={(v) => metaDeTipo(v).label} onChange={(v) => { setTipos(v); setVisibles(DE_A); }} placeholder="Tipo: todos" className={FILTRO_EN_FILA} />
        </div>

        {datos.cargando && datos.movimientos.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-secondary)]"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando movimientos…</p>
        ) : filtradas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--rule-base)] py-10 text-center text-sm text-[var(--text-secondary)]">
            <Package className="mx-auto mb-2 h-7 w-7 opacity-40" aria-hidden />
            {filtrosActivos ? "Ningún movimiento coincide con esos filtros." : `Sin movimientos ${EN_EL_PERIODO[periodo]}.`}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-[var(--surface-raised)]">
            <TablaMovimientos filas={mostradas} hoy={hoy} onVer={setDetalle} />
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-sm text-[var(--text-secondary)]">
              {/* «X de Y» de lo que se está viendo; y si el servidor tiene más de lo traído, se dice. */}
              <span>
                {mostradas.length} de {filtradas.length} {EN_EL_PERIODO[periodo]}
                {traidoParcial && ` · se trajeron ${datos.movimientos.length} de ${datos.totalServidor}`}
              </span>
              {(quedanCargadas > 0 || datos.cursor) && (
                <button
                  type="button"
                  disabled={datos.cargandoMas}
                  onClick={() => {
                    if (quedanCargadas > 0) setVisibles((v) => v + DE_A);
                    else void datos.cargarMas().then(() => setVisibles((v) => v + DE_A));
                  }}
                  className={button({ variant: "secondary", className: "rounded-xl" })}
                >
                  {datos.cargandoMas && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {quedanCargadas > 0 ? `Ver ${Math.min(DE_A, quedanCargadas)} más` : "Traer más antiguos"}
                </button>
              )}
            </div>
          </div>
        )}
      </CuerpoDeSeccion>

      {registrar && (
        <ModalRegistrarMovimiento productos={productos} onClose={() => setRegistrar(false)} onSaved={() => { setRegistrar(false); void datos.recargar(); recargarProductos(); }} />
      )}
      {detalle && (
        <MovementDetailModal
          movimiento={detalle}
          perdida={detalle.type === "merma" ? perdidaDe(detalle, porId.get(detalle.productId)?.costPrice ?? 0) : undefined}
          onRevertido={() => { toast.success("Movimiento revertido"); void datos.recargar(); recargarProductos(); }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
