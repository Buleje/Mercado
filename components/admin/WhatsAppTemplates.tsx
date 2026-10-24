"use client";

/**
 * Mensajes › Plantillas: mensajes guardados para copiar y pegar en WhatsApp.
 *
 * Una fila de cabecera (título + ⓘ · Nueva plantilla), el buscador pegado a la
 * lista y una plantilla por fila con el mensaje en una línea: «Copiar» a la
 * vista, lo demás en «⋯». Ver, crear y editar van en una ventana con la vista
 * previa tipo WhatsApp. Las tuyas son las mismas respuestas rápidas de la
 * bandeja de WhatsApp (misma clave de localStorage, mismo formato).
 *
 * Antes (11-10, main): 1,42 pantallas, 63 textos < 14 px, un formulario que
 * empujaba la grilla y botones de 28 px.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, SectionTitle, undoToast } from "@buleje/design-system";
import { Check, Copy, Eye, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import {
  PREDEFINED_QUICK_REPLIES,
  QUICK_REPLIES_LS_KEY,
  loadCustomQuickReplies,
  type QuickReply,
} from "@/components/admin/whatsapp/inbox/quick-replies";
import { TextoConVariables, variablesDe } from "@/components/admin/whatsapp/plantillas/BurbujaWhatsApp";
import { ModalPlantilla, type ModoPlantilla } from "@/components/admin/whatsapp/plantillas/ModalPlantilla";

function guardar(lista: QuickReply[]) {
  localStorage.setItem(QUICK_REPLIES_LS_KEY, JSON.stringify(lista));
}

const alTeclado = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

export default function WhatsAppTemplates() {
  const [propias, setPropias] = useState<QuickReply[]>([]);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPlantilla | null>(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    setPropias(loadCustomQuickReplies());
  }, []);

  /* Las tuyas primero: son las que armaste para tu negocio. */
  const todas = useMemo(() => [...propias, ...PREDEFINED_QUICK_REPLIES], [propias]);
  const filas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return q ? todas.filter((p) => `${p.nombre} ${p.texto}`.toLowerCase().includes(q)) : todas;
  }, [todas, texto]);

  const copiar = useCallback(async (p: QuickReply) => {
    try {
      await navigator.clipboard.writeText(p.texto);
      setCopiadoId(p.id);
      setTimeout(() => setCopiadoId((id) => (id === p.id ? null : id)), 2000);
    } catch {
      /* sin permiso de portapapeles: el texto sigue a la vista en la ventana */
      setModo({ tipo: "ver", plantilla: p });
    }
  }, []);

  const alGuardar = (nombre: string, msg: string, id?: string) => {
    const nueva: QuickReply = { id: id ?? `custom-${Date.now()}`, nombre, texto: msg, variables: variablesDe(msg), custom: true };
    const lista = id ? propias.map((p) => (p.id === id ? nueva : p)) : [...propias, nueva];
    setPropias(lista);
    guardar(lista);
    setModo(null);
  };

  const eliminar = (p: QuickReply) => {
    const antes = propias;
    const lista = propias.filter((x) => x.id !== p.id);
    setPropias(lista);
    guardar(lista);
    undoToast({ message: `Borraste «${p.nombre}»`, onUndo: () => { setPropias(antes); guardar(antes); } });
  };

  /* El ⋯ no devuelve el foco a su botón al elegir: se enfoca a mano antes de
     abrir, para que la ventana lo guarde como disparador y vuelva ahí al cerrar. */
  const desdeElMenu = (p: QuickReply, m: ModoPlantilla) => () => {
    document.querySelector<HTMLElement>(`[data-menu-plantilla="${CSS.escape(p.id)}"] button`)?.focus({ preventScroll: true });
    setModo(m);
  };

  const accionesDe = (p: QuickReply): MenuAccion[] => [
    { id: "ver", label: "Ver como queda", icon: Eye, onSelect: desdeElMenu(p, { tipo: "ver", plantilla: p }) },
    p.custom
      ? { id: "editar", label: "Editar", icon: Pencil, onSelect: desdeElMenu(p, { tipo: "editar", plantilla: p }) }
      : { id: "base", label: "Usar como base", hint: "Una copia tuya para cambiarla", icon: Plus, onSelect: desdeElMenu(p, { tipo: "nueva", base: p }) },
    ...(p.custom ? [{ id: "borrar", label: "Borrar", icon: Trash2, tone: "danger" as const, onSelect: () => eliminar(p) }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Plantillas</SectionTitle>
          <InfoTip
            title="Plantillas de WhatsApp"
            what="Mensajes guardados para copiar y pegar en WhatsApp. Las {palabras} entre llaves las cambias antes de mandar."
            affects="Las que creas aparecen también como respuestas rápidas en la bandeja de WhatsApp. Se guardan en este navegador."
            example="«Hola {nombre}, tu pedido #{pedido} ya está confirmado.»"
          />
        </div>
        <button type="button" onClick={() => setModo({ tipo: "nueva" })} className={button({ variant: "primary", className: "ml-auto rounded-xl" })}>
          <Plus className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Nueva plantilla</span>
        </button>
      </div>

      <label className="relative block">
        <span className="sr-only">Buscar plantillas</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Buscar entre ${todas.length} plantillas…`}
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] sm:max-w-md"
        />
      </label>

      {filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Ninguna plantilla dice «{texto.trim()}».</p>
      ) : (
        <DataTable className="table-fixed">
          <colgroup className="max-sm:hidden">
            <col className="w-56" />
            <col />
            <col className="w-48" />
          </colgroup>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Mensaje</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                onClick={() => setModo({ tipo: "ver", plantilla: p })}
                onKeyDown={alTeclado(() => setModo({ tipo: "ver", plantilla: p }))}
                aria-label={`Ver la plantilla ${p.nombre}`}
                className="cursor-pointer"
              >
                <td className="font-semibold">
                  <span className="block min-w-0 truncate">
                    {p.nombre}
                    {p.custom && <span className="font-normal text-[var(--text-secondary)]"> · tuya</span>}
                  </span>
                </td>
                <td className="text-[var(--text-secondary)]">
                  <TextoConVariables texto={p.texto} className="block min-w-0 truncate" />
                </td>
                <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => void copiar(p)} className={button({ variant: "secondary", className: "rounded-xl px-3" })}>
                      {copiadoId === p.id ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                      {copiadoId === p.id ? "Copiado" : "Copiar"}
                    </button>
                    <div data-menu-plantilla={p.id} className="contents">
                      <ActionMenu label={`Más de ${p.nombre}`} icon={MoreHorizontal} actions={accionesDe(p)} soloIcono size="md" className="w-12 shrink-0" title="Ver, editar o borrar" />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <ModalPlantilla
        modo={modo}
        copiado={modo?.tipo === "ver" && copiadoId === modo.plantilla.id}
        onCerrar={() => setModo(null)}
        onCopiar={(p) => void copiar(p)}
        onGuardar={alGuardar}
        onCambiarModo={setModo}
      />
    </div>
  );
}
