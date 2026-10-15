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
 *   · Datos           → sólo si la guía guardó su ficha de SERFOR (importada)
 *   · Hoja SERFOR     → siempre (anulada: con su sello)
 *   · Resumen interno → siempre (R1-R4, `gtf-resumen-interno`)
 *   · Imprimir en talonario → viva: sólo los valores, en su lugar, sobre el
 *     talonario preimpreso de la matricial (15-10, `GtfMatricialModal`)
 *   · Documentos del permiso → siempre; sin permiso sólo los papeles de la guía (ADR-482)
 *     (ADR-467: las carpetas del plan, por `planId`; ver, descargar,
 *     imprimir y enviar por WhatsApp — 08-10)
 *   · Cubicar en Oxapampina → viva y de trozas (K7 · ADR-483: con descuentos, a la cuenta de una persona)
 *   · Ver ingresos    → la guía ya entró al Libro CTP
 *   · Asignar permiso → viva, de trozas y sin permiso (15-10: las trozas a mano
 *     nacen sin él); además va a la vista como botón, igual que «Ingresar al CTP»
 *   · Deshacer la importación → viva e importada
 *   · Anular          → viva
 * `soloLectura` (la pestaña «Anuladas y otras»): sólo Datos, Hoja, Resumen y
 * Documentos del permiso.
 *
 * Los modales de «Datos», «Documentos» y «Deshacer» se montan sólo abiertos (uno por fila).
 */

import { useMemo, useState } from "react";
import { Ban, Eye, FileText, FolderOpen, Link2, LogIn, Printer, ReceiptText, Ruler, Undo2 } from "@buleje/design-system/icons";
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
import GtfMatricialModal from "./GtfMatricialModal";

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
    abrirTalonario,
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
    abrirTalonario?: () => void;
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
  if (viva && g.ctp === "ingresada") {
    a.push({ id: "ingresos", label: "Ver sus ingresos en el CTP", hint: "Abre Ingresos del Libro CTP", icon: LogIn, onSelect: verIngresosDelCtp });
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
  const [abierto, setAbierto] = useState<"datos" | "deshacer" | "documentos" | "cubicar" | "permiso" | "talonario" | null>(null);
  const acciones = useMemo(
    () =>
      opcionesGtf(g, {
        soloLectura,
        abrirDatos: () => setAbierto("datos"),
        abrirDeshacer: () => setAbierto("deshacer"),
        abrirDocumentos: () => setAbierto("documentos"),
        abrirCubicar: () => setAbierto("cubicar"),
        abrirPermiso: () => setAbierto("permiso"),
        abrirTalonario: () => setAbierto("talonario"),
        onHoja,
        onResumen,
        onAnular,
      }),
    [g, soloLectura, onHoja, onResumen, onAnular],
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
      <ActionMenu label={`Acciones de la GTF ${g.gtfNumber}`} title="Más acciones" actions={acciones} soloIcono size="xs" />
      {abierto === "datos" && (
        <ModalFichaImportada gtfDatos={g.gtfDatos} gtfNumber={g.gtfNumber} items={g.items} onClose={() => setAbierto(null)} />
      )}
      {abierto === "documentos" && (
        <GtfDocumentosModal planId={g.planId ?? null} permiso={permisoDeLaGuiaGtf(g)} gtfNumber={g.gtfNumber} sinPapeles={g.status === "anulada" || !!g.deletedAt} onClose={() => setAbierto(null)} />
      )}
      {abierto === "cubicar" && <LothGtfCubicarModal g={g} onClose={() => setAbierto(null)} />}
      {abierto === "talonario" && <GtfMatricialModal g={g} onClose={() => setAbierto(null)} />}
      {abierto === "permiso" && (
        <LothGtfAsignarPermiso
          gtf={g}
          onClose={() => setAbierto(null)}
          onHecho={() => {
            setAbierto(null);
            onRecargar?.();
          }}
        />
      )}
      {abierto === "deshacer" && (
        <ModalDeshacer
          gtfId={g.id}
          gtfNumber={g.gtfNumber}
          aboveModals={false}
          onClose={() => setAbierto(null)}
          onHecho={() => {
            setAbierto(null);
            onRecargar?.();
          }}
        />
      )}
    </div>
  );
}
