"use client";

/**
 * Una fila de «Para atender ahora» por ACCIÓN (M08): «Cobrar 3», «Reponer 5».
 * Dice qué la originó, cómo se resuelve, a quién le toca y desde cuándo, y
 * lleva al lugar (o al registro, si es uno solo). Sin enlace cuando este rol
 * no ve esa pestaña: el aviso se ve igual, pero no se ofrece un camino cerrado.
 * Se dibuja con `FilaAhora` (18-10), igual que las alertas sueltas.
 */
import type { ElementType } from "react";
import {
  Banknote,
  Calculator,
  CalendarClock,
  FileText,
  HandCoins,
  PackagePlus,
  Receipt,
  Truck,
} from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import type { AccionId } from "./acciones-de-avisos";
import FilaAhora from "./FilaAhora";
import { cuandoFue } from "./notificaciones-categorias";
import type { GrupoConEnlace } from "./use-acciones-de-avisos";

const ICONOS: Record<AccionId, ElementType> = {
  caja: Calculator,
  cobrar: HandCoins,
  pagar: Banknote,
  comprobantes: Receipt,
  documentos: FileText,
  reponer: PackagePlus,
  vencen: CalendarClock,
  pedidos: Truck,
};

function cuando(fecha: GrupoConEnlace["fecha"]): string {
  if (!fecha) return "hoy";
  const txt = cuandoFue(fecha.iso);
  if (!txt) return "hoy";
  if (fecha.es === "ultimo") return `último aviso ${txt}`;
  return txt.startsWith("hace") ? `pendiente ${txt}` : `pendiente desde ${txt}`;
}

export function FilaAccion({ grupo, onNavegar }: { grupo: GrupoConEnlace; onNavegar: () => void }) {
  const { urgente, href } = grupo;
  return (
    <FilaAhora
      qa={`accion-${grupo.id}`}
      icono={ICONOS[grupo.id]}
      urgente={urgente}
      titulo={grupo.rotulo}
      detalle={grupo.detalle.join(" · ") || undefined}
      meta={`${grupo.quien} · ${cuando(grupo.fecha)}`}
      ayuda={grupo.como}
      accion={
        href
          ? {
              label: grupo.registro ? "Abrir" : "Resolver",
              onClick: () => {
                irAEnlace(href);
                onNavegar();
              },
            }
          : undefined
      }
    />
  );
}
