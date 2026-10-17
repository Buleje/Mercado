"use client";

/**
 * TramitesExpediente — qué se presentó, ante quién y en qué estado quedó.
 *
 * Diseño: los estados no son adornos, son el filtro. Los chips de arriba filtran
 * la lista de un toque, y lo que espera respuesta hace más de dos semanas sale
 * en una tira aparte — es lo único que pide una acción hoy.
 *
 * Cada fila lleva la marca de tiempo grande a la izquierda (día y mes, como un
 * sello de mesa de partes) porque "cuándo lo presenté" es la pregunta que se le
 * hace a esta pantalla.
 */

import { useMemo, useState } from "react";
import { m as motion } from "framer-motion";
import { Clock, Inbox, RefreshCw, Search } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { staggerContainer } from "@/components/ui-system/motion";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import {
  contarPorEstado,
  ESTADOS_TRAMITE,
  tramitesSinRespuesta,
  type EstadoTramite,
  type TramiteRegistro,
} from "@/lib/forestal/tramites-registro";
import { mensajeAvisoSinRespuesta } from "@/lib/forestal/tramites-aviso-mensaje";
import { Btn } from "./ctp-shared";
import TramiteAvisoWhatsApp from "./TramiteAvisoWhatsApp";
import TramiteExpedienteFila from "./TramiteExpedienteFila";
import { ChipEstado as Chip } from "./chip-estado";

/** Sin tildes ni mayúsculas: "relación"/"relacion" tienen que dar el mismo resultado. */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function TramitesExpediente({
  tramites,
  cargando,
  onRecargar,
  onAbrir,
  onDuplicar,
  onBorrar,
}: {
  tramites: TramiteRegistro[];
  cargando: boolean;
  onRecargar: () => void;
  onAbrir: (t: TramiteRegistro) => void;
  /** Abre un trámite NUEVO con los datos de éste ya cargados (menos fechas y
   *  tabla de guías, que son del período viejo — ver `datosParaDuplicar`). */
  onDuplicar: (t: TramiteRegistro) => void;
  onBorrar: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState<EstadoTramite | "">("");
  const [busqueda, setBusqueda] = useState("");
  const porEstado = useMemo(() => contarPorEstado(tramites), [tramites]);
  const hoy = useMemo(() => new Date(), []);
  const esperando = useMemo(() => tramitesSinRespuesta(tramites, hoy), [tramites, hoy]);
  const visibles = useMemo(() => {
    const porEstadoFiltrados = filtro ? tramites.filter((t) => t.estado === filtro) : tramites;
    const q = sinTildes(busqueda.trim());
    if (!q) return porEstadoFiltrados;
    return porEstadoFiltrados.filter((t) =>
      /* La carta (ADR-487) también se encuentra por una de sus guías, su permiso o su expediente. */
      [
        t.codigoInterno,
        t.formatoNombre,
        t.asunto,
        t.expedienteAutoridad,
        t.notas,
        t.datos?.permisoCodigo,
        t.datos?.expediente,
        ...(t.emision?.guias ?? []),
      ].some((campo) => campo && sinTildes(campo).includes(q)),
    );
  }, [tramites, filtro, busqueda]);

  /* Borrar pide confirmación (11-10): antes un clic en el tacho lo sacaba del
     expediente sin preguntar. */
  const [aBorrar, setABorrar] = useState<TramiteRegistro | null>(null);
  /* Sólo los estados que tienen algo (y el elegido): seis chips con cinco en 0
     eran una fila entera de botones apagados. */
  const estadosVisibles = ESTADOS_TRAMITE.filter((e) => porEstado[e.key] > 0 || filtro === e.key);

  return (
    <div className="space-y-4">
      {/* Buscador, estados y recargar en UNA fila pegada a la lista. Busca por
          formato, asunto, N° de expediente, notas, guías y permiso: la Relación
          de guías se presenta todos los meses y «la de julio» no se encuentra a ojo. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setBusqueda("")}
            placeholder="Buscar código, guía, permiso o expediente…"
            title="Busca por código, N° de guía, permiso, formato, asunto, N° de expediente o notas"
            aria-label="Buscar en el expediente"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
          />
        </div>
        {/* Estados = filtro. Un chip con un número que no se puede tocar es un cartel. */}
        {tramites.length > 0 && (
          <div role="group" aria-label="Filtrar por estado" className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
            <Chip label="Todos" count={tramites.length} activo={filtro === ""} tono="muted" onClick={() => setFiltro("")} />
            {estadosVisibles.map((e) => (
              <Chip
                key={e.key}
                label={e.label}
                count={porEstado[e.key]}
                activo={filtro === e.key}
                tono={e.tono}
                onClick={() => setFiltro(filtro === e.key ? "" : (e.key as EstadoTramite))}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onRecargar}
          disabled={cargando}
          aria-label="Recargar el expediente"
          title="Recargar el expediente"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>

      {esperando.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] px-4 py-1.5 dark:bg-[var(--data-warning-500)]/12">
          <Clock className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden="true" />
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold text-[var(--data-warning-ink)]">
            {esperando.length} {esperando.length === 1 ? "trámite lleva" : "trámites llevan"} más de 15 días sin respuesta
            <InfoTip
              icono="ayuda"
              title="15 días sin respuesta"
              what="No es un plazo legal — cada procedimiento tiene el suyo en el TUPA."
              affects="Es el recordatorio de ir a preguntar por el expediente, que es lo que en la práctica lo mueve."
            />
          </p>
          {filtro !== "presentado" && (
            <button
              type="button"
              onClick={() => setFiltro("presentado")}
              className="inline-flex h-12 shrink-0 items-center rounded-xl px-3 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-raised)]"
            >
              Ver presentados
            </button>
          )}
          <TramiteAvisoWhatsApp mensaje={mensajeAvisoSinRespuesta(esperando, hoy)} label="Avisar por WhatsApp" />
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] px-6 py-10 text-center">
          <Inbox className="h-8 w-8 text-[var(--text-tertiary)] opacity-60" aria-hidden="true" />
          <p className="text-base font-bold text-[var(--text-primary)]">
            {busqueda.trim() ? "Ningún trámite coincide con la búsqueda" : filtro ? "Ningún trámite en ese estado" : "Todavía no hay trámites guardados"}
          </p>
          <p className="max-w-md text-sm text-[var(--text-secondary)]">
            {busqueda.trim()
              ? "Prueba con otra palabra o borra la búsqueda."
              : filtro
                ? "Prueba con otro estado o mira todos."
                : "Elige un formato en «Formatos», llénalo y guárdalo: acá queda lo que presentaste."}
          </p>
        </div>
      ) : (
        <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
          {visibles.map((t) => (
            <TramiteExpedienteFila key={t.id} t={t} hoy={hoy} onAbrir={onAbrir} onDuplicar={onDuplicar} onBorrar={setABorrar} />
          ))}
        </motion.ul>
      )}

      <AdminModal
        open={Boolean(aBorrar)}
        onClose={() => setABorrar(null)}
        title="Borrar del expediente"
        description={aBorrar ? `${aBorrar.codigoInterno ? `${aBorrar.codigoInterno} · ` : ""}${aBorrar.formatoNombre}` : undefined}
        variant="centered-sm"
        footer={
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setABorrar(null)}>Cancelar</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (aBorrar) onBorrar(aBorrar.id);
                setABorrar(null);
              }}
            >
              Borrar
            </Btn>
          </div>
        }
      >
        <p className={`${MODAL_BODY} text-sm text-[var(--text-secondary)]`}>
          Se quita el registro y sus datos llenados. El papel que ya presentaste ante la autoridad no cambia.
        </p>
      </AdminModal>
    </div>
  );
}
