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
import type { ModeloArchivo } from "./use-archivo";
export default function CabeceraArchivo({ arch }: { arch: ModeloArchivo }) {
  const { setFilterMode, filterMode, kpis, setShowCameraScan, setShowTemplates, setImportandoCarpeta,
    setOrdenando, fileInputRef, uploadProgress, handleFiles, scanInputRef, handleScan } = arch;
  return (
    <>
      {/* Un título por vista (Documentos › Archivo, ola 3 del panel unificado):
          el título del hub ya dice «Documentos»; acá va el de la vista, con la
          explicación en la ⓘ y las acciones en la misma fila. */}
      {/* Una fila (11-10): título · ⓘ · escritorio · Indicadores · ⋯ · Subir.
          Con `TituloDeVista` (gap de 16 px y los botones en su propio bloque)
          el titular de Indicadores partía la fila en dos a 1280 px. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap">Archivo del negocio</SectionTitle>
          <InfoTip
            title="Archivo del negocio"
            side="bottom"
            what="Tus documentos en carpetas: contratos, licencias, facturas, fotos y planillas."
            affects="Un documento con fecha de vencimiento te avisa 30 días antes. La IA lo nombra y lo clasifica al escanearlo. Clic derecho sobre un archivo abre sus acciones."
            example="Subes la licencia de funcionamiento con vencimiento el 15/03: el 13/02 te aparece en «por vencer»."
          />
        </div>
        <div
          className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2"
          onPointerOver={() => precargarArchivo(...DE_LA_CABECERA)}
          onFocusCapture={() => precargarArchivo(...DE_LA_CABECERA)}
        >
        {/* Si está conectado con el escritorio o no, a la vista sin entrar a
            "Mi PC" (Brandon 2026-08-28). No se ve nada si el navegador no
            soporta la File System Access API — no tiene sentido avisar de
            algo que ahí no se puede usar. */}
        <EstadoCarpetaLocalBadge tenantId={slugActivo()} onAbrir={() => setFilterMode("sync")} />

        {/* Los indicadores del drive, como en el resto del panel: el botón
            «Indicadores» con el titular en una línea y las tarjetas debajo al
            abrirlo (antes un ▾ suelto, 2026-09-24). En la papelera no hay
            resumen que mostrar. */}
        {filterMode !== "trash" && kpis.boton}

        {/* Cinco acciones en el header no entraban en pantallas medianas: se
            partían en dos-tres filas y competían con el primario. Queda UNA
            acción principal (Subir archivos) y el resto en el menú del DS —
            "Importar carpeta" vivía como botón suelto y era lo que más
            forzaba el salto de línea (Brandon 2026-08-30). */}
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
        </div>
      </div>
    </>
  );
}