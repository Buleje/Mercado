"use client";

/**
 * FlujoN8nFila — un flujo de n8n en la lista: nombre, estado, para qué sirve,
 * el último disparo y sus tres acciones (probar, apagar/encender, borrar).
 * La URL del webhook queda abajo, recortada: sirve para reconocer cuál es.
 */

import { Loader2, Play, Power, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { icono48 } from "./piezas-canal";
import { haceCuanto } from "./shared";
import type { FlujoN8n } from "./tipos";

export interface ResultadoPrueba {
  id: string;
  ok: boolean;
  texto: string;
}

const PASTILLA = "rounded-full border px-2 py-0.5 text-sm font-semibold text-[var(--text-primary)]";

export default function FlujoN8nFila({
  flujo: f,
  probando,
  resultado,
  onProbar,
  onActivar,
  onBorrar,
}: {
  flujo: FlujoN8n;
  probando: boolean;
  resultado: ResultadoPrueba | null;
  onProbar: () => void;
  onActivar: () => void;
  onBorrar: () => void;
}) {
  return (
    <li className={cn("py-2", !f.activo && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">{f.nombre}</p>
            <span
              className={cn(
                PASTILLA,
                f.activo
                  ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10"
                  : "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
              )}
            >
              {f.activo ? "Activo" : "Apagado"}
            </span>
            {f.ultimoDisparo && (
              <span className={cn("text-sm", f.ultimoDisparo.ok ? "text-[var(--text-secondary)]" : "text-[var(--data-error-ink)]")}>
                {f.ultimoDisparo.ok ? "Disparado" : "Falló"} {haceCuanto(f.ultimoDisparo.fecha)} · {f.ultimoDisparo.detalle}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{f.descripcion}</p>
          <p className="truncate font-mono text-sm text-[var(--text-tertiary)]" title={f.url}>
            {f.url}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onProbar}
            disabled={probando}
            title="Mandar un ping de prueba"
            aria-label={`Probar ${f.nombre}`}
            className={icono48}
          >
            {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onActivar}
            title={f.activo ? "Apagar" : "Encender"}
            aria-label={`${f.activo ? "Apagar" : "Encender"} ${f.nombre}`}
            className={icono48}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onBorrar}
            title="Borrar"
            aria-label={`Borrar ${f.nombre}`}
            className={cn(icono48, "text-[var(--text-tertiary)] hover:text-[var(--data-error-ink)]")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {resultado && (
        <p
          className={cn(
            "mt-2 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]",
            resultado.ok ? "bg-[var(--data-success-500)]/10" : "bg-[var(--data-error-500)]/10",
          )}
        >
          {resultado.texto}
        </p>
      )}
    </li>
  );
}
