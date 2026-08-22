"use client";

/**
 * TramiteFormulario — llenar un formato y sacarlo impreso.
 *
 * Los campos los declara el catálogo (`tramites-catalogo`), no este componente:
 * un trámite nuevo aparece acá solo. Lo que sí vive acá es el AUTOLLENADO —
 * traer de la Ficha CTP y del Libro lo que el operador no debería volver a
 * tipear (razón social, serie y último correlativo de GTF, volúmenes del
 * período). Ese es el punto del módulo: el membrete y los datos ya están.
 *
 * Diseño (2026-07-29): trece campos en una grilla plana se leían como un
 * formulario del Estado. Ahora van en tres bloques (a quién va · qué se pide ·
 * quién firma) con el documento vivo al lado — antes había que imprimir para
 * ver cómo quedaba. En pantallas chicas el papel pasa a una pestaña.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  FileDown,
  FileText,
  HardDrive,
  Loader2,
  Maximize2,
  Save,
  SlidersHorizontal,
} from "@buleje/design-system/icons";
import { buildTramiteHtml, imprimirTramite, TRAMITE_PREVIEW_CSS } from "@/lib/forestal/tramites-print";
import { archivarEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import { nombreArchivoTramite, tramiteDocumentoAPdf } from "@/lib/forestal/tramites-documento-pdf";
import {
  AUTORIDADES,
  GRUPOS_CAMPO,
  asuntoDe,
  faltantesDelTramite,
  type DatosTramite,
  type FormatoTramite,
} from "@/lib/forestal/tramites-catalogo";
import type { TramiteRegistro } from "@/lib/forestal/tramites-registro";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import {
  gtfDuplicadaEntreRelaciones,
  parseGuiasInforme,
  periodoDesdeSugerido,
  relacionesDelFormato,
} from "@/lib/forestal/tramites-relacion-guias";
import {
  borrarLogoTramite,
  guardarLogoTramite,
  leerArchivoLogo,
  leerLogoTramite,
  LOGO_MAX_BYTES,
  type LogoTramite,
} from "@/lib/forestal/tramites-logo";
import { Btn } from "./ctp-shared";
import TramiteArchivadorOffscreen, { type TramiteArchivadorHandle } from "./TramiteArchivadorOffscreen";
import TramiteCamposPanel from "./TramiteCamposPanel";
import TramiteDocumentoModal from "./TramiteDocumentoModal";
import TramitePreview from "./TramitePreview";
import type { GuardarTramiteInput } from "@/hooks/use-forest-tramites";

/** Carpeta del Drive donde se archivan los trámites — distinta de la de guías GTF. */
const CARPETA_TRAMITES = "Trámites y Oficios (CTP)";

/** Lo que el sistema puede completar solo: identidad + datos del libro. */
export interface AutollenadoTramite {
  ficha: CtpReportFicha | null;
  /** Serie de GTF en uso y último correlativo emitido (del Registro de Salida). */
  serieGtf?: string;
  ultimoCorrelativo?: string;
  /** Período elegido en el Libro y sus cifras. */
  periodo?: string;
  ingresosCount?: number;
  volumenIngresado?: string;
  despachosCount?: number;
  /** Especie CITES del período (para el permiso de exportación). */
  especieCites?: string;
}

/** Valor sugerido para un campo con `autollenado`. */
function sugerido(campoId: string, auto: AutollenadoTramite): string {
  const f = auto.ficha ?? {};
  switch (campoId) {
    case "firmante":
      return f.razonSocial ?? "";
    case "lugar":
      return f.provincia?.trim() || f.region?.trim() || "";
    case "serieActual":
      return auto.serieGtf ?? "";
    case "ultimoCorrelativo":
      return auto.ultimoCorrelativo ?? "";
    case "periodo":
      return auto.periodo ?? "";
    case "ingresosCount":
      return auto.ingresosCount != null ? String(auto.ingresosCount) : "";
    case "volumenIngresado":
      return auto.volumenIngresado ?? "";
    case "despachosCount":
      return auto.despachosCount != null ? String(auto.despachosCount) : "";
    case "especie":
      return auto.especieCites ?? "";
    case "entidadNombre":
      return f.razonSocial ?? "";
    case "entidadRuc":
      return f.ruc ?? "";
    case "entidadRepresentante":
      return f.representante ?? "";
    case "serieGtfInforme":
      return auto.serieGtf ?? "";
    case "membreteEmpresa":
      return f.razonSocial ?? "";
    default:
      return "";
  }
}

export default function TramiteFormulario({
  formato,
  auto,
  existente,
  tramites,
  onGuardar,
  onCerrar,
}: {
  formato: FormatoTramite;
  auto: AutollenadoTramite;
  /** Si se abrió desde el expediente: se edita ese trámite. */
  existente?: TramiteRegistro | null;
  /** Todo el expediente del tenant — sólo se usa en formatos con `correlativo`
   *  (continuidad de período, historial, duplicados cruzados; ADR-364 ronda 4). */
  tramites: TramiteRegistro[];
  onGuardar: (input: GuardarTramiteInput) => Promise<TramiteRegistro | null>;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<DatosTramite>({});
  const [estado, setEstado] = useState<string>(existente?.estado ?? "borrador");
  const [expediente, setExpediente] = useState(existente?.expedienteAutoridad ?? "");
  const [fechaPresentacion, setFechaPresentacion] = useState(existente?.fechaPresentacion ?? "");
  const [fechaLimite, setFechaLimite] = useState(existente?.fechaLimite ?? "");
  const [notas, setNotas] = useState(existente?.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * Id del expediente una vez guardado. Sin esto, guardar dos veces creaba DOS
   * trámites del mismo documento: el `save` es upsert por id y el segundo POST
   * iba sin id. Se adopta el que devolvió el servidor.
   */
  const [idGuardado, setIdGuardado] = useState<string | null>(existente?.id ?? null);
  /** N° de documento correlativo (ADR-364 ronda 3) — `null` hasta el primer
   *  "Presentado"; lo asigna el servidor, acá sólo se refleja. */
  const [numeroDocumento, setNumeroDocumento] = useState<string | null>(existente?.numeroDocumento ?? null);
  /** Móvil: el papel no cabe al lado, va en su propia pestaña. */
  const [panelMovil, setPanelMovil] = useState<"formulario" | "documento">("formulario");
  const [modalDocumento, setModalDocumento] = useState(false);
  const [archivando, setArchivando] = useState(false);
  const archivadorRef = useRef<TramiteArchivadorHandle>(null);
  /** Logo del membrete (ADR-364 ronda 6) — por tenant, no por trámite: se
   *  sube una vez y queda para todos los documentos que se emitan después. */
  const [logo, setLogo] = useState<LogoTramite | null>(() => leerLogoTramite());

  async function onLogoArchivo(file?: File) {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setAviso("La imagen pesa demasiado — probá con una más liviana.");
      return;
    }
    try {
      const leido = await leerArchivoLogo(file);
      guardarLogoTramite(leido);
      setLogo(leido);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    }
  }

  function onLogoQuitar() {
    borrarLogoTramite();
    setLogo(null);
  }

  // Al abrir: lo guardado (si se edita) o lo que el sistema puede completar.
  useEffect(() => {
    if (existente) {
      setDatos(existente.datos ?? {});
      return;
    }
    const base: DatosTramite = {};
    for (const c of formato.campos) {
      const s = c.autollenado ? sugerido(c.id, auto) : "";
      if (s) base[c.id] = s;
    }
    setDatos(base);
    // `auto` cambia con el período; re-llenar al vuelo pisaría lo tipeado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formato.id, existente]);

  const set = (id: string, valor: string) => setDatos((p) => ({ ...p, [id]: valor }));
  const faltantes = useMemo(() => faltantesDelTramite(formato, datos), [formato, datos]);
  // `guiasJson` no es un campo de `formato.campos` (tiene forma propia, ver
  // TramiteRelacionGuias): se exige aparte, sin sumar al conteo de "obligatorios".
  const sinGuias = Boolean(formato.tablaGuias) && parseGuiasInforme(datos.guiasJson).length === 0;
  const requeridos = useMemo(() => formato.campos.filter((c) => c.requerido), [formato]);
  const listos = requeridos.length - faltantes.length;
  const autoridad = AUTORIDADES[formato.autoridad];
  const autollenados = useMemo(
    () => formato.campos.filter((c) => c.autollenado && (datos[c.id] ?? "").trim()).length,
    [formato, datos],
  );
  /** Cuenta regresiva de la fecha límite (si el operador la cargó) — el aviso
   *  T-3 vive en el shell (`ForestalTramites`), esto es sólo el chip visible
   *  mientras se está EDITANDO este trámite puntual. */
  const diasHastaLimite = useMemo(() => {
    if (!fechaLimite.trim() || estado === "resuelto" || estado === "desistido") return null;
    const d = new Date(`${fechaLimite}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return null;
    const hoy = new Date();
    const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
    return Math.floor((d.getTime() - hoyUtc) / 86_400_000);
  }, [fechaLimite, estado]);
  // Sólo los grupos que este formato realmente usa, para numerar sin huecos
  // ("1, 2, 4" si un grupo no aplica se lee como que falta el 3).
  const gruposVisibles = useMemo(
    () => GRUPOS_CAMPO.filter((g) => formato.campos.some((c) => (c.grupo ?? "datos") === g.id)),
    [formato],
  );

  // Continuidad de período + historial + duplicados cruzados (ADR-364 ronda 4)
  // — sólo tiene sentido en formatos con correlativo, que son los que se
  // presentan período tras período sin poder solaparse.
  const relacionesFormato = useMemo(
    () => (formato.correlativo ? relacionesDelFormato(tramites, formato.id) : []),
    [tramites, formato],
  );
  const idActual = idGuardado ?? existente?.id ?? null;
  const otrasRelaciones = useMemo(
    () => relacionesFormato.filter((t) => t.id !== idActual),
    [relacionesFormato, idActual],
  );
  const sugerenciaPeriodo = useMemo(() => periodoDesdeSugerido(otrasRelaciones), [otrasRelaciones]);
  const duplicadosCruzados = useMemo(
    () => (formato.tablaGuias ? gtfDuplicadaEntreRelaciones(parseGuiasInforme(datos.guiasJson), otrasRelaciones) : []),
    [formato, datos.guiasJson, otrasRelaciones],
  );

  /** Carpeta del Drive: la propia del formato si declara una, si no la genérica. */
  const carpetaDrive = formato.carpetaDrive ?? CARPETA_TRAMITES;

  function imprimir() {
    try {
      imprimirTramite({ formato, datos, ficha: auto.ficha, numeroDocumento: numeroDocumento ?? undefined, logo });
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * "Vista previa en pestaña" — la MISMA ventana imprimible de `imprimir()`,
   * pero sin esperar a que el trámite esté completo: Brandon la pidió para
   * mirar el borrador a medio llenar, no sólo el documento listo para
   * presentar. `imprimirTramite` ya abre sin disparar el diálogo de impresión
   * (el usuario decide desde ahí), así que reusarla tal cual alcanza.
   */
  function verEnPestana() {
    try {
      imprimirTramite({ formato, datos, ficha: auto.ficha, numeroDocumento: numeroDocumento ?? undefined, logo });
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Guarda el PDF del trámite en el Drive, como ya hacen las GTF y el informe
   * ARFFS del Libro CTP: se fotografía el documento (offscreen, mismo patrón
   * que `CtpArchivadorAuto`) y sube a una carpeta propia, con el asunto y la
   * autoridad como etiquetas — así se busca desde el Drive sin volver acá.
   * `carpetaDrive`: cada formato puede declarar la suya (`FormatoTramite.carpetaDrive`)
   * para no perderse entre los otros ocho — si no declara, cae en la genérica.
   */
  async function guardarEnDrive() {
    setArchivando(true);
    setAviso(null);
    try {
      const body = buildTramiteHtml({ formato, datos, ficha: auto.ficha, numeroDocumento: numeroDocumento ?? undefined, logo });
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>${TRAMITE_PREVIEW_CSS}html{background:#fff}.aviso{display:none}</style></head><body>${body}</body></html>`;
      const doc = await archivadorRef.current?.capturar(html);
      if (!doc) throw new Error("No se pudo preparar el documento para el PDF.");
      const pdf = await tramiteDocumentoAPdf(doc);
      const nombreBase = `${formato.nombre}${numeroDocumento ? ` N° ${numeroDocumento}` : ""} — ${auto.ficha?.razonSocial ?? "CTP"} — ${new Date().toISOString().slice(0, 10)}`;
      const nombre = nombreArchivoTramite(nombreBase);
      await archivarEnDrive({
        archivo: pdf,
        nombreArchivo: nombre,
        carpeta: carpetaDrive,
        etiquetas: [autoridad.corto, formato.nombre],
        descripcion: asuntoDe(formato, datos),
      });
      setAviso(`Guardado en el Drive · carpeta "${carpetaDrive}".`);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    } finally {
      setArchivando(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    const guardado = await onGuardar({
      id: idGuardado ?? existente?.id,
      formatoId: formato.id,
      formatoNombre: formato.nombre,
      autoridad: formato.autoridad,
      asunto: asuntoDe(formato, datos),
      datos,
      estado,
      expedienteAutoridad: expediente.trim() || null,
      fechaPresentacion: fechaPresentacion.trim() || null,
      fechaLimite: fechaLimite.trim() || null,
      notas: notas.trim() || null,
    });
    setGuardando(false);
    if (guardado) {
      setIdGuardado(guardado.id);
      setEstado(guardado.estado);
      setFechaPresentacion(guardado.fechaPresentacion ?? "");
      setFechaLimite(guardado.fechaLimite ?? "");
      const numeroNuevo = !numeroDocumento && guardado.numeroDocumento;
      setNumeroDocumento(guardado.numeroDocumento);
      setAviso(
        numeroNuevo
          ? `Guardado y numerado como N° ${guardado.numeroDocumento} — ya podés presentarlo.`
          : idGuardado || existente
            ? "Cambios guardados en el expediente."
            : "Guardado en el expediente: ya podés seguirlo desde ahí.",
      );
    }
  }

  // Panel de campos: se muestra en la columna del formulario O adentro del
  // modal — NUNCA los dos a la vez (`TramiteRelacionGuias`, adentro, siembra
  // su estado desde `value` una sola vez al montar; dos copias vivas
  // divergirían en cuanto se edite una). El modal lo pide sólo cuando está
  // abierto; acá se oculta mientras tanto.
  const panelCampos = (
    <TramiteCamposPanel
      formato={formato}
      datos={datos}
      setDatos={setDatos}
      set={set}
      gruposVisibles={gruposVisibles}
      sugerenciaPeriodo={sugerenciaPeriodo}
      relacionesFormato={relacionesFormato}
      idActual={idActual}
      duplicadosCruzados={duplicadosCruzados}
      existente={existente}
      estado={estado}
      setEstado={setEstado}
      expediente={expediente}
      setExpediente={setExpediente}
      fechaPresentacion={fechaPresentacion}
      setFechaPresentacion={setFechaPresentacion}
      fechaLimite={fechaLimite}
      setFechaLimite={setFechaLimite}
      notas={notas}
      setNotas={setNotas}
      logo={logo}
      onLogoArchivo={onLogoArchivo}
      onLogoQuitar={onLogoQuitar}
    />
  );

  // Mismas acciones que la barra inferior de la página — el modal es una
  // superficie completa de edición, así que necesita poder guardar/imprimir
  // sin volver acá (Brandon 2026-08-20: "las opciones de editar en la misma página").
  const barraAcciones = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-[var(--text-tertiary)]">
        {faltantes.length > 0
          ? `Falta: ${faltantes.map((f) => f.label).join(", ")}${sinGuias ? " · agregá al menos una guía" : ""}`
          : sinGuias
            ? "Agregá al menos una guía en la tabla antes de imprimir."
            : "El documento sale con tu membrete; la firma va a mano."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Btn variant="secondary" disabled={guardando} onClick={() => void guardar()}>
          <Save className="h-4 w-4" />
          {guardando ? "Guardando…" : idGuardado || existente ? "Guardar cambios" : "Guardar en expediente"}
        </Btn>
        <Btn variant="secondary" disabled={archivando} onClick={() => void guardarEnDrive()}>
          {archivando ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
          {archivando ? "Guardando…" : "PDF al Drive"}
        </Btn>
        <Btn variant="dark" disabled={faltantes.length > 0 || sinGuias} onClick={imprimir}>
          <FileDown className="h-4 w-4" />
          Imprimir / PDF
        </Btn>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Cabecera del trámite: identidad editorial + a quién va + progreso. */}
      <div
        className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] p-5"
        style={{ background: "linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-raised) 60%)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-raised)]/80 px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                {autoridad.label}
              </span>
              {/* Correlativo: se asigna sólo al primer "Presentado" (ADR-364
                  ronda 3) — antes de eso, avisa que todavía no tiene número
                  en vez de mostrar un chip vacío. */}
              {formato.correlativo && (
                numeroDocumento ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[length:var(--ts-2xs)] font-black text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    N° {numeroDocumento}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--rule-base)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]" title="Se asigna solo al guardar con estado Presentado">
                    Sin N° — se asigna al presentar
                  </span>
                )
              )}
              {/* Cuenta regresiva de la fecha límite que cargó el operador —
                  el sistema no inventa el plazo, sólo cuenta lo que ya le
                  dijeron (ADR próximo: plazos por trámite). */}
              {diasHastaLimite !== null && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-black ${
                    diasHastaLimite < 0
                      ? "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                      : diasHastaLimite <= 3
                        ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "bg-[var(--surface-raised)]/80 text-[var(--text-secondary)]"
                  }`}
                >
                  {diasHastaLimite < 0
                    ? `Venció hace ${Math.abs(diasHastaLimite)} ${Math.abs(diasHastaLimite) === 1 ? "día" : "días"}`
                    : diasHastaLimite === 0
                      ? "Vence hoy"
                      : `Vence en ${diasHastaLimite} ${diasHastaLimite === 1 ? "día" : "días"}`}
                </span>
              )}
            </div>
            <h3 className="font-display mt-2 text-2xl leading-tight text-[var(--text-primary)]">{formato.nombre}</h3>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{formato.proposito}</p>
          </div>
          <Btn variant="secondary" onClick={onCerrar}>
            <ArrowLeft className="h-4 w-4" />
            Otros trámites
          </Btn>
        </div>

        {/* Progreso de lo obligatorio: cuántos campos faltan, no un % abstracto. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--motion-base)]"
              style={{ width: `${requeridos.length ? (listos / requeridos.length) * 100 : 100}%` }}
            />
          </div>
          <p className="text-sm font-bold text-[var(--text-secondary)]">
            {faltantes.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                <Check className="h-4 w-4" /> Listo para presentar
              </span>
            ) : (
              `${listos} de ${requeridos.length} datos obligatorios`
            )}
          </p>
          {autollenados > 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              {autollenados} {autollenados === 1 ? "campo llenado" : "campos llenados"} con tus datos del Libro
            </p>
          )}
        </div>

        {formato.advertencia && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formato.advertencia}</span>
          </p>
        )}
      </div>

      {aviso && (
        <p className="rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-3 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
          {aviso}
        </p>
      )}

      {/* Móvil: alternar entre llenar y ver el papel. */}
      <div className="flex gap-2 xl:hidden">
        {(
          [
            { key: "formulario", label: "Llenar", icon: SlidersHorizontal },
            { key: "documento", label: "Ver documento", icon: FileText },
          ] as const
        ).map((t) => {
          const Icono = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setPanelMovil(t.key)}
              aria-pressed={panelMovil === t.key}
              className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition ${
                panelMovil === t.key
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
              }`}
            >
              <Icono className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* `pb-20`: la barra de acciones es sticky y sin esto tapaba el último
          campo (el firmante quedaba detrás del botón de imprimir). */}
      <div className="grid gap-4 pb-20 xl:grid-cols-[minmax(0,1fr)_28rem]">
        {/* ── Columna 1: los campos — oculta mientras el modal la usa (ver
            `panelCampos` arriba: nunca dos copias vivas a la vez). ── */}
        <div className={`space-y-4 ${panelMovil === "documento" ? "max-xl:hidden" : ""}`}>
          {!modalDocumento && panelCampos}
        </div>

        {/* ── Columna 2: el papel, pegado mientras se hace scroll ── */}
        <div className={panelMovil === "formulario" ? "max-xl:hidden" : ""}>
          <TramitePreview
            formato={formato}
            datos={datos}
            ficha={auto.ficha}
            numeroDocumento={numeroDocumento}
            logo={logo}
            onCampoChange={set}
            className="xl:sticky xl:top-4"
            acciones={
              <>
                <button
                  type="button"
                  onClick={verEnPestana}
                  title="Ver en una pestaña nueva"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalDocumento(true)}
                  title="Ver en grande"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </>
            }
          />
        </div>
      </div>

      <TramiteDocumentoModal
        open={modalDocumento}
        onClose={() => setModalDocumento(false)}
        formato={formato}
        datos={datos}
        ficha={auto.ficha}
        numeroDocumento={numeroDocumento}
        logo={logo}
        editor={modalDocumento ? panelCampos : null}
        footer={barraAcciones}
        onCampoChange={set}
      />
      <TramiteArchivadorOffscreen handleRef={archivadorRef} />

      {/* Acciones: pegadas al pie, siempre alcanzables. */}
      <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur">
        {barraAcciones}
      </div>
    </div>
  );
}
