"use client";

import { SectionTitle } from "@buleje/design-system";
import { Eye, Search, Share2, Star } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { AccionesDeLaVista, ORDEN_ACCION, TextoDeAccion, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import type { OrdenEsenciales } from "@/lib/documentos/esenciales";
import { getFileIcon } from "../archivo-visual";
import { CAMPO_BUSCAR, SELECT, papeles } from "./compartido";

const ORDENES: { id: OrdenEsenciales; label: string }[] = [
  { id: "uso", label: "Más usadas" },
  { id: "manual", label: "Mi orden" },
  { id: "reciente", label: "Movidas hace poco" },
  { id: "nombre", label: "Por nombre" },
];

/**
 * Dentro de Documentos: la ⓘ, el buscador, el orden y «Elegir carpetas» van a
 * la fila de las pestañas (Brandon 23-10: «aprovechar mejor el espacio») y
 * acá queda una sola fila con las cifras y lo que más abres. Fuera (sin fila de
 * pestañas), la cabecera de siempre con su título.
 */
export default function CabeceraEsenciales({ cifras, q, setQ, orden, setOrden, botonConTexto, onElegir, destacados, onAbrir, enGrande = false, onCompartir }: {
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
}) {
  const enFila = useEnElLibro();
  const hay = cifras.carpetas > 0;

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
      className={cn(button({ variant: "secondary" }), "gap-2", enFila && "@max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0")}
      data-qa="esenciales-compartir"
    >
      <Share2 className="h-4 w-4" />
      {enFila ? <TextoDeAccion>Compartir</TextoDeAccion> : "Compartir"}
    </button>
  );
  const masAbierto = destacados.length > 0 && !q && (
    <div className="flex flex-wrap items-center gap-2" aria-label="Lo que más abres">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        <Eye className="h-4 w-4" /> Lo que más abres
      </span>
      {destacados.map((doc) => {
        const { Icon, tint } = getFileIcon(doc.mimeType, doc.name);
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => onAbrir(doc)}
            className="inline-flex h-10 max-w-[13rem] items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]"
          >
            <Icon className={cn("h-4 w-4 shrink-0", tint)} />
            <span className="truncate">{doc.name}</span>
          </button>
        );
      })}
    </div>
  );

  if (enFila) {
    return (
      <>
        <AccionesDeLaVista orden={ORDEN_ACCION.info} fueraDelLibro={null}>{ayuda}</AccionesDeLaVista>
        <AccionesDeLaVista orden={ORDEN_ACCION.principal} fueraDelLibro={null}>
          {ordenar}
          {compartir}
          {elegir}
        </AccionesDeLaVista>
        {hay && !enGrande && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {buscador}
            {resumen}
            {masAbierto}
          </div>
        )}
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
        {elegir}
      </div>
      {masAbierto}
    </>
  );
}
