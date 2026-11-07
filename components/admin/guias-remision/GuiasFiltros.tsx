"use client";

/** Una fila: buscador + estado (segmentado con su conteo), 48 px y texto ≥14 px. */
import type { FiltroEstado } from "./use-guias";
import { STATUS_META, type GuiaStatus } from "./tipos";
import CampoBuscar from "@/components/ui-system/CampoBuscar";
import SegmentedControl from "@/components/ui-system/SegmentedControl";

const ESTADOS: readonly FiltroEstado[] = ["", "BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA", "ANULADA"];

interface Props {
  search: string;
  onSearch: (v: string) => void;
  estado: FiltroEstado;
  onEstado: (e: FiltroEstado) => void;
  conteos: Record<string, number>;
}

export function GuiasFiltros({ search, onSearch, estado, onEstado, conteos }: Props) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <CampoBuscar valor={search} onCambiar={onSearch} placeholder="Buscar por destinatario…" etiqueta="Buscar guías de remisión" />
      <div className="min-w-0 max-w-full overflow-x-auto scrollbar-none">
        <SegmentedControl<FiltroEstado>
          size="lg"
          label="Filtrar por estado"
          value={estado}
          onChange={onEstado}
          options={ESTADOS.map((s) => ({ value: s, label: s === "" ? "Todos" : STATUS_META[s as GuiaStatus].label, badge: conteos[s] ?? 0 }))}
        />
      </div>
    </div>
  );
}
