"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { MessageSquare } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useAltoDelChat } from "@/components/admin/chat-ia/use-alto-del-chat";

// ChatIAClean consume /api/ai-assistant por SSE. Va sin SSR: el historial y el
// tono viven en localStorage.
const ChatIAClean = dynamic(() => import("@/components/admin/chat-ia/ChatIAClean"), {
  ssr: false,
  loading: S,
});

/**
 * Chat IA: la conversación con el asistente, en una tarjeta de alto fijo que se
 * puede llevar a pantalla completa.
 *
 * Lo que tenía arriba se fue (Brandon 2026-10-10, «cada pestaña cumple su tarea,
 * sin repetir»): la franja «Asistente Ejecutivo IA» repetía el título del hub, el
 * contador «Consultas · Gratis 0 de 100» lo contaba el navegador (el consumo
 * real lo muestra el hub) y de los cinco ajustes sólo el tono llegaba al
 * servidor — ese quedó en la fila de arriba del chat.
 */
export default function ChatIAModule() {
  const [maximizado, setMaximizado] = useState(false);
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const salir = useCallback(() => setMaximizado(false), []);
  const alternar = useCallback(() => setMaximizado((m) => !m), []);

  // Pantalla completa = diálogo: Tab atrapado, Escape sale, scroll de atrás
  // bloqueado y el foco vuelve al botón que la abrió.
  useModalAccesible(cajaRef, { onCerrar: salir, activo: maximizado });
  const alto = useAltoDelChat(cajaRef, !maximizado);

  return (
    <div className="space-y-4">
      {/* Anidado en el hub no se dibuja (el hub ya dice «Asistente IA»); suelto
          es la identidad del módulo. */}
      {!maximizado && (
        <AdminModuleHeader
          title="Chat IA"
          description="Pregúntale por tu negocio o díctale lo que quieres anotar."
          icon={MessageSquare}
        />
      )}
      <div
        ref={cajaRef}
        role={maximizado ? "dialog" : undefined}
        aria-modal={maximizado ? true : undefined}
        aria-label={maximizado ? "Chat IA en pantalla completa" : undefined}
        tabIndex={maximizado ? -1 : undefined}
        style={alto ? { height: alto } : undefined}
        className={cn(
          "flex flex-col overflow-hidden bg-[var(--surface-raised)]",
          maximizado
            ? "fixed inset-0 z-modal-3"
            : // El alto lo mide `useAltoDelChat`; el `calc` es sólo el del primer
              // pintado.
              "h-[calc(100dvh-260px)] min-h-[420px] rounded-xl border border-[var(--rule-base)] sm:h-[calc(100dvh-220px)] sm:min-h-[480px]",
        )}
      >
        <ChatIAClean maximizado={maximizado} onMaximizar={alternar} />
      </div>
    </div>
  );
}
