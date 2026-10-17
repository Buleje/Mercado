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

/**
 * Una línea a la vista, EN el riel de las sub-pestañas (a la derecha); el
 * detalle, en el ⓘ (ley de la vista). Cortas a propósito (≤ 36 letras): al
 * lado de las cuatro pestañas entran a 1280 px con el menú lateral abierto.
 */
const PROPOSITO: Record<SubComandos, { linea: string; what: string; affects: string; example: string }> = {
  papel: {
    linea: "Lee tu papel y te dice dónde va.",
    what: "Lee facturas, capturas de Yape y listas de precios. Primero lee en tu navegador, sin costo; la IA solo entra si hace falta.",
    affects: "Nada se guarda hasta que revisas y confirmas.",
    example: "Foto de una factura de S/ 90 → «registrar la compra» con sus productos.",
  },
  precios: {
    linea: "Muchos precios con una frase.",
    what: "Cambia precios o costos de muchos productos a la vez: con una orden o pegando la lista del proveedor.",
    affects: "Se guarda en tu catálogo con historial de precios y se puede deshacer.",
    example: "«Sube 5 % todo Abarrotes» → ves los 10 precios, antes y después.",
  },
  mensajes: {
    linea: "A quién escribirle hoy, ya redactado.",
    what: "Fiados por vencer, clientes que dejaron de venir y seguimientos pendientes.",
    affects: "No envía nada solo: copias o abres WhatsApp tú.",
    example: "Rosa debe S/ 45 hace 12 días → mensaje amable listo para enviar.",
  },
  historial: {
    linea: "Lo que la IA guardó por ti.",
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

  // El propósito sube al riel (antes era una fila propia entre las pestañas y
  // el contenido). Angosto: sólo el ⓘ; la línea vuelve desde 56rem de riel.
  const enElRiel = (
    <span className="flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
      <span className="hidden max-w-[18rem] truncate @min-[56rem]:inline">{proposito.linea}</span>
      <InfoTip
        title={PESTANAS.find((p) => p.id === vista)?.label}
        what={`${proposito.linea} ${proposito.what}`}
        affects={proposito.affects}
        example={proposito.example}
        side="bottom"
      />
    </span>
  );

  return (
    <div ref={raizRef}>
      {/* El medidor de IA del mes (`<ConsumoIA compacto />`, con su aviso «Se
          acabó el tope») lo monta el hub «Asistente IA», uno solo para Chat,
          Comandos y Automatizaciones; en «Lo que hizo la IA» se esconde porque
          Indicadores ya trae la tarjeta del mes. */}
      <AdminTabBar
        tabs={PESTANAS}
        activeTab={vista}
        onTabChange={(id) => irA(id as SubComandos)}
        moduleId={MODULE_ID}
        draggable={false}
        rightSlot={enElRiel}
      >
        <div className="pt-3">
          {vista === "papel" && <LeerPapel irA={irA} />}
          {vista === "precios" && <PreciosEnBloque irA={irA} />}
          {vista === "mensajes" && <AQuienEscribir irA={irA} />}
          {vista === "historial" && <LoQueHizoLaIA irA={irA} />}
        </div>
      </AdminTabBar>
    </div>
  );
}
