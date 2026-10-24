"use client";

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowLeft, Download, FileArchive, LayoutGrid, List, MessageCircle, Search } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import {
  TIPO_TERCERO_LABEL, conSubcarpetas, ordenarDocsTercero,
  type OrdenDocsTercero, type TerceroVinculado,
} from "@/lib/documentos/terceros-vinculo";
import type { ModeloArchivo } from "../archivo/use-archivo";
import PapelesDeCarpeta, { type GrupoDeCarpeta } from "./PapelesDeCarpeta";
import { CAMPO_BUSCAR, ICONO_TERCERO } from "./compartido";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Busca en el nombre, el nombre original, las etiquetas y el texto leído (OCR). */
function coincide(doc: DbDocument, aguja: string): boolean {
  if (!aguja) return true;
  return sinTildes([doc.name, doc.originalName, (doc.tags ?? []).join(" "), (doc.aiTags ?? []).join(" "), doc.ocrText].filter(Boolean).join(" ")).includes(aguja);
}

const ORDENES: { id: OrdenDocsTercero; label: string }[] = [
  { id: "fecha", label: "Lo último primero" },
  { id: "nombre", label: "Por nombre" },
  { id: "vencimiento", label: "Lo que vence antes" },
];

export default function DetalleTercero({ tercero, arch, onVolver }: {
  tercero: TerceroVinculado;
  arch: ModeloArchivo;
  /** Sólo en una columna (celular o vista angosta): vuelve a la lista. */
  onVolver?: () => void;
}) {
  const { folders, documents, folderById, setExpediente, setWhatsappDoc, zipAndDownload } = arch;
  const [q, setQ] = useState("");
  const [orden, setOrden] = useLocalStorage<OrdenDocsTercero>("archivo-terceros-orden", "fecha");
  const [miniaturas, setMiniaturas] = useLocalStorage<boolean>("archivo-terceros-miniaturas", false);
  const aguja = sinTildes(q.trim());

  // Una sección por carpeta (la vinculada y sus subcarpetas), en el orden del árbol.
  const grupos: GrupoDeCarpeta[] = useMemo(() => {
    const porCarpeta = new Map<string, DbDocument[]>();
    for (const d of documents) {
      if (!d.folderId || d.deletedAt || !tercero.carpetaIds.has(d.folderId) || !coincide(d, aguja)) continue;
      const lista = porCarpeta.get(d.folderId) ?? [];
      lista.push(d);
      porCarpeta.set(d.folderId, lista);
    }
    const vistas = new Set<string>();
    const salida: GrupoDeCarpeta[] = [];
    for (const raiz of tercero.carpetas) {
      for (const id of conSubcarpetas([raiz.id], folders)) {
        if (vistas.has(id)) continue;
        vistas.add(id);
        const carpeta = folderById.get(id);
        const docs = porCarpeta.get(id) ?? [];
        // Con búsqueda sólo las carpetas que tienen algo; sin búsqueda, la vinculada aunque esté vacía.
        if (!carpeta || (docs.length === 0 && (aguja || id !== raiz.id))) continue;
        // Una subcarpeta lleva su camino desde la vinculada: «Contratos › 2026 › Anexos».
        const ruta: string[] = [];
        if (id !== raiz.id) {
          for (let p = carpeta.parentId; p; p = folderById.get(p)?.parentId ?? null) {
            ruta.unshift(folderById.get(p)?.name ?? "…");
            if (p === raiz.id) break;
          }
        }
        salida.push({ carpeta, ruta, docs: ordenarDocsTercero(docs, orden) });
      }
    }
    return salida;
  }, [documents, folders, folderById, tercero, aguja, orden]);

  const todos = useMemo(() => grupos.flatMap((g) => g.docs), [grupos]);
  const Icono = ICONO_TERCERO[tercero.tipo];
  const nombreZip = tercero.nombre.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "tercero";

  return (
    <div className="min-w-0 space-y-4" data-qa="tercero-detalle">
      {/* Cabecera en una fila también a 400 px: el ícono grande se va antes que partirla. */}
      <div className="flex items-center gap-3">
        {onVolver && (
          <button type="button" onClick={onVolver} aria-label="Volver a la lista" className={button({ variant: "ghost", size: "icon" })}>
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] max-sm:hidden">
          <Icono className="h-5 w-5 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{tercero.nombre}</CardTitle>
          <p className="truncate text-xs text-[var(--text-tertiary)]">
            {TIPO_TERCERO_LABEL[tercero.tipo].uno}
            {tercero.detalle ? ` · ${tercero.detalle}` : ""}
            {` · ${tercero.docs === 1 ? "1 papel" : `${tercero.docs} papeles`}`}
            {tercero.vencidos > 0 ? ` · ${tercero.vencidos} vencido${tercero.vencidos === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <ActionMenu
          label="Acciones"
          size="md"
          compactoEnMovil
          disabled={todos.length === 0}
          actions={[
            { id: "expediente", label: "Expediente PDF", hint: "Todo junto en un PDF con carátula", icon: FileArchive, onSelect: () => setExpediente({ tipo: "ids", ids: todos.map((d) => d.id) }) },
            { id: "whatsapp", label: "Enviar por WhatsApp", icon: MessageCircle, onSelect: () => setWhatsappDoc(todos) },
            { id: "zip", label: "Descargar todo (ZIP)", icon: Download, onSelect: () => void zipAndDownload(todos, `${nombreZip}.zip`) },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_14rem]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Buscar en los papeles de ${tercero.nombre}`}
            placeholder="Buscar por nombre o contenido…"
            className={CAMPO_BUSCAR}
          />
        </div>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as OrdenDocsTercero)}
          aria-label="Ordenar"
          className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div role="group" aria-label="Cómo se ven" className="flex">
          {([[false, List, "Lista"], [true, LayoutGrid, "Miniaturas"]] as const).map(([valor, I, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={miniaturas === valor}
              title={label}
              aria-label={label}
              onClick={() => setMiniaturas(valor)}
              className={cn(
                "flex h-12 w-12 items-center justify-center border first:rounded-l-xl last:rounded-r-xl last:-ml-px",
                miniaturas === valor
                  ? "relative z-[1] border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)]",
              )}
            >
              <I className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
          {aguja ? `No hay papeles con «${q.trim()}».` : "Sus carpetas están vacías."}
        </p>
      ) : (
        grupos.map((g) => <PapelesDeCarpeta key={g.carpeta.id} grupo={g} arch={arch} miniaturas={miniaturas} />)
      )}
    </div>
  );
}
