"use client";

/**
 * El chat de Buleje IA: mensajes, «pensando…», estado vacío con ejemplos y el
 * compositor. Los mensajes nuevos se anuncian (`aria-live`) para quien usa
 * lector de pantalla.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Trash2 } from "@buleje/design-system/icons";
import { ErrorAlert } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { useConfirm } from "@/components/ui-system/ConfirmModal";
import { useBulejeIaChat } from "@/hooks/use-buleje-ia-chat";
import type { BulejeIaConversaciones } from "@/hooks/use-buleje-ia-conversaciones";
import type { BulejeIaModelos } from "@/hooks/use-buleje-ia-modelos";
import { AvisoModelo } from "./AvisoModelo";
import { CompositorIa } from "./CompositorIa";
import { EstadoVacioChat } from "./EstadoVacioChat";
import { MensajeIa } from "./MensajeIa";
import { RenombrarConversacion } from "./RenombrarConversacion";

export function VistaChat({
  conversacionId,
  alCrear,
  alCambiar,
  conversaciones,
  modelos,
  onIrAModelos,
  onBorrada,
}: {
  conversacionId: string | null;
  alCrear: (id: string) => void;
  alCambiar: () => void;
  conversaciones: BulejeIaConversaciones;
  modelos: BulejeIaModelos;
  onIrAModelos: () => void;
  onBorrada: () => void;
}) {
  const chat = useBulejeIaChat({ conversacionId, alCrear, alCambiar });
  const [borrador, setBorrador] = useState<string | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const finRef = useRef<HTMLDivElement>(null);

  // Al llegar un mensaje (o el «pensando…»), baja al final.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [chat.mensajes.length, chat.pensando]);

  const actual = conversaciones.items.find((c) => c.id === conversacionId);
  const borrar = async () => {
    if (!conversacionId) return;
    const ok = await confirm({
      title: "¿Borrar esta conversación?",
      description: "Se borran los mensajes de esta charla. Lo que ya quedó anotado en el negocio no se toca.",
      intent: "danger",
      confirmLabel: "Borrar",
    });
    if (!ok) return;
    const r = await conversaciones.borrar(conversacionId);
    if (r.ok) onBorrada();
    else setErrorAccion(r.error);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2 md:px-5">
        <AvisoModelo modelos={modelos} onIrAModelos={onIrAModelos} />
        {conversacionId && (
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Cambiar el nombre de la conversación" onClick={() => setRenombrando(true)}>
              <Pencil className="h-5 w-5" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Borrar la conversación" onClick={borrar}>
              <Trash2 className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        )}
      </div>
      {errorAccion && (
        <div className="px-3 pt-2 md:px-5">
          <ErrorAlert description={errorAccion} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
        <div className="mx-auto w-full max-w-3xl space-y-4" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensajes">
          {chat.cargando ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Abriendo la conversación…
            </p>
          ) : chat.errorCarga ? (
            <ErrorAlert
              title="No pude abrir la conversación"
              description={chat.errorCarga}
              action={
                <Button variant="secondary" onClick={chat.recargar}>
                  Reintentar
                </Button>
              }
            />
          ) : chat.mensajes.length === 0 ? (
            <EstadoVacioChat onElegir={(t) => setBorrador(t)} />
          ) : (
            chat.mensajes.map((m) => (
              <MensajeIa
                key={m.id}
                mensaje={m}
                resueltas={chat.resueltas}
                onResolver={chat.resolver}
                onReintentar={chat.reintentar}
                onDescartar={chat.descartar}
              />
            ))
          )}
          {chat.pensando && (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Pensando…
            </p>
          )}
          <div ref={finRef} />
        </div>
      </div>

      <CompositorIa
        ocupado={chat.pensando}
        leeFotos={modelos.principalLeeFotos}
        borrador={borrador}
        onBorradorUsado={() => setBorrador(null)}
        onEnviar={chat.enviar}
      />

      {renombrando && conversacionId && (
        <RenombrarConversacion
          tituloActual={actual?.titulo ?? ""}
          onCerrar={() => setRenombrando(false)}
          onGuardar={(t) => conversaciones.renombrar(conversacionId, t)}
        />
      )}
      <ConfirmDialog />
    </div>
  );
}
