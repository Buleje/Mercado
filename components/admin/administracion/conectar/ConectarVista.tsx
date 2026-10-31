"use client";

/**
 * ConectarVista — ver la agenda fuera del panel (ADR-501 §5): el enlace de
 * calendario para Google/Outlook/iPhone, la cuenta de Google conectada y, para
 * Telegram o n8n, el enlace a Automatizaciones (allí se configuran; no se
 * duplican acá).
 */
import type { MouseEvent } from "react";
import { ArrowUpRight, Bot } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { TARJETA } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { EncabezadoAgenda } from "../comun/EncabezadoAgenda";
import { ConexionGoogle } from "./ConexionGoogle";
import { FeedsIcs } from "./FeedsIcs";

const HREF_AUTOMATIZACIONES = "/admin?tab=asistente-ia&vista=automatizaciones";

const AYUDA = {
  what: "Para ver tu agenda en el celular o en el calendario que ya usas, sin entrar al panel.",
  affects: "El enlace de calendario sirve para Google, Outlook y el iPhone, pero Google lo actualiza cuando quiere (horas, a veces un día). Conectando tu cuenta de Google se copia al instante.",
  example: "Telegram y n8n se conectan en Asistente IA › Automatizaciones; después eliges en cada actividad si avisa por ahí.",
};

function irSinRecargar(e: MouseEvent<HTMLAnchorElement>) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  void irAEnlace(HREF_AUTOMATIZACIONES);
}

export default function ConectarVista() {
  return (
    <div className="space-y-4">
      <EncabezadoAgenda titulo="Conectar" ayuda={AYUDA} />
      <ConexionGoogle />
      <FeedsIcs />
      <section className={cn(TARJETA, "flex flex-wrap items-center gap-3 px-4 py-3")} aria-label="Telegram y n8n">
        <Bot className="size-5 text-[var(--text-secondary)]" aria-hidden="true" />
        <div className="min-w-0 flex-[1_1_14rem]">
          <CardTitle>Telegram y n8n</CardTitle>
          <span className="block text-sm text-[var(--text-tertiary)]">Se conectan en Automatizaciones</span>
        </div>
        <a href={HREF_AUTOMATIZACIONES} onClick={irSinRecargar} className={button({ variant: "secondary" })}>
          Ir a Automatizaciones
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
