"use client";

/**
 * Qué trato tiene el cliente elegido, en una línea (ADR-430).
 *
 * Va al lado del selector de cliente —Declarar producción, Cobrar aserrío,
 * el cubicador—: es lo que explica el importe ANTES de verlo. Sin trato se
 * dice qué rige en su lugar; leyendo o con error, se dice también, porque un
 * silencio ahí se lee como «no tiene precio».
 */
import { tarifaVigente, type GrupoEspecies, type ServicioPrecio } from "@/lib/forestal/precio-cliente";
import { tratoEnPalabras, vigenciaEnPalabras } from "@/lib/forestal/trato-en-palabras";
import type { TratoDelCliente } from "./hooks/use-trato-del-cliente";

export default function CtpLineaDelTrato({
  trato,
  servicio,
  fecha,
  grupos,
  nombre,
}: {
  trato: Pick<TratoDelCliente, "tarifas" | "cargando" | "error">;
  servicio: ServicioPrecio;
  fecha: string;
  grupos: readonly GrupoEspecies[];
  nombre: string;
}) {
  const clase = "text-xs leading-snug";
  if (trato.cargando) {
    return <p className={`${clase} text-[var(--text-tertiary)]`}>Leyendo el precio pactado con {nombre}…</p>;
  }
  if (trato.error) {
    return (
      <p className={`${clase} font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
        No se pudo leer el precio pactado con {nombre}.{servicio === "aserrio" ? " Pon el precio a mano." : ""}
      </p>
    );
  }
  const vigente = tarifaVigente(trato.tarifas, servicio, fecha);
  if (!vigente) {
    return (
      <p className={`${clase} text-[var(--text-tertiary)]`}>
        {nombre} no tiene precio pactado de {servicio === "aserrio" ? "aserrío" : "venta"} para ese día
        {servicio === "aserrio" ? ": rige la tarifa de la planta." : "."}
      </p>
    );
  }
  return (
    <p className={`${clase} text-[var(--text-secondary)]`}>
      <b className="text-[var(--text-primary)]">Precio pactado</b> ({vigenciaEnPalabras(vigente)}):{" "}
      <span className="font-medium tabular-nums">{tratoEnPalabras(vigente, grupos)}</span>.{" "}
      {servicio === "aserrio" ? "Se usa donde no haya precio a mano." : "Se sugiere en cada especie."}
    </p>
  );
}
