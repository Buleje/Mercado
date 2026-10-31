"use client";

/**
 * «Vaciar» desde un botón SIEMPRE pregunta (Brandon 24-10: «cuando se da en
 * Vaciar lote quiero una modal de confirmar, para evitar presionar botones sin
 * querer»). La pregunta la arma `cubicador-vaciar` (cuánto se va y qué queda a
 * salvo); acá sólo se espera el «Sí, vaciar» antes de borrar. Sin aviso (la
 * lista ya está vacía) no pregunta ni borra. Devuelve si se vació.
 */
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { AvisoVaciar } from "@/lib/forestal/cubicador-vaciar";

export function useVaciarConConfirmar(vaciar: () => void): (aviso: AvisoVaciar | false) => Promise<boolean> {
  const { confirm } = useConfirm();
  return async (aviso) => {
    if (!aviso) return false;
    const ok = await confirm(aviso);
    if (ok) vaciar();
    return ok;
  };
}
