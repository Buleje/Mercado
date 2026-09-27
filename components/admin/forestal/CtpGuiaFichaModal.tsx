"use client";

/**
 * La ficha de la guía — todo lo que el libro sabe de ella, y el botón para
 * recibirla (ADR-350).
 *
 * Rediseño 2026-09-26 (Brandon: «un rediseño completo y mejor elaborado… que
 * en una fila haya 2 o más bloques»). Antes: dos pestañas («El documento» /
 * «Las trozas») con los casilleros apilados en 6 secciones; sin plata, sin
 * papeles, sin fotos, sin etiquetas ni estado de cada troza. Ahora: una
 * cabecera con la identidad de la guía y su estado en pastillas, y una grilla
 * de bloques —una pregunta cada uno— que a ≥56rem de modal va en 2 columnas y
 * a ≥72rem en 3 (container query: manda el ancho del modal, no el de la
 * ventana, que cambia 300 px con la barra lateral).
 *
 * Recibir en otra pantalla que la que se revisa termina en guías recibidas sin
 * mirar: «Recepcionar» sigue en el pie, con todo a la vista.
 */

import { useMemo } from "react";
import { FileText, Loader2, PackageCheck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDocumentosGuia } from "@/hooks/use-documentos-guia";
import { usePlataDeGuia } from "@/hooks/use-plata-de-guia";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import { trozasPorFila } from "@/lib/forestal/acomodar-trozas";
import { mensajeDeVencida, vencimientoDeGuia, yaRecibida } from "@/lib/forestal/fecha-de-llegada";
import { lineaDeTiempo, resumirTrozas, ddmm } from "@/lib/forestal/ficha-guia-resumen";
import { normalizarFotos } from "@/lib/forestal/fotos-carga";
import { completitudFicha, seccionesDeGuia, type LineaConGuia } from "@/lib/forestal/guia-ficha";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { ptDeLinea } from "@/lib/forestal/plata-de-guia";
import { resumenOxapampa } from "@/lib/forestal/cubicacion-oxapampa";
import { Btn, ModalBody, ModalFooter, type WoodEntry } from "./ctp-shared";
import FichaCabecera from "./ficha-guia/FichaCabecera";
import FichaAvisos from "./ficha-guia/FichaAvisos";
import BloqueMadera from "./ficha-guia/BloqueMadera";
import BloqueRecepcion from "./ficha-guia/BloqueRecepcion";
import BloquePlata from "./ficha-guia/BloquePlata";
import BloqueTrozas from "./ficha-guia/BloqueTrozas";
import BloqueDocumentoGtf from "./ficha-guia/BloqueDocumentoGtf";
import BloquePapeles from "./ficha-guia/BloquePapeles";
import BloqueFotos from "./ficha-guia/BloqueFotos";

/** Una pieza de la guía, como la devuelve el endpoint de trozas (`serializar`). */
export interface TrozaDeFicha {
  id: string;
  /** La fila (asiento por especie) de la que cuelga. */
  woodEntryId?: string | null;
  codificacion?: string | null;
  codigoPlanta?: string | null;
  especieComun?: string | null;
  especieCientifica?: string | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  /** El diámetro declarado como UN número, cuando la guía no trae D1/D2. */
  diametroCm?: number | null;
  largoM?: number | null;
  volumenM3?: number | string | null;
  fechaRecepcion?: string | null;
  noRecepcionada?: boolean | null;
  consumidaEnId?: string | null;
  /* Viajan en el JSON desde ADR-363/436; la ficha dice con ellos DÓNDE está cada una. */
  despachadaEnId?: string | null;
  descarte?: boolean | null;
  retrozos?: number | null;
  etiquetadaEn?: string | null;
  /* Cubicación Oxapampa (2026-09-26), del mismo `serializar` del endpoint de
     trozas (`?woodEntryId=`): pulgadas, pies y el pt congelado al guardar. */
  oxD1Pulg?: number | null;
  oxD2Pulg?: number | null;
  oxLargoPies?: number | null;
  oxPt?: number | null;
  oxMedidoEn?: string | null;
  /** D1/D2 en cm cargados en planta porque la guía no los traía. */
  d1d2MedidoEnPlanta?: boolean | null;
}

export default function CtpGuiaFichaModal({
  guia,
  trozas,
  recepcionando,
  error,
  onRecepcionar,
  onVerDocumento,
  onCuadrar,
  onAcomodar,
  onPlata,
  onDocumentos,
  onEtiquetas,
  onFotos,
  onCorregirRecepcion,
  onCubicar,
  onClose,
}: {
  guia: GuiaIngreso<WoodEntry>;
  /** Las piezas de todos sus asientos. `null` mientras cargan. */
  trozas: TrozaDeFicha[] | null;
  /** Legado: hoy «cargando» es `trozas == null`. */
  cargandoTrozas?: boolean;
  recepcionando: boolean;
  error: string | null;
  /** Recepciona la guía entera: fecha sus piezas, la fecha y la valida (ADR-339). */
  onRecepcionar: () => void;
  onVerDocumento: () => void;
  /** Abre el cuadre cuando el documento se contradice a sí mismo (ADR-353). */
  onCuadrar?: () => void;
  /** Lleva cada troza a la fila de su especie (ADR-435). */
  onAcomodar?: () => void;
  /* Los otros papeles de la guía. Cada uno REEMPLAZA la ficha (no se apilan
     modales: obligaría a cerrar dos veces). Sin el manejador no se ofrece. */
  onPlata?: () => void;
  onDocumentos?: () => void;
  onEtiquetas?: () => void;
  onFotos?: () => void;
  onCorregirRecepcion?: () => void;
  /** «Cubicar Oxapampa»: se abre ENCIMA de la ficha (planilla que vuelve a ella). */
  onCubicar?: () => void;
  onClose: () => void;
}) {
  const plata = usePlataDeGuia(guia.gtfNumber);
  const docs = useDocumentosGuia(guia.gtfNumber);

  const secciones = useMemo(() => seccionesDeGuia(guia as unknown as GuiaIngreso<LineaConGuia>), [guia]);
  const completitud = useMemo(() => completitudFicha(secciones), [secciones]);
  /* El mismo cálculo que el chip de la tabla: un solo criterio de descuadre. */
  const cuadre = cuadreDeIngreso(guia.volumenM3, guia.trozasM3, guia.trozasCount);
  const porFila = useMemo(
    () =>
      trozasPorFila(
        guia.lineas.map((l) => ({ id: l.id, especie: l.speciesCommonName, cientifico: l.speciesScientificName ?? null })),
        trozas ?? [],
      ),
    [guia.lineas, trozas],
  );
  const resumen = useMemo(() => (trozas ? resumirTrozas(trozas) : null), [trozas]);
  const vigencia = useMemo(() => vencimientoDeGuia(guia.lineas), [guia.lineas]);
  const tiempo = useMemo(
    () =>
      lineaDeTiempo({
        lineas: guia.lineas,
        expedicion: vigencia.expedicion,
        vencimiento: vigencia.vencimiento,
        piezasDecididas: guia.trozasDecididas,
        piezasTotal: guia.trozasCount,
      }),
    [guia.lineas, guia.trozasDecididas, guia.trozasCount, vigencia],
  );
  const fotos = useMemo(() => normalizarFotos(guia.lineas[0]?.photos), [guia.lineas]);
  /* ≈ pt aserrable: el MISMO cálculo que «Plata de la guía» (rolliza al 56 %).
     La ficha vieja decía m³ × 424 y la misma pila salía con dos cifras. */
  const pt = guia.lineas.reduce((s, l) => s + ptDeLinea({ volumeM3: Number(l.volumeM3) || 0, productType: l.productType }), 0);
  const oxapampa = useMemo(() => (trozas ? { ...resumenOxapampa(trozas), total: trozas.length } : null), [trozas]);
  const especies = useMemo(
    () => [...new Set((trozas ?? []).map((t) => t.especieComun ?? "").filter(Boolean))],
    [trozas],
  );

  const llego = tiempo.hitos.find((h) => h.clave === "llego")?.dia ?? null;
  const vencida =
    vigencia.vencimiento && tiempo.recibidaVencida
      ? mensajeDeVencida(vigencia.vencimiento)
      : vigencia.vencimiento && tiempo.vencidaSinRecibir
        ? `La guía venció el ${ddmm(vigencia.vencimiento)} y la madera todavía no figura recibida.`
        : null;
  /** Una guía ya recibida no se vuelve a recibir: el botón lo dice, no lo esconde. */
  const yaRecepcionada = guia.status !== "pendiente" && guia.trozasDecididas >= guia.trozasCount;
  const ocupado = recepcionando;

  return (
    <AdminModal
      open
      onClose={recepcionando ? () => {} : onClose}
      variant="info"
      className="sm:max-w-[80rem]"
      icon={FileText}
      title="Ficha de la guía"
      claveVentana="ctp-guia-ficha"
      footer={
        <ModalFooter
          error={error}
          nota={
            <span className="font-mono tabular-nums">
              {completitud.llenos}/{completitud.total} casilleros
              {guia.trozasCount > 0 && ` · ${guia.trozasDecididas}/${guia.trozasCount} piezas recibidas`}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={recepcionando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={onRecepcionar} disabled={recepcionando || yaRecepcionada}>
            {recepcionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            {yaRecepcionada ? "Ya recepcionada" : "Recepcionar guía"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="@container/ficha space-y-4">
        <FichaCabecera
          guia={guia}
          ptAserrable={pt}
          trozas={resumen}
          plata={plata.dto}
          docsLlenos={docs.datos?.llenos ?? null}
          fotos={fotos.length}
          llego={llego}
          alerta={vencida}
          atajos={{ onVerDocumento, onPlata, onDocumentos, onEtiquetas, onFotos }}
          ocupado={ocupado}
        />

        <FichaAvisos
          descuadre={descuadra(cuadre) ? { declarado: guia.volumenM3, trozas: guia.trozasM3 ?? 0 } : null}
          enOtraFila={porFila.enOtraFila.size}
          vencida={vencida}
          onCuadrar={onCuadrar}
          onAcomodar={onAcomodar}
          ocupado={ocupado}
        />

        {/* Orden por pregunta: qué trae · cuándo llegó · cuánto costó; después
            dónde está cada troza y qué dice el papel; al final lo que acompaña.
            `dense` deja que un bloque angosto suba al hueco que deja uno ancho. */}
        <div className="grid grid-cols-1 gap-4 grid-flow-row-dense @min-[56rem]/ficha:grid-cols-2 @min-[72rem]/ficha:grid-cols-3">
          <BloqueMadera guia={guia} trozasPorFila={trozas ? porFila.cuantas : null} indice={1} />
          <BloqueRecepcion
            hitos={tiempo.hitos}
            piezasDecididas={guia.trozasDecididas}
            piezasTotal={guia.trozasCount}
            onCorregir={yaRecibida(guia) ? onCorregirRecepcion : undefined}
            ocupado={ocupado}
            indice={2}
          />
          <BloquePlata
            dto={plata.dto}
            cargando={plata.cargando}
            error={plata.error}
            onReintentar={() => void plata.cargar()}
            onAbrir={onPlata}
            ocupado={ocupado}
            indice={3}
            pt={{ estimado: pt, oxapampa }}
          />
          <BloqueTrozas
            trozas={trozas}
            resumen={resumen}
            enOtraFila={porFila.enOtraFila}
            especies={especies}
            indice={4}
            className="@min-[56rem]/ficha:col-span-2"
            onCubicar={onCubicar}
            ocupado={ocupado}
          />
          <BloqueDocumentoGtf
            secciones={secciones}
            llenos={completitud.llenos}
            total={completitud.total}
            onVerDocumento={onVerDocumento}
            ocupado={ocupado}
            indice={5}
          />
          <BloquePapeles
            datos={docs.datos}
            cargando={docs.cargando}
            error={docs.error}
            onAbrir={onDocumentos}
            ocupado={ocupado}
            indice={6}
          />
          <BloqueFotos fotos={fotos} onFotos={onFotos} ocupado={ocupado} indice={7} className="@min-[72rem]/ficha:col-span-2" />
        </div>
      </ModalBody>
    </AdminModal>
  );
}
