"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Eye, Save } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";
import { useTenantSlug } from "@/contexts/tenant-context";
import { useCmsPageEditor } from "@/hooks/use-cms-page-editor";
import ListaBloquesEditor from "@/components/admin/cms/ListaBloquesEditor";
import PanelPropiedadesBloque from "@/components/admin/cms/PanelPropiedadesBloque";
import { nombreDeBloque } from "@/components/admin/cms/campos-bloques";
import { limpiarEnlace, ETIQUETA_ESTADO } from "@/components/admin/cms/tipos";
import RenderBloques from "@/components/cms/RenderBloques";
import { BLOQUES_POR_TIPO } from "@/components/cms/registro-bloques";

const VOLVER = "/admin?tab=pagina-inicio&vista=paginas";
const CAMPO_BARRA =
  "h-11 px-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function EditorDePagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useConfirm();
  const tenantSlug = useTenantSlug();
  const ed = useCmsPageEditor(id);
  const { pagina } = ed;

  const [titulo, setTitulo] = useState("");
  const [enlace, setEnlace] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Los datos de la página se editan en la barra; se parte de lo guardado.
  useEffect(() => {
    if (pagina) {
      setTitulo(pagina.title);
      setEnlace(pagina.slug);
    }
  }, [pagina?.id, pagina?.title, pagina?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ed.error) {
    return (
      <div className="p-8 text-center space-y-3" role="alert">
        <p className={ADMIN_TOKENS.bodyText}>{ed.error}</p>
        <button type="button" onClick={() => router.push(VOLVER)} className={ADMIN_TOKENS.btnSecondary}>
          Volver a mis páginas
        </button>
      </div>
    );
  }
  if (!pagina) {
    return (
      <div className="p-8">
        <LoadingState />
      </div>
    );
  }

  const bloques = [...pagina.blocks].sort((a, b) => a.order - b.order);
  const bloqueElegido = bloques.find((b) => b.id === elegido) ?? null;
  const publicada = pagina.status === "PUBLISHED";
  const sinGuardar = titulo.trim() !== pagina.title || enlace !== pagina.slug;

  /** Corre una acción con el botón bloqueado y avisa el resultado. */
  async function hacer(accion: Promise<{ ok: boolean; error?: string }>, exito?: string) {
    setOcupado(true);
    const r = await accion;
    setOcupado(false);
    if (!r.ok) toast.error(r.error ?? "No se pudo completar");
    else if (exito) toast.success(exito);
    return r.ok;
  }

  async function mover(blockId: string, delta: -1 | 1) {
    const ids = bloques.map((b) => b.id);
    const i = ids.indexOf(blockId);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await hacer(ed.reordenar(ids));
  }

  async function eliminarBloque(blockId: string, tipo: string) {
    const ok = await confirm({
      title: `¿Eliminar el bloque «${nombreDeBloque(tipo)}»?`,
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    });
    if (!ok) return;
    if (await hacer(ed.eliminarBloque(blockId))) setElegido((e) => (e === blockId ? null : e));
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[var(--surface-canvas)]">
      <header className="bg-[var(--surface-raised)] border-b border-[var(--rule-base)] px-4 py-3 flex flex-wrap items-center gap-3">
        <button type="button" aria-label="Volver a mis páginas" onClick={() => router.push(VOLVER)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[var(--rule-soft)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-wrap items-center gap-2 flex-1 basis-full sm:basis-0 sm:min-w-[16rem]">
          <input aria-label="Título de la página" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${CAMPO_BARRA} basis-full sm:basis-0 flex-1 sm:min-w-[10rem] font-bold`} />
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-[var(--text-tertiary)]">/cms/</span>
            <input aria-label="Enlace de la página" value={enlace} onChange={(e) => setEnlace(limpiarEnlace(e.target.value))} className={`${CAMPO_BARRA} w-40`} />
            <InfoTip title="El enlace" what="Lo que va después de /cms/. Si lo cambias, la dirección anterior deja de funcionar." />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${publicada ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
            {ETIQUETA_ESTADO[pagina.status]}
          </span>
          {publicada && (
            <a href={`/t/${tenantSlug}/cms/${pagina.slug}`} target="_blank" rel="noopener noreferrer" className={ADMIN_TOKENS.btnSecondary}>
              <Eye className="w-4 h-4" aria-hidden /> Ver publicada
            </a>
          )}
          <button
            type="button"
            disabled={ocupado || !sinGuardar || !titulo.trim() || !enlace}
            onClick={() => void hacer(ed.guardarDatos(titulo.trim(), enlace), "Datos guardados")}
            className={ADMIN_TOKENS.btnSecondary}
          >
            <Save className="w-4 h-4" aria-hidden /> Guardar datos
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void hacer(publicada ? ed.despublicar() : ed.publicar(), publicada ? "Volvió a borrador" : "Página publicada")}
            className={ADMIN_TOKENS.btnPrimary}
          >
            {publicada ? "Despublicar" : "Publicar"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
        <ListaBloquesEditor
          bloques={bloques}
          elegido={elegido}
          onElegir={setElegido}
          onAgregar={(tipo) => void hacer(ed.agregarBloque(tipo, bloques.length))}
          onMover={(b, d) => void mover(b, d)}
          onVisible={(b, v) => void hacer(ed.cambiarVisible(b, v))}
          onEliminar={(b) => void eliminarBloque(b, bloques.find((x) => x.id === b)?.type ?? "")}
        />

        {/* Vista previa: en pantalla angosta no cabe junto a los paneles, ahí se ve publicada. */}
        <main className="hidden lg:block flex-1 overflow-y-auto bg-[var(--rule-soft)] p-6" aria-label="Vista previa de la página">
          <div className="max-w-6xl mx-auto bg-[var(--surface-raised)]">
            {bloques.length === 0 ? (
              <div className="p-16 text-center text-[var(--text-secondary)]">
                <p className="text-xl mb-2">Esta página está vacía</p>
                <p>Agrega bloques desde la columna de la izquierda.</p>
              </div>
            ) : (
              bloques.filter((b) => b.visible && BLOQUES_POR_TIPO[b.type]).map((b) => (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Editar ${nombreDeBloque(b.type)}`}
                  className={`relative cursor-pointer ${elegido === b.id ? "ring-4 ring-[var(--accent)]" : ""}`}
                  onClick={() => setElegido(b.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setElegido(b.id);
                    }
                  }}
                >
                  <RenderBloques bloques={[b]} />
                </div>
              ))
            )}
          </div>
        </main>

        {bloqueElegido && (
          <PanelPropiedadesBloque
            bloque={bloqueElegido}
            guardando={ocupado}
            onGuardar={(props) => void hacer(ed.guardarProps(bloqueElegido.id, props), "Bloque guardado")}
          />
        )}
      </div>
    </div>
  );
}
