"use client";

/**
 * TramiteRequisitos — lo que pidió la entidad, uno por fila: hay / falta / no
 * aplica, una nota y su papel del Archivo (enlazar uno que ya está o subirlo).
 * Cada cambio se guarda al toque (`PATCH …/requisitos`) y la cuenta «7 de 10
 * listos» la devuelve el servidor.
 */
import { useState } from "react";
import { FileText, Link2, MoreHorizontal, Plus, Trash2, Upload, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { toast } from "sonner";
import ActionMenu from "@/components/admin/shared/action-menu";
import { CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { ESTADOS_REQUISITO, type EstadoRequisito, type RequisitoDto, type RequisitosOps, type TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import { EnlazarDocumento } from "../comun/EnlazarDocumento";
import { enlaceDocumento, subirDocumento } from "../comun/subir-documento";
import { cambiarRequisitos, carpetaDelTramite, leerTramite } from "./tramites-api";
import { REQUISITO_UI, textoConteo } from "./tramites-ui";

const OPCIONES = ESTADOS_REQUISITO.map((e) => ({ value: e, label: REQUISITO_UI[e].texto }));

export function TramiteRequisitos({ tramite, onCambiado }: { tramite: TramiteDto; onCambiado: (t: TramiteDto) => void }) {
  const [nuevo, setNuevo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [enlazando, setEnlazando] = useState<RequisitoDto | null>(null);

  const aplicar = async (clave: string, ops: RequisitosOps, ok?: string): Promise<boolean> => {
    setOcupado(clave);
    const r = await cambiarRequisitos(tramite.id, ops);
    setOcupado(null);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    onCambiado(r.data.tramite);
    if (ok) toast.success(ok);
    return true;
  };

  const agregar = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    if (await aplicar("nuevo", { agregar: [{ nombre, estado: "falta" }] })) setNuevo("");
  };

  /** Sube el archivo colgado del requisito; si el servidor todavía no lo cuelga solo, se enlaza a mano. */
  const subir = async (req: RequisitoDto, archivo: File) => {
    setOcupado(req.id);
    const s = await subirDocumento(archivo, { carpetaRuta: carpetaDelTramite(tramite), vinculoTipo: "requisito", vinculoId: `${tramite.id}:${req.id}` });
    if (!s.ok) {
      setOcupado(null);
      return void toast.error(s.error);
    }
    if (!s.vinculado) {
      await aplicar(req.id, { cambiar: [{ id: req.id, documentId: s.id, estado: "hay" }] }, `«${archivo.name}» quedó en «${req.nombre}»`);
    } else {
      const r = await leerTramite(tramite.id);
      setOcupado(null);
      if (r.ok) onCambiado(r.data.tramite);
      toast.success(`«${archivo.name}» quedó en «${req.nombre}»`);
    }
    setEnlazando(null);
  };

  const requisitos = [...tramite.requisitos].sort((a, b) => a.orden - b.orden);

  return (
    <section className="space-y-3 border-t border-[var(--rule-soft)] pt-4" aria-label="Requisitos">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CardTitle as="h3">Requisitos</CardTitle>
        <span className={cn("text-sm font-semibold", tramite.conteo.falta > 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]")}>
          {textoConteo(tramite.conteo)}
        </span>
      </div>

      {requisitos.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">Todavía no hay requisitos: agrega lo que te pidieron.</p>}

      <ul className="divide-y divide-[var(--rule-soft)]">
        {requisitos.map((r) => (
          <FilaRequisito
            key={r.id}
            r={r}
            ocupado={ocupado === r.id}
            onEstado={(estado) => void aplicar(r.id, { cambiar: [{ id: r.id, estado }] })}
            onNota={(nota) => void aplicar(r.id, { cambiar: [{ id: r.id, nota }] })}
            onEnlazar={() => setEnlazando(r)}
            onSoltarPapel={() => void aplicar(r.id, { cambiar: [{ id: r.id, documentId: null }] }, "El papel se soltó del requisito (sigue en el Archivo)")}
            onQuitar={() => void aplicar(r.id, { quitar: [r.id] }, `«${r.nombre}» salió de la lista`)}
          />
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void agregar();
        }}
      >
        <input type="text" className={CAMPO_ALTO} value={nuevo} aria-label="Nuevo requisito" placeholder="Ej.: recibo de luz del último mes" onChange={(e) => setNuevo(e.target.value)} />
        <button type="submit" className={button({ variant: "secondary", className: "shrink-0 max-sm:w-12 max-sm:px-0" })} disabled={!nuevo.trim() || ocupado === "nuevo"} title="Agregar requisito">
          <Plus className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">Agregar</span>
        </button>
      </form>

      {enlazando && (
        <EnlazarDocumento
          titulo={`Papel de «${enlazando.nombre}»`}
          sugerencia={enlazando.nombre}
          onCerrar={() => setEnlazando(null)}
          onSubir={(f) => subir(enlazando, f)}
          onElegir={async (d) => {
            if (await aplicar(enlazando.id, { cambiar: [{ id: enlazando.id, documentId: d.id, estado: "hay" }] }, `«${d.nombre}» quedó en «${enlazando.nombre}»`)) setEnlazando(null);
          }}
        />
      )}
    </section>
  );
}

interface FilaProps {
  r: RequisitoDto;
  ocupado: boolean;
  onEstado: (e: EstadoRequisito) => void;
  onNota: (nota: string | null) => void;
  onEnlazar: () => void;
  onSoltarPapel: () => void;
  onQuitar: () => void;
}

function FilaRequisito({ r, ocupado, onEstado, onNota, onEnlazar, onSoltarPapel, onQuitar }: FilaProps) {
  const [nota, setNota] = useState(r.nota ?? "");
  const guardarNota = () => {
    const limpia = nota.trim() || null;
    if (limpia !== (r.nota ?? null)) onNota(limpia);
  };

  return (
    <li className={cn("space-y-2 py-3", ocupado && "opacity-60")} aria-busy={ocupado}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("min-w-0 flex-1 font-medium", r.estado === "no_aplica" ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]")}>{r.nombre}</span>
        <SegmentedControl<EstadoRequisito> value={r.estado} onChange={onEstado} options={OPCIONES} size="lg" label={`Estado de «${r.nombre}»`} />
        <ActionMenu
          label="Más"
          icon={MoreHorizontal}
          soloIcono
          size="md"
          className="w-12 shrink-0"
          title={`Más de «${r.nombre}»`}
          actions={[
            { id: "enlazar", label: r.documentId ? "Cambiar el papel" : "Enlazar o subir un papel", icon: Link2, onSelect: onEnlazar },
            ...(r.documentId ? [{ id: "soltar", label: "Soltar el papel", icon: X, onSelect: onSoltarPapel }] : []),
            { id: "quitar", label: "Quitar de la lista", icon: Trash2, tone: "danger" as const, onSelect: onQuitar },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {r.documentId ? (
          <a href={enlaceDocumento(r.documentId)} target="_blank" rel="noopener noreferrer" className={button({ variant: "ghost", className: "max-w-full gap-2 px-2" })}>
            <FileText className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{r.documentoNombre ?? "Ver el papel"}</span>
          </a>
        ) : (
          <button type="button" className={button({ variant: "ghost", className: "gap-2 px-2" })} onClick={onEnlazar}>
            <Upload className="size-4" aria-hidden="true" />
            Enlazar o subir el papel
          </button>
        )}
        <input
          type="text"
          className={`${CAMPO_ALTO} min-w-0 flex-1 basis-48`}
          value={nota}
          aria-label={`Nota de «${r.nombre}»`}
          placeholder="Nota (opcional)"
          onChange={(e) => setNota(e.target.value)}
          onBlur={guardarNota}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              guardarNota();
            }
          }}
        />
      </div>
    </li>
  );
}
