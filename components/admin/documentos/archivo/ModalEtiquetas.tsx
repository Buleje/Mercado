"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { QrCode, Download, Printer, Check } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useBaseVerificacion } from "@/hooks/use-base-verificacion";
import { EVENTO_ETIQUETAS, type DetalleEtiquetas } from "@/lib/documentos/etiquetas-evento";
import { ETIQUETAS_POR_HOJA, generarPdfEtiquetas, maquetarEtiquetas } from "@/lib/documentos/etiquetas-qr";
import type { DbDocument } from "@/lib/types/documents";
import type { ModeloArchivo } from "./use-archivo";

/** Sólo el origen de la base pública: el panel vive en `/admin`, no en `/v`. */
function origenDe(base: string | null): string | null {
  if (!base) return null;
  try { return new URL(base).origin; } catch { return null; }
}

function Contenido({ docs, carpetaDe, marcar, onClose }: {
  docs: DbDocument[];
  carpetaDe: (id: string | null) => string | null;
  marcar: (ids: string[], puesto: boolean) => Promise<number>;
  onClose: () => void;
}) {
  const { base } = useBaseVerificacion();
  const [empezarEn, setEmpezarEn] = useState(1);
  const [paso, setPaso] = useState<1 | 2>(1);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const papeles = useMemo(() => docs.map((d) => ({ id: d.id, codigo: d.codigo, name: d.name, carpeta: carpetaDe(d.folderId) })), [docs, carpetaDe]);
  const m = useMemo(() => maquetarEtiquetas(papeles, empezarEn), [papeles, empezarEn]);
  const ids = useMemo(() => m.etiquetas.map((e) => e.papel.id), [m]);
  /* Sin la base del servidor (no llegó o falló) se usa el host de este navegador: sirve si es el mismo que abre el celular. */
  const origen = origenDe(base) ?? (typeof window !== "undefined" ? window.location.origin : "");
  const enLocal = /^https?:\/\/(localhost|127\.|192\.168\.|10\.)/.test(origen);

  const hacer = async (modo: "bajar" | "imprimir") => {
    setTrabajando(true);
    setError(null);
    /* Se abre ya, dentro del clic: después de un `await` el navegador bloquea la ventana. */
    const ventana = modo === "imprimir" ? window.open("", "_blank") : null;
    try {
      const { blob } = await generarPdfEtiquetas({ papeles, origen, empezarEn });
      const url = URL.createObjectURL(blob);
      if (modo === "imprimir" && ventana) {
        ventana.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `etiquetas-qr-${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPaso(2);
    } catch (err) {
      ventana?.close();
      setError(err instanceof Error ? err.message : "No se pudo armar la hoja. Vuelve a intentarlo.");
    } finally {
      setTrabajando(false);
    }
  };

  const registrar = async () => {
    setTrabajando(true);
    try {
      const n = await marcar(ids, true);
      if (n === 0) toast.info("No había nada por marcar: ya estaban registrados.");
      else toast.success(`${n} ${n === 1 ? "papel registrado" : "papeles registrados"}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo marcar. Vuelve a intentarlo.");
    } finally {
      setTrabajando(false);
    }
  };

  const hojas = `${m.hojas} ${m.hojas === 1 ? "hoja" : "hojas"}`;
  return (
    <AdminModal
      open
      onClose={onClose}
      title="Etiquetas con QR"
      description={paso === 1 ? "Código y QR para pegar en cada papel" : "Ya tienes la hoja"}
      icon={QrCode}
      size="md"
      claveVentana="etiquetas-qr"
      footer={
        <ModalFooter error={error}>
          {paso === 1 ? (
            <>
              <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cancelar</button>
              <button type="button" onClick={() => hacer("imprimir")} disabled={trabajando || m.etiquetas.length === 0} className={button({ variant: "secondary" })}>
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button type="button" onClick={() => hacer("bajar")} disabled={trabajando || m.etiquetas.length === 0} className={button({ variant: "primary" })} data-qa="etiquetas-bajar">
                <Download className="h-4 w-4" /> {trabajando ? "Armando…" : "Descargar PDF"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={trabajando} className={button({ variant: "secondary" })} data-qa="etiquetas-todavia">Todavía no</button>
              <button type="button" onClick={registrar} disabled={trabajando} className={button({ variant: "primary" })} data-qa="etiquetas-registrar">
                <Check className="h-4 w-4" /> Sí, marcar los {ids.length} como registrados
              </button>
            </>
          )}
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        {paso === 1 ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <span data-qa="etiquetas-cuenta">{m.etiquetas.length} {m.etiquetas.length === 1 ? "etiqueta" : "etiquetas"} · {hojas}</span>
              <InfoTip
                title="Etiquetas con QR"
                what="Una hoja de stickers (3 columnas × 8 filas, 70×37 mm) con el código de cada papel y un QR."
                affects="Al pegar el sticker en el papel, el celular abre ese papel en el panel con solo escanear."
                example="DOC-000367 con su QR, pegado en la esquina del contrato."
              />
            </p>
            {m.sinCodigo > 0 && (
              <p className="text-xs text-[var(--text-secondary)]">{m.sinCodigo} {m.sinCodigo === 1 ? "papel no tiene" : "papeles no tienen"} código y se {m.sinCodigo === 1 ? "salta" : "saltan"}.</p>
            )}
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <label htmlFor="etiquetas-empezar">Empezar en la etiqueta</label>
              <input
                id="etiquetas-empezar"
                type="number"
                min={1}
                max={ETIQUETAS_POR_HOJA}
                value={empezarEn}
                onChange={(e) => setEmpezarEn(Math.min(ETIQUETAS_POR_HOJA, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))}
                className="h-12 w-20 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-center text-base tabular-nums text-[var(--text-primary)]"
                data-qa="etiquetas-empezar"
              />
              <InfoTip title="Hoja ya empezada" what={`Si ya gastaste las primeras de la hoja, pon el número de la primera libre (1 a ${ETIQUETAS_POR_HOJA}). Se cuentan de izquierda a derecha, de arriba hacia abajo.`} />
            </div>
            {enLocal && (
              <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)]" data-qa="etiquetas-aviso-local">
                Este QR apunta a {origen}: un celular fuera de esta red no lo abrirá. Imprímelo desde la dirección real del negocio.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--text-primary)]">
            ¿Ya las pegaste en los papeles? Si es así, los {ids.length} quedan como <strong>registrados</strong> y salen de «Por registrar».
          </p>
        )}
      </div>
    </AdminModal>
  );
}

/** Escucha `abrirEtiquetas(ids)` y muestra la ventana con los papeles pedidos. */
export default function ModalEtiquetas({ arch }: { arch: ModeloArchivo }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const { documents, folderById, marcarCodigoFisico } = arch;
  useEffect(() => {
    const al = (e: Event) => setIds((e as CustomEvent<DetalleEtiquetas>).detail.ids);
    window.addEventListener(EVENTO_ETIQUETAS, al);
    return () => window.removeEventListener(EVENTO_ETIQUETAS, al);
  }, []);
  const docs = useMemo(() => {
    if (!ids) return [];
    const pedidos = new Set(ids);
    return documents.filter((d) => pedidos.has(d.id));
  }, [ids, documents]);
  const carpetaDe = useMemo(() => (id: string | null) => (id ? folderById.get(id)?.name ?? null : null), [folderById]);
  if (!ids) return null;
  return <Contenido docs={docs} carpetaDe={carpetaDe} marcar={marcarCodigoFisico} onClose={() => setIds(null)} />;
}
