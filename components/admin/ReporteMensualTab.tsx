"use client";

/**
 * Mi Plata › Impuestos y reportes › Reporte mensual: EL MES EN UNA HOJA. Eliges
 * el mes, ves sus tres cifras y bajas el PDF (top productos, top clientes y
 * fiados) que el sistema también te manda el día 1 a las 6:00.
 *
 * Antes (medido 11-10): «Generar reporte» respondía siempre 400 («tenantId
 * requerido»: el panel no le pasaba el negocio al generador), «Descargar PDF»
 * volvía a generar y mandaba otro correo, y los ingresos eran los pedidos no
 * cancelados, sin el POS — otra cifra que el Resumen para el mismo mes.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, Loader2, Mail, MoreHorizontal, Receipt } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { nombreDelMes } from "./impuestos/impuestos-del-mes";

interface Resultado { ok: boolean; ingresos: number; gastos: number; utilidad: number; emailSent?: boolean; error?: string }
type Estado = { fase: "cargando" } | { fase: "error"; mensaje: string } | { fase: "lista"; datos: Resultado };

/** El mes anterior al de Lima: el que ya cerró. */
function mesAnterior(hoy: string): string {
  const [y, m] = hoy.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const url = (mes: string, extra = "") => `/api/admin/monthly-report?year=${mes.slice(0, 4)}&month=${Number(mes.slice(5, 7))}${extra}`;

export default function ReporteMensualTab() {
  const hoy = limaDateKey().slice(0, 7);
  const [mes, setMes] = useState(() => mesAnterior(hoy));
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "cargando" });
    fetch(url(mes), { credentials: "same-origin" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Resultado;
        if (!vivo) return;
        if (!r.ok || !j.ok) setEstado({ fase: "error", mensaje: r.status === 429 ? "Muchos pedidos seguidos: espera un minuto." : j.error ?? "No se pudo armar el reporte" });
        else setEstado({ fase: "lista", datos: j });
      })
      .catch(() => { if (vivo) setEstado({ fase: "error", mensaje: "Sin conexión" }); });
    return () => { vivo = false; };
  }, [mes]);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await fetch(url(mes, "&enviar=1"), { credentials: "same-origin" });
      const j = (await r.json().catch(() => ({}))) as Resultado;
      if (r.ok && j.emailSent) toast.success("Te lo mandamos al correo del negocio");
      else toast.error(j.error ?? "No hay correo del negocio configurado");
    } finally {
      setEnviando(false);
    }
  };

  const datos = estado.fase === "lista" ? estado.datos : null;
  const cifras = datos
    ? [
        { rotulo: "Ingresos", valor: datos.ingresos, clase: "text-[var(--text-primary)]" },
        { rotulo: "Gastos", valor: datos.gastos, clase: "text-[var(--text-primary)]" },
        { rotulo: "Utilidad", valor: datos.utilidad, clase: datos.utilidad >= 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]" },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Una fila: título · mes · Descargar PDF · Más */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Reporte mensual</SectionTitle>
          <InfoTip
            title="Reporte mensual"
            what="El mes en una hoja PDF: ingresos, gastos y utilidad, los 10 productos y los 5 clientes que más dejaron, y los fiados del mes."
            affects="Ingresos = ventas del mostrador + pedidos confirmados, en camino o entregados (lo mismo que el Resumen de Mi Plata). El día 1 a las 6:00 se manda solo al correo del dueño."
            example="El 1 de noviembre te llega el de octubre; acá puedes bajar cualquier mes anterior."
          />
        </div>
        <label className="sr-only" htmlFor="reporte-mes">Mes</label>
        <input
          id="reporte-mes"
          type="month"
          value={mes}
          max={hoy}
          onChange={(e) => e.target.value && setMes(e.target.value)}
          className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-2">
          <a
            href={url(mes, "&download=1")}
            className={button({ variant: "primary", className: "rounded-xl px-4" })}
          >
            <Download className="h-4 w-4" aria-hidden /> Descargar PDF
          </a>
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Mandar por correo, impuestos del mes"
            actions={[
              { id: "correo", label: "Mandármelo por correo", hint: "Al correo del dueño del negocio", icon: Mail, busy: enviando, disabled: enviando, onSelect: () => void enviar() },
              { id: "impuestos", label: "Impuestos del mes", hint: "Cuánto pagar a SUNAT y cuándo", icon: Receipt, seccion: "Ver", onSelect: () => irAEnlace("/admin?tab=plata&vista=impuestos") },
            ]}
          />
        </div>
      </div>

      {estado.fase === "cargando" ? (
        <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Armando {nombreDelMes(mes)}…
        </p>
      ) : estado.fase === "error" ? (
        <p role="alert" className="flex items-center gap-2 py-8 text-sm text-[var(--data-error-ink)]">
          <AlertTriangle className="h-4 w-4" aria-hidden /> {estado.mensaje}
        </p>
      ) : (
        <section aria-label={`Resumen de ${nombreDelMes(mes)}`} className="grid grid-cols-1 divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {cifras.map((c) => (
            <div key={c.rotulo} className="p-4">
              <p className="text-sm text-[var(--text-secondary)]">{c.rotulo} de {nombreDelMes(mes)}</p>
              <p className={cn("text-2xl font-bold tabular-nums", c.clase)}>{formatCurrency(c.valor)}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
