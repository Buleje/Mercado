"use client";

/**
 * Etapa «Revisar» (F23): lo que impide crear, lo que conviene mirar y la guía
 * entera en una ficha, antes de tocar «Crear guía». Cada problema lleva a su etapa.
 */
import { AlertTriangle, CheckCircle2, XCircle } from "@buleje/design-system/icons";
import { diaYFecha } from "@/components/admin/einvoice/emision-reglas";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { lineasValidas, PASOS_GUIA, pesoEstimado, type Pendiente } from "./guia-reglas";
import { unidadLegible } from "./guia-unidades";
import { MOTIVO_ROTULO } from "./tipos";
import type { NuevaGuia } from "./use-nueva-guia";

const ROTULO = Object.fromEntries(PASOS_GUIA.map((p) => [p.id, p.rotulo]));

function Lista({ titulo, tono, filas, onIr }: { titulo: string; tono: "error" | "aviso"; filas: readonly Pendiente[]; onIr: NuevaGuia["irA"] }) {
  if (filas.length === 0) return null;
  const Icono = tono === "error" ? XCircle : AlertTriangle;
  return (
    <section
      className={cn("space-y-1 rounded-xl px-3 py-2", tono === "error" ? "bg-[var(--data-error-100)]" : "bg-[var(--data-warning-100)]")}
      aria-label={titulo}
      data-qa={tono === "error" ? "guia-faltan" : "guia-avisos"}
    >
      <span className={cn("flex items-center gap-1.5 text-sm font-bold", tono === "error" ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]")}>
        <Icono className="h-4 w-4 shrink-0" aria-hidden />
        {titulo}
      </span>
      <ul className="space-y-1">
        {filas.map((f, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-[var(--text-primary)]">
            <span className="min-w-0 flex-1">{f.texto}</span>
            <button type="button" onClick={() => onIr(f.paso)} className={button({ variant: "ghost", className: "rounded-xl" })}>
              Ir a {ROTULO[f.paso]}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-semibold text-[var(--text-secondary)]">{etiqueta}</dt>
      <dd className="break-words text-sm text-[var(--text-primary)]">{children || "—"}</dd>
    </div>
  );
}

export function GuiaPasoRevisar({ g }: { g: NuevaGuia }) {
  const { form, pedido } = g;
  const fecha = form.fechaTraslado ? new Date(form.fechaTraslado) : null;
  const cuando = fecha && Number.isFinite(fecha.getTime()) ? `${diaYFecha(fecha.toISOString())}, ${form.fechaTraslado.slice(11, 16)}` : "";
  const sustenta = form.documentoRef.trim() || (pedido ? `El pedido ${pedido.codigo} (sin comprobante)` : "Sin documento");
  const lineas = lineasValidas(g.items);
  const { kg } = pesoEstimado(g.items);
  const publico = form.modalidad === "publico";
  const transporte = [
    publico ? "Público" : "Privado",
    publico && [form.transportistaNombre, form.transportistaRuc && `RUC ${form.transportistaRuc}`].filter(Boolean).join(", "),
    form.vehiculoPlaca,
    [form.conductorNombre, form.conductorDni && `DNI ${form.conductorDni}`].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <Lista titulo="Falta para crear la guía" tono="error" filas={g.pendientes} onIr={g.irA} />
      <Lista titulo="Revisa antes de crear" tono="aviso" filas={g.avisos} onIr={g.irA} />
      {g.pendientes.length === 0 && g.avisos.length === 0 && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-success-ink)]">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Todo en orden: toca «Crear guía».
        </p>
      )}

      <dl className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--rule-base)] p-3 sm:grid-cols-2" data-qa="guia-ficha">
        <Dato etiqueta="Lo sustenta">{sustenta}</Dato>
        <Dato etiqueta="Motivo y fecha">{[MOTIVO_ROTULO[form.motivoTraslado] ?? form.motivoTraslado, cuando].filter(Boolean).join(" · ")}</Dato>
        <Dato etiqueta="Recibe">{[form.destinatarioNombre, form.destinatarioRuc].filter(Boolean).join(" · ")}</Dato>
        <Dato etiqueta="Dirección de quien recibe">{form.destinatarioDireccion}</Dato>
        <Dato etiqueta="Sale de">{form.puntoPartida}</Dato>
        <Dato etiqueta="Llega a">{form.puntoLlegada}</Dato>
        <Dato etiqueta="Transporte">{transporte}</Dato>
        <Dato etiqueta="Peso y bultos">
          {[
            form.pesoBruto.trim() && `${form.pesoBruto} kg pesados`,
            kg > 0 && `${kg} kg estimados`,
            form.bultos.trim() && `${form.bultos} bultos`,
          ].filter(Boolean).join(" · ")}
        </Dato>
        <div className="sm:col-span-2">
          <dt className="text-sm font-semibold text-[var(--text-secondary)]">
            {lineas.length} {lineas.length === 1 ? "ítem" : "ítems"}
          </dt>
          <dd>
            <ul className="text-sm text-[var(--text-primary)]">
              {lineas.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-[var(--rule-soft)] py-1 last:border-0">
                  <span className="min-w-0 truncate">{l.descripcion}</span>
                  <span className="shrink-0 tabular-nums">{l.cantidad} {unidadLegible(l.unidad).toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </div>
  );
}
