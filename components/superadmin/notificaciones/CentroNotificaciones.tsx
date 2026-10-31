"use client";

import { useMemo, useState } from "react";
import { Inbox, RefreshCw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATEGORIAS, type BandejaAvisos } from "@/lib/superadmin/nivel-aviso";
import { avisosVisibles, conteos, gruposIncompletos, type Filtros } from "./filtrar";
import { BuscadorAvisos, ChipsNivel, RielCategorias } from "./FiltrosAvisos";
import { ListaAvisos } from "./ListaAvisos";

const FILTROS_INICIALES: Filtros = { nivel: "todos", categoria: "todas", q: "" };

/** Lo que explica el ⓘ del título: qué quiere decir cada nivel y con qué regla sale. */
const AYUDA = (
  <InfoTip
    title="Cómo se clasifica cada aviso"
    what="Urgente = atiéndelo hoy. Importante = esta semana. Leve = cuando tengas tiempo. Informativo = para que lo sepas. El nivel lo pone el servidor con reglas fijas de tiempo y cantidad."
    affects="El orden de la lista (urgente primero, después lo más reciente) y el número rojo de la campana."
    example="Un error que pasó 372 veces y se vio hace 18 h = urgente. Una tienda con 9 días sin vender que antes vendía = urgente; con 120 días = leve (rescate largo)."
  />
);

function descripcion(data: BandejaAvisos | null, cargando: boolean, fallo: boolean): string {
  if (!data) return fallo ? "No se pudo cargar la bandeja" : "Cargando avisos…";
  if (data.total === 0) return "Todo al día";
  const urg = data.niveles.urgente;
  const base = `${data.total} pendientes · ${urg} ${urg === 1 ? "urgente" : "urgentes"}`;
  if (fallo) return `${base} · no se pudo actualizar`;
  return cargando ? `${base} · actualizando…` : base;
}

function EstadoSinDatos({ fallo, onReintentar }: { fallo: boolean; onReintentar: () => void }) {
  if (!fallo) {
    return (
      <div className="space-y-2 p-5" aria-busy="true" aria-label="Cargando avisos">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-sm text-[var(--text-secondary)]">No se pudo cargar la bandeja.</p>
      <button
        type="button"
        onClick={onReintentar}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
      </button>
    </div>
  );
}

/**
 * Centro de notificaciones del superadmin (Brandon 2026-10-18: «modal central,
 * clasificado, más amplio, cada uno con su categoría y urgente, leve y demás»).
 *
 * Filtros: chips de nivel + buscador arriba; categorías en un riel a la
 * izquierda (chips deslizables a 400 px). La lista es lo único que scrollea.
 * Los datos llegan del hook de la campana: abrir el modal no suma pedidos.
 */
export function CentroNotificaciones({
  open,
  onClose,
  data,
  cargando,
  fallo,
  onReintentar,
}: {
  open: boolean;
  onClose: () => void;
  data: BandejaAvisos | null;
  cargando: boolean;
  fallo: boolean;
  onReintentar: () => void;
}) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const cambiar = (p: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...p }));

  const vista = useMemo(() => {
    if (!data) return null;
    const c = conteos(data, filtros);
    // Riel: las categorías con algo pendiente, más la elegida aunque quede en 0.
    const categorias = CATEGORIAS.filter((k) => data.buckets[k].count > 0 || filtros.categoria === k);
    return {
      conteos: c,
      categorias,
      visibles: avisosVisibles(data, filtros),
      incompletos: gruposIncompletos(data, filtros),
    };
  }, [data, filtros]);

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Centro de notificaciones"
      description={descripcion(data, cargando, fallo)}
      icon={Inbox}
      size="xl"
      ayuda={AYUDA}
      claveVentana="superadmin-centro-notificaciones"
      className="h-[90vh] sm:h-[85vh]"
    >
      {!data || !vista ? (
        <EstadoSinDatos fallo={fallo} onReintentar={onReintentar} />
      ) : (
        <div className="flex h-full min-h-0 flex-col" data-qa="centro-notificaciones">
          <div
            className={`flex shrink-0 flex-col gap-2 border-b border-[var(--rule-base)] py-3 lg:flex-row lg:items-center lg:justify-between ${MODAL_GUTTER}`}
          >
            <ChipsNivel valor={filtros.nivel} conteos={vista.conteos.porNivel} onCambiar={(nivel) => cambiar({ nivel })} />
            <BuscadorAvisos valor={filtros.q} onCambiar={(q) => cambiar({ q })} className="lg:w-80" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <RielCategorias
              valor={filtros.categoria}
              categorias={vista.categorias}
              conteos={vista.conteos.porCategoria}
              onCambiar={(categoria) => cambiar({ categoria })}
            />
            <ListaAvisos
              data={data}
              filtros={filtros}
              visibles={vista.visibles}
              enFiltro={vista.conteos.porNivel[filtros.nivel]}
              incompletos={vista.incompletos}
              onIr={onClose}
            />
          </div>
        </div>
      )}
    </AdminModal>
  );
}
