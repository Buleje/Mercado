"use client";

/**
 * useCuentaRecordada — la cuenta de Google que este navegador recuerda
 * (`lib/tienda-cliente/cuenta-recordada.ts`), al día con «Olvidar», con otras
 * pestañas y con el ingreso por el globito. En el servidor y en el primer
 * dibujo es null: sin desajuste de hidratación.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  leerCrudoCuentaRecordada,
  parsearCuentaRecordada,
  suscribirCuentaRecordada,
  type CuentaRecordada,
} from "@/lib/tienda-cliente/cuenta-recordada";

const enElServidor = () => null;
const instantanea = () => leerCrudoCuentaRecordada();

export function useCuentaRecordada(): CuentaRecordada | null {
  const crudo = useSyncExternalStore(suscribirCuentaRecordada, instantanea, enElServidor);
  return useMemo(() => parsearCuentaRecordada(crudo), [crudo]);
}
