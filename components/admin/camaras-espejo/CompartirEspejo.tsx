"use client";

/**
 * El interruptor «Que también lo vean otros equipos» del Espejo del celular
 * (24-10). La lógica vive en `hooks/use-compartir-espejo.ts`.
 */

import { Interruptor } from "@/components/ui-system/Interruptor";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CompartirEspejo as Compartir } from "@/hooks/use-compartir-espejo";

function linea(c: Compartir): string {
  if (c.estado === "enviando")
    return "Lo ves con tu usuario en tus otros equipos · 1 cuadro cada 1,5 s";
  if (c.estado === "otro_equipo")
    return "Otra pestaña tuya ya lo comparte: entra apenas esa se apague";
  if (c.estado === "error") return c.error ?? "No se pudo compartir.";
  return "Apagado: sólo se ve en esta PC";
}

export default function CompartirEspejo({ c }: { c: Compartir }) {
  return (
    <div className="flex items-center gap-2" data-testid="espejo-compartir" data-estado={c.estado}>
      <Interruptor
        className="min-w-0 flex-1"
        enabled={c.prendido}
        onChange={c.cambiar}
        label="Que también lo vean otros equipos"
        desc={linea(c)}
      />
      <InfoTip
        title="Verlo desde otro equipo"
        side="top"
        what="En la tablet u otra PC, entra al panel con TU usuario y abre Cámaras › Espejo del celular: ahí aparece, 1 cuadro cada 1,5 s."
        affects="Sólo tu usuario lo ve. No se guardan fotos ni pasan por la IA: el servidor tiene sólo el último cuadro por 10 s. Se apaga solo al detener el espejo o cerrar esta pestaña."
        example="Del celular puede salir WhatsApp o el banco: apágalo antes de abrirlos."
      />
    </div>
  );
}
