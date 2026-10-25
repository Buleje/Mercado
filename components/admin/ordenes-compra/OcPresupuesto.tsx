"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BlockTitle, DataTable, LoadingState } from "@buleje/design-system";
import { RefreshCw, Wallet } from "@buleje/design-system/icons";
import CabeceraOrdenes from "@/components/admin/ordenes-compra/CabeceraOrdenes";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CATEGORIA_COMPRAS_TOTAL,
  categoriaDeProveedor,
  type LineaPresupuestoCompras,
} from "@/lib/compras/presupuesto-compras";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { usePresupuestoCompras } from "@/components/admin/ordenes-compra/hooks/use-presupuesto-compras";

/**
 * Compras › Órdenes y recepción › Presupuesto (N02, noche 17-10): cuánto
 * compraste este mes contra cuánto pensabas comprar, en total y por proveedor.
 * El techo vive en el presupuesto de Mi Plata (categoría «compras:…»); la
 * cuenta la hace el servidor (`/api/compras/presupuesto`).
 */

const AYUDA = {
  title: "Presupuesto",
  what: "Lo comprado este mes (órdenes recibidas y por recibir) contra lo que pensabas comprar, en total y por proveedor.",
  affects:
    "Sólo compara: no crea órdenes ni mueve plata. Las canceladas y las automáticas sin aprobar no cuentan. El presupuesto se guarda con el de Mi Plata › Gastos y presupuesto, pero no se suma a tus gastos.",
  example: "Presupuesto de S/ 8 000 y órdenes por S/ 6 500: te quedan S/ 1 500. Si a Alicorp le diste S/ 3 000 y ya van S/ 3 200, sale en rojo.",
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

const SIN_LINEAS: readonly LineaPresupuestoCompras[] = [];
const COLUMNAS: readonly ColumnaFiltro<LineaPresupuestoCompras>[] = [
  { id: "proveedor", label: "Proveedor", tipo: "texto", valor: (l) => [l.nombre] },
  { id: "comprado", label: "Comprado", tipo: "rango", numero: (l) => l.comprado, unidad: "S/", paso: 0.01 },
  { id: "queda", label: "Te queda", tipo: "rango", numero: (l) => l.quedan, unidad: "S/", paso: 0.01 },
];
const ORDEN: Record<string, AccesorOrden<LineaPresupuestoCompras>> = {
  proveedor: { valor: (l) => l.nombre, texto: true },
  comprado: { valor: (l) => l.comprado },
  presupuesto: { valor: (l) => l.presupuesto },
  queda: { valor: (l) => l.quedan },
};

const nombreMes = (clave: string) => MESES[Number(clave.slice(5, 7)) - 1] ?? clave;

function tono(l: LineaPresupuestoCompras): string {
  if (l.usadoPct === null) return "bg-[var(--accent)]";
  if (l.usadoPct > 100) return "bg-[var(--data-error-500)]";
  if (l.usadoPct >= 90) return "bg-[var(--data-warning-500)]";
  return "bg-[var(--accent)]";
}

function Barra({ l }: { l: LineaPresupuestoCompras }) {
  if (l.usadoPct === null) return null;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="img" aria-label={`Usaste el ${l.usadoPct}% del presupuesto`}>
      <div className={cn("h-full rounded-full", tono(l))} style={{ width: `${Math.min(100, Math.max(0, l.usadoPct))}%` }} />
    </div>
  );
}

function Quedan({ l }: { l: LineaPresupuestoCompras }) {
  if (l.quedan === null) return <span className="text-[var(--text-secondary)]">Sin presupuesto</span>;
  return l.quedan >= 0 ? (
    <span className="font-semibold text-[var(--data-success-ink)]">Te quedan {formatCurrency(l.quedan)}</span>
  ) : (
    <span className="font-semibold text-[var(--data-error-ink)]">Te pasaste por {formatCurrency(-l.quedan)}</span>
  );
}

/** Campo para fijar un techo: Enter guarda, Escape cancela; 0 lo quita. */
function FijarTecho({
  clave,
  inicial,
  nombre,
  ocupado,
  onGuardar,
  onCancelar,
}: {
  clave: string;
  inicial: number | null;
  nombre: string;
  ocupado: boolean;
  onGuardar: (monto: number) => void;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState(inicial ? String(inicial) : "");
  const monto = Number(valor.replace(",", "."));
  const valido = valor.trim() !== "" && Number.isFinite(monto) && monto >= 0;
  return (
    <span className="inline-flex items-center gap-2">
      <label className="sr-only" htmlFor={`techo-${clave}`}>Presupuesto del mes para {nombre}</label>
      <input
        id={`techo-${clave}`}
        inputMode="decimal"
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valido) onGuardar(monto);
          if (e.key === "Escape") onCancelar();
        }}
        placeholder="S/ 0"
        className="h-12 w-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-right tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
      />
      <button type="button" disabled={!valido || ocupado} onClick={() => onGuardar(monto)} className={button({ variant: "primary", className: "rounded-xl" })}>
        {ocupado ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" onClick={onCancelar} className={button({ variant: "ghost", className: "rounded-xl" })}>Cancelar</button>
    </span>
  );
}

export default function OcPresupuesto({ barra }: { barra?: ReactNode }) {
  const { data, cargando, error, aviso, guardando, cargar, guardar } = usePresupuestoCompras();
  const [editando, setEditando] = useState<string | null>(null);
  const f = useFiltrosTabla(data?.proveedores ?? SIN_LINEAS, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = useMemo(() => ord.ordenar(f.filtradas), [ord, f.filtradas]);

  const fijar = async (category: string, nombre: string, monto: number) => {
    if (await guardar(category, monto, nombre)) setEditando(null);
  };

  const editor = (category: string, l: LineaPresupuestoCompras) =>
    editando === category ? (
      <FijarTecho clave={category} inicial={l.presupuesto} nombre={l.nombre} ocupado={guardando === category} onGuardar={(m) => void fijar(category, l.nombre, m)} onCancelar={() => setEditando(null)} />
    ) : (
      <button type="button" onClick={() => setEditando(category)} className={button({ variant: "secondary", className: "rounded-xl" })} data-qa="presupuesto-fijar">
        {l.presupuesto === null ? "Fijar" : formatCurrency(l.presupuesto)}
      </button>
    );

  return (
    <div className="space-y-4">
      <CabeceraOrdenes
        barra={barra}
        ayuda={AYUDA}
        acciones={[
          { id: "actualizar", label: "Actualizar", hint: "Vuelve a calcular lo comprado", icon: RefreshCw, onSelect: () => void cargar() },
          { id: "fijar", label: "Fijar presupuesto del mes", hint: "Cuánto piensas comprar en todo el mes", icon: Wallet, onSelect: () => setEditando(CATEGORIA_COMPRAS_TOTAL) },
        ]}
        tituloMenu="Más acciones del presupuesto"
      />

      {aviso && <p role="status" className="text-sm font-semibold text-[var(--data-success-ink)]">{aviso}</p>}
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--data-error-ink)]">
          {error}
          <button type="button" onClick={() => void cargar()} className={button({ variant: "ghost", className: "rounded-xl" })}>Reintentar</button>
        </p>
      )}

      {cargando && !data ? (
        <LoadingState />
      ) : data ? (
        <>
          <section className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" data-qa="presupuesto-total">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <BlockTitle>Compras de {nombreMes(data.mes)}</BlockTitle>
              {editor(CATEGORIA_COMPRAS_TOTAL, data.total)}
            </div>
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {formatCurrency(data.total.comprado)}
              {data.total.presupuesto !== null && (
                <span className="text-base font-normal text-[var(--text-secondary)]"> de {formatCurrency(data.total.presupuesto)}</span>
              )}
            </p>
            <Barra l={data.total} />
            <p className="flex flex-wrap gap-x-3 text-sm text-[var(--text-secondary)]">
              <Quedan l={data.total} />
              <span>Recibido {formatCurrency(data.total.recibido)}</span>
              <span>Por recibir {formatCurrency(data.total.porRecibir)}</span>
            </p>
            {!data.hayPresupuesto && (
              <p className="text-sm text-[var(--text-secondary)]">
                Todavía no fijaste cuánto piensas comprar. Usa «Fijar» aquí o en{" "}
                <EnlacePanel href="/admin?tab=plata&vista=gastos">Mi Plata › Gastos y presupuesto</EnlacePanel>.
              </p>
            )}
          </section>

          {data.proveedores.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Este mes todavía no hay órdenes de compra.</p>
          ) : (
            <section className="space-y-2">
              <BlockTitle>Por proveedor · {data.proveedores.length}</BlockTitle>
              <BarraFiltrosTabla vistas="oc-presupuesto" f={f} />
              <DataTable>
                <thead>
                  <tr>
                    <ThColumna label="Proveedor" ids={["proveedor"]} f={f} orden={ord} ordenId="proveedor" />
                    <ThColumna label="Comprado" ids={["comprado"]} f={f} derecha orden={ord} ordenId="comprado" />
                    <ThColumna label="Presupuesto" orden={ord} ordenId="presupuesto" />
                    <ThColumna label="Te queda" ids={["queda"]} f={f} derecha orden={ord} ordenId="queda" />
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && <SinCoincidenciasFila colSpan={4} />}
                  {filas.map((l) => {
                    const cat = categoriaDeProveedor(l.supplierId ?? "");
                    return (
                      <tr key={l.supplierId ?? l.nombre}>
                        <td className="min-w-[10rem]">
                          <span className="font-semibold text-[var(--text-primary)]">{l.nombre}</span>
                          <span className="mt-1 block"><Barra l={l} /></span>
                          {l.porRecibir > 0 && <span className="block text-sm text-[var(--text-secondary)]">Por recibir {formatCurrency(l.porRecibir)}</span>}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(l.comprado)}</td>
                        <td>{editor(cat, l)}</td>
                        <td className="whitespace-nowrap text-right text-sm"><Quedan l={l} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
