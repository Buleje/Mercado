"use client";

/**
 * Las grabaciones guardadas: escuchar, renombrar en el lugar, editar/recortar,
 * mandar por WhatsApp y llevar a la papelera del Archivo.
 */
import { useState } from "react";
import {
  Check,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Scissors,
  Trash2,
  X,
} from "@buleje/design-system/icons";
import { EmptyState } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { ActionMenu } from "@/components/admin/shared/action-menu";
import type { DbDocument } from "@/lib/types/documents";
import { fechaGrabacion, formatoPeso, limpiarNombre } from "@/lib/grabadora/formato";
import { notaDe, urlAudio } from "@/lib/grabadora/archivo";
import { CAMPO, ReproductorAudio, TEXTO_ERROR, TEXTO_META } from "./compartido";

interface Acciones {
  renombrar: (id: string, nombre: string) => Promise<void>;
  borrar: (id: string) => Promise<void>;
  onEditar: (doc: DbDocument) => void;
  onEnviar: (doc: DbDocument) => void;
}

export function ListaGrabaciones({
  items,
  cargando,
  error,
  onReintentar,
  ...acciones
}: Acciones & {
  items: DbDocument[];
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
}) {
  const [sonando, setSonando] = useState<string | null>(null);

  if (cargando && items.length === 0) {
    return (
      <p className={`${TEXTO_META} flex items-center gap-2`} role="status">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> Cargando las grabaciones…
      </p>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3" role="alert">
        <span className={TEXTO_ERROR}>{error}</span>
        <Button variant="secondary" size="lg" onClick={onReintentar}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState title="Todavía no hay grabaciones guardadas" description="Graba una nota y tócale Guardar." />;
  }

  return (
    <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" data-grabaciones>
      {items.map((doc) => (
        <FilaGrabacion
          key={doc.id}
          doc={doc}
          sonando={sonando === doc.id}
          onSonar={() => setSonando((s) => (s === doc.id ? null : doc.id))}
          {...acciones}
        />
      ))}
    </ul>
  );
}

function FilaGrabacion({
  doc,
  sonando,
  onSonar,
  renombrar,
  borrar,
  onEditar,
  onEnviar,
}: Acciones & { doc: DbDocument; sonando: boolean; onSonar: () => void }) {
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(doc.name);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nota = notaDe(doc);

  async function hacer(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function guardarNombre() {
    const limpio = limpiarNombre(nombre);
    if (!limpio || limpio === doc.name) return setRenombrando(false);
    if (await hacer(() => renombrar(doc.id, limpio))) setRenombrando(false);
  }

  return (
    <li className="space-y-2 p-3" data-grabacion={doc.name}>
      <div className="flex items-center gap-3">
        <Button
          variant={sonando ? "primary" : "secondary"}
          size="lg"
          className="w-11 shrink-0 px-0"
          onClick={onSonar}
          aria-label={sonando ? `Cerrar ${doc.name}` : `Escuchar ${doc.name}`}
          data-accion="escuchar"
        >
          {sonando ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5" aria-hidden />}
        </Button>

        {renombrando ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              className={`${CAMPO} min-w-0 flex-[1_1_12rem]`}
              value={nombre}
              maxLength={120}
              autoFocus
              aria-label="Nombre nuevo"
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardarNombre();
                if (e.key === "Escape") {
                  setNombre(doc.name);
                  setRenombrando(false);
                }
              }}
              data-renombrar
            />
            <Button size="lg" onClick={() => void guardarNombre()} disabled={ocupado} aria-label="Guardar el nombre" data-accion="guardar-nombre">
              {ocupado ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden /> : <Check className="h-5 w-5" aria-hidden />}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                setNombre(doc.name);
                setRenombrando(false);
              }}
              aria-label="Cancelar"
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={doc.name}>
              {doc.name}
            </p>
            <p className={`${TEXTO_META} truncate`}>
              {fechaGrabacion(doc.uploadedAt)} · {formatoPeso(doc.size)}
              {nota ? ` · ${nota}` : ""}
            </p>
          </div>
        )}

        {!renombrando && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="lg"
              className="w-11 px-0"
              onClick={() => onEnviar(doc)}
              aria-label={`Enviar ${doc.name} por WhatsApp`}
              title="Enviar por WhatsApp"
              data-accion="whatsapp"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
            </Button>
            <ActionMenu
              label="Más acciones"
              soloIcono
              icon={MoreHorizontal}
              actions={[
                { id: "renombrar", label: "Renombrar", icon: Pencil, onSelect: () => setRenombrando(true) },
                { id: "editar", label: "Editar y recortar", hint: "Nombre, nota, inicio y fin", icon: Scissors, onSelect: () => onEditar(doc) },
                { id: "whatsapp", label: "Enviar por WhatsApp", icon: MessageCircle, onSelect: () => onEnviar(doc) },
                { id: "borrar", label: "Mandar a la papelera", icon: Trash2, tone: "danger", onSelect: () => setConfirmarBorrar(true) },
              ]}
            />
          </div>
        )}
      </div>

      {confirmarBorrar && (
        <div className="flex flex-wrap items-center gap-2 pl-14">
          <span className="text-sm text-[var(--text-primary)]">¿Mandar «{doc.name}» a la papelera del Archivo?</span>
          <Button variant="danger" size="lg" disabled={ocupado} onClick={() => void hacer(() => borrar(doc.id))} data-accion="confirmar-borrar">
            Sí, a la papelera
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setConfirmarBorrar(false)}>
            No
          </Button>
        </div>
      )}

      {error && (
        <p className={`${TEXTO_ERROR} pl-14`} role="alert">
          {error}
        </p>
      )}

      {sonando && <ReproductorAudio src={urlAudio(doc)} autoPlay etiqueta={`Reproduciendo ${doc.name}`} />}
    </li>
  );
}
