"use client";

/**
 * LothGtfView — Guías de Transporte Forestal (GTF) del Libro TH, ADR-126 Fase 4.
 * Interna, no oficial (la GTF oficial se emite vía SNIFFS).
 *
 * Tres pestañas en `?sub=` (compactación 17-10, Brandon: «compactar el Libro
 * TH» como el CTP), recordadas como las del resto del libro:
 *  · «Guías» — las vigentes (`LothGtfGuias`);
 *  · «Anuladas y otras» — las dadas de baja, sólo para consulta;
 *  · «Por imprimir» — la cola del monte (`LothColaMonte`), que era la vista
 *    `?vista=monte`. Ese enlace (el del WhatsApp, con `&trabajo=`) abre esta
 *    pestaña y sigue resaltando su guía.
 * En «Por imprimir» no se piden las guías: es la pantalla del celular del monte.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Ban, FileText, Printer } from "@buleje/design-system/icons";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import { useGtfBuscadaEnUrl } from "./hooks/use-gtf-buscada-en-url";
import { SUBS_GTF, type SubGtf } from "./loth-vistas-fusionadas";
import LothGtfGuias, { type LothGtfGuiasProps } from "./LothGtfGuias";

/* La cola del monte, sólo cuando se abre (como cuando era una vista aparte). */
const LothColaMonte = dynamic(() => import("./LothColaMonte"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center">
      <LoadingSpinner size={32} />
    </div>
  ),
});

const PESTANAS: readonly PestanaDeVista<SubGtf>[] = [
  { id: "guias", label: "Guías", icon: FileText, hint: "Las guías vigentes del libro, con sus papeles y su ingreso al Libro CTP" },
  { id: "bajas", label: "Anuladas y otras", icon: Ban, hint: "Las guías anuladas y las eliminadas, sólo para consulta" },
  { id: "monte", label: "Por imprimir", icon: Printer, hint: "Las guías que la oficina manda al monte para imprimirlas en la matricial" },
];

/** Un `?vista=monte` viejo (el enlace del WhatsApp del monte) abre «Por imprimir». */
function subPorVistaVieja(): SubGtf | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("vista") === "monte" ? "monte" : undefined;
}

export default function LothGtfView({
  pedido = null,
  ...propios
}: LothGtfGuiasProps & {
  /** Una pestaña pedida desde el libro estando YA en GTF (ver `usePestanaInterna`). */
  pedido?: { sub: string; n: number } | null;
} = {}) {
  /* ⌘K: `?gtf=` ubica la guía en la lista (el mismo foco que «Por árbol»). */
  const buscada = useGtfBuscadaEnUrl(propios.focusGtf, propios.onFocusHandled);
  const props = { ...propios, ...buscada };
  const [forzada] = useState(subPorVistaVieja);
  /* Cuántas vigentes y cuántas bajas: las cuenta la lista y se dicen en la pestaña. */
  const [cuentas, setCuentas] = useState<{ guias: number; bajas: number } | null>(null);
  const { sub, irA } = usePestanaInterna<SubGtf>({
    moduleId: "loth-gtf",
    validas: SUBS_GTF,
    porDefecto: "guias",
    forzada,
    pedido,
  });
  /* Se llega buscando una guía (desde «Por árbol»): la cola del monte no la muestra. */
  const { focusGtf } = props;
  useEffect(() => {
    if (focusGtf && sub === "monte") irA("guias");
  }, [focusGtf, sub, irA]);

  return (
    <PestanasDeVista
      prefijo="loth-gtf"
      etiqueta="Guías vigentes, dadas de baja o por imprimir"
      items={PESTANAS.map((p) => (p.id === "monte" ? p : { ...p, cuenta: cuentas?.[p.id] ?? null }))}
      activa={sub}
      onCambiar={irA}
    >
      {sub === "monte" ? <LothColaMonte /> : <LothGtfGuias {...props} seccion={sub} onSeccion={irA} onCuentas={setCuentas} />}
    </PestanasDeVista>
  );
}
