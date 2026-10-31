"use client";

import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { ClipboardCheck, Eye, Search, Share2, Star } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import ActionMenu from "@/components/admin/shared/action-menu";
import { AccionesDeLaVista, ORDEN_ACCION, TextoDeAccion, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import FilaDeslizable from "@/components/admin/shared/FilaDeslizable";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { OrdenEsenciales } from "@/lib/documentos/esenciales";
import { getFileIcon } from "../archivo-visual";
import { CAMPO_BUSCAR, SELECT, papeles } from "./compartido";
import InspeccionEsencialesModal from "./InspeccionEsencialesModal";

const ORDENES: { id: OrdenEsenciales; label: string }[] = [
  { id: "uso", label: "Más usadas" },
  { id: "manual", label: "Mi orden" },
  { id: "reciente", label: "Movidas hace poco" },
  { id: "nombre", label: "Por nombre" },
];

/** Fila de pestañas angosta (panel de una carpeta abierto): compartir e inspección van en un menú. */
const ANGOSTO_OCULTO = "@max-[44rem]/riel:hidden";
const ANGOSTO_VISIBLE = "hidden @max-[44rem]/riel:block";

/**
 * Dentro de Documentos: la ⓘ, el buscador, el orden y «Elegir carpetas» van a
 * la fila de las pestañas (Brandon 23-10: «aprovechar mejor el espacio») y
 * acá queda una sola fila con las cifras y lo que más abres. Fuera (sin fila de
 * pestañas), la cabecera de siempre con su título.
 */
export default function CabeceraEsenciales({ cifras, q, setQ, orden, setOrden, botonConTexto, onElegir, destacados, onAbrir, enGrande = false, onCompartir, paraInspeccion }: {
  cifras: { carpetas: number; papeles: number; vencidos: number; porVencer: number };
  q: string;
  setQ: (q: string) => void;
  orden: OrdenEsenciales;
  setOrden: (o: OrdenEsenciales) => void;
  botonConTexto: boolean;
  onElegir: () => void;
  destacados: readonly DbDocument[];
  onAbrir: (doc: DbDocument) => void;
  /** Mirando una carpeta en grande: sin la fila de cifras y «lo que más abres» (la tabla sube). */
  enGrande?: boolean;
  /** «Compartir con un enlace»: todas las esenciales en un solo enlace con vencimiento y clave. */
  onCompartir?: () => void;
  /** «Para inspección» (24-10): hoja con el índice de las esenciales + QR. Sin esto, no sale el botón. */
  paraInspeccion?: { carpetas: readonly DbDocumentFolder[]; folders: readonly DbDocumentFolder[]; docs: readonly DbDocument[] };
}) {
  const enFila = useEnElLibro();
  const hay = cifras.carpetas > 0;
  const [inspeccionando, setInspeccionando] = useState(false);
  // Sólo se pliegan si existe el menú que los junta (si no, compartir desaparecería).
  const plegar = enFila && hay && !!onCompartir && !!paraInspeccion;

  const ayuda = (
    <InfoTip
      title="Esenciales"
      side="bottom"
      what="Las carpetas más valiosas y usadas del negocio, juntas y a mano."
      affects="En el Archivo: clic derecho en una carpeta (o su «⋯») › «Llevar a Esenciales». También con «Elegir carpetas» acá mismo. Arrastra una tarjeta para ordenarlas o suelta archivos encima para subirlos ahí. La carpeta sigue en su lugar del Archivo."
      example="«Licencias y permisos», «Contratos vigentes» y «SUNAT 2026» a un clic, con lo que vence a la vista y aviso en la campana."
    />
  );
  const resumen = hay && (
    <span className="truncate text-sm text-[var(--text-tertiary)]">
      {cifras.carpetas} carpeta{cifras.carpetas === 1 ? "" : "s"} · {papeles(cifras.papeles)}
      {cifras.vencidos > 0 ? ` · ${cifras.vencidos} vencido${cifras.vencidos === 1 ? "" : "s"}` : ""}
      {cifras.porVencer > 0 ? ` · ${cifras.porVencer} por vencer` : ""}
    </span>
  );
  // El buscador no va a la fila de pestañas: a 1280 no entraba con el orden y la
  // estrella, y las pestañas bajaban a otra fila. Va con las cifras, que ya ocupan una.
  const buscador = hay && (
    <div className={cn("relative min-w-0", enFila ? "w-56 max-sm:w-full" : "flex-[1_1_12rem] sm:max-w-[18rem]")}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en Esenciales" placeholder="Buscar carpeta…" className={CAMPO_BUSCAR} />
    </div>
  );
  const ordenar = hay && (
    <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenEsenciales)} aria-label="Ordenar carpetas" className={cn(SELECT, "w-32")}>
      {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
  const elegir = (
    <button
      type="button"
      onClick={onElegir}
      title="Elegir carpetas"
      aria-label="Elegir carpetas"
      className={cn(
        button({ variant: hay ? "secondary" : "primary", size: enFila || botonConTexto ? undefined : "icon" }),
        "gap-2",
        enFila && hay && "@max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0",
      )}
    >
      <Star className="h-4 w-4" />
      {enFila ? (hay ? <TextoDeAccion>Elegir carpetas</TextoDeAccion> : "Elegir carpetas") : botonConTexto && "Elegir carpetas"}
    </button>
  );
  const compartir = hay && onCompartir && (
    <button
      type="button"
      onClick={onCompartir}
      title="Compartir con un enlace"
      aria-label="Compartir tus esenciales con un enlace"
      className={cn(button({ variant: "secondary" }), "gap-2", enFila && "@max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0", plegar && ANGOSTO_OCULTO)}
      data-qa="esenciales-compartir"
    >
      <Share2 className="h-4 w-4" />
      {enFila ? <TextoDeAccion>Compartir</TextoDeAccion> : "Compartir"}
    </button>
  );
  const inspeccion = hay && paraInspeccion && (
    <button
      type="button"
      onClick={() => setInspeccionando(true)}
      title="Hoja para inspección: índice con vencimientos y un QR"
      aria-label="Armar la hoja para inspección"
      className={cn(button({ variant: "secondary" }), "gap-2", enFila && "@max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0", plegar && ANGOSTO_OCULTO)}
      data-qa="esenciales-inspeccion"
    >
      <ClipboardCheck className="h-4 w-4" />
      {enFila ? <TextoDeAccion>Para inspección</TextoDeAccion> : "Para inspección"}
    </button>
  );
  // Con el panel de una carpeta abierto (fila de ~548 px) los dos no entraban
  // y la cabecera de Documentos bajaba a una tercera fila: van juntos en un menú.
  const sacarAfuera = plegar && onCompartir && (
    <div className={ANGOSTO_VISIBLE} data-qa="esenciales-sacar-afuera">
      <ActionMenu
        label="Compartir o armar la hoja para inspección"
        icon={Share2}
        soloIcono
        actions={[
          { id: "enlace", label: "Compartir con un enlace", hint: "Con vencimiento y clave", icon: Share2, onSelect: onCompartir },
          { id: "inspeccion", label: "Hoja para inspección", hint: "Índice con vencimientos y un QR", icon: ClipboardCheck, onSelect: () => setInspeccionando(true) },
        ]}
      />
    </div>
  );
  const modalInspeccion = inspeccionando && paraInspeccion && (
    <InspeccionEsencialesModal {...paraInspeccion} onClose={() => setInspeccionando(false)} />
  );
  // Una fila que se desliza de lado (24-10): con el panel abierto ocupaba dos.
  const masAbierto = destacados.length > 0 && !q && (
    <FilaDeslizable
      className="flex-[1_1_20rem]"
      etiqueta="Lo que más abres"
      qa="esenciales-mas-abiertos"
      rotulo={
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          <Eye className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Lo que más abres</span>
        </span>
      }
    >
      {destacados.map((doc) => {
        const { Icon, tint } = getFileIcon(doc.mimeType, doc.name);
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => onAbrir(doc)}
            title={doc.name}
            className="inline-flex h-12 max-w-[13rem] shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]"
          >
            <Icon className={cn("h-4 w-4 shrink-0", tint)} />
            <span className="truncate">{doc.name}</span>
          </button>
        );
      })}
    </FilaDeslizable>
  );

  if (enFila) {
    return (
      <>
        <AccionesDeLaVista orden={ORDEN_ACCION.info} fueraDelLibro={null}>{ayuda}</AccionesDeLaVista>
        <AccionesDeLaVista orden={ORDEN_ACCION.principal} fueraDelLibro={null}>
          {ordenar}
          {compartir}
          {inspeccion}
          {sacarAfuera}
          {elegir}
        </AccionesDeLaVista>
        {hay && !enGrande && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {buscador}
            {resumen}
            {masAbierto}
          </div>
        )}
        {modalInspeccion}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap">Esenciales</SectionTitle>
          {ayuda}
          {resumen}
        </div>
        {buscador}
        {ordenar}
        {compartir}
        {inspeccion}
        {elegir}
      </div>
      {masAbierto}
      {modalInspeccion}
    </>
  );
}
