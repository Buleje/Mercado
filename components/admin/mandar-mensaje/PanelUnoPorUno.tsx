"use client";

/**
 * Mandar mensaje › «Uno por uno (WhatsApp)»: la lista de a quiénes les llega,
 * cada uno con «Abrir» (su WhatsApp con el mensaje ya escrito: lo mandas tú) y,
 * en la fila del título, copiar todos los mensajes o sólo los números. Es lo
 * que era Clientes › Mensajes masivos; ahora además cuenta qué chats abriste.
 */
import { useCallback, useState } from "react";
import { CheckCheck, Copy, MoreHorizontal, Phone } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { logger } from "@/lib/logger";
import { ListaDestinatarios } from "@/components/admin/mensajes-masivos/ListaDestinatarios";
import { aplicarPlantilla, numeroWhatsApp, soloDigitos, type Destinatario } from "@/components/admin/mensajes-masivos/shared";
import type { EstadoRegistro } from "./use-registro-uno-por-uno";

const DEL_REGISTRO: Record<EstadoRegistro, string | null> = {
  "sin-abrir": null,
  anotando: "anotando…",
  anotado: "queda en «Lo que ya mandaste»",
  "sin-anotar": "no se pudo anotar: se reintenta con el próximo",
};

export function PanelUnoPorUno({
  destinatarios,
  plantilla,
  abiertos,
  onAbrir,
  estado,
  anota,
}: {
  destinatarios: Destinatario[];
  plantilla: string;
  abiertos: ReadonlySet<string>;
  onAbrir: (telefono: string) => void;
  estado: EstadoRegistro;
  /** Si lo abierto queda anotado (quien no ve «Automático» no tiene historial). */
  anota: boolean;
}) {
  const [copiado, setCopiado] = useState<"mensajes" | "numeros" | null>(null);
  const conNumero = destinatarios.filter((c) => soloDigitos(c.phone));
  const n = conNumero.length;
  const puedeCopiar = n > 0 && plantilla.trim().length > 0;

  const copiar = useCallback(
    async (que: "mensajes" | "numeros") => {
      const lineas = conNumero.map((c) =>
        que === "mensajes" ? `${c.name} | +${numeroWhatsApp(c.phone)} | ${aplicarPlantilla(plantilla, c)}` : `+${numeroWhatsApp(c.phone)}`,
      );
      try {
        await navigator.clipboard.writeText(lineas.join("\n"));
        setCopiado(que);
        setTimeout(() => setCopiado(null), 3000);
      } catch (err) {
        logger.warn("[MandarMensaje] no se pudo copiar", { error: String(err) });
      }
    },
    [conNumero, plantilla],
  );

  const acciones: MenuAccion[] = [
    {
      id: "numeros",
      label: copiado === "numeros" ? "Números copiados" : "Copiar solo los números",
      hint: "Un número por línea, con +51",
      icon: Phone,
      onSelect: () => void copiar("numeros"),
      disabled: n === 0,
    },
  ];
  const abiertosAca = conNumero.filter((c) => abiertos.has(c.phone)).length;
  const delRegistro = anota ? DEL_REGISTRO[estado] : null;

  return (
    <ListaDestinatarios
      destinatarios={destinatarios}
      plantilla={plantilla}
      abiertos={abiertos}
      onAbrir={onAbrir}
      acciones={
        <>
          {abiertos.size > 0 && (
            <p role="status" className="text-sm text-[var(--text-secondary)]">
              Abriste <strong className="text-[var(--text-primary)]">{abiertosAca}</strong> de {n}
              {delRegistro && <span> · {delRegistro}</span>}
            </p>
          )}
          <button
            type="button"
            onClick={() => void copiar("mensajes")}
            disabled={!puedeCopiar}
            className={button({ variant: "primary", className: "h-12 shrink-0 gap-1.5 rounded-xl px-4 disabled:opacity-60" })}
          >
            {copiado === "mensajes" ? <CheckCheck className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copiado === "mensajes" ? "Lista copiada" : `Copiar ${n} ${n === 1 ? "mensaje" : "mensajes"}`}
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Copiar solo los números" />
        </>
      }
    />
  );
}
