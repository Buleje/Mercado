"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Info, Link2, Wallet } from "@buleje/design-system/icons";
import EnlacePanel, { CLASE_ENLACE_PANEL } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { FilaConciliacion, OrigenDiferencia, TonoDiferencia } from "@/lib/compras/conciliacion";

const HREF_RECEPCIONES = "/admin?tab=compras&vista=ordenes-compra&sub=recibir";

const ORIGEN: Record<OrigenDiferencia, string> = {
  orden: "Orden",
  recepcion: "Recepción",
  documento: "Factura",
  cuenta: "Cuenta",
  pago: "Pago",
};

const ICONO_TONO: Record<TonoDiferencia, { Icono: typeof Info; clase: string }> = {
  alerta: { Icono: AlertTriangle, clase: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
  aviso: { Icono: AlertTriangle, clase: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  info: { Icono: Info, clase: "text-[var(--text-secondary)]" },
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que se abre debajo de una fila de la conciliación: cada diferencia con el
 * papel de donde sale, las líneas que no cuadran producto por producto y las
 * propuestas de vínculo. Nada se une ni se paga desde acá: «Vincular a su
 * orden» abre la misma ventana de Por pagar, que pide confirmar.
 */
export default function DetalleConciliacion({ fila, onVerCuenta, onVincular }: {
  fila: FilaConciliacion;
  onVerCuenta: (cuentaId: string) => void;
  onVincular: (cuentaId: string) => void;
}) {
  const cuentaId = fila.cuentaIds[0];
  return (
    <div className="space-y-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-3 sm:px-4">
      {fila.diferencias.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
          Lo pedido, lo que llegó, la factura y la cuenta dicen lo mismo.
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label="Qué no cuadra y de dónde sale">
          {fila.diferencias.map((d) => {
            const { Icono, clase } = ICONO_TONO[d.tono];
            return (
              <li key={d.clave} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                <Icono className={cn("mt-0.5 h-4 w-4 shrink-0", clase)} aria-hidden />
                <span className="min-w-0">
                  <span className="mr-1.5 inline-flex rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-sm font-semibold text-[var(--text-secondary)]">{ORIGEN[d.origen]}</span>
                  {d.texto}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {fila.lineas.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-[var(--surface-raised)] px-3 py-2" aria-label="Productos que no cuadran">
          {fila.lineas.map((l) => (
            <li key={l.productId} className="text-sm text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">{l.nombre}</strong>
              {": pediste "}<span className="tabular-nums">{l.pedido}</span>
              {", llegaron "}<span className="tabular-nums">{l.llego}</span>
              {l.noAptos > 0 && <>{" ("}<span className="tabular-nums">{l.noAptos}</span>{" no aptas)"}</>}
              {l.noLlegara > 0 && <>{", "}<span className="tabular-nums">{l.noLlegara}</span>{" no llegarán"}</>}
              {" → "}
              <strong className="tabular-nums text-[var(--text-primary)]">
                {l.diferencia > 0 ? `faltan ${plural(l.diferencia, l.unidad || "unidad", l.unidad || "unidades")}` : l.diferencia < 0 ? `sobran ${-l.diferencia}` : "cuadra"}
              </strong>
              {l.sinExplicar > 0 && l.diferencia > 0 && l.sinExplicar < l.diferencia && <> ({l.sinExplicar} sin descuento anotado)</>}
            </li>
          ))}
        </ul>
      )}

      {fila.propuestas.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Puede ser</p>
          <ul className="space-y-1.5">
            {fila.propuestas.map((p) => (
              <li key={p.texto} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-[var(--text-primary)]">{p.texto}</span>
                  <span className="block text-[var(--text-secondary)]">{p.motivo}</span>
                </span>
                {p.cuentaId && (
                  <button type="button" onClick={() => onVincular(p.cuentaId!)} className={button({ variant: "secondary", className: "shrink-0 gap-1.5 rounded-xl" })}>
                    <Link2 className="h-4 w-4" aria-hidden /> Unir esa cuenta
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {fila.ordenId && <EnlacePanel cosa="oc" id={fila.ordenId}>Abrir la orden {fila.codigo}</EnlacePanel>}
        {(fila.tipo === "recepcion" || (fila.llego?.recepciones ?? 0) > 0) && (
          <EnlacePanel href={HREF_RECEPCIONES}>
            <ExternalLink className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />Ver en Recepciones
          </EnlacePanel>
        )}
        {cuentaId && (
          <button type="button" onClick={() => onVerCuenta(cuentaId)} className={cn(CLASE_ENLACE_PANEL, "inline-flex items-center gap-1")}>
            <Wallet className="h-4 w-4" aria-hidden /> Ver la cuenta
          </button>
        )}
        {fila.tipo === "cuenta" && cuentaId && !/^Saldo inicial/.test(fila.codigo) && (
          <button type="button" onClick={() => onVincular(cuentaId)} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl" })}>
            <Link2 className="h-4 w-4" aria-hidden /> Vincular a su orden
          </button>
        )}
      </div>
    </div>
  );
}
