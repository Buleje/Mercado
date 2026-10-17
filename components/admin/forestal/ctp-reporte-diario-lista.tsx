"use client";

/** La lista de reportes diarios del negocio (ADR-439): hora, días, canales y cómo salió el último. */
import { Mail, MessageCircle, Plus } from "@buleje/design-system/icons";
import { DIAS_SEMANA, type ReporteDiario } from "@/lib/forestal/reporte-diario";
import type { EnvioDeReporte } from "./hooks/use-reportes-diarios";

/** «Lun a Sáb», «Todos los días», «Lun, Mié, Vie». */
export function diasTexto(dias: readonly number[]): string {
  const d = [...dias].sort((a, b) => a - b).join(",");
  if (d === "0,1,2,3,4,5,6") return "Todos los días";
  if (d === "1,2,3,4,5,6") return "Lun a Sáb";
  if (d === "1,2,3,4,5") return "Lun a Vie";
  return dias.map((i) => DIAS_SEMANA[i]).join(", ");
}

function estadoUltimo(envios: EnvioDeReporte[] | undefined): { texto: string; tono: string } {
  if (!envios?.length) return { texto: "Sin envíos", tono: "text-[var(--text-tertiary)]" };
  /* El último «round»: los intentos del mismo minuto que el más nuevo. */
  const corte = new Date(envios[0].createdAt).getTime() - 60_000;
  const ronda = envios.filter((e) => new Date(e.createdAt).getTime() >= corte);
  const fallos = ronda.filter((e) => e.status !== "sent").length;
  if (fallos === 0) return { texto: "Último: salió", tono: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" };
  if (fallos === ronda.length) return { texto: "Último: no salió", tono: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" };
  return { texto: `Último: ${fallos} de ${ronda.length} no salieron`, tono: "text-[var(--data-warning-700)]" };
}

export default function ReporteDiarioLista({
  reportes,
  envios,
  elegido,
  onElegir,
  onNuevo,
}: {
  reportes: ReporteDiario[];
  envios: Record<string, EnvioDeReporte[]>;
  elegido: string;
  onElegir: (id: string) => void;
  onNuevo: () => void;
}) {
  return (
    <nav aria-label="Reportes guardados" className="space-y-1.5">
      {reportes.map((r) => {
        const est = estadoUltimo(envios[r.id]);
        const activo = r.id === elegido;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onElegir(r.id)}
            aria-current={activo ? "true" : undefined}
            className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
              activo ? "border-[var(--accent)] bg-[var(--accent-muted)]" : "border-[var(--rule-base)] hover:bg-[var(--surface-canvas)]"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{r.nombre}</span>
              {!r.activo && <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 text-sm text-[var(--text-tertiary)]">pausado</span>}
            </span>
            <span className="flex items-center gap-1.5 text-sm tabular-nums text-[var(--text-secondary)]">
              {r.hora} · {diasTexto(r.dias)}
              {r.porCorreo && <Mail className="h-3.5 w-3.5" aria-label="por correo" />}
              {r.porWhatsapp && <MessageCircle className="h-3.5 w-3.5" aria-label="por WhatsApp" />}
            </span>
            <span className={`block text-sm ${est.tono}`}>{est.texto}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onNuevo}
        aria-current={elegido === "nuevo" ? "true" : undefined}
        className={`flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm font-semibold transition-colors ${
          elegido === "nuevo" ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
        }`}
      >
        <Plus className="h-4 w-4" /> Nuevo reporte
      </button>
    </nav>
  );
}
