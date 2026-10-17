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

const MODOS: Array<{ id: Modo; label: string; icon: typeof ListChecks; what: string; affects: string; example: string }> = [
  {
    id: "orden",
    label: "Orden en palabras",
    icon: PenLine,
    what: "Di qué precios cambiar, cuánto y cómo redondear. Las órdenes comunes se entienden sin IA ($0); si no, la IA lee tu orden con los nombres de tus categorías, nunca tus precios. «Lo que no se vendió en 30 días» mira tus ventas de caja y tus pedidos (sin los cancelados); lo que no tiene stock no entra.",
    affects: "Nada cambia hasta que ves la diferencia y tocas Aplicar.",
    example: "«Rebaja 10 % lo que no se vendió en 30 días» · «Sube 5 % Abarrotes menos el arroz y redondea a 10 céntimos»",
  },
  {
    id: "lista",
    label: "Lista del proveedor",
    icon: ListChecks,
    what: "Un producto por renglón (o separados por «·»), con su costo al final. Los busco en tu catálogo por nombre, sin IA; la IA solo desempata nombres parecidos.",
    affects: "Cambia el costo y el precio de los que encuentro; tú eliges cuáles.",
    example: "Panetón D'Onofrio 900g 19.50 · Chifles 3.30",
  },
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

  const ayuda = MODOS.find((m) => m.id === modo) ?? MODOS[0];

  // Modo, su ⓘ y «Cambios hechos» en UNA fila dentro del bloque (antes eran
  // una fila de botones afuera + el rótulo «Tu orden» adentro).
  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Cómo cambiar precios" className="inline-flex min-w-0 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            {MODOS.map(({ id, label, icon: Icono }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={modo === id}
                onClick={() => setModo(id)}
                className={`inline-flex h-12 min-w-0 items-center gap-1.5 px-3 text-sm font-semibold transition-colors ${
                  modo === id
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icono className="h-4 w-4 shrink-0" aria-hidden />
                <span className="max-sm:hidden">{label}</span>
                <span className="sm:hidden">{label.split(" ")[0]}</span>
              </button>
            ))}
          </div>
          <InfoTip title={ayuda.label} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} side="bottom" className="shrink-0" />
          <button
            type="button"
            onClick={() => irA("historial")}
            className="ml-auto inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] max-sm:w-12 max-sm:justify-center max-sm:px-0"
            title="Ver los cambios hechos y deshacerlos"
            aria-label="Cambios hechos"
          >
            <History className="h-4 w-4" aria-hidden />
            <span className="max-sm:hidden">Cambios hechos</span>
          </button>
        </div>

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
