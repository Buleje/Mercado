"use client";

/**
 * Qué lleva el «Anexo 04 por permiso»: todo, sólo lo tildado como distribuido
 * o sólo lo que falta tildar (Brandon, 2026-10-19: «una sección igual al anexo
 * por permiso pero sólo con los bloques que se seleccionaron con check»).
 *
 * Es UNA sección con un interruptor y no dos copias: las pestañas por permiso,
 * el resumen por especie y tipo, el PDF y el CSV son los mismos; cambia qué
 * líneas entran. Debajo, la cuenta que lo prueba: marcado + por distribuir =
 * todo.
 */

import { useCallback, useEffect, useState } from "react";
import { Check } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CuadreMarcado } from "@/lib/forestal/reparto-por-distribuir";
import type { AnexoDePermiso } from "@/lib/forestal/anexo-por-permiso";
import type { ProcedenciaBloques } from "@/lib/forestal/anexo04-validacion";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export type ModoAnexo = "todo" | "marcado" | "pendiente";
const MODOS: readonly ModoAnexo[] = ["todo", "marcado", "pendiente"];

/** El modo elegido, recordado en este navegador como el resto de la Distribución. */
export function useModoAnexo(clave: string): [ModoAnexo, (m: ModoAnexo) => void] {
  const [modo, setModo] = useState<ModoAnexo>("todo");
  useEffect(() => {
    try {
      const v = localStorage.getItem(clave);
      if (v && (MODOS as readonly string[]).includes(v)) setModo(v as ModoAnexo);
    } catch { /* sin almacenamiento: queda «Todo» */ }
  }, [clave]);
  const elegir = useCallback(
    (m: ModoAnexo) => {
      setModo(m);
      try { localStorage.setItem(clave, m); } catch { /* sin almacenamiento: vale para esta visita */ }
    },
    [clave],
  );
  return [modo, elegir];
}

/** De qué clase de bloque salió el papel (va al checklist del Anexo 04). */
export function procedenciaDeAnexo(a: AnexoDePermiso): ProcedenciaBloques {
  const directa = a.bloques.filter((b) => b.aserradaDirecta).length;
  return { rolliza: a.bloques.length - directa, aserradaDirecta: directa };
}

const ROTULO: Record<ModoAnexo, string> = { todo: "Todo", marcado: "Marcado", pendiente: "Sin marcar" };

export function SelectorModoAnexo({
  modo,
  onCambiar,
  cuadre,
}: {
  modo: ModoAnexo;
  onCambiar: (m: ModoAnexo) => void;
  cuadre: CuadreMarcado;
}) {
  const m3: Record<ModoAnexo, number> = { todo: cuadre.todo.m3, marcado: cuadre.marcado.m3, pendiente: cuadre.pendiente.m3 };
  return (
    <div role="radiogroup" aria-label="Qué lleva el Anexo 04" className="grid grid-cols-3 gap-0.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5 sm:inline-flex sm:items-center">
      {MODOS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={modo === k}
          onClick={() => onCambiar(k)}
          className={`inline-flex min-h-8 flex-col items-center justify-center whitespace-nowrap rounded-lg px-2 py-1 text-sm font-bold leading-tight transition-colors sm:h-8 sm:flex-row sm:gap-1.5 sm:px-2.5 sm:py-0 ${
            modo === k
              ? "bg-[var(--accent-dark)] text-white"
              : "text-[var(--text-secondary)] hover:bg-primary/10 hover:text-[var(--text-primary)]"
          }`}
        >
          {ROTULO[k]}
          <span className={`font-mono text-xs tabular-nums ${modo === k ? "" : "text-[var(--text-tertiary)]"}`}>{fmtM3(m3[k])}</span>
        </button>
      ))}
    </div>
  );
}

/** «Marcado + Sin marcar = Todo», en m³ y piezas, con su ✓ o su aviso. */
export function CuentaMarcado({ cuadre }: { cuadre: CuadreMarcado }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
      <span>Marcado</span>
      <b className="font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(cuadre.marcado.m3)}</b>
      <span>+ Sin marcar</span>
      <b className="font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(cuadre.pendiente.m3)}</b>
      <span>= Todo</span>
      <b className="font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(cuadre.todo.m3)} m³</b>
      {cuadre.cuadra ? (
        <span className="inline-flex items-center gap-1 font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <Check className="h-4 w-4" aria-hidden /> cuadra
        </span>
      ) : (
        <span className="font-bold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">no cuadra</span>
      )}
      <InfoTip
        title="Marcado y por distribuir"
        what={<span>«Marcado» es lo que tildaste como distribuido en los bloques. «Sin marcar» es lo que todavía no tildaste. Las dos partes suman el todo, en piezas, pie tablar y m³.</span>}
        affects={<span>Cada modo arma el mismo Anexo 04 por permiso, con sólo esas líneas. Un permiso por papel.</span>}
        example={<span>Permiso 096: tildaste 3 de los 4 tipos. «Marcado» trae esos 3; el cuarto aparece en «Sin marcar».</span>}
      />
    </div>
  );
}
