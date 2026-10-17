"use client";

/**
 * Menú «Vista» de cualquier pantalla (M07): cambiar de una vez lo que se ve
 * (las del sistema o las tuyas) y guardar lo que tienes puesto con un nombre.
 * El estado lo lleva `useVistasGuardadas`; las reglas, `lib/admin/vistas-guardadas`.
 * Mismo aspecto que el de la Lista de Pedidos (`OrdersTab/VistasPedidosMenu`).
 */

import { useId, useState } from "react";
import { Bookmark, BookmarkPlus, Check, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { LARGO_NOMBRE } from "@/lib/admin/vistas-guardadas";
import type { VistasGuardadas } from "@/hooks/use-vistas-guardadas";

interface Props<T> {
  vistas: VistasGuardadas<T>;
  /** Qué guarda, en palabras: «La búsqueda, los filtros y el orden de las columnas». */
  queGuarda: string;
  /** Ejemplo de nombre para el campo. */
  ejemplo?: string;
}

export function MenuVistasGuardadas<T>({ vistas, queGuarda, ejemplo = "Ej.: Los de la mañana" }: Props<T>) {
  const [guardando, setGuardando] = useState(false);
  const { actual, sistema, guardadas, aplicar } = vistas;
  const nombre = actual?.nombre ?? "puesta a mano";

  const acciones: MenuAccion[] = [
    ...sistema.map((v) => ({
      id: v.id,
      label: v.nombre,
      hint: v.ayuda,
      icon: Bookmark,
      activo: actual?.id === v.id,
      seccion: "Del sistema",
      onSelect: () => aplicar(v),
    })),
    ...guardadas.map((v) => ({
      id: v.id,
      label: v.nombre,
      icon: Bookmark,
      activo: actual?.id === v.id,
      seccion: "Tuyas",
      onSelect: () => aplicar(v),
    })),
    {
      id: "guardar",
      label: "Guardar lo que se ve…",
      hint: guardadas.length > 0 ? "O borrar una de las tuyas" : queGuarda,
      icon: BookmarkPlus,
      seccion: "Tuyas",
      disabled: !vistas.listo,
      onSelect: () => setGuardando(true),
    },
  ];

  return (
    <>
      {/* Resaltado cuando lo que se ve no es la estándar: así se nota que hay algo puesto. */}
      <ActionMenu
        label={`Vista: ${nombre}`}
        title={`Vista: ${nombre} · cambiarla o guardar la que se ve`}
        icon={Bookmark}
        actions={acciones}
        soloIcono
        variant={vistas.esEstandar ? "outline" : "accent"}
        className="w-12! shrink-0"
      />
      {guardando && (
        <GuardarVista vistas={vistas} queGuarda={queGuarda} ejemplo={ejemplo} onClose={() => setGuardando(false)} />
      )}
    </>
  );
}

function GuardarVista<T>({ vistas, queGuarda, ejemplo, onClose }: Props<T> & { onClose: () => void }) {
  const id = useId();
  const deUsuario = vistas.actual && vistas.guardadas.some((g) => g.id === vistas.actual?.id);
  const [nombre, setNombre] = useState(deUsuario ? (vistas.actual?.nombre ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const guardar = () => {
    const e = vistas.guardar(nombre);
    setError(e);
    setHecho(e ? null : `«${nombre.trim()}» quedó guardada`);
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Guardar la vista"
      description={queGuarda}
      icon={BookmarkPlus}
      size="sm"
      footer={
        <ModalFooter error={error} aviso={hecho}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>
            {hecho ? "Listo" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!nombre.trim()}
            className={button({ variant: "primary", className: "rounded-xl px-4" })}
          >
            Guardar
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nombre.trim()) guardar();
          }}
          className="space-y-2"
        >
          <label htmlFor={id} className="block text-sm font-bold text-[var(--text-primary)]">
            Nombre
          </label>
          <input
            id={id}
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
              setHecho(null);
            }}
            maxLength={LARGO_NOMBRE}
            placeholder={ejemplo}
            autoFocus
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </form>

        {vistas.guardadas.length > 0 && (
          <div className="space-y-1">
            <span className="block text-sm font-bold text-[var(--text-primary)]">Tus vistas</span>
            <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
              {vistas.guardadas.map((v) => (
                <li key={v.id} className="flex items-center gap-2 pl-3">
                  {vistas.actual?.id === v.id && (
                    <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-label="La que se ve" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">{v.nombre}</span>
                  <button
                    type="button"
                    onClick={() => vistas.borrar(v.id)}
                    aria-label={`Borrar la vista «${v.nombre}»`}
                    title="Borrar"
                    className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
