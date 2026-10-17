"use client";

/**
 * Paso 3 de «Nueva cotización» (F27): todo lo que va a ver el cliente antes de
 * crearla —líneas con descuento, base, IGV, total, hasta cuándo vale, alcance
 * y condiciones— y un «Cambiar» que vuelve al paso de cada cosa. «Ver como la
 * verá el cliente» abre el mismo documento que se imprime, como borrador.
 */
import { Calendar, Eye } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { printCotizacion, type EmpresaEmisor } from "@/lib/documentos/cotizacion-print";
import { diaEnDias, finDelDiaLima, hoyLima, textoDia, textoQuedan } from "@/lib/cotizaciones/vigencia";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChipDisponibilidad } from "./ChipDisponibilidad";
import { AvisoSinReserva, TotalesPrevios } from "./PasoItems";
import { subtotalDeLinea } from "./tipos";
import { useDisponibilidad } from "./use-disponibilidad";
import type { FormNuevaCotizacion } from "./use-nueva-cotizacion";

const CAMPO =
  "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]";
const PLAZOS = [7, 15, 30] as const;
const num = (s: string) => parseFloat(s) || 0;
const cifra = (n: number) => String(n).replace(".", ",");

function Bloque({ titulo, onCambiar, children }: { titulo: string; onCambiar: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={ROTULO}>{titulo}</span>
        <button type="button" onClick={onCambiar} className={button({ variant: "ghost", className: "rounded-xl px-3 text-[var(--accent-ink)] dark:text-[var(--accent)]" })}>
          Cambiar
        </button>
      </div>
      {children}
    </section>
  );
}

export function VistaPreviaCotizacion({ form, empresa }: { form: FormNuevaCotizacion; empresa: EmpresaEmisor | null }) {
  const lineas = form.items.filter((i) => i.descripcion.trim());
  const stock = useDisponibilidad(lineas);
  const descuentos = lineas.some((i) => num(i.descuento) > 0);

  const verComoCliente = () =>
    printCotizacion(
      {
        numero: "BORRADOR",
        clienteNombre: form.clienteNombre.trim() || "—",
        clienteRuc: form.clienteRuc.trim() || undefined,
        subtotal: form.subtotal,
        igv: form.igv,
        total: form.total,
        validoHasta: form.validoHasta ? finDelDiaLima(form.validoHasta) : "",
        notas: form.notas.trim() || undefined,
        items: lineas.map((i) => ({ descripcion: i.descripcion, cantidad: num(i.cantidad), precioUnit: num(i.precioUnit), descuento: num(i.descuento), subtotal: subtotalDeLinea(i) })),
        createdAt: new Date().toISOString(),
      },
      empresa,
    );

  return (
    <div className="space-y-3">
      <Bloque titulo="Cliente" onCambiar={() => form.irAPaso(1)}>
        <p className="font-semibold text-[var(--text-primary)]">{form.clienteNombre || "—"}</p>
        <p className="text-sm text-[var(--text-secondary)]">
          {[form.clienteRuc ? `${form.clienteRuc.replace(/\D/g, "").length === 8 ? "DNI" : "RUC"} ${form.clienteRuc}` : "Sin RUC/DNI", form.cliente ? "de tu lista de clientes" : "escrito a mano"].join(" · ")}
        </p>
      </Bloque>

      <Bloque titulo={`Ítems (${lineas.length})${descuentos ? " · con descuento" : ""}`} onCambiar={() => form.irAPaso(2)}>
        <ul className="divide-y divide-[var(--rule-soft)]">
          {lineas.map((i, idx) => {
            const estado = stock.estadoDe(i.productoId);
            return (
              <li key={`${idx}-${i.descripcion}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold text-[var(--text-primary)]">{i.descripcion}</p>
                  <p className="tabular-nums text-[var(--text-secondary)]">
                    {cifra(num(i.cantidad))} × {formatCurrency(num(i.precioUnit))}
                    {num(i.descuento) > 0 && <span className="font-semibold text-[var(--text-primary)]"> · −{cifra(num(i.descuento))} %</span>}
                  </p>
                  {estado && <ChipDisponibilidad estado={estado} />}
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">{formatCurrency(subtotalDeLinea(i))}</span>
              </li>
            );
          })}
        </ul>
        <TotalesPrevios subtotal={form.subtotal} igv={form.igv} total={form.total} />
        {stock.hayProductos && <div className="mt-2"><AvisoSinReserva error={stock.error} /></div>}
      </Bloque>

      <div className="space-y-2">
        <span className={ROTULO}>
          <label htmlFor="cot-vigencia">Vale hasta</label>
          <InfoTip
            title="Hasta cuándo vale"
            what="El último día en que el cliente puede aceptar estos precios; vale el día entero, hasta las 23:59."
            affects="Pasado ese día ya no se convierte en pedido: se renueva (sale una cotización nueva con fecha nueva)."
          />
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {PLAZOS.map((n) => {
            const dia = diaEnDias(n);
            return (
              <button key={n} type="button" aria-pressed={form.validoHasta === dia} onClick={() => form.setValidoHasta(dia)}
                className={button({ variant: form.validoHasta === dia ? "primary" : "secondary", className: "rounded-xl px-4" })}>
                {n} días
              </button>
            );
          })}
          <span className="relative block flex-1 basis-44">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input id="cot-vigencia" type="date" min={hoyLima()} value={form.validoHasta} onChange={(e) => form.setValidoHasta(e.target.value)} className={cn(CAMPO, "h-12 pl-9 pr-3")} />
          </span>
        </div>
        {form.validoHasta && (
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {textoDia(form.validoHasta)} <span className="font-normal text-[var(--text-secondary)]">· {textoQuedan(form.validoHasta)}</span>
          </p>
        )}
      </div>

      <label className="block space-y-1">
        <span className={ROTULO}>Alcance y condiciones (las ve el cliente)</span>
        <textarea
          value={form.notas}
          onChange={(e) => form.setNotas(e.target.value)}
          placeholder="Qué incluye, forma de pago, plazo de entrega…"
          rows={3}
          className={cn(CAMPO, "resize-none px-3 py-3")}
        />
      </label>

      <button type="button" onClick={verComoCliente} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" })}>
        <Eye className="h-4 w-4" aria-hidden /> Ver como la verá el cliente
      </button>
    </div>
  );
}
