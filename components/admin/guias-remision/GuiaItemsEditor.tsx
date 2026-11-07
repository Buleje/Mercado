"use client";

/**
 * Etapa «Carga» de la guía nueva (F22): los ítems con su unidad por nombre
 * (se guarda el código SUNAT), el peso que suman —ESTIMADO— y el peso bruto
 * que se pesó, aparte. Uno nunca se copia en el otro.
 */
import { AlertTriangle, Plus, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOTON_ICONO, CAMPO } from "./estilos";
import { BloqueGuia, CampoGuia, errorDe } from "./guia-piezas";
import { pesoEstimado } from "./guia-reglas";
import { UNIDADES_GUIA, unidadLegible } from "./guia-unidades";
import type { NuevaGuia } from "./use-nueva-guia";

const kg = (n: number) => formatNumber(n, { max: 3 });

export function GuiaItemsEditor({ g }: { g: NuevaGuia }) {
  const { items, form } = g;
  const visitada = g.visitados.includes("carga");
  const err = errorDe(g.pendientes, visitada);
  const estimado = pesoEstimado(items);
  const faltanItems = visitada ? g.pendientes.find((p) => p.paso === "carga" && !p.campo)?.texto : undefined;

  return (
    <div className="space-y-5">
      <BloqueGuia titulo="Qué llevas">
        <div className="space-y-3">
          {items.map((item, idx) => {
            const conocida = UNIDADES_GUIA.some((u) => u.codigo === item.unidad);
            return (
              <div key={idx} className="space-y-1">
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem_3rem] gap-2 sm:grid-cols-[1fr_5rem_9.5rem_6.5rem_3rem]">
                  <input aria-label="Descripción" type="text" value={item.descripcion} onChange={(e) => g.updateItem(idx, "descripcion", e.target.value)} placeholder="Descripción"
                    className={`${CAMPO} col-span-3 sm:col-span-1`} />
                  <input aria-label="Cantidad" type="number" min="0" step="any" value={item.cantidad} onChange={(e) => g.updateItem(idx, "cantidad", e.target.value)} placeholder="Cant." className={`${CAMPO} text-center`} />
                  <select aria-label="Unidad" value={item.unidad} onChange={(e) => g.updateItem(idx, "unidad", e.target.value)} className={CAMPO} data-qa="guia-unidad">
                    {UNIDADES_GUIA.map((u) => (
                      <option key={u.codigo} value={u.codigo}>{u.nombre}</option>
                    ))}
                    {!conocida && <option value={item.unidad}>{unidadLegible(item.unidad)}</option>}
                  </select>
                  <input aria-label="Peso por unidad en kg" type="number" min="0" step="any" value={item.pesoUnitario} onChange={(e) => g.updateItem(idx, "pesoUnitario", e.target.value)} placeholder="kg c/u" className={cn(CAMPO, "col-span-2 text-center sm:col-span-1")} />
                  <button type="button" aria-label={`Quitar ${item.descripcion || "ítem"}`} onClick={() => g.removeItem(idx)} className={cn(BOTON_ICONO, "text-[var(--data-error-ink)] max-sm:col-start-4 max-sm:row-start-1")}>
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                {item.unidadOrigen && (
                  <p className="flex items-center gap-1.5 text-sm text-[var(--data-warning-ink)]">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    En el pedido venía como «{item.unidadOrigen}»: va como {unidadLegible(item.unidad)}, cámbiala si no corresponde.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" onClick={g.addItem} className={button({ variant: "secondary", className: "rounded-xl" })}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar ítem
        </button>
        {faltanItems && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{faltanItems}</p>}
      </BloqueGuia>

      <BloqueGuia
        titulo="Peso y bultos"
        extra={
          <InfoTip
            title="Peso estimado y peso bruto"
            what="El estimado suma cantidad × peso por unidad de cada ítem. El bruto es lo que marcó la balanza con empaque y todo."
            affects="La guía impresa muestra los dos por separado: el estimado nunca reemplaza al pesado."
            example="20 sacos × 50 kg = 1.000 kg estimados; en la balanza salen 1.012 kg de peso bruto."
          />
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2" data-qa="guia-peso-estimado">
            <span className="block text-sm font-semibold text-[var(--text-secondary)]">Peso estimado</span>
            <span className="text-base font-bold tabular-nums text-[var(--text-primary)]">{estimado.kg > 0 ? `${kg(estimado.kg)} kg` : "—"}</span>
            {estimado.sinPeso > 0 && (
              <span className="block text-sm text-[var(--data-warning-ink)]">
                {estimado.sinPeso} {estimado.sinPeso === 1 ? "ítem" : "ítems"} sin peso
              </span>
            )}
          </div>
          <CampoGuia etiqueta="Peso bruto pesado (kg)" tipo="number" inputMode="decimal" placeholder="Lo que marcó la balanza" valor={form.pesoBruto} onCambio={(v) => g.campo("pesoBruto", v)} error={err("pesoBruto")} />
          <CampoGuia etiqueta="N° de bultos" soloNumeros maxLength={5} placeholder="Sacos, cajas o paquetes" valor={form.bultos} onCambio={(v) => g.campo("bultos", v)} error={err("bultos")} />
        </div>
      </BloqueGuia>
    </div>
  );
}
