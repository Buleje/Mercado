"use client";

/**
 * TramitesCuerpo — los documentos que el CTP le presenta a la autoridad.
 *
 * El sistema ya generaba todo lo que el CTP REGISTRA (libro, anexo 04, GTF,
 * informe, carpeta de fiscalización). Esto es lo otro: lo que el CTP PIDE —
 * visado de talonario de GTF, inspección de campo, actualización de datos,
 * descargo ante una supervisión, permiso CITES, oficios. Antes se escribía a
 * mano en Word, cada vez desde cero y sin rastro de qué se presentó (ADR-308).
 *
 * Desde la ola 2 del panel unificado (2026-10-10) es la fase «Trámites» de
 * Herramientas y trámites: la cabina (y qué vista se ve) la pone
 * `ForestalHerramientas`; acá vive todo lo demás —los datos del autollenado,
 * el formato abierto y los avisos, ahora en un solo bloque «Pendientes»—. El
 * catálogo, el formulario y el expediente viven en sus propios archivos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorAlert } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { useForestTramites } from "@/hooks/use-forest-tramites";
import { useForestPlantaciones } from "@/hooks/use-forest-plantaciones";
import { FORMATOS_TRAMITE, datosParaDuplicar, formatoPorId, type DatosTramite } from "@/lib/forestal/tramites-catalogo";
import { tramitesPorVencer, tramitesSinRespuesta, type TramiteRegistro } from "@/lib/forestal/tramites-registro";
import { mensajeAvisoTramites } from "@/lib/forestal/tramites-aviso-mensaje";
import { avisoPlazoRelacion, relacionesDelFormato } from "@/lib/forestal/tramites-relacion-guias";
import TramiteFormulario from "./TramiteFormulario";
import TramitesCatalogo from "./TramitesCatalogo";
import TramitesExpediente from "./TramitesExpediente";
import PlantacionesModule from "./PlantacionesModule";
import TramiteAvisoGuias from "./TramiteAvisoGuias";
import TramitesPendientes, { type AvisoPlazo } from "./TramitesPendientes";
import { useTramiteDesdeGuias } from "./hooks/use-tramite-desde-guias";
import { useAutollenadoTramite } from "./hooks/use-autollenado-tramite";
import { useTramiteDesdeUrl } from "./hooks/use-tramite-desde-url";
import type { Vista } from "./tramites-grupos";

export default function TramitesCuerpo({
  vista,
  onVista,
  onAlertas,
}: {
  vista: Vista;
  onVista: (v: Vista) => void;
  /** Cuántos trámites esperan respuesta: el punto en «Expediente» de la cabina. */
  onAlertas: (sinRespuesta: number) => void;
}) {
  const [formatoId, setFormatoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<TramiteRegistro | null>(null);
  const [seedDatos, setSeedDatos] = useState<DatosTramite | null>(null);
  /** Fuerza un montaje FRESCO del formulario en cada apertura (editar,
   *  duplicar o uno nuevo): sin esto, pasar de un trámite a otro sin pasar
   *  por el catálogo reutilizaría la instancia y arrastraría estado interno
   *  (estado/N° de documento) del trámite anterior. */
  const [instancia, setInstancia] = useState(0);
  const { auto, autoListo } = useAutollenadoTramite();
  /** Casilleros que traen las guías elegidas en la vista GTF del Libro TH (07-10). */
  const [prellenado, setPrellenado] = useState<DatosTramite | null>(null);
  const desdeGuias = useTramiteDesdeGuias(autoListo, auto.ficha?.razonSocial ?? null);
  const formatoGuias = desdeGuias.pedido?.formatoId ?? null;
  const { tramites, cargando, error, setError, recargar, guardar, borrar } = useForestTramites();
  /** Sólo para el aviso "listo para presentar" — Plantaciones tiene su propio
   *  motor (ADR-380, ficha estructurada, no un `FormatoTramite`) y no vive en
   *  `tramites`; acá se lee aparte para no dejarlo huérfano fuera de esa vista. */
  const { listado: plantaciones, recargar: recargarPlantaciones } = useForestPlantaciones();
  /** Sin esto el aviso queda con la foto de cuando montó el shell: volver de
   *  Plantaciones tras marcar "listo para presentar" no lo mostraba hasta
   *  recargar la página entera (probado en vivo, no a ojo). */
  useEffect(() => {
    if (vista === "catalogo") void recargarPlantaciones();
  }, [vista, recargarPlantaciones]);

  /* Ir al Expediente o a Plantaciones cierra el formato abierto (antes lo hacía el clic en la cabina). */
  useEffect(() => {
    if (vista === "expediente" || vista === "plantaciones") setFormatoId(null);
  }, [vista]);

  const formato = formatoId ? formatoPorId(formatoId) : null;
  const esperando = useMemo(() => tramitesSinRespuesta(tramites, new Date()), [tramites]);
  useEffect(() => {
    onAlertas(esperando.length);
  }, [esperando.length, onAlertas]);
  /**
   * Vencen pronto o ya vencieron (T-3 por defecto) — mira la fecha límite que
   * el OPERADOR cargó por trámite, no un aviso genérico de 15 días para todo.
   */
  const porVencer = useMemo(() => tramitesPorVencer(tramites, new Date()), [tramites]);
  /**
   * Plantaciones "listo para presentar" que nadie tocó desde ahí (ALTO
   * IMPACTO #3 de la priorización 2026-08-22): sin este aviso, un registro
   * que ya está listo se queda huérfano hasta que alguien entra a la pestaña
   * Plantaciones por su cuenta a revisar.
   */
  const plantacionesListas = useMemo(
    () => plantaciones.filter((p) => p.estado === "listo_presentar"),
    [plantaciones],
  );
  const fichaFloja = !auto.ficha?.razonSocial || !auto.ficha?.ruc;

  /**
   * Plazo vencido (ADR-364 ronda 4): formatos con correlativo se presentan
   * período tras período — si pasaron 15+ días desde que terminó el último
   * período declarado sin uno nuevo, avisa arriba, ANTES de que el operador
   * tenga que abrir el formato para descubrirlo.
   */
  const avisosPlazo = useMemo<AvisoPlazo[]>(() => {
    const hoy = new Date();
    return FORMATOS_TRAMITE.filter((f) => f.correlativo).flatMap((f) => {
      const aviso = avisoPlazoRelacion(relacionesDelFormato(tramites, f.id), hoy);
      return aviso ? [{ formato: f, aviso }] : [];
    });
  }, [tramites]);

  const sumarGuias = useTramiteDesdeUrl({
    resultadoGuias: desdeGuias.resultado,
    formatoGuias,
    formatoId,
    instancia,
    setFormatoId,
    setEditando,
    setSeedDatos,
    setPrellenado,
    setInstancia,
    setVista: onVista,
  });

  const abrirFormato = useCallback((id: string) => {
    setFormatoId(id);
    setEditando(null);
    setSeedDatos(null);
    setPrellenado(null);
    setInstancia((n) => n + 1);
    onVista("catalogo");
  }, [onVista]);

  const abrirExpediente = useCallback((t: TramiteRegistro) => {
    setFormatoId(t.formatoId);
    setEditando(t);
    setSeedDatos(null);
    setPrellenado(null);
    setInstancia((n) => n + 1);
    onVista("catalogo");
  }, [onVista]);

  /** "Duplicar" desde el Expediente: un trámite NUEVO con los datos del viejo
   *  ya cargados (sin fechas ni tabla de guías, ver `datosParaDuplicar`) —
   *  nunca edita al original. */
  const duplicarExpediente = useCallback((t: TramiteRegistro) => {
    const formatoDe = formatoPorId(t.formatoId);
    if (!formatoDe) return;
    setFormatoId(t.formatoId);
    setEditando(null);
    setSeedDatos(datosParaDuplicar(formatoDe, t.datos ?? {}));
    setPrellenado(null);
    setInstancia((n) => n + 1);
    onVista("catalogo");
  }, [onVista]);

  return (
    <div className="space-y-4">
      {error && (
        <ErrorAlert
          title="No se pudo completar"
          description={error}
          action={
            <button type="button" onClick={() => setError(null)} className={button({ variant: "secondary" })}>
              Cerrar
            </button>
          }
        />
      )}

      {vista === "catalogo" && !formato && (
        <TramitesPendientes
          porVencer={porVencer}
          mensajeWhatsApp={mensajeAvisoTramites(porVencer)}
          plantacionesListas={plantacionesListas}
          fichaFloja={fichaFloja}
          avisosPlazo={avisosPlazo}
          onAbrirTramite={abrirExpediente}
          onAbrirPlantaciones={() => onVista("plantaciones")}
          onAbrirFormato={abrirFormato}
        />
      )}

      {vista === "catalogo" && !formato && (
        <TramitesCatalogo tramites={tramites} onElegir={abrirFormato} onAbrirPlantaciones={() => onVista("plantaciones")} />
      )}

      {vista === "catalogo" && (!formato || formato.id === formatoGuias) && <TramiteAvisoGuias d={desdeGuias} />}

      {vista === "catalogo" && formato && (
        <TramiteFormulario
          key={instancia}
          formato={formato}
          auto={auto}
          existente={editando}
          seedDatos={seedDatos}
          prellenado={prellenado}
          sumarGuias={sumarGuias?.instancia === instancia ? sumarGuias : null}
          tramites={tramites}
          onGuardar={guardar}
          onCerrar={() => {
            setFormatoId(null);
            setEditando(null);
            setSeedDatos(null);
            setPrellenado(null);
            desdeGuias.descartar();
          }}
        />
      )}

      {vista === "expediente" && (
        <TramitesExpediente
          tramites={tramites}
          cargando={cargando}
          onRecargar={() => void recargar()}
          onAbrir={abrirExpediente}
          onDuplicar={duplicarExpediente}
          onBorrar={(id) => void borrar(id)}
        />
      )}

      {vista === "plantaciones" && <PlantacionesModule />}
    </div>
  );
}
