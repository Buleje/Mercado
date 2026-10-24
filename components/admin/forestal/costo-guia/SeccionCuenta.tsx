"use client";

/**
 * «Cuenta de <proveedor>» dentro de «Plata de la guía» (pedido de Brandon
 * 26-09: «ver la cuenta del proveedor ahí mismo»).
 *
 * UNA verdad (ADR-437 §5): el neto es el de «Cuenta por persona»
 * (`unificarCuentas`) y los movimientos son los del estado de cuenta que sale
 * en PDF y por WhatsApp (`estadoCuentaUnificado`). Acá no se calcula ningún
 * saldo propio: sólo se filtra y se escribe en palabras.
 *
 * Plegada muestra igual el neto (plegar no es esconder el dato). Una guía de
 * servicio o sin proveedor ligado no tiene cuenta: lo dice un InfoTip.
 */

import { useId, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useCuentaDeGuia } from "@/hooks/use-cuenta-de-guia";
import {
  TIPO_LINEA_LABEL,
  TIPOS_LINEA_CUENTA,
  type TipoLineaCuenta,
} from "@/lib/forestal/cuenta-en-la-guia";
import type { PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import { Btn } from "../ctp-shared";
import { Bloque, Opciones, soles } from "./comun";
import ListaMovimientosCuenta, { saldoEnPalabras, tonoDelSaldo } from "./ListaMovimientosCuenta";

type Filtro = "todo" | TipoLineaCuenta;

function motivoSinCuenta(dto: PlataDeGuiaDTO, esServicio: boolean): string {
  if (esServicio) {
    return "Es madera de servicio: no se la compraste a nadie, así que no hay proveedor a quien pagarle. Lo que le cobras a su dueño por el aserrío está en su cuenta, en Cuenta por persona.";
  }
  if (dto.proveedor && !dto.proveedor.seguro) {
    return `A ${dto.proveedor.nombre} sólo se le propone por un nombre parecido. Elígelo como proveedor y guarda el costo: ahí aparece su cuenta.`;
  }
  return "Esta guía todavía no tiene proveedor ligado a una ficha del directorio. Elige a quién le pagas y guarda el costo: ahí aparece su cuenta.";
}

export default function SeccionCuenta({
  dto,
  esServicio,
  abierto,
  onAlternar,
  onCerrarModal,
}: {
  dto: PlataDeGuiaDTO;
  /** Lo que dice el selector ahora (puede no estar guardado todavía). */
  esServicio: boolean;
  /** Controlado desde el modal: sobrevive a esconderlo para anotar un flete. */
  abierto: boolean;
  onAlternar: () => void;
  /** «Ver cuenta completa» cierra el modal antes de ir a Adelantos › Cuenta por persona. */
  onCerrarModal: () => void;
}) {
  const persona = esServicio ? null : dto.persona;
  const idPanel = useId();
  const [filtro, setFiltro] = useState<Filtro>("todo");
  /* Relee cuando algo de la guía cambia la cuenta: un pago, un costo guardado. */
  const version = `${persona?.neto ?? ""}|${dto.pago?.pagado ?? ""}|${dto.cuenta?.monto ?? ""}`;
  const { cuenta, cargando, error, recargar } = useCuentaDeGuia(persona?.parteId ?? null, abierto, version);

  if (!persona) {
    return (
      <Bloque
        titulo={
          <>
            <Scale className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
            <span>Cuenta del proveedor</span>
            <InfoTip title="¿Por qué no hay cuenta?" what={motivoSinCuenta(dto, esServicio)} />
          </>
        }
        extra={<span className="text-sm font-bold text-[var(--text-tertiary)]">Sin cuenta</span>}
      >
        {null}
      </Bloque>
    );
  }

  /* La cabecera lee el DTO de la guía (se relee tras cada pago); la cuenta
     plegada puede ser de una lectura anterior. Las dos salen de `unificarCuentas`. */
  const neto = persona.neto;
  const nombre = persona.nombre;
  const conteo = (t: TipoLineaCuenta) => cuenta?.lineas.filter((l) => l.tipo === t).length ?? 0;
  const lineas = (cuenta?.lineas ?? []).filter((l) => filtro === "todo" || l.tipo === filtro);
  const otras = Object.entries(cuenta?.otrasMonedas ?? {}).filter(([, v]) => Math.abs(v) >= 0.005);

  return (
    <Bloque
      titulo={
        <>
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idPanel}
            onClick={onAlternar}
            className="inline-flex min-h-11 min-w-0 items-center gap-1.5 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "" : "-rotate-90"}`}
              aria-hidden
            />
            <span className="min-w-0 break-words">Cuenta de {nombre}</span>
          </button>
          <InfoTip
            title="La cuenta de tu proveedor"
            what="La misma cuenta que ves en Adelantos › Cuenta por persona: sus guías de madera, lo que le pagaste, sus adelantos y los aserríos, en una sola."
            affects="El neto es lo que queda después de cruzar todo. No cambia nada: sólo lo muestra."
            example="Madera S/ 1 500 − pagado S/ 500 = le debes S/ 1 000. Si además te debe S/ 200 de un adelanto, el neto es le debes S/ 800."
          />
        </>
      }
      extra={
        /* Abierta, el neto grande ya lo dice: repetirlo en la cabecera es ruido. */
        abierto && cuenta ? null : (
          <span className={`text-sm font-bold tabular-nums ${tonoDelSaldo(neto)}`}>
            {saldoEnPalabras(neto)}
          </span>
        )
      }
    >
      {abierto && (
        <div id={idPanel} className="space-y-3 text-sm">
          {!cuenta && cargando && (
            <p className="flex items-center gap-2 py-4 text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo la cuenta…
            </p>
          )}
          {!cuenta && !cargando && error && (
            <div className="space-y-2">
              <p role="alert" className="flex items-start gap-2 font-bold text-[var(--data-error-ink)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
              </p>
              <Btn size="sm" variant="secondary" onClick={() => void recargar()}>
                Reintentar
              </Btn>
            </div>
          )}

          {cuenta && (
            <>
              <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
                <p className="text-sm font-bold text-[var(--text-secondary)]">Neto de la cuenta</p>
                <p className={`text-2xl font-bold tabular-nums ${tonoDelSaldo(cuenta.neto)}`}>
                  {saldoEnPalabras(cuenta.neto)}
                </p>
                {otras.map(([moneda, v]) => (
                  <p key={moneda} className="font-bold tabular-nums text-[var(--text-secondary)]">
                    y en {moneda}: {saldoEnPalabras(v, moneda, true)}
                  </p>
                ))}
                <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-3">
                  {(
                    [
                      ["Madera", soles(cuenta.madera)],
                      ["Pagado", soles(cuenta.pagado)],
                      ["Adelantado", cuenta.adelantado == null ? "sin ficha" : soles(cuenta.adelantado)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 sm:block">
                      <dt className="text-[var(--text-secondary)]">{k}</dt>
                      <dd className="font-bold tabular-nums text-[var(--text-primary)] sm:text-base">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <Opciones
                etiqueta="Qué movimientos ver"
                valor={filtro}
                onCambio={setFiltro}
                opciones={[
                  { v: "todo" as Filtro, l: `Todo · ${cuenta.lineas.length}` },
                  ...TIPOS_LINEA_CUENTA.map((t) => ({ v: t as Filtro, l: `${TIPO_LINEA_LABEL[t]} · ${conteo(t)}` })),
                ]}
              />

              <ListaMovimientosCuenta lineas={lineas} gtfActual={dto.gtfNumber} />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              onCerrarModal();
              window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "adelantos" } }));
            }}
            className="inline-flex min-h-11 items-center gap-1.5 font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
          >
            Ver cuenta completa <ExternalLink className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </Bloque>
  );
}
