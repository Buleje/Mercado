"use client";

/**
 * BarraPagoSemana — una línea arriba de la asistencia con el pago del sábado
 * («Hoy se paga: 4 trabajadores · S/ 1.480 neto · S/ 150 en adelantos a
 * descontar») y los dos botones: ver el pago y dar un adelanto. Sólo para el
 * dueño (nivel completo): el pago mueve plata de Mi Plata y de la caja.
 *
 * El aviso de la campana del sábado trae `?pago=semana`: abre el pago solo.
 */

import { useState } from "react";
import { HandCoins, Wallet } from "@buleje/design-system/icons";
import { useParamDeEntrada } from "@/hooks/use-param-de-entrada";
import { cn, limaDateKey } from "@/lib/utils";
import { semanaDe } from "@/lib/rrhh/fechas";
import { BOTON } from "../rrhh-form";
import { formatearPEN, pluralizar } from "../rrhh-ui";
import DarAdelantoModal, { type PersonaParaAdelanto } from "./DarAdelantoModal";
import PagoSemanaModal from "./PagoSemanaModal";
import type { PagoSemana } from "./use-pago-semana";

const TONO = {
  hoy: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  normal: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

type Adelanto = { abierto: false } | { abierto: true; colaboradorId?: string };

/** `pago` lo carga `AsistenciaView`: el mismo dato sirve al chip de adelanto de cada fila. */
export default function BarraPagoSemana({ pago }: { pago: PagoSemana }) {
  const { datos, setDesde, recargar } = pago;
  const [verPago, setVerPago] = useState(false);
  const [adelanto, setAdelanto] = useState<Adelanto>({ abierto: false });

  useParamDeEntrada(
    "pago",
    (v) => {
      if (v === "semana") setVerPago(true);
    },
    (p) => p.get("tab") === "rrhh",
  );

  const cerrarPago = () => {
    setVerPago(false);
    const estaSemana = semanaDe(limaDateKey()).desde;
    // La barra habla siempre de esta semana: si navegaste a otra, vuelve.
    if (pago.desde !== estaSemana) setDesde(estaSemana);
    else void recargar();
  };

  const personas: PersonaParaAdelanto[] = (datos?.filas ?? [])
    .filter((f) => f.estado !== "CESADO")
    .map((f) => ({
      id: f.colaboradorId,
      nombre: f.nombre,
      yaDado: f.adelantosDeLaSemana.reduce((a, x) => a + x.monto, 0),
    }));

  const t = datos?.totales;
  const pendientes = (t?.porPagar ?? 0) + (t?.faltaDefinir ?? 0);
  const esHoy = datos?.esDiaDePago === true && pendientes > 0;
  let texto: string;
  if (!datos || !t) texto = "Pago del sábado";
  else if (pendientes === 0 && t.pagados > 0)
    texto = `Pago de la semana: ${pluralizar(t.pagados, "pagado", "pagados")} · ${formatearPEN(t.netoPagado)} entregado`;
  else {
    const cifras =
      t.porPagar > 0
        ? `${pluralizar(t.porPagar, "trabajador", "trabajadores")} · ${formatearPEN(t.netoPorPagar)} neto · ${formatearPEN(t.adelantosPorDescontar)} en adelantos a descontar`
        : "";
    const falta =
      t.faltaDefinir > 0
        ? `${cifras ? " · " : ""}a ${t.faltaDefinir} les falta definir el pago`
        : "";
    const yaPagados = t.pagados > 0 ? ` · ya pagaste a ${t.pagados}` : "";
    texto = `${esHoy ? "Hoy se paga" : `Pago del sábado (${datos.periodo})`}: ${`${cifras}${falta}${yaPagados}` || "nadie por pagar"}`;
  }

  return (
    <>
      <div
        className={cn(
          "mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2",
          esHoy ? TONO.hoy : TONO.normal,
        )}
      >
        <Wallet className="h-5 w-5 shrink-0" />
        <p
          className={cn(
            "min-w-0 flex-1 basis-60 text-sm",
            esHoy ? "font-semibold" : "text-[var(--text-primary)]",
          )}
        >
          {texto}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAdelanto({ abierto: true })}
            disabled={!datos}
            className={BOTON.chico}
          >
            <HandCoins className="h-4 w-4" /> Dar adelanto
          </button>
          <button
            type="button"
            onClick={() => setVerPago(true)}
            className={esHoy ? BOTON.chicoPrimario : BOTON.chico}
          >
            Ver el pago
          </button>
        </div>
      </div>

      {verPago && (
        <PagoSemanaModal
          pago={pago}
          onClose={cerrarPago}
          onDarAdelanto={(id) => setAdelanto({ abierto: true, colaboradorId: id })}
        />
      )}
      {adelanto.abierto && (
        <DarAdelantoModal
          personas={personas}
          colaboradorId={adelanto.colaboradorId}
          pago={datos}
          aboveModals={verPago}
          onClose={() => setAdelanto({ abierto: false })}
          onDado={() => {
            setAdelanto({ abierto: false });
            void recargar();
          }}
        />
      )}
    </>
  );
}
