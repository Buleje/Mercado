"use client";

/**
 * Buleje IA (ADR-528): la app a pantalla completa. Barra a la izquierda en PC,
 * cajón en el celular; la vista y la conversación abierta viven en la URL
 * (`?vista=` y `?c=`) para que «atrás» y un enlace compartido funcionen.
 */
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useBulejeIaConversaciones } from "@/hooks/use-buleje-ia-conversaciones";
import { useBulejeIaModelos } from "@/hooks/use-buleje-ia-modelos";
import { BarraLateral } from "./BarraLateral";
import { VistaChat } from "./VistaChat";
import { VistaModelos } from "./VistaModelos";
import { VistaMemoria } from "./VistaMemoria";
import { VistaConectar } from "./VistaConectar";
import { TITULO_VISTA, leerVista, urlDeVista, type VistaIa } from "./vistas";

export default function BulejeIaApp() {
  const router = useRouter();
  const params = useSearchParams();
  const vista = leerVista(params.get("vista"));
  const conversacionId = vista === "chat" ? params.get("c") : null;
  const [cajon, setCajon] = useState(false);

  const conversaciones = useBulejeIaConversaciones();
  const modelos = useBulejeIaModelos();

  const ir = useCallback(
    (v: VistaIa, c?: string | null, reemplazar = false) => {
      const url = urlDeVista(v, c);
      if (reemplazar) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
      setCajon(false);
    },
    [router],
  );
  // La primera respuesta trae el id: se REEMPLAZA la URL (atrás no vuelve a un chat vacío).
  const alCrear = useCallback((id: string) => ir("chat", id, true), [ir]);

  const titulo =
    vista === "chat" && conversacionId
      ? conversaciones.items.find((c) => c.id === conversacionId)?.titulo || TITULO_VISTA.chat
      : TITULO_VISTA[vista];

  const barra = (
    <BarraLateral
      vista={vista}
      conversacionId={conversacionId}
      conversaciones={conversaciones}
      onNueva={() => ir("chat", null)}
      onAbrir={(id) => ir("chat", id)}
      onVista={(v) => ir(v)}
    />
  );

  return (
    <div className="flex h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <aside className="hidden w-72 shrink-0 border-r border-[var(--rule-soft)] bg-[var(--surface-raised)] md:block">{barra}</aside>

      <AdminModal open={cajon} onClose={() => setCajon(false)} variant="side" title="Buleje IA">
        <div className="h-full">{barra}</div>
      </AdminModal>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 md:px-5">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir el menú" onClick={() => setCajon(true)}>
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
          <PageTitle className="min-w-0 flex-1 truncate text-[length:var(--ts-lg)] sm:text-[length:var(--ts-xl)]">{titulo}</PageTitle>
        </header>

        <main id="main-content" className="flex min-h-0 flex-1 flex-col">
          {vista === "chat" && (
            <VistaChat
              conversacionId={conversacionId}
              alCrear={alCrear}
              alCambiar={conversaciones.recargar}
              conversaciones={conversaciones}
              modelos={modelos}
              onIrAModelos={() => ir("modelos")}
              onBorrada={() => ir("chat", null, true)}
            />
          )}
          {vista === "modelos" && <VistaModelos modelos={modelos} />}
          {vista === "memoria" && <VistaMemoria />}
          {vista === "conectar" && <VistaConectar />}
        </main>
      </div>
    </div>
  );
}
