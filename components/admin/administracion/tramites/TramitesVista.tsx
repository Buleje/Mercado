"use client";

/**
 * TramitesVista — Administración › Trámites (ADR-524): lo que se gestiona con
 * bancos, SUNAT, la municipalidad, la notaría o RENIEC. Arriba lo que vence
 * pronto; abajo la lista con filtros por entidad, estado y persona. La ficha
 * abre con `?id=` (así llegan los enlaces de la agenda y de la ficha del
 * Directorio) y se cierra sacándolo.
 */
import { useEffect, useState } from "react";
import { FileCheck, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import { DataTable, EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { toast } from "sonner";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna } from "@/components/admin/shared/use-orden-columna";
import { button } from "@/components/ui-system/button-variants";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import type { TramiteDto } from "@/lib/admin/fichas-tramites-alquileres";
import { EncabezadoAgenda } from "../comun/EncabezadoAgenda";
import { fechaRelativa } from "../comun/fechas";
import { Insignia } from "../comun/Insignia";
import { COLUMNAS_TRAMITES, ORDEN_TRAMITES } from "./columnas-filtro-tramites";
import { borrarTramite } from "./tramites-api";
import { ESTADO_TRAMITE_UI, PLANTILLAS_TRAMITE, entidadDe, personaDe, textoConteo } from "./tramites-ui";
import { TramiteModal } from "./TramiteModal";
import { useTramites } from "./use-tramites";
import { VencenPronto } from "./VencenPronto";

const AYUDA = {
  what: "Lo que estás gestionando con un banco, SUNAT, SUNARP, la municipalidad, una notaría o RENIEC: qué te pidieron, qué ya tienes y qué falta.",
  affects: "El vencimiento y el próximo paso salen en Hoy y en el calendario. Cada requisito puede llevar su papel del Archivo.",
  example: "«Alquiler del local» con Agrobanco: DNI vigente, ficha RUC, partida SUNARP, autovalúo, recibo de luz, CCI y contrato. 5 de 7 listos.",
};

export default function TramitesVista() {
  const lista = useTramites();
  const ficha = useFichaEnUrl("id");
  const [nuevo, setNuevo] = useState<{ plantilla?: string } | null>(null);
  const f = useFiltrosTabla(lista.filas, COLUMNAS_TRAMITES);
  const ord = useOrdenColumna(ORDEN_TRAMITES);
  const filas = ord.ordenar(f.filtradas);
  const { confirm } = useConfirm();

  const abierto = ficha.id ? lista.filas.find((t) => t.id === ficha.id) ?? null : null;
  const { id: idPedido, cerrar } = ficha;
  /* Un enlace a un trámite que ya no está: se avisa y se saca de la URL. */
  useEffect(() => {
    if (!idPedido || lista.cargando || lista.error) return;
    if (!lista.filas.some((t) => t.id === idPedido)) {
      toast.error("Ese trámite ya no existe o no es de este negocio.");
      cerrar();
    }
  }, [idPedido, lista.cargando, lista.error, lista.filas, cerrar]);

  const borrar = async (t: TramiteDto) => {
    const ok = await confirm({
      title: `¿Borrar «${t.asunto}»?`,
      description: "Deja de salir en Hoy y en el calendario. Los papeles se quedan en el Archivo.",
      intent: "danger",
      confirmLabel: "Borrar",
    });
    if (!ok) return;
    const r = await borrarTramite(t.id);
    if (!r.ok) return void toast.error(r.error);
    lista.quitar(t.id);
    toast.success(`«${t.asunto}» se borró`);
  };

  const guardado = (t: TramiteDto, eraNuevo: boolean) => {
    lista.poner(t);
    if (eraNuevo) {
      setNuevo(null);
      ficha.abrir(t.id);
    }
  };

  return (
    <div className="space-y-4">
      <EncabezadoAgenda
        titulo="Trámites"
        ayuda={AYUDA}
        acciones={
          <button type="button" className={button({ variant: "primary", className: "max-sm:w-12 max-sm:px-0" })} onClick={() => setNuevo({})} title="Nuevo trámite">
            <Plus className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Nuevo trámite</span>
          </button>
        }
        menu={[
          ...PLANTILLAS_TRAMITE.map((p) => ({ id: `plantilla-${p.id}`, label: p.texto, icon: FileCheck, seccion: "Con sus requisitos", onSelect: () => setNuevo({ plantilla: p.id }) })),
          { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: lista.refrescar, busy: lista.recargando },
        ]}
      />

      {lista.error && (
        <ErrorAlert
          title="No se pudieron traer los trámites"
          description={lista.error}
          action={
            <button type="button" className={button({ variant: "secondary" })} onClick={lista.refrescar}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        />
      )}

      {lista.cargando ? (
        <LoadingState message="Trayendo los trámites…" />
      ) : lista.filas.length === 0 ? (
        !lista.error && <EmptyState title="Todavía no hay trámites" description="Crea uno con «Nuevo trámite» o desde una plantilla del menú «⋯»." />
      ) : (
        <>
          <VencenPronto tramites={lista.filas} onAbrir={(t) => ficha.abrir(t.id)} />
          <BarraFiltrosTabla excel="Trámites" vistas="tramites" f={f} />
          <DataTable zebra aria-busy={lista.recargando}>
            <thead>
              <tr>
                <ThColumna label="Trámite" ids={["tramite", "entidad"]} f={f} orden={ord} ordenId="tramite" />
                <ThColumna label="Persona" ids={["persona"]} f={f} orden={ord} ordenId="persona" />
                <ThColumna label="Estado" ids={["estado"]} f={f} orden={ord} ordenId="estado" />
                <ThColumna label="Requisitos" f={f} orden={ord} ordenId="requisitos" />
                <ThColumna label="Próximo" f={f} orden={ord} ordenId="proximo" />
                <th data-label="Acciones"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
              {filas.map((t) => (
                <FilaTramite key={t.id} t={t} onAbrir={() => ficha.abrir(t.id)} onBorrar={() => void borrar(t)} />
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      {(nuevo || abierto) && (
        <TramiteModal
          key={abierto?.id ?? `nuevo-${nuevo?.plantilla ?? ""}`}
          tramite={abierto}
          plantilla={nuevo?.plantilla}
          onGuardado={guardado}
          onCerrar={() => (abierto ? cerrar() : setNuevo(null))}
        />
      )}
    </div>
  );
}

function FilaTramite({ t, onAbrir, onBorrar }: { t: TramiteDto; onAbrir: () => void; onBorrar: () => void }) {
  const estado = ESTADO_TRAMITE_UI[t.estado];
  const proximo = t.proximoPasoEl ?? t.venceEl;
  return (
    <tr>
      <td>
        <button type="button" className={button({ variant: "link", className: "h-auto min-h-12 flex-col items-start px-0 text-left" })} onClick={onAbrir}>
          <span className="font-semibold text-[var(--text-primary)]">{t.asunto}</span>
          <span className="text-sm font-normal text-[var(--text-tertiary)]">{entidadDe(t)}</span>
        </button>
      </td>
      <td>{personaDe(t) || <span className="text-[var(--text-tertiary)]">—</span>}</td>
      <td>
        <Insignia tono={estado.tono} texto={estado.texto} />
      </td>
      <td className={t.conteo.falta > 0 ? "text-[var(--data-warning-ink)]" : undefined}>{textoConteo(t.conteo)}</td>
      <td>
        {proximo ? (
          <span className="block">
            <span className="block">{fechaRelativa(proximo)}</span>
            <span className="block text-sm text-[var(--text-tertiary)]">{t.proximoPasoEl ? (t.proximoPaso ?? "Próximo paso") : "Vence"}</span>
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        )}
      </td>
      <td className="text-right">
        <ActionMenu
          label="Más"
          icon={MoreHorizontal}
          soloIcono
          size="md"
          className="w-12 shrink-0"
          title={`Más de «${t.asunto}»`}
          actions={[
            { id: "abrir", label: "Abrir", icon: Pencil, onSelect: onAbrir },
            { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: onBorrar },
          ]}
        />
      </td>
    </tr>
  );
}
