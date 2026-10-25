"use client";

/**
 * Transmisiones en una tabla: las que vienen (con «Empezar» a la vista) y las
 * pasadas (con sus cifras). Una sola pieza para las dos secciones.
 */
import { DataTable } from "@buleje/design-system";
import { Play, Square } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { CLASE_TABLA } from "@/components/admin/campanas/comun";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import type { TransmisionDto } from "./tipos";

const cuando = (iso: string) => {
  try {
    return formatDateTimeShort(iso);
  } catch {
    return iso;
  }
};

const BTN = "inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]";

const diaDe = (t: TransmisionDto) => t.status === "live" ? t.scheduledFor : (t.startedAt ?? t.scheduledFor);

/* Los filtros se muestran sólo en «pasadas» (las próximas son pocas); el orden sirve en las dos. */
const COLUMNAS: readonly ColumnaFiltro<TransmisionDto>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (t) => limaDateKey(diaDe(t)) || null },
  { id: "titulo", label: "Transmisión", tipo: "texto", valor: (t) => [t.title, t.description ?? ""] },
  { id: "ventas", label: "Ventas", tipo: "rango", numero: (t) => Number(t.gmvSoles), unidad: "S/", paso: 0.01 },
];
const ORDEN: Record<string, AccesorOrden<TransmisionDto>> = {
  fecha: { valor: (t) => diaDe(t) },
  titulo: { valor: (t) => t.title, texto: true },
  duracion: { valor: (t) => t.durationSeconds },
  espectadores: { valor: (t) => t.viewersPeak },
  pedidos: { valor: (t) => t.ordersGenerated },
  ventas: { valor: (t) => Number(t.gmvSoles) },
};

export function TablaTransmisiones({
  filas,
  tipo,
  onEmpezar,
  onTerminar,
}: {
  filas: TransmisionDto[];
  tipo: "proximas" | "pasadas";
  onEmpezar: (t: TransmisionDto) => void;
  onTerminar: (t: TransmisionDto) => void;
}) {
  const proximas = tipo === "proximas";
  const f = useFiltrosTabla(filas, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const vistas = ord.ordenar(proximas ? filas : f.filtradas);
  return (
    <>
    {!proximas && <BarraFiltrosTabla f={f} />}
    <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="overflow-x-auto">
        <DataTable className={CLASE_TABLA}>
          <thead>
            <tr>
              <ThColumna label={proximas ? "Cuándo" : "Fecha"} ids={proximas ? undefined : ["fecha"]} f={f} orden={ord} ordenId="fecha" />
              <ThColumna label="Transmisión" ids={proximas ? undefined : ["titulo"]} f={f} orden={ord} ordenId="titulo" />
              {!proximas && <ThColumna label="Duración" derecha className="hidden sm:table-cell" orden={ord} ordenId="duracion" />}
              {!proximas && <ThColumna label="Máx. de espectadores" derecha orden={ord} ordenId="espectadores" />}
              {!proximas && <ThColumna label="Pedidos" derecha className="hidden md:table-cell" orden={ord} ordenId="pedidos" />}
              {!proximas && <ThColumna label="Ventas" ids={["ventas"]} f={f} derecha orden={ord} ordenId="ventas" />}
              {proximas && <th className="text-right" data-label="Acciones"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {vistas.length === 0 && <SinCoincidenciasFila colSpan={proximas ? 3 : 6} />}
            {vistas.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap text-[var(--text-secondary)]">{cuando(proximas || t.status === "live" ? t.scheduledFor : (t.startedAt ?? t.scheduledFor))}</td>
                <td>
                  <p className="font-bold text-[var(--text-primary)]">{t.title}</p>
                  {t.description && <p className="line-clamp-1 text-sm text-[var(--text-secondary)]">{t.description}</p>}
                </td>
                {!proximas && <td className="hidden text-right tabular-nums text-[var(--text-secondary)] sm:table-cell">{t.durationSeconds ? `${Math.round(t.durationSeconds / 60)} min` : "—"}</td>}
                {!proximas && <td className="text-right tabular-nums">{t.viewersPeak}</td>}
                {!proximas && <td className="hidden text-right tabular-nums md:table-cell">{t.ordersGenerated}</td>}
                {!proximas && <td className="text-right font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{formatCurrency(Number(t.gmvSoles))}</td>}
                {proximas && (
                  <td className="text-right">
                    {t.status === "live" ? (
                      <button type="button" onClick={() => onTerminar(t)} className={BTN}>
                        <Square className="h-4 w-4" aria-hidden /> Terminar
                      </button>
                    ) : (
                      <button type="button" onClick={() => onEmpezar(t)} className={BTN}>
                        <Play className="h-4 w-4" aria-hidden /> Empezar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
    </>
  );
}
