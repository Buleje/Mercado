"use client";

import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import EstadoCarpetaLocalBadge from "../EstadoCarpetaLocalBadge";
import { slugActivo } from "./compartido";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import { Camera, Scan, Sparkles, FolderTree, Wand2, Upload } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { precargarArchivo, DE_LA_CABECERA } from "./perezosos";
import { AccionesDeLaVista, ORDEN_ACCION, TextoDeAccion, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import type { ModeloArchivo } from "./use-archivo";
import AvisoCodigoPendiente from "./AvisoCodigoPendiente";
export default function CabeceraArchivo({ arch }: { arch: ModeloArchivo }) {
  const { setFilterMode, filterMode, kpis, setShowCameraScan, setShowTemplates, setImportandoCarpeta,
    setOrdenando, fileInputRef, uploadProgress, handleFiles, scanInputRef, handleScan } = arch;
  // Dentro de Documentos (fila de pestañas con hueco): la ⓘ y los botones van a esa fila
  // y no hay fila de título propia (Brandon 23-10: «aprovechar mejor el espacio»).
  const enFila = useEnElLibro();
  const precargar = {
    onPointerOver: () => precargarArchivo(...DE_LA_CABECERA),
    onFocusCapture: () => precargarArchivo(...DE_LA_CABECERA),
  };
  const ayuda = (
    <InfoTip
      title="Archivo del negocio"
      side="bottom"
      what="Tus documentos en carpetas: contratos, licencias, facturas, fotos y planillas."
      affects="Un documento con fecha de vencimiento te avisa 30 días antes. La IA lo nombra y lo clasifica al escanearlo. Clic derecho sobre un archivo abre sus acciones."
      example="Subes la licencia de funcionamiento con vencimiento el 15/03: el 13/02 te aparece en «por vencer»."
    />
  );
  // Si está conectado con el escritorio o no, a la vista sin entrar a «Mi PC» (Brandon
  // 2026-08-28). No se ve nada si el navegador no soporta la File System Access API.
  const escritorio = <EstadoCarpetaLocalBadge tenantId={slugActivo()} onAbrir={() => setFilterMode("sync")} />;
  // Cinco acciones no entraban: queda UNA principal (Subir archivos) y el resto en el
  // menú del DS (Brandon 2026-08-30).
  const menu = (
    <ModuleActionMenu
      iconOnly
      className="h-12 w-12"
      items={[
        {
          label: "Escanear un documento",
          description: "Recorta, mejora y guarda; la IA lo nombra y clasifica",
          icon: Camera,
          onClick: () => setShowCameraScan(true),
        },
        {
          label: "Escanear a PDF",
          description: "Varias páginas en un solo archivo",
          icon: Scan,
          onClick: () => setShowCameraScan(true),
        },
        {
          label: "Generar plantilla",
          description: "Contratos y actas listos para completar",
          icon: Sparkles,
          onClick: () => setShowTemplates(true),
        },
        {
          label: "Importar carpeta",
          description: "Subes una carpeta completa respetando sus subcarpetas",
          icon: FolderTree,
          onClick: () => setImportandoCarpeta(true),
          dividerBefore: true,
        },
        {
          label: "Ordenar mi Archivo",
          description: "Nombres claros, basura y carpetas vacías",
          icon: Wand2,
          onClick: () => setOrdenando(true),
          dividerBefore: true,
        },
      ]}
    />
  );
  const entradas = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && handleScan(e.target.files)}
      />
    </>
  );

  if (enFila) {
    return (
      <>
        <AccionesDeLaVista orden={ORDEN_ACCION.info} fueraDelLibro={null}>{ayuda}</AccionesDeLaVista>
        {/* Los indicadores del drive: el botón va solo a la fila (orden «indicadores»). */}
        {filterMode !== "trash" && kpis.boton}
        <AccionesDeLaVista fueraDelLibro={null}>{escritorio}</AccionesDeLaVista>
        {/* ADR-516 — «N por registrar»: no se dibuja si estás al día. */}
        <AccionesDeLaVista fueraDelLibro={null}><AvisoCodigoPendiente arch={arch} /></AccionesDeLaVista>
        <AccionesDeLaVista orden={ORDEN_ACCION.principal} fueraDelLibro={null}>
          <span className="flex items-center gap-2" {...precargar}>
            {menu}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Subir archivos"
              className={button({ variant: "primary", className: cn("rounded-xl", !uploadProgress && "max-sm:w-12 max-sm:px-0") })}
            >
              {uploadProgress ? (
                <>
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {uploadProgress.total === 1 ? "Procesando…" : `Subiendo ${uploadProgress.done}/${uploadProgress.total}…`}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" aria-hidden />
                  {/* En el celular sólo el ícono: así entra en la misma fila que el resto. */}
                  <span className="max-sm:sr-only"><TextoDeAccion corto="Subir">Subir archivos</TextoDeAccion></span>
                </>
              )}
            </button>
          </span>
        </AccionesDeLaVista>
        {entradas}
      </>
    );
  }

  return (
    <>
      {/* Fuera de Documentos: título · ⓘ · escritorio · Indicadores · ⋯ · Subir, en una fila (11-10). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap">Archivo del negocio</SectionTitle>
          {ayuda}
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2" {...precargar}>
          {escritorio}
          <AvisoCodigoPendiente arch={arch} />
          {filterMode !== "trash" && kpis.boton}
          {menu}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={button({ variant: "primary", className: cn("rounded-xl", !uploadProgress && "max-sm:w-12 max-sm:px-0") })}
          >
            {uploadProgress ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {uploadProgress.total === 1 ? "Procesando…" : `Subiendo ${uploadProgress.done}/${uploadProgress.total}…`}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Subir archivos</span>
              </>
            )}
          </button>
          {entradas}
        </div>
      </div>
    </>
  );
}
