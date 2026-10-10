"use client";

import { useEffect, useState } from "react";
import { History, ListChecks, Lock, PenLine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import EntradaOrden from "./EntradaOrden";
import EntradaLista from "./EntradaLista";
import DiferenciaPreciosModal from "./DiferenciaPreciosModal";
import { usePreciosEnBloque } from "./use-precios-en-bloque";

type SubComandos = "papel" | "precios" | "mensajes" | "historial";
type Modo = "orden" | "lista";

/** Los mismos roles que deja pasar `requireAdmin(req, ["admin"])` (management tier). */
const PUEDEN_CAMBIAR_PRECIOS = new Set(["admin", "owner", "manager", "superadmin"]);

const MODOS: Array<{ id: Modo; label: string; icon: typeof ListChecks }> = [
  { id: "orden", label: "Orden en palabras", icon: PenLine },
  { id: "lista", label: "Lista del proveedor", icon: ListChecks },
];

/**
 * Comandos IA › Precios en bloque. Dos entradas que terminan en la MISMA
 * diferencia (Hoy → Queda): una orden en palabras o la lista del proveedor.
 * Aplicar escribe con verificación (lo que viste = lo que hay) y deja un
 * recibo que se deshace desde el aviso o desde «Lo que hizo la IA».
 */
export default function PreciosEnBloque({ irA }: { irA: (sub: SubComandos) => void }) {
  const rol = useMiRol();
  const p = usePreciosEnBloque();
  const [modo, setModo] = useState<Modo>("orden");

  useEffect(() => {
    if (p.pasarela) setModo("lista");
  }, [p.pasarela]);

  // null = todavía no se sabe: permisivo (el servidor es el gate de verdad).
  if (rol && !PUEDEN_CAMBIAR_PRECIOS.has(rol)) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-secondary)]">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        Solo el administrador cambia precios en bloque.
        <InfoTip
          title="Precios en bloque"
          what="Cambiar muchos precios de una vez toca la plata de todo el negocio: lo hace el administrador o el dueño."
          example="Pídele que use «Sube 5 % Abarrotes» desde su cuenta."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Cómo cambiar precios" className="inline-flex rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
          {MODOS.map(({ id, label, icon: Icono }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={modo === id}
              onClick={() => setModo(id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
                modo === id
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icono className="h-4 w-4" aria-hidden />
              <span className="max-sm:hidden">{label}</span>
              <span className="sm:hidden">{label.split(" ")[0]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => irA("historial")}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          title="Ver los cambios hechos y deshacerlos"
        >
          <History className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Cambios hechos</span>
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        {modo === "orden" ? (
          <EntradaOrden pensando={p.pensando} dudas={p.dudas} error={p.error} onPedir={(orden) => void p.pedirPlan({ orden })} />
        ) : (
          <EntradaLista key={p.pasarela ? "papel" : "vacia"} pensando={p.pensando} error={p.error} inicial={p.pasarela} onPedir={(c) => void p.pedirPlan(c)} />
        )}
      </div>

      {p.plan && (
        <DiferenciaPreciosModal
          key={`${p.plan.interpretacion}-${p.plan.filas.length}`}
          plan={p.plan}
          aplicando={p.aplicando}
          onCerrar={p.cerrarPlan}
          onAplicar={p.aplicar}
        />
      )}
    </div>
  );
}
