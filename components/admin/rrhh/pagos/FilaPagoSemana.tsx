"use client";

/**
 * FilaPagoSemana — una persona en el pago del sábado: lo ganado, los adelantos
 * que se le descuentan, el neto y «Pagar». Las cifras son las del servidor; si
 * le falta definir el pago, el monto que escribes se previsualiza con la misma
 * función pura y el servidor lo vuelve a calcular al pagar.
 */

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, HandCoins, Loader2, Undo2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { FilaPagoSemanaDTO } from "@/lib/rrhh/pago-semana";
import { BOTON, CLASE_CAMPO, CLASE_CHIP } from "../rrhh-form";
import { formatearPEN, pluralizar } from "../rrhh-ui";
import { calculoDeLaFila, type ComoPagas } from "./use-pago-semana";

type Resultado = { ok: boolean; mensaje: string };

interface Props {
  fila: FilaPagoSemanaDTO;
  como: ComoPagas;
  ocupado: boolean;
  /** Otra fila se está guardando: ésta espera. */
  bloqueado: boolean;
  onPagar: (montoManual: number | null) => Promise<Resultado>;
  onDeshacer: () => Promise<Resultado>;
  onDarAdelanto: () => void;
}

const CHIP_OK =
  "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const CHIP_AVISO =
  "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const TEXTO_AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

function textoMetodo(m: string | null): string {
  if (!m) return "";
  return (
    { efectivo: "efectivo", yape: "Yape", plin: "Plin", transferencia: "transferencia" }[m] ?? m
  );
}

export default function FilaPagoSemana({
  fila,
  como,
  ocupado,
  bloqueado,
  onPagar,
  onDeshacer,
  onDarAdelanto,
}: Props) {
  const { confirm } = useConfirm();
  const [escrito, setEscrito] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const montoManual =
    fila.tipo === "falta_definir" && escrito.trim() ? Number(escrito.replace(",", ".")) : null;
  const montoValido = montoManual == null || (Number.isFinite(montoManual) && montoManual > 0);
  const calculo = calculoDeLaFila(fila, montoValido ? montoManual : null);
  const pagado = fila.pagado;
  const dadoEstaSemana = fila.adelantosDeLaSemana.reduce((a, x) => a + x.monto, 0);

  const avisar = (r: Resultado) => (r.ok ? toast.success(r.mensaje) : toast.error(r.mensaje));
  const pagar = async () => {
    setConfirmando(false);
    avisar(await onPagar(montoManual));
  };
  const deshacer = async () => {
    const ok = await confirm({
      title: `¿Deshacer el pago de ${fila.nombre}?`,
      description:
        "Se borra el gasto de Mi Plata, sus adelantos vuelven a quedar por descontar y, si el neto salió de la caja abierta, vuelve a la caja.",
      intent: "danger",
      confirmLabel: "Sí, deshacer",
    });
    if (ok) avisar(await onDeshacer());
  };

  const menu: MenuAccion[] = [
    {
      id: "adelanto",
      label: "Dar adelanto",
      hint: "Se descuenta en su próximo pago",
      icon: HandCoins,
      onSelect: onDarAdelanto,
    },
    ...(pagado || fila.pagoSinGasto
      ? [
          {
            id: "deshacer",
            label: "Deshacer el pago",
            icon: Undo2,
            onSelect: () => void deshacer(),
            tone: "danger" as const,
            disabled: bloqueado || ocupado,
          },
        ]
      : []),
  ];

  let ganado: ReactNode;
  if (pagado && pagado.diferencia != null) {
    // El pago congeló lo ganado: la asistencia cambió después (marcó el sábado
    // tras pagar, o un semanal pagado a media semana).
    const d = pagado.diferencia;
    ganado = (
      <div className="flex flex-col items-end gap-1">
        <span>{formatearPEN(pagado.base)}</span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", TEXTO_AVISO)}>
          {d > 0 ? `Ahora ganó ${formatearPEN(d)} más` : `Ahora ganó ${formatearPEN(-d)} menos`}
          <InfoTip
            title="Lo ganado cambió después del pago"
            side="left"
            what={`Se le pagó ${formatearPEN(pagado.base)} con lo marcado hasta ese momento; con la asistencia de ahora ganó ${formatearPEN(fila.ganado)}.`}
            affects="Deshaz el pago (la plata vuelve a la caja y sus adelantos quedan por descontar) y vuelve a pagar con lo de ahora."
          />
        </span>
        <button
          type="button"
          disabled={bloqueado || ocupado}
          onClick={() => void deshacer()}
          className={BOTON.chicoFantasma}
        >
          <Undo2 className="h-4 w-4" /> Deshacer y volver a pagar
        </button>
      </div>
    );
  } else if (pagado) ganado = formatearPEN(pagado.base);
  else if (fila.tipo === "mensual")
    ganado = <span className="text-[var(--text-tertiary)]">Cobra por mes</span>;
  else if (fila.tipo === "falta_definir") {
    ganado = (
      <label className="flex flex-col items-end gap-1">
        <span className={cn("text-xs font-semibold", TEXTO_AVISO)}>Falta definir su pago</span>
        <input
          inputMode="decimal"
          aria-label={`Cuánto se le paga a ${fila.nombre} esta semana`}
          value={escrito}
          onChange={(e) => setEscrito(e.target.value)}
          placeholder="S/ 0.00"
          className={cn(
            CLASE_CAMPO,
            "w-32 text-right tabular-nums",
            !montoValido && "border-[var(--data-error-500)]",
          )}
        />
      </label>
    );
  } else ganado = formatearPEN(calculo.base ?? 0);

  const descuento = pagado ? pagado.descontado : calculo.aDescontar;
  const neto = pagado ? pagado.neto : calculo.neto;
  const sePuedePagar =
    !pagado &&
    !fila.pagoSinGasto &&
    fila.tipo !== "mensual" &&
    calculo.base != null &&
    calculo.base > 0 &&
    montoValido;

  return (
    <tr>
      <td data-label="Persona">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold text-[var(--text-primary)]">{fila.nombre}</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {[
              fila.puesto,
              fila.sinMarcar > 0 ? `${pluralizar(fila.sinMarcar, "día", "días")} sin marcar` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin puesto"}
          </p>
          {dadoEstaSemana > 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              Esta semana le diste {formatearPEN(dadoEstaSemana)} (
              {pluralizar(fila.adelantosDeLaSemana.length, "adelanto", "adelantos")})
            </p>
          )}
          {fila.otrasDeudas > 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              Cuenta corriente: {formatearPEN(fila.otrasDeudas)} (no se descuenta del sueldo)
            </p>
          )}
        </div>
      </td>
      <td data-label="Ganado" className="text-right tabular-nums">
        {ganado}
      </td>
      <td data-label="Adelantos" className="text-right tabular-nums">
        {descuento > 0 ? (
          <span className="inline-flex items-center justify-end gap-1">
            − {formatearPEN(descuento)}
            {!pagado && calculo.lineas.length > 0 && (
              <InfoTip
                title="Qué se descuenta"
                side="left"
                what={calculo.lineas
                  .map(
                    (l) =>
                      `${l.codigo ?? "Adelanto"}: ${formatearPEN(l.descuento)} de ${formatearPEN(l.saldo)}${l.liquida ? " (queda cerrado)" : ""}`,
                  )
                  .join(" · ")}
                affects={
                  calculo.sigueDebiendo > 0
                    ? `Sigue debiendo ${formatearPEN(calculo.sigueDebiendo)}: se descuenta la semana que viene.`
                    : undefined
                }
                example={
                  calculo.descontadoPrevio > 0
                    ? `Ya se le descontó ${formatearPEN(calculo.descontadoPrevio)} a mano para esta semana: no se vuelve a descontar.`
                    : undefined
                }
              />
            )}
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        )}
      </td>
      <td
        data-label="Neto"
        className="text-right font-bold tabular-nums text-[var(--text-primary)]"
      >
        {!pagado && (fila.tipo === "mensual" || calculo.base == null) ? "—" : formatearPEN(neto)}
      </td>
      <td data-label="Pago">
        <div className="flex items-center justify-end gap-2">
          {pagado && (
            <span className={cn(CLASE_CHIP, CHIP_OK, "gap-1")}>
              <CheckCircle2 className="h-4 w-4" /> Pagado
              {pagado.metodo ? ` · ${textoMetodo(pagado.metodo)}` : ""}
              {pagado.salioDeCaja ? " · de la caja" : ""}
            </span>
          )}
          {fila.pagoSinGasto && !pagado && (
            <span className={cn(CLASE_CHIP, CHIP_AVISO)}>Su gasto se borró: deshaz el pago</span>
          )}
          {sePuedePagar && !confirmando && (
            <button
              type="button"
              disabled={bloqueado || ocupado}
              onClick={() => setConfirmando(true)}
              className={BOTON.chicoPrimario}
            >
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
              Pagar {formatearPEN(calculo.neto)}
            </button>
          )}
          {sePuedePagar && confirmando && (
            <>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className={BOTON.chicoFantasma}
              >
                No
              </button>
              <button
                type="button"
                disabled={bloqueado || ocupado}
                onClick={() => void pagar()}
                className={BOTON.chicoPrimario}
              >
                Sí, pagado en {textoMetodo(como.metodo)}
                {como.metodo === "efectivo" && como.saleDeCaja ? " de la caja" : ""}
              </button>
            </>
          )}
          <ActionMenu label={`Más opciones de ${fila.nombre}`} actions={menu} soloIcono size="md" />
        </div>
      </td>
    </tr>
  );
}
