"use client";

/**
 * «Datos» de una guía IMPORTADA en la vista GTF del Libro TH (ADR-461, 02-10
 * noche): todo lo que la guía decía al importarla —titular, propietario,
 * destinatario, transporte, cuadro de productos (37), estado en SERFOR— con los
 * mismos bloques que la vista previa de la importación (de a dos por fila, con
 * el resumen por especie; 02-10-2026) y su lista de trozas tal como quedó en el
 * libro. Desde el 07-10 (Brandon: «que se separe en sección GTF y Lista de
 * trozas… más amplio para evitar el scroll») son dos pestañas en un modal de
 * casi todo el ancho y 90 % del alto.
 *
 * Sólo se ofrece en las guías que guardaron la ficha (`gtfDatos.fichaSerfor`,
 * desde el 02-10 noche): una anotada a mano no tiene una «ficha de SERFOR».
 *
 * ADR-474 (07-10): la lista dice el «Código único» de cada troza en el libro y
 * su «Código en la guía» — las DOS columnas siempre (Brandon 08-10), aunque
 * coincidan: así se ve de un vistazo cuál se renombró al importar. El N° de la
 * Lista de trozas (33) que trajo la guía va en el título de la lista.
 *
 * 16-10 (Brandon: «que se parezca lo más posible a esos formatos»): las dos
 * pestañas tienen la cara del talonario — la GTF en el orden del Anexo I y la
 * lista como la hoja «Lista de trozas»; el «Código único» va en la última
 * columna, en gris (`gtf-datos-papel-*.tsx`).
 *
 * 16-10 (Brandon: «que la guía tenga tipo lupa y otros para poder ver la guía
 * más en una hoja más amplia y completa»): cada pestaña dibuja su hoja dentro
 * de la lupa (`gtf-datos-lupa.tsx`: −/%/+, ajustar al ancho, hoja completa;
 * el % se recuerda por pestaña) y «Ver en hoja grande» la abre a pantalla
 * completa, en papel A4, encima de este modal.
 */

import { useId, useMemo, useState } from "react";
import { FileText, Fullscreen } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { fichaDeGuiaImportada } from "@/lib/forestal/loth-importar-guia-ficha";
import { listaTrozasDeLaGuia } from "@/lib/forestal/gtf-resumen-interno-datos";
import GtfDatosPapelLista from "./gtf-datos-papel-lista";
import GtfDatosLupa, { GtfHojaGrande } from "./gtf-datos-lupa";
import LothImportarGuiasBloques from "./LothImportarGuiasBloques";
import CtpApartados, { CtpApartadoPanel, type Apartado } from "./ctp-apartados";

/**
 * El ancho es el de `planilla`; lo propio de este modal es el alto FIJO (92 %
 * en el celular, 90 % desde 640 px): la lupa llena lo que sobra y su scroll
 * queda adentro de la hoja.
 */
const MODAL_AMPLIO = "h-[92dvh] max-h-[92dvh] sm:h-[90vh] sm:max-h-[90vh]";

/**
 * El modal «Datos» de una guía importada, en dos pestañas: «GTF» (los casilleros
 * del documento) y «Lista de trozas» (resumen por especie + cada troza). Se
 * monta sólo abierto; lo abre la opción «Datos» del menú ⋯ de la tabla GTF.
 */
export default function ModalFichaImportada({
  gtfDatos,
  gtfNumber,
  items,
  onClose,
}: {
  gtfDatos: unknown;
  gtfNumber: string;
  items: unknown;
  onClose: () => void;
}) {
  const leida = useMemo(() => fichaDeGuiaImportada(gtfDatos), [gtfDatos]);
  const piezas = useMemo(() => piezasDeItems(items), [items]);
  const paraResumen = useMemo(
    () => piezas.map((p) => ({ comun: p.comun, cientifico: p.cientifico, m3: p.volumeM3 })),
    [piezas],
  );
  /* El (35) que guardó la guía al importarla (`gtfDatos.guia.listaTrozasNro`). */
  const nroLista = useMemo(() => listaTrozasDeLaGuia(gtfDatos), [gtfDatos]);
  const [pestana, setPestana] = useState<"gtf" | "trozas">("gtf");
  const [grande, setGrande] = useState(false);
  const idBase = useId();
  if (!leida) return null;
  /* Lo mismo se dibuja en la pestaña y en la hoja grande. */
  const hoja =
    pestana === "gtf" ? (
      <LothImportarGuiasBloques ficha={leida.ficha} piezas={paraResumen} partes="datos" />
    ) : (
      <>
        <GtfDatosPapelLista ficha={leida.ficha} gtfNumber={gtfNumber} nroLista={nroLista} piezas={piezas} />
        <LothImportarGuiasBloques ficha={leida.ficha} piezas={paraResumen} partes="resumen" />
      </>
    );
  const nombreHoja = pestana === "gtf" ? `GTF ${gtfNumber}` : `Lista de trozas de la GTF ${gtfNumber}`;
  const apartados: Apartado[] = [
    {
      id: "gtf",
      label: "GTF",
      hint: "La guía como el papel: origen, propietario, partida, destinatario, transportista y detalle del producto",
    },
    {
      id: "trozas",
      label: "Lista de trozas",
      contador: piezas.length,
      unidad: piezas.length === 1 ? "troza" : "trozas",
    },
  ];
  return (
    <AdminModal
      open
      onClose={onClose}
      size="planilla"
      icon={FileText}
      className={MODAL_AMPLIO}
      title={`Datos de la GTF ${gtfNumber}`}
      description={
        leida.verificada
          ? "Como la publicó SERFOR al importarla"
          : "Leída de una foto o PDF al importarla: sin verificar en SERFOR"
      }
    >
      <div className="flex h-full flex-col gap-3 px-5 py-4 sm:px-6">
        <CtpApartados
          apartados={apartados}
          activo={pestana}
          onIr={(id) => setPestana(id === "trozas" ? "trozas" : "gtf")}
          idBase={idBase}
          etiqueta={`Secciones de la GTF ${gtfNumber}`}
        />
        <CtpApartadoPanel idBase={idBase} id={pestana} className="flex min-h-0 flex-1 flex-col">
          {/* `key`: cada pestaña con su lupa y su % recordado. */}
          <GtfDatosLupa
            key={pestana}
            clave={`gtf-datos-lupa:${pestana}`}
            etiqueta={nombreHoja}
            extra={
              <button
                type="button"
                onClick={() => setGrande(true)}
                aria-label="Ver en hoja grande"
                title="La hoja a pantalla completa, en papel A4"
                className={`${button({ variant: "secondary" })} max-sm:w-12 max-sm:px-0`}
              >
                <Fullscreen className="h-5 w-5" aria-hidden />
                <span className="max-sm:hidden">Ver en hoja grande</span>
              </button>
            }
          >
            {hoja}
          </GtfDatosLupa>
        </CtpApartadoPanel>
      </div>
      {grande && (
        <GtfHojaGrande titulo={nombreHoja} clave={`gtf-datos-lupa:grande:${pestana}`} onClose={() => setGrande(false)}>
          {hoja}
        </GtfHojaGrande>
      )}
    </AdminModal>
  );
}
