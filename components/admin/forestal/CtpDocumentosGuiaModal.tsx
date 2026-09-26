"use client";

/**
 * CtpDocumentosGuiaModal — los papeles de UNA guía de ingreso, cada uno en su
 * casillero (ADR-438): factura, guía de remisión del remitente, guía del
 * transportista, lista de trozas, GTF y otros.
 *
 * Pedido de Brandon (2026-09-26): «un apartado para agregar documentos (fotos,
 * PDF, etc.) con un casillero para cada uno». Los archivos quedan en el Drive,
 * en la carpeta de las guías del mes, con su N° de guía: el expediente que pide
 * una fiscalización ya está armado al recibir el camión.
 *
 * Lo abren el menú «Más» de la guía y el chip «3/6 docs» de la fila.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { AlertTriangle, FolderOpen, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useDocumentosGuia, type DocumentoDeGuia } from "@/hooks/use-documentos-guia";
import { useMiRol } from "@/hooks/use-mi-rol";
import { TOTAL_CASILLEROS, type CasilleroGuia } from "@/lib/forestal/documentos-guia";
import CtpDocumentosGuiaCasillero from "./CtpDocumentosGuiaCasillero";

export interface CtpDocumentosGuiaModalProps {
  gtf: string;
  /** Una línea bajo el título («COMUNIDAD NATIVA SANTA ROSA»). */
  contexto?: string;
  onClose: () => void;
  /** Cambió cuántos casilleros tienen archivo: la tabla actualiza su chip. */
  onCambio?: (llenos: number) => void;
  /** Abrir el «Documento de la guía» (la GTF que arma el sistema). */
  onArmarGtf?: () => void;
}

export default function CtpDocumentosGuiaModal({
  gtf,
  contexto,
  onClose,
  onCambio,
  onArmarGtf,
}: CtpDocumentosGuiaModalProps) {
  const { datos, cargando, error, subiendo, subir, quitar } = useDocumentosGuia(gtf);
  const { confirm } = useConfirm();
  const llenos = datos?.llenos;
  /* Quitar un documento es un borrado real del expediente (factura, GTF…):
     sólo admin y dueño, igual que la plata de la guía — el servidor rechaza
     al resto (`soloAdminODueno`, `guias/documentos/route.ts`). `null` =
     todavía no se sabe: se ofrece y el servidor decide. */
  const rolActual = useMiRol();
  const puedeQuitar = rolActual == null || rolActual === "admin" || rolActual === "owner" || rolActual === "superadmin";

  useEffect(() => {
    if (llenos != null) onCambio?.(llenos);
  }, [llenos, onCambio]);

  const alSubir = async (casillero: CasilleroGuia, files: File[], reemplaza?: string) => {
    let ok = 0;
    for (const f of files) {
      const err = await subir(casillero, f, reemplaza);
      if (err) toast.error(err);
      else ok++;
    }
    if (ok > 0)
      toast.success(
        reemplaza
          ? "Archivo reemplazado"
          : ok === 1
            ? "Archivo guardado"
            : `${ok} archivos guardados`,
      );
  };

  const alQuitar = async (doc: DocumentoDeGuia) => {
    const si = await confirm({
      title: `¿Quitar «${doc.name}»?`,
      description:
        "Sale de este casillero y va a la papelera del Drive: desde ahí se puede recuperar.",
      intent: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!si) return;
    const err = await quitar(doc.id);
    if (err) toast.error(err);
    else toast.success("Archivo quitado");
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Documentos de la guía ${gtf}`}
      description={contexto}
      icon={FolderOpen}
      variant="wide"
      claveVentana="ctp-documentos-guia"
    >
      <div className={`${MODAL_BODY} flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {llenos == null ? "—" : llenos} de {TOTAL_CASILLEROS} casilleros con archivo
          </p>
          <InfoTip
            title="Documentos de la guía"
            what="Los papeles que llegan con el camión, cada uno en su casillero. Se suben con la cámara del celular o desde la PC (PDF o foto, hasta 4 MB)."
            affects="Quedan en el Drive, en «Guías forestales (GTF)» del año y mes del ingreso, con el N° de guía como etiqueta. Quitar uno lo manda a la papelera del Drive."
            example="Llega el camión: foto a la factura, a la guía del transportista y a la lista de trozas. La GTF, desde «La del sistema»."
          />
          {cargando && (
            <Loader2
              className="h-4 w-4 animate-spin text-[var(--text-tertiary)]"
              aria-label="Cargando"
            />
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-[var(--data-error-500)]/10 p-3 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {datos && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {datos.casilleros.map((c) => (
              <CtpDocumentosGuiaCasillero
                key={c.clave}
                casillero={c}
                subiendo={Boolean(subiendo[c.clave])}
                puedeQuitar={puedeQuitar}
                onSubir={(files, reemplaza) => void alSubir(c.clave, files, reemplaza)}
                onQuitar={(d) => void alQuitar(d)}
                onArmarGtf={c.clave === "gtf" ? onArmarGtf : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
