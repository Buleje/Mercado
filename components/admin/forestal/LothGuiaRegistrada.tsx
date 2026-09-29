"use client";

/**
 * Después de registrar el despacho con guía: el papel. El camión no sale sin
 * él, así que la guía (original + 2 copias) y su lista de trozas se abren en el
 * visor en el mismo paso, y se pueden guardar en el expediente de la guía.
 */

import { useMemo, useState } from "react";
import { ArrowRight, Check, FileText, Info, Printer, TreePine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { carpetaGuiaPorTitular, tagCasillero, tagGtf } from "@/lib/forestal/documentos-guia";
import { papelesGuiaLoth } from "@/lib/forestal/loth-guia-print";
import type { PaseAlCtp } from "@/lib/forestal/guia-th-al-ctp";
import type { RegistradaLoth } from "./hooks/use-despacho-guia-loth";
import { verIngresosDelCtp } from "./LothGtfCtp";
import CtpDocumentoVisor, { type DocumentoImprimible, type MetaArchivado } from "./CtpDocumentoVisor";
import { Btn } from "./ctp-shared";

/** Con qué se guarda cada papel: las mismas etiquetas y carpeta que las guías del CTP. */
export function archivoDeGuiaLoth(
  r: Pick<RegistradaLoth, "gtfNumber" | "titular" | "datos">,
  doc: DocumentoImprimible,
): MetaArchivado {
  const esLista = doc.nombre.startsWith("Lista");
  return {
    etiquetas: ["forestal", esLista ? "lista de trozas" : "GTF", "libro TH", r.gtfNumber, r.titular, tagGtf(r.gtfNumber), tagCasillero(esLista ? "lista_trozas" : "gtf")].filter(
      (t): t is string => Boolean(t && t.trim()),
    ),
    descripcion: `${doc.nombre} — guía del bosque de ${r.titular || "el titular"}${r.datos.destinatario.nombre ? `, destino ${r.datos.destinatario.nombre}` : ""}.`,
    carpetaRuta: carpetaGuiaPorTitular({ titular: r.titular, permiso: r.datos.titulos[0] ?? null, gtfNumber: r.gtfNumber }),
  };
}

/**
 * Qué pasó en el Libro CTP del negocio al emitir: la guía quedó para recibirla
 * (con el enlace), ya estaba, o por qué no pasó (va a otra empresa, la Ficha no
 * tiene RUC). Sin Libro CTP no dice nada.
 */
function AvisoLibroCtp({ ctp }: { ctp: PaseAlCtp | null }) {
  if (!ctp?.mensaje) return null;
  const enElCtp = ctp.estado === "creada" || ctp.estado === "ya_estaba" || ctp.estado === "ya_ingresada";
  const tono =
    ctp.estado === "error"
      ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10"
      : enElCtp
        ? "border-[var(--accent)]/40 bg-[var(--surface-raised)] text-[var(--text-primary)]"
        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]";
  return (
    <div
      role="status"
      data-testid="aviso-libro-ctp"
      className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 px-3 py-2.5 text-sm font-bold ${tono}`}
    >
      {enElCtp ? (
        <TreePine className="h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden="true" />
      ) : (
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 basis-60">{ctp.mensaje}</span>
      {enElCtp && (
        <Btn variant="secondary" size="sm" onClick={verIngresosDelCtp} className="max-sm:h-11 max-sm:w-full">
          Ver en tu Libro CTP <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Btn>
      )}
    </div>
  );
}

export default function LothGuiaRegistrada({
  r,
  cientificoDe,
}: {
  r: RegistradaLoth;
  cientificoDe?: (comun: string) => string | null | undefined;
}) {
  const papeles = useMemo(
    () => papelesGuiaLoth({ gtfNumber: r.gtfNumber, gtfDate: r.gtfDate, titular: r.titular, datos: r.datos, piezas: r.piezas, cientificoDe }),
    [r, cientificoDe],
  );
  const [visor, setVisor] = useState<number | null>(null);
  const volumen = r.volumenM3 || r.piezas.reduce((a, p) => a + (p.volumeM3 ?? 0), 0);

  return (
    <div className="rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-5 dark:bg-[var(--data-success-500)]/10">
      <p className="flex items-center gap-2 text-base font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
        Guía {r.gtfNumber} registrada — {r.lineas} {r.lineas === 1 ? "troza despachada" : "trozas despachadas"} en el libro
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        {fmtM3(volumen)} m³ · destino {r.datos.destinatario.nombre || "—"}
        <InfoTip
          icono="ayuda"
          title="Qué sigue"
          what="La guía ya figura en «Guías» del libro. Si va a tu propia planta, queda en tu Libro CTP: cuando la madera llegue, la recibes con sus trozas poniendo sólo el día."
          example="Si hay que corregir la placa antes de que llegue, se anula la guía y se hace otra: las trozas vuelven a quedar libres. Si ya la recibiste en tu Libro CTP, primero anula allá sus ingresos."
        />
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn variant="dark" onClick={() => setVisor(0)}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir la guía y la lista
        </Btn>
        <Btn variant="secondary" onClick={() => setVisor(1)}>
          <FileText className="h-4 w-4" aria-hidden="true" /> Ver la lista de trozas
        </Btn>
      </div>
      <AvisoLibroCtp ctp={r.ctp} />
      {visor != null && (
        <CtpDocumentoVisor
          documentos={[papeles.gtf, papeles.lista]}
          activo={visor}
          onActivo={setVisor}
          onClose={() => setVisor(null)}
          onArchivar={(doc) => archivoDeGuiaLoth(r, doc)}
        />
      )}
    </div>
  );
}
