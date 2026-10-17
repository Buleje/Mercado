'use client';

import { LoadingState } from "@buleje/design-system";
import { CabeceraVista } from "@/components/admin/inventario/movimientos/CabeceraVista";
import { button } from "@/components/ui-system/button-variants";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Plus, Pencil, RefreshCw, Wallet } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import EditarPresupuestoModal, { type BorradorCategoria } from "./presupuesto/EditarPresupuestoModal";
import { formatCurrency } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoriaPresupuesto = {
  nombre: string;
  limite: number;
  gastado: number;
  porcentaje: number;
};

type PresupuestoData = {
  mes: string;
  categorias: CategoriaPresupuesto[];
};

type DraftCategoria = BorradorCategoria;

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORIAS_SUGERIDAS = [
  "Mercaderia", "Alquiler", "Servicios", "Personal", "Transporte", "Marketing", "Otros",
];

function mesLabel(mes: string): string {
  const [y, m] = mes.split("-");
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const idx = parseInt(m) - 1;
  return `${meses[idx] ?? m} ${y}`;
}

function getBarColor(porcentaje: number): string {
  if (porcentaje > 100) return "bg-[var(--data-error-500)] animate-pulse";
  if (porcentaje > 80) return "bg-[var(--data-error-500)]";
  if (porcentaje > 60) return "bg-[var(--data-warning-500)]";
  return "bg-primary/10";
}

function getBarTrack(porcentaje: number): string {
  if (porcentaje > 100) return "bg-red-100 dark:bg-red-900/20";
  if (porcentaje > 80) return "bg-red-100 dark:bg-red-900/20";
  if (porcentaje > 60) return "bg-amber-100 dark:bg-amber-900/20";
  return "bg-primary/10 dark:bg-primary/15";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Las secciones de la vista (Mi Plata › Gastos y presupuesto): van en la fila del título. */
  barra?: ReactNode;
  /** Si hay categorías cargadas, según el resumen del hub (`undefined` = no se sabe). */
  hayPresupuesto?: boolean;
}

export default function PresupuestoMensualTab({ barra, hayPresupuesto }: Props = {}) {
  const [data, setData] = useState<PresupuestoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [draft, setDraft] = useState<DraftCategoria[]>([]);
  /** Un `key` nuevo por apertura: el borrador de la ventana arranca limpio. */
  const [apertura, setApertura] = useState(0);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/presupuesto");
      if (!res.ok) throw new Error("Error al cargar presupuesto");
      const json: PresupuestoData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const openEdit = () => {
    if (data && data.categorias.length > 0) {
      setDraft(data.categorias.map(c => ({ nombre: c.nombre, limite: String(c.limite) })));
    } else {
      setDraft(CATEGORIAS_SUGERIDAS.map(n => ({ nombre: n, limite: "" })));
    }
    setApertura((n) => n + 1);
    setShowEdit(true);
  };

  // ── Computed ───────────────────────────────────────────────────────────────

  const totalPresupuestado = data?.categorias.reduce((s, c) => s + c.limite, 0) ?? 0;
  const totalGastado = data?.categorias.reduce((s, c) => s + c.gastado, 0) ?? 0;
  const porcentajeTotal = totalPresupuestado > 0 ? Math.round((totalGastado / totalPresupuestado) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  /* La cabecera va en TODOS los estados: las secciones de la vista no se
     pueden ir mientras carga o cuando todavía no hay presupuesto. */
  const vacio = !data || data.categorias.length === 0;
  const cabecera = (
    <CabeceraVista
      titulo="Gastos"
      ayuda={{
        what:
          hayPresupuesto === false || (!loading && vacio)
            ? "El techo que le pones a cada rubro del mes. Todavía no le pusiste techo a ningún rubro."
            : `El techo que le pones a cada rubro${data ? ` en ${mesLabel(data.mes)}` : " del mes"} y cuánto llevas gastado de él.`,
        affects: "La barra de cada rubro pasa a coral al 60 % de su techo y a rojo al 80 %.",
        example: "Techo de transporte S/ 600 y llevas S/ 450: vas en 75 %.",
      }}
      secciones={barra}
      accion={
        !loading && !error ? (
          <button type="button" onClick={openEdit} className={button({ variant: vacio ? "primary" : "secondary", className: "h-12 shrink-0 gap-2 rounded-xl px-4" })}>
            {vacio ? <Plus className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
            <span className="max-sm:sr-only">{vacio ? "Crear presupuesto" : "Editar presupuesto"}</span>
          </button>
        ) : undefined
      }
      acciones={[{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void fetchData() }]}
      tituloMenu="Actualizar el presupuesto"
    />
  );

  return (
    <div className="space-y-4">
      {cabecera}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--data-error-ink)]">{error}</p>
          <button type="button" onClick={fetchData} className={button({ variant: "secondary", className: "h-12 shrink-0 gap-2 rounded-xl" })}>
            <RefreshCw className="h-4 w-4" aria-hidden />Reintentar
          </button>
        </div>
      ) : vacio || !data ? (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          <Wallet className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          Todavía no le pusiste techo a ningún rubro: toca «Crear presupuesto».
        </p>
      ) : (
    <div className="space-y-6">
      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.categorias.map((cat) => {
          const restante = cat.limite - cat.gastado;
          const barWidth = Math.min(cat.porcentaje, 100);
          return (
            <div
              key={cat.nombre}
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--text-primary)]">{cat.nombre}</p>
                <span className={cn(
                  "text-sm font-bold px-2 py-0.5 rounded-lg",
                  cat.porcentaje > 100
                    ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] animate-pulse"
                    : cat.porcentaje > 80
                      ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                      : cat.porcentaje > 60
                        ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                        : "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                )}>
                  {cat.porcentaje}%
                </span>
              </div>

              {/* Progress bar */}
              <div className={cn("h-2.5 rounded-full overflow-hidden", getBarTrack(cat.porcentaje))}>
                <div
                  className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", getBarColor(cat.porcentaje))}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-tertiary)]">
                  {formatCurrency(cat.gastado)} de {formatCurrency(cat.limite)}
                </span>
              </div>

              <p className={cn(
                "text-sm font-bold",
                restante >= 0
                  ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                  : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
              )}>
                {restante >= 0
                  ? `Quedan ${formatCurrency(restante)}`
                  : `Excedido en ${formatCurrency(Math.abs(restante))}`
                }
              </p>

              {cat.porcentaje > 100 && (
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] animate-pulse">
                  Excedido
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Resumen inferior */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 ">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Total presupuestado</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(totalPresupuestado)}</p>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Total gastado</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(totalGastado)}</p>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">% del presupuesto</p>
            <p className={cn(
              "text-lg font-bold",
              porcentajeTotal > 100
                ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                : porcentajeTotal > 80
                  ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                  : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
            )}>
              {porcentajeTotal}%
            </p>
          </div>
        </div>
        <div className={cn("h-2 rounded-full overflow-hidden mt-3", getBarTrack(porcentajeTotal))}>
          <div
            className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", getBarColor(porcentajeTotal))}
            style={{ width: `${Math.min(porcentajeTotal, 100)}%` }}
          />
        </div>
      </div>

    </div>
      )}

      <EditarPresupuestoModal
        key={apertura}
        open={showEdit}
        creando={vacio}
        inicial={draft}
        onClose={() => setShowEdit(false)}
        onGuardado={() => {
          setShowEdit(false);
          void fetchData();
        }}
      />
    </div>
  );
}
