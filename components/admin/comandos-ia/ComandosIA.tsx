"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ScanText, Tags, MessageCircle, History } from "@buleje/design-system/icons";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar, { type AdminTab } from "@/components/admin/shared/AdminTabBar";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

/*
 * Comandos IA (Brandon 2026-10-09): lo que la IA HACE por el dueño, no
 * reportes. Antes eran 4 secciones (Resumen, Acciones, Análisis, Fiados) que
 * repetían Inicio y Analítica; la lista de fiados se mudó a Analítica ›
 * Clientes › Fiados › Quién te debe (components/admin/fiados/FiadosRiesgoIA.tsx).
 *
 * Cada sub-vista es de su propio carril y recibe `irA` para mandar al dueño a
 * otra (p. ej. «Lee un papel» detecta una lista de precios y salta a
 * «Precios en bloque» con la lista en sessionStorage).
 */

const ConsumoIA = dynamic(() => import("@/components/admin/comandos-ia/ConsumoIA"), { loading: () => null });
const LeerPapel = dynamic(() => import("@/components/admin/comandos-ia/papel/LeerPapel"), { loading: S });
const PreciosEnBloque = dynamic(() => import("@/components/admin/comandos-ia/precios/PreciosEnBloque"), { loading: S });
const AQuienEscribir = dynamic(() => import("@/components/admin/comandos-ia/mensajes/AQuienEscribir"), { loading: S });
const LoQueHizoLaIA = dynamic(() => import("@/components/admin/comandos-ia/historial/LoQueHizoLaIA"), { loading: S });

const SUBS = ["papel", "precios", "mensajes", "historial"] as const;
type SubComandos = (typeof SUBS)[number];

const MODULE_ID = "comandos-ia";

const PESTANAS: AdminTab[] = [
  { id: "papel", label: "Lee un papel", icon: ScanText },
  { id: "precios", label: "Precios en bloque", icon: Tags },
  { id: "mensajes", label: "A quién escribir", icon: MessageCircle },
  { id: "historial", label: "Lo que hizo la IA", icon: History },
];

/** Una línea a la vista; el detalle, en el ⓘ (ley de la vista). */
const PROPOSITO: Record<SubComandos, { linea: string; what: string; affects: string; example: string }> = {
  papel: {
    linea: "La IA lee tu papel y te propone dónde guardarlo.",
    what: "Lee facturas, capturas de Yape y listas de precios. Primero lee en tu navegador, sin costo; la IA solo entra si hace falta.",
    affects: "Nada se guarda hasta que revisas y confirmas.",
    example: "Foto de una factura de S/ 90 → «registrar la compra» con sus productos.",
  },
  precios: {
    linea: "Cambia muchos precios con una frase; ves cada cambio antes de guardar.",
    what: "Cambia precios o costos de muchos productos a la vez: con una orden o pegando la lista del proveedor.",
    affects: "Se guarda en tu catálogo con historial de precios y se puede deshacer.",
    example: "«Sube 5 % todo Abarrotes» → ves los 10 precios, antes y después.",
  },
  mensajes: {
    linea: "A quién conviene escribirle hoy, con el mensaje ya redactado.",
    what: "Fiados por vencer, clientes que dejaron de venir y seguimientos pendientes.",
    affects: "No envía nada solo: copias o abres WhatsApp tú.",
    example: "Rosa debe S/ 45 hace 12 días → mensaje amable listo para enviar.",
  },
  historial: {
    linea: "Lo que la IA guardó por ti, quién lo pidió y cuánto costó.",
    what: "Recibos de cada acción y las que esperan tu OK.",
    affects: "Los cambios de precios se pueden deshacer desde aquí.",
    example: "Hoy 10:42 · Subiste 5 % Abarrotes (10 precios) · [Deshacer]",
  },
};

export default function ComandosIA() {
  const { vista, irA } = useSubvistaModulo<SubComandos>(MODULE_ID, SUBS, "papel");
  const proposito = PROPOSITO[vista];
  const raizRef = useRef<HTMLDivElement>(null);

  // A 400 px el riel se desliza y la pestaña recordada («Lo que hizo la IA»)
  // quedaba fuera de vista: se centra en el riel, sin mover la página.
  useEffect(() => {
    const tab = raizRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const riel = tab?.parentElement;
    if (!tab || !riel || riel.scrollWidth <= riel.clientWidth) return;
    const t = tab.getBoundingClientRect();
    const r = riel.getBoundingClientRect();
    riel.scrollBy({ left: t.left - r.left - (r.width - t.width) / 2 });
  }, [vista]);

  return (
    <div ref={raizRef}>
      {/* Los dos rieles (hub y Comandos) van pegados: la franja del consumo ya
          no los separa. Va en la misma fila que la línea de la pestaña, a la
          derecha, ANTES del botón que gasta. */}
      <AdminTabBar
        tabs={PESTANAS}
        activeTab={vista}
        onTabChange={(id) => irA(id as SubComandos)}
        moduleId={MODULE_ID}
        draggable={false}
      >
        <div className="space-y-4 pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* En línea (no flex): a 400 px el ⓘ queda pegado a la última
                palabra, no colgado en el borde derecho. */}
            <p className="min-w-0 flex-1 basis-64 text-sm text-[var(--text-secondary)]">
              {proposito.linea}{" "}
              <InfoTip
                title={PESTANAS.find((p) => p.id === vista)?.label}
                what={proposito.what}
                affects={proposito.affects}
                example={proposito.example}
                side="bottom"
                className="-mt-0.5"
              />
            </p>
            {/* En «Lo que hizo la IA» ya está el medidor grande; sin permiso
                ConsumoIA no pinta nada (`empty:hidden` evita el hueco). */}
            {vista !== "historial" && (
              <div className="w-full empty:hidden sm:ml-auto sm:w-auto">
                <ConsumoIA compacto />
              </div>
            )}
          </div>

          {vista === "papel" && <LeerPapel irA={irA} />}
          {vista === "precios" && <PreciosEnBloque irA={irA} />}
          {vista === "mensajes" && <AQuienEscribir irA={irA} />}
          {vista === "historial" && <LoQueHizoLaIA irA={irA} />}
        </div>
      </AdminTabBar>
    </div>
  );
}
