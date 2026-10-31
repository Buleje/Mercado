"use client";

/**
 * La columna «Acciones» de la tabla GTF del Libro TH (Brandon 07-10: «tipo tres
 * puntitos para comprimir las opciones, porque están muchas y la columna se
 * hace demasiado ancha»).
 *
 * A la vista queda sólo lo de uso constante: «Ingresar al CTP» cuando la guía
 * de trozas está por ingresar. Todo lo demás va en el menú ⋯ (`ActionMenu`,
 * que se dibuja en un portal: el `overflow-x-auto` de la tabla no lo corta),
 * con las MISMAS condiciones que tenían los botones de la fila:
 *   · Datos → sólo si guardó su ficha de SERFOR (importada) · Hoja SERFOR y
 *     Resumen interno (R1-R4) → siempre (anulada: con su sello)
 *   · Imprimir en talonario → viva: sólo los valores sobre el talonario
 *     preimpreso de la matricial (15-10, `GtfMatricialModal`)
 *   · Imprimir con formato → viva: la guía y su lista en hoja blanca, con el
 *     formato entero (27-10, `use-gtf-con-formato`; una anulada no: parecería válida)
 *   · Enviar al monte → viva: a la cola «Por imprimir» del celular + WhatsApp
 *     (16-10); ya impresa dice «Ya impresa en la hoja N° …» y sólo deja
 *     «Reimprimir en otra hoja» con motivo
 *   · Documentos del permiso → siempre; sin permiso, sólo los de la guía (ADR-467/482)
 *   · Cubicar en Oxapampina → viva y de trozas (K7 · ADR-483)
 *   · Ver ingresos → ya entró al Libro CTP
 *   · Asignar permiso → viva, de trozas y sin permiso (15-10); también como botón
 *   · Desatar del permiso → viva, de trozas y con permiso (25-10): vuelve a sin plan
 *   · Pedir corrección → viva (ADR-512); con uno abierto, deshabilitada y con chip
 *   · Deshacer la importación → viva e importada · Anular → viva
 * `soloLectura` (la pestaña «Anuladas y otras»): sólo Datos, Hoja, Resumen y
 * Documentos del permiso.
 *
 * Los modales de «Datos», «Documentos» y «Deshacer» se montan sólo abiertos (uno por fila).
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Eye, FileText, FileWarning, FolderOpen, Link2, Link2Off, LogIn, Printer, ReceiptText, Ruler, Send, Undo2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { importacionDeLaGuia } from "@/lib/forestal/loth-importar-guia-deshacer";
import { fichaDeGuiaImportada } from "@/lib/forestal/loth-importar-guia-ficha";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { Gtf } from "./gtf-tabla-columnas";
import ModalFichaImportada from "./LothImportarGuiasFicha";
import { ModalDeshacer } from "./LothImportarGuiasDeshacer";
import { verIngresosDelCtp } from "./LothGtfCtp";
import GtfDocumentosModal from "./GtfDocumentosModal";
import LothGtfCubicarModal from "./LothGtfCubicarModal";
import LothGtfAsignarPermiso from "./LothGtfAsignarPermiso";
import LothGtfDesatarPermiso from "./LothGtfDesatarPermiso";
import GtfMatricialModal from "./GtfMatricialModal";
import { fuenteLoth, useGtfConFormato } from "./hooks/use-gtf-con-formato";
import GtfEnviarAlMonteModal from "./GtfEnviarAlMonteModal";
import { useColaMonteCtx } from "./cola-monte-contexto";
import { etiquetaMonteImpresa } from "./gtf-monte-ya-impresa";
import { useCorreccionDeLaFila } from "./correccion-guia/use-correccion-de-la-fila";
import CorreccionChip from "./correccion-guia/CorreccionChip";
import PedirCorreccionLoth from "./correccion-guia/PedirCorreccionLoth";

/** La guía salió sin permiso y todavía se le puede asignar uno (viva y de trozas). */
export const pideAsignarPermiso = (g: Pick<Gtf, "planId" | "status" | "deletedAt" | "tipo">): boolean =>
  !g.planId && g.status !== "anulada" && !g.deletedAt && g.tipo === "trozas";

/** El código del permiso de la guía: el título que guardó o, en una plantación, el (5) de sus casilleros. */
export const permisoDeLaGuiaGtf = (g: Pick<Gtf, "tituloHabilitante" | "gtfDatos">): string | null =>
  g.tituloHabilitante?.trim() || (g.gtfDatos ? leerGtfDatos(g.gtfDatos).titulos[0]?.trim() : "") || null;

export interface AccionesGtfProps {
  g: Gtf;
  /** Guía de trozas viva que la bandeja del CTP ofrece ingresar. */
  porIngresar?: boolean;
  /** Pestaña de bajas: sin ingresar, deshacer ni anular. */
  soloLectura?: boolean;
  onIngresarCtp?: (gtfNumber: string) => void;
  onHoja: (g: Gtf) => void;
  onResumen: (g: Gtf) => void;
  onAnular?: (id: string) => void;
  onRecargar?: () => void;
}

/** Las opciones del menú ⋯ de una guía, en su orden. Puro: lo leen el menú y las pruebas. */
export function opcionesGtf(
  g: Gtf,
  {
    soloLectura = false,
    abrirDatos,
    abrirDeshacer,
    abrirDocumentos,
    abrirCubicar,
    abrirPermiso,
    abrirDesatar,
    abrirTalonario,
    imprimirConFormato,
    conFormatoOcupado = false,
    abrirMonte,
    abrirCorreccion,
    correccionAbierta = false,
    monteImpresa = null,
    onHoja,
    onResumen,
    onAnular,
  }: {
    soloLectura?: boolean;
    abrirDatos: () => void;
    abrirDeshacer: () => void;
    abrirDocumentos?: () => void;
    abrirCubicar?: () => void;
    abrirPermiso?: () => void;
    abrirDesatar?: () => void;
    abrirTalonario?: () => void;
    imprimirConFormato?: () => void;
    /** Pidiendo los datos de la guía para imprimirla con formato. */
    conFormatoOcupado?: boolean;
    abrirMonte?: () => void;
    abrirCorreccion?: () => void;
    /** Ya hay un pedido de corrección abierto (Pendiente o En revisión): no se pide otro. */
    correccionAbierta?: boolean;
    /** «Ya impresa en la hoja N° …» si la guía ya salió del talonario (`etiquetaMonteImpresa`). */
    monteImpresa?: string | null;
    onHoja: (g: Gtf) => void;
    onResumen: (g: Gtf) => void;
    onAnular?: (id: string) => void;
  },
): MenuAccion[] {
  const viva = g.status !== "anulada" && !g.deletedAt && !soloLectura;
  const a: MenuAccion[] = [];
  if (fichaDeGuiaImportada(g.gtfDatos)) {
    a.push({ id: "datos", label: "Datos", hint: "La guía como la publica SERFOR y su lista de trozas", icon: Eye, onSelect: abrirDatos });
  }
  a.push({
    id: "hoja",
    label: "Imprimir hoja SERFOR",
    hint: g.status === "anulada" || g.deletedAt ? "Sale con el sello de anulada" : "La hoja de casilleros (mismo formato que el Libro CTP)",
    icon: Printer,
    tone: "dark",
    onSelect: () => onHoja(g),
  });
  a.push({
    id: "resumen",
    label: "Imprimir resumen interno",
    hint: "Por especie y árbol, cuadre, dónde está cada troza y saldo del permiso",
    icon: FileText,
    onSelect: () => onResumen(g),
  });
  if (viva && abrirTalonario) {
    a.push({
      id: "talonario",
      label: "Imprimir en talonario",
      hint: "Sólo los valores, cada uno en su casillero del talonario de la matricial",
      icon: ReceiptText,
      onSelect: abrirTalonario,
    });
  }
  if (viva && imprimirConFormato) {
    a.push({
      id: "con-formato",
      label: "Imprimir con formato",
      hint: "La guía y su lista en hoja blanca, con todo el formato y sus valores",
      icon: FileText,
      busy: conFormatoOcupado,
      onSelect: imprimirConFormato,
    });
  }
  if (viva && abrirMonte) {
    a.push(
      monteImpresa
        ? { id: "monte", label: monteImpresa, hint: "Ver la foto · Reimprimir en otra hoja si se dañó", icon: CheckCircle2, onSelect: abrirMonte }
        : { id: "monte", label: "Enviar al monte", hint: "A la cola «Por imprimir» del celular del monte, con aviso por WhatsApp", icon: Send, onSelect: abrirMonte },
    );
  }
  if (abrirDocumentos) {
    /* Una anulada no recibe papeles (el servidor responde 404): sólo quedan las carpetas del plan. */
    const baja = g.status === "anulada" || !!g.deletedAt;
    a.push({
      id: "documentos",
      label: "Documentos del permiso",
      /* ADR-482: los papeles de la guía (factura, remisión, GTF, lista firmada) no dependen del plan. */
      hint: baja
        ? g.planId ? "Guía anulada: sólo las carpetas del plan" : "Guía anulada: ya no recibe papeles"
        : g.planId ? "Papeles de la guía y carpetas del plan: subir, ver, imprimir o enviar por WhatsApp" : "Papeles de la guía: factura, remisión, GTF, lista firmada",
      icon: FolderOpen,
      disabled: baja && !g.planId,
      onSelect: abrirDocumentos,
    });
  }
  if (viva && abrirCubicar && g.tipo === "trozas") {
    a.push({
      id: "cubicar",
      label: "Cubicar en Oxapampina",
      hint: "Con descuentos, para comprar o vender; al lado la cifra SERFOR",
      icon: Ruler,
      onSelect: abrirCubicar,
    });
  }
  if (viva && abrirPermiso && pideAsignarPermiso(g)) {
    a.push({ id: "permiso", label: "Asignar permiso", hint: "Salió sin permiso: ata la guía, sus trozas y sus despachos al permiso que elijas", icon: Link2, onSelect: abrirPermiso });
  }
  if (viva && abrirDesatar && g.planId && g.tipo === "trozas") {
    a.push({ id: "desatar", label: "Desatar del permiso", hint: "La guía y sus líneas vuelven a sin plan: cuentan en el saldo de cada plan vigente", icon: Link2Off, tone: "danger", onSelect: abrirDesatar });
  }
  if (viva && g.ctp === "ingresada") {
    a.push({ id: "ingresos", label: "Ver sus ingresos en el CTP", hint: "Abre Ingresos del Libro CTP", icon: LogIn, onSelect: verIngresosDelCtp });
  }
  if (viva && abrirCorreccion) {
    a.push({
      id: "correccion",
      label: "Pedir corrección",
      hint: correccionAbierta
        ? "Ya tiene un pedido abierto: espera la respuesta de la plataforma"
        : "La guía emitida no se edita: la plataforma revisa tu pedido y, si corresponde, la anula y la emite de nuevo",
      icon: FileWarning,
      disabled: correccionAbierta,
      onSelect: abrirCorreccion,
    });
  }
  if (viva && importacionDeLaGuia(g.observations)) {
    a.push({
      id: "deshacer",
      label: "Deshacer la importación",
      hint: "Anula la guía, sus despachos y los trozados y talas referenciales que creó",
      icon: Undo2,
      tone: "danger",
      onSelect: abrirDeshacer,
    });
  }
  if (viva && onAnular) {
    a.push({ id: "anular", label: "Anular la guía", hint: "Queda en el libro con su motivo; no se borra", icon: Ban, tone: "danger", onSelect: () => onAnular(g.id) });
  }
  return a;
}

export default function AccionesGtf({
  g, porIngresar = false, soloLectura = false, onIngresarCtp, onHoja, onResumen, onAnular, onRecargar,
}: AccionesGtfProps) {
  const [abierto, setAbierto] = useState<"datos" | "deshacer" | "documentos" | "cubicar" | "permiso" | "desatar" | "talonario" | "monte" | null>(null);
  const cerrar = () => setAbierto(null);
  /* Se escribió algo (permiso, desatar, deshacer): se cierra y la lista se relee. */
  const hecho = () => {
    setAbierto(null);
    onRecargar?.();
  };
  /* La pastilla de la fila (vivo o, si no hay, la última confirmada): ya impresa = otro envío gastaría otra hoja. */
  const monteImpresa = etiquetaMonteImpresa(useColaMonteCtx()?.porGuia.get(g.id));
  /* ADR-512: el pedido de corrección de la guía (una sola llamada para toda la lista, en el proveedor). */
  const corr = useCorreccionDeLaFila(g.id, !soloLectura && g.status !== "anulada" && !g.deletedAt);
  /* «Imprimir con formato» sin abrir el diseñador: pide titular y fecha del talonario al elegirlo. */
  const cf = useGtfConFormato(useMemo(() => fuenteLoth(g), [g]));
  useEffect(() => {
    if (cf.error) toast.error(cf.error);
  }, [cf.error]);
  const acciones = useMemo(
    () =>
      opcionesGtf(g, {
        soloLectura,
        abrirDatos: () => setAbierto("datos"),
        abrirDeshacer: () => setAbierto("deshacer"),
        abrirDocumentos: () => setAbierto("documentos"),
        abrirCubicar: () => setAbierto("cubicar"),
        abrirPermiso: () => setAbierto("permiso"),
        abrirDesatar: () => setAbierto("desatar"),
        abrirTalonario: () => setAbierto("talonario"),
        imprimirConFormato: () => void cf.imprimir(["guia", "lista"]),
        conFormatoOcupado: cf.ocupado === "imprimir",
        abrirMonte: () => setAbierto("monte"),
        abrirCorreccion: corr.puede ? () => corr.abrir("fila") : undefined,
        correccionAbierta: corr.abierta,
        monteImpresa,
        onHoja,
        onResumen,
        onAnular,
      }),
    [g, soloLectura, monteImpresa, corr.puede, corr.abierta, corr.abrir, cf.imprimir, cf.ocupado, onHoja, onResumen, onAnular],
  );
  return (
    <div className="flex items-center justify-end gap-2">
      {porIngresar && !soloLectura && g.status !== "anulada" && !g.deletedAt && onIngresarCtp && (
        <button
          type="button"
          onClick={() => onIngresarCtp(g.gtfNumber)}
          title="Registrar estas trozas como ingreso en el Libro de Operaciones del CTP"
          className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-primary/15 dark:text-[var(--accent)]"
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden /> Ingresar al CTP
        </button>
      )}
      {!soloLectura && pideAsignarPermiso(g) && (
        <button
          type="button"
          onClick={() => setAbierto("permiso")}
          title="Esta guía salió sin permiso: elige a cuál pertenecen sus trozas"
          className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border-2 border-[var(--data-warning-500)] px-2.5 text-xs font-bold text-[var(--data-warning-700)] hover:bg-[var(--data-warning-50)] dark:text-[var(--data-warning-500)] dark:hover:bg-[var(--data-warning-500)]/10"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden /> Asignar permiso
        </button>
      )}
      {corr.solicitud && <CorreccionChip s={corr.solicitud} />}
      <ActionMenu label={`Acciones de la GTF ${g.gtfNumber}`} title="Más acciones" actions={acciones} soloIcono size="xs" />
      {abierto === "datos" && (
        <ModalFichaImportada gtfDatos={g.gtfDatos} gtfNumber={g.gtfNumber} items={g.items} onClose={() => setAbierto(null)}
          onPedirCorreccion={corr.puede && !corr.abierta ? () => corr.abrir("ventana") : undefined} />
      )}
      {corr.desde && (
        <PedirCorreccionLoth g={g} aboveModals={corr.desde === "ventana" && abierto === "datos"} onClose={corr.cerrar} />
      )}
      {abierto === "documentos" && (
        <GtfDocumentosModal planId={g.planId ?? null} permiso={permisoDeLaGuiaGtf(g)} gtfNumber={g.gtfNumber} sinPapeles={g.status === "anulada" || !!g.deletedAt} onClose={() => setAbierto(null)} />
      )}
      {abierto === "cubicar" && <LothGtfCubicarModal g={g} onClose={() => setAbierto(null)} />}
      {abierto === "talonario" && <GtfMatricialModal g={g} onClose={() => setAbierto(null)} />}
      {abierto === "monte" && <GtfEnviarAlMonteModal g={g} onClose={() => setAbierto(null)} />}
      {abierto === "permiso" && <LothGtfAsignarPermiso gtf={g} onClose={cerrar} onHecho={hecho} />}
      {abierto === "desatar" && <LothGtfDesatarPermiso gtf={g} permiso={permisoDeLaGuiaGtf(g)} onClose={cerrar} onHecho={hecho} />}
      {abierto === "deshacer" && <ModalDeshacer gtfId={g.id} gtfNumber={g.gtfNumber} aboveModals={false} onClose={cerrar} onHecho={hecho} />}
    </div>
  );
}
