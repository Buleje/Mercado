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
 *
 * 23-10 (Brandon: «que la gtf se vea más visible, es decir los detalles estarán
 * al costado y la otra sección estarán la gtf y lista bien arriba, todo el
 * espacio que aproveche para evitar estar bajando»): la cabecera es UNA fila
 * (título, pestañas, lupa, hoja grande, detalles, ventana y X) y debajo la
 * hoja arranca pegada, con todo el alto; los detalles de la guía van en una
 * columna al costado (`gtf-datos-detalles.tsx`), plegable y recordada. Debajo
 * de 1024 px no hay costado: los detalles son una tercera pestaña.
 */

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText, FileWarning, Fullscreen, PanelRightClose, PanelRightOpen, X } from "@buleje/design-system/icons";
import AdminModal, { CabeceraPropia } from "@/components/admin/shared/AdminModal";
import { BOTON_VENTANA } from "@/components/admin/shared/modal-controles-ventana";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { fichaDeGuiaImportada } from "@/lib/forestal/loth-importar-guia-ficha";
import { listaTrozasDeLaGuia } from "@/lib/forestal/gtf-resumen-interno-datos";
import { cn } from "@/lib/utils";
import GtfDatosPapelLista from "./gtf-datos-papel-lista";
import GtfDatosPapelGuia from "./gtf-datos-papel-guia";
import GtfDatosLupa, { GtfHojaGrande } from "./gtf-datos-lupa";
import GtfDatosDetalles from "./gtf-datos-detalles";
import LothImportarGuiasBloques from "./LothImportarGuiasBloques";
import CtpApartados, { CtpApartadoPanel, type Apartado } from "./ctp-apartados";

/**
 * El ancho es el de `planilla`; lo propio de este modal es el alto FIJO (94 %:
 * medido 23-10, cada punto es una franja más de la hoja): la lupa llena lo que
 * sobra y su scroll queda adentro de la hoja.
 */
const MODAL_AMPLIO = "h-[94dvh] max-h-[94dvh] sm:h-[94vh] sm:max-h-[94vh]";

/** Desde dónde hay columna de detalles al costado (el `lg` de Tailwind). */
const MQ_COSTADO = "(min-width: 1024px)";
/* Sin `matchMedia` (jsdom de los tests) se dibuja como en una PC: con costado. */
const conMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
const suscribirCostado = (avisar: () => void) => {
  if (!conMatchMedia()) return () => {};
  const mq = window.matchMedia(MQ_COSTADO);
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
};
/* El modal se monta sólo en el cliente (al abrirlo): la primera pintura ya sabe si hay costado, sin un cuadro con tres pestañas. */
const hayCostado = () => !conMatchMedia() || window.matchMedia(MQ_COSTADO).matches;
const hayCostadoServidor = () => true;

/** Los botones de ícono de la cabecera: 48 px, como los de la lupa (ADR-489). */
const BOTON_ICONO = cn(button({ variant: "secondary" }), "w-12 shrink-0 px-0");

type Pestana = "gtf" | "trozas" | "detalles";

/**
 * El modal «Datos» de una guía importada, en dos pestañas: «GTF» (los casilleros
 * del documento) y «Lista de trozas» (resumen por especie + cada troza), con
 * los detalles al costado. Se monta sólo abierto; lo abre la opción «Datos»
 * del menú ⋯ de la tabla GTF.
 */
export default function ModalFichaImportada({
  gtfDatos,
  gtfNumber,
  items,
  onClose,
  onPedirCorreccion,
}: {
  gtfDatos: unknown;
  gtfNumber: string;
  items: unknown;
  onClose: () => void;
  /** Guía emitida y viva: «Pedir corrección» (ADR-512) se abre encima de esta ventana. */
  onPedirCorreccion?: () => void;
}) {
  const leida = useMemo(() => fichaDeGuiaImportada(gtfDatos), [gtfDatos]);
  const piezas = useMemo(() => piezasDeItems(items), [items]);
  const paraResumen = useMemo(
    () => piezas.map((p) => ({ comun: p.comun, cientifico: p.cientifico, m3: p.volumeM3 })),
    [piezas],
  );
  /* El (35) que guardó la guía al importarla (`gtfDatos.guia.listaTrozasNro`). */
  const nroLista = useMemo(() => listaTrozasDeLaGuia(gtfDatos), [gtfDatos]);
  const [elegida, setElegida] = useState<Pestana>("gtf");
  const [grande, setGrande] = useState(false);
  /* Los detalles al costado, plegables; lo elegido se recuerda en este equipo. */
  const [conDetalles, setConDetalles] = useLocalStorage<boolean>("gtf-datos:detalles-al-costado", true);
  const costado = useSyncExternalStore(suscribirCostado, hayCostado, hayCostadoServidor);
  /* Dónde se muda la barra de la lupa (la cabecera): se conoce un cuadro después de montar. */
  const [lugarLupa, setLugarLupa] = useState<HTMLDivElement | null>(null);
  const idBase = useId();
  if (!leida) return null;
  /* Con costado no existe la pestaña «Detalles»: si quedó elegida al agrandar la ventana, se vuelve a la GTF. */
  const pestana: Pestana = costado && elegida === "detalles" ? "gtf" : elegida;
  const detallesAlCostado = costado && conDetalles !== false;
  /* El registro en SERFOR sale de la hoja sólo cuando los detalles lo muestran (al costado o en su pestaña). */
  const registroEnHoja = costado && !detallesAlCostado;
  const hoja = (conRegistro: boolean) =>
    pestana === "trozas" ? (
      <>
        <GtfDatosPapelLista ficha={leida.ficha} gtfNumber={gtfNumber} nroLista={nroLista} piezas={piezas} />
        <LothImportarGuiasBloques ficha={leida.ficha} piezas={paraResumen} partes="resumen" />
      </>
    ) : (
      <GtfDatosPapelGuia ficha={leida.ficha} conTrozas={paraResumen.length > 0} registro={conRegistro} />
    );
  const nombreHoja = pestana === "trozas" ? `Lista de trozas de la GTF ${gtfNumber}` : `GTF ${gtfNumber}`;
  const detalles = (
    <GtfDatosDetalles ficha={leida.ficha} verificada={leida.verificada} nroLista={nroLista} piezas={paraResumen} />
  );
  const apartados: Apartado[] = [
    {
      id: "gtf",
      label: "GTF",
      hint: "La guía como el papel: origen, propietario, partida, destinatario, transportista y detalle del producto",
    },
    /* Sin costado van tres pestañas en 400 px: «Trozas 22» entra en una línea; «Lista de trozas 22 trozas» ocupaba tres. */
    costado
      ? { id: "trozas", label: "Lista de trozas", contador: piezas.length, unidad: piezas.length === 1 ? "troza" : "trozas" }
      : { id: "trozas", label: "Trozas", contador: piezas.length, hint: "La lista de trozas de la guía y el resumen por especie" },
    ...(costado
      ? []
      : [{ id: "detalles", label: "Detalles", hint: "Estado, volúmenes, titular, destinatario, transporte, especies y registro en SERFOR" }]),
  ];
  const descripcion = leida.verificada
    ? "Datos como los publicó SERFOR al importarla"
    : "Datos leídos de una foto o PDF al importarla: sin verificar en SERFOR";
  return (
    <AdminModal
      open
      onClose={onClose}
      size="planilla"
      className={MODAL_AMPLIO}
      hideCloseButton
      claveVentana="gtf-datos-importada"
    >
      <div className="flex h-full flex-col">
        {/* Una fila desde 1024 px (si no entra, las herramientas se parten DENTRO de su grupo y la X sigue arriba a la
            derecha); debajo, el título con la X arriba y las herramientas en la fila siguiente. */}
        <CabeceraPropia
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule-base)] px-4 py-2.5 sm:px-6 lg:flex-nowrap"
          acciones={
            <>
              {onPedirCorreccion && (
                <button
                  type="button"
                  onClick={onPedirCorreccion}
                  aria-label="Pedir corrección de esta guía"
                  title="Pedir corrección: la plataforma revisa tu pedido y, si corresponde, la anula y la emite de nuevo"
                  className={BOTON_VENTANA}
                >
                  <FileWarning className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="Cerrar" className={BOTON_VENTANA}>
                <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
            </>
          }
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:min-w-[12rem]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]">
              <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              {/* El número manda (es lo que se busca); «Datos de la» va en la línea de abajo. */}
              <CardTitle as="h2" title={`Datos de la GTF ${gtfNumber}`} className="truncate font-display text-base sm:text-lg">
                <span className="sr-only">Datos de la </span>GTF {gtfNumber}
              </CardTitle>
              <p title={descripcion} className="truncate text-xs text-[var(--text-secondary)]">
                {descripcion}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 max-lg:order-1 max-lg:w-full lg:justify-end">
            <div className="min-w-0 max-sm:w-full">
              <CtpApartados
                apartados={apartados}
                activo={pestana}
                onIr={(id) => setElegida(id === "trozas" || id === "detalles" ? id : "gtf")}
                idBase={idBase}
                etiqueta={`Secciones de la GTF ${gtfNumber}`}
                columnas={costado ? 2 : 3}
              />
            </div>
            {/* Oculto en la pestaña «Detalles»: no hay hoja que agrandar (y no suma un hueco). */}
            <div ref={setLugarLupa} className={cn("flex items-center", pestana === "detalles" && "hidden")} />
            {pestana !== "detalles" && (
              <button
                type="button"
                onClick={() => setGrande(true)}
                aria-label="Ver en hoja grande"
                title="La hoja a pantalla completa, en papel A4"
                className={BOTON_ICONO}
              >
                <Fullscreen className="h-5 w-5" aria-hidden />
              </button>
            )}
            {costado && (
              <button
                type="button"
                onClick={() => setConDetalles(!detallesAlCostado)}
                aria-pressed={detallesAlCostado}
                aria-label={detallesAlCostado ? "Ocultar los detalles del costado" : "Ver los detalles al costado"}
                title={detallesAlCostado ? "Ocultar los detalles (la hoja usa todo el ancho)" : "Ver los detalles de la guía al costado"}
                className={cn(BOTON_ICONO, "aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent-soft)]")}
              >
                {detallesAlCostado ? <PanelRightClose className="h-5 w-5" aria-hidden /> : <PanelRightOpen className="h-5 w-5" aria-hidden />}
              </button>
            )}
          </div>
        </CabeceraPropia>

        <div className="flex min-h-0 flex-1 gap-4 px-3 py-3 sm:px-6">
          <CtpApartadoPanel idBase={idBase} id={pestana} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {pestana === "detalles" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-1">{detalles}</div>
            ) : (
              /* `key`: cada pestaña con su lupa y su % recordado. */
              <GtfDatosLupa key={pestana} clave={`gtf-datos-lupa:${pestana}`} etiqueta={nombreHoja} barraEn={lugarLupa}>
                {hoja(registroEnHoja)}
              </GtfDatosLupa>
            )}
          </CtpApartadoPanel>
          {detallesAlCostado && (
            <aside
              aria-label={`Detalles de la GTF ${gtfNumber}`}
              className="w-80 shrink-0 overflow-y-auto overscroll-contain border-l border-[var(--rule-base)] pl-4 2xl:w-96"
            >
              {detalles}
            </aside>
          )}
        </div>
      </div>
      {grande && (
        <GtfHojaGrande titulo={nombreHoja} clave={`gtf-datos-lupa:grande:${pestana}`} onClose={() => setGrande(false)}>
          {hoja(true)}
        </GtfHojaGrande>
      )}
    </AdminModal>
  );
}
