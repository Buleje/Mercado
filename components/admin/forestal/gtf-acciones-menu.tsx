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
 *   · Documentos del permiso → siempre; sin permiso sólo los papeles de la guía (ADR-482)
 *     (ADR-467: las carpetas del plan, por `planId`; ver, descargar,
 *     imprimir y enviar por WhatsApp — 08-10)
 *   · Cubicar en Oxapampina → viva y de trozas (K7 · ADR-483: con descuentos, a la cuenta de una persona)
 *   · Ver ingresos    → la guía ya entró al Libro CTP
 *   · Deshacer la importación → viva e importada
 *   · Anular          → viva
 * `soloLectura` (la pestaña «Anuladas y otras»): sólo Datos, Hoja, Resumen y
 * Documentos del permiso.
 *
 * Los modales de «Datos», «Documentos» y «Deshacer» se montan sólo abiertos (uno por fila).
 */

import { useMemo, useState } from "react";
import { Ban, Eye, FileText, FolderOpen, LogIn, Printer, Ruler, Undo2 } from "@buleje/design-system/icons";
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
    onHoja,
    onResumen,
    onAnular,
  }: {
    soloLectura?: boolean;
    abrirDatos: () => void;
    abrirDeshacer: () => void;
    abrirDocumentos?: () => void;
    abrirCubicar?: () => void;
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
  const [abierto, setAbierto] = useState<"datos" | "deshacer" | "documentos" | "cubicar" | null>(null);
  const acciones = useMemo(
    () =>
      opcionesGtf(g, {
        soloLectura,
        abrirDatos: () => setAbierto("datos"),
        abrirDeshacer: () => setAbierto("deshacer"),
        abrirDocumentos: () => setAbierto("documentos"),
        abrirCubicar: () => setAbierto("cubicar"),
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
      <ActionMenu label={`Acciones de la GTF ${g.gtfNumber}`} title="Más acciones" actions={acciones} soloIcono size="xs" />
      {abierto === "datos" && (
        <ModalFichaImportada gtfDatos={g.gtfDatos} gtfNumber={g.gtfNumber} items={g.items} onClose={() => setAbierto(null)} />
      )}
      {abierto === "documentos" && (
        <GtfDocumentosModal planId={g.planId ?? null} permiso={permisoDeLaGuiaGtf(g)} gtfNumber={g.gtfNumber} sinPapeles={g.status === "anulada" || !!g.deletedAt} onClose={() => setAbierto(null)} />
      )}
      {abierto === "cubicar" && <LothGtfCubicarModal g={g} onClose={() => setAbierto(null)} />}
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
