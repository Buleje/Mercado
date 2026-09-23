"use client";

/**
 * Declarar producción — el modal APARTE de «Producir sin lote» (ADR-429).
 *
 * Pedido de Brandon (22-09): un resumen por especie y tipo, elegir el tipo de
 * servicio —madera propia con su precio de venta, o aserrío a un tercero con
 * su cuenta y su precio—, el detalle en otra sección, y todo en un modal
 * aparte. «Producir sin lote» queda para cubicar.
 *
 *  - **Un asiento por especie.** Antes, elegir una especie se la ponía a TODAS
 *    las piezas y la real se perdía. Acá cada especie es su corrida, y lo que
 *    no tiene especie no se registra: se le pone (a eso solo, nunca pisando).
 *  - **Un solo pedido** que crea y declara todas las corridas o ninguna.
 *  - **Registrar vacía la libreta**: reabrir ya no ofrece declarar —y cobrar—
 *    lo mismo otra vez. El duplicado que igual se intente, lo frena el servidor.
 *
 * El borrador (servicio, cuenta, precios, permiso…) vive en el componente de
 * afuera, que no se desmonta al cerrar: volver a cubicar para corregir una
 * especie y regresar no borra lo que ya se había puesto.
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Boxes, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { ESPECIES_MADERA, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";
import { recordarCodigosDeCorrida } from "@/lib/forestal/codigos-de-corrida";
import { esIsoValido, etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { versionVigente } from "@/lib/forestal/tarifa-aserrio";
import {
  armarPedido,
  corridasPorEspecie,
  paquetesDeLoCubicado,
  resumenEspecieTipo,
  type TipoServicio,
} from "@/lib/forestal/declarar-produccion";
import { useTarifaAserrio } from "./hooks/use-tarifa-aserrio";
import { useRegistrarProduccionSinLote } from "./hooks/use-registrar-produccion-sin-lote";
import {
  TEXTOS_VACIOS,
  faltaParaRegistrar,
  lineasDePrecio,
  mensajeDeRegistro,
  notaDelPie,
  preciosDelPedido,
  totalDePrecios,
  type TextosDePrecio,
} from "./hooks/declarar-produccion-pantalla";
import {
  preciosDeVentaRecordados,
  recordarPreciosDeVenta,
  vaciarLibretaProduccion,
} from "./hooks/libreta-produccion";
import { Btn, ModalBody, ModalFooter, Seccion } from "./ctp-shared";
import CtpAsientoProduccion from "./CtpAsientoProduccion";
import CtpAvisoSinEspecie, { AvisoEspeciePuesta } from "./CtpAvisoSinEspecie";
import CtpLoQueSeDeclara from "./CtpLoQueSeDeclara";
import CtpServicioProduccion from "./CtpServicioProduccion";

export interface BorradorDeclaracion {
  /** Sin valor inicial a propósito: suponer «propia» es la respuesta que nadie revisa. */
  servicio: TipoServicio | null;
  parteId: string | null;
  textos: TextosDePrecio;
  linea: string;
  permiso: string;
  observaciones: string;
  /** La especie que se le pone a lo cubicado SIN especie. Nunca pisa una que ya está. */
  especieParaSinEspecie: string | null;
}

const BORRADOR_INICIAL: BorradorDeclaracion = {
  servicio: null,
  parteId: null,
  textos: TEXTOS_VACIOS,
  /* La del día a día, como el alta con lote (`CtpRegistrarProduccionModal`). */
  linea: "LP",
  permiso: "",
  observaciones: "",
  especieParaSinEspecie: null,
};

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Lo cubicado en «Producir sin lote», con la especie de cada pieza. */
  piezas: readonly PiezaCubicada[];
  /** La serie de códigos de paquete que ya usa la planta. */
  codigosEnPlanta: readonly string[];
  /** La fecha es de los dos modales: la tira de días de atrás y el campo de acá dicen lo mismo. */
  fecha: string;
  onFecha: (iso: string) => void;
  /** El patio que ya leyó «Producir sin lote» (campo «Código»): permiso sugerido y especies conocidas. */
  trozas: readonly TrozaParaCodigo[];
  /** Ya quedó registrado y la libreta se vació: el mensaje resume qué se hizo. */
  onRegistrado: (mensaje: string) => void;
}

export default function CtpDeclararProduccionModal(props: Props) {
  const [borrador, setBorrador] = useState<BorradorDeclaracion>(BORRADOR_INICIAL);
  if (!props.abierto) return null;
  return <Dialogo {...props} borrador={borrador} setBorrador={setBorrador} />;
}

function Dialogo({
  onCerrar,
  piezas,
  codigosEnPlanta,
  fecha,
  onFecha,
  trozas,
  onRegistrado,
  borrador,
  setBorrador,
}: Omit<Props, "abierto"> & {
  borrador: BorradorDeclaracion;
  setBorrador: Dispatch<SetStateAction<BorradorDeclaracion>>;
}) {
  const cambiar = (parcial: Partial<BorradorDeclaracion>) =>
    setBorrador((b) => ({ ...b, ...parcial }));
  const { servicio, parteId, textos, especieParaSinEspecie } = borrador;

  const piezasEfectivas = useMemo(
    () =>
      especieParaSinEspecie
        ? piezas.map((p) =>
            claveEspecie(p.especie) ? p : { ...p, especie: especieParaSinEspecie },
          )
        : [...piezas],
    [piezas, especieParaSinEspecie],
  );
  const paquetes = useMemo(
    () => paquetesDeLoCubicado(piezasEfectivas, { codigosEnPlanta }),
    [piezasEfectivas, codigosEnPlanta],
  );
  const corridas = useMemo(() => corridasPorEspecie(paquetes), [paquetes]);
  const conEspecie = useMemo(() => corridas.filter((c) => claveEspecie(c.especie)), [corridas]);
  const sinEspecie = corridas.find((c) => !claveEspecie(c.especie)) ?? null;
  const resumen = useMemo(() => resumenEspecieTipo(paquetes), [paquetes]);
  const especiesConocidas = useMemo(
    () => [
      ...new Set([
        ...conEspecie.map((c) => c.especie),
        ...trozas.map((t) => t.especie).filter((e): e is string => Boolean(e)),
        ...ESPECIES_MADERA,
      ]),
    ],
    [conEspecie, trozas],
  );

  /* La tarifa sugiere el precio del aserrío y dice cuánto cobra lo que quede sin trato. */
  const tarifa = useTarifaAserrio();
  const version = versionVigente(tarifa.tarifario, fecha);
  const [recordados] = useState(preciosDeVentaRecordados);
  const lineas = useMemo(
    () =>
      lineasDePrecio({
        especies: resumen.especies,
        corridas,
        servicio,
        textos,
        recordados,
        tarifa: version,
      }),
    [resumen.especies, corridas, servicio, textos, recordados, version],
  );
  const total = useMemo(() => totalDePrecios(lineas), [lineas]);
  const directorio = useDirectorioForestal({ activo: servicio === "tercero" });
  const cliente = parteId
    ? (directorio.partes.find((p) => p.id === parteId)?.nombre ?? null)
    : null;

  const falta = faltaParaRegistrar({
    corridas,
    servicio,
    parteId,
    lineas,
    fechaValida: esIsoValido(fecha),
    tarifa: { cargando: tarifa.cargando, error: tarifa.error },
  });
  const { registrar, guardando, error } = useRegistrarProduccionSinLote();

  const alRegistrar = async () => {
    if (falta || !servicio) return;
    const precios = preciosDelPedido(lineas);
    const pedidoServicio =
      servicio === "propia"
        ? ({ tipo: "propia", precios } as const)
        : parteId
          ? ({ tipo: "tercero", parteId, precios } as const)
          : null;
    if (!pedidoServicio) return;
    const resp = await registrar(
      armarPedido({
        paquetes,
        fecha,
        lineaProduccion: borrador.linea || null,
        originCode: borrador.permiso.trim() || null,
        observaciones: borrador.observaciones.trim() || null,
        servicio: pedidoServicio,
      }),
    );
    if (!resp) return;
    invalidarCtp();
    /* Los códigos anotados al cubicar quedan atados a SU corrida —la de su
       especie—: «Vincular materia prima» se abre con la propuesta armada (ADR-417). */
    for (const c of resp.corridas) {
      const k = claveEspecie(c.especie);
      recordarCodigosDeCorrida(
        c.id,
        piezasEfectivas.filter((p) => claveEspecie(p.especie) === k),
      );
    }
    if (servicio === "propia")
      recordarPreciosDeVenta(lineas.map((l) => ({ especie: l.especie, precioPt: l.precio })));
    vaciarLibretaProduccion();
    setBorrador(BORRADOR_INICIAL);
    onRegistrado(mensajeDeRegistro(resp, servicio, cliente));
  };

  const nota =
    falta ?? notaDelPie({ servicio, total, cliente, conPermiso: Boolean(borrador.permiso.trim()) });

  return (
    <AdminModal
      open
      aboveModals
      onClose={guardando ? () => undefined : onCerrar}
      title="Declarar producción"
      description={`${esIsoValido(fecha) ? etiquetaLarga(fecha) : "Sin fecha"} · sin lote · ${
        conEspecie.length === 1 ? "1 corrida" : `${conEspecie.length} corridas, una por especie`
      }`}
      icon={Boxes}
      variant="info"
      footer={
        <ModalFooter error={error} nota={nota}>
          <Btn variant="ghost" onClick={onCerrar} disabled={guardando}>
            Volver a cubicar
          </Btn>
          <Btn
            variant="primary"
            disabled={Boolean(falta) || guardando}
            onClick={() => void alRegistrar()}
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Boxes className="h-4 w-4" aria-hidden />
            )}
            {guardando
              ? "Registrando…"
              : conEspecie.length > 1
                ? `Registrar ${conEspecie.length} corridas`
                : "Registrar producción"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        {sinEspecie && (
          <CtpAvisoSinEspecie
            piezas={sinEspecie.piezas}
            medidas={sinEspecie.paquetes.length}
            especies={especiesConocidas}
            onElegir={(nombre) => cambiar({ especieParaSinEspecie: nombre })}
          />
        )}
        {especieParaSinEspecie && !sinEspecie && (
          <AvisoEspeciePuesta
            especie={especieParaSinEspecie}
            onDeshacer={() => cambiar({ especieParaSinEspecie: null })}
          />
        )}

        <Seccion
          numero={1}
          title="Tipo de servicio"
          estado={servicio && (servicio === "propia" || parteId) ? "ok" : "pendiente"}
        >
          <div className="sm:col-span-12">
            <CtpServicioProduccion
              servicio={servicio}
              onServicio={(t) => cambiar({ servicio: t })}
              parteId={parteId}
              onParte={(id) => cambiar({ parteId: id })}
              fecha={fecha}
              directorio={directorio}
              cargo={total}
            />
          </div>
        </Seccion>

        <Seccion numero={2} title="Lo que se declara" hint="PT · m³ · piezas">
          <CtpLoQueSeDeclara
            resumen={resumen}
            paquetes={paquetes}
            servicio={servicio}
            lineas={lineas}
            onPrecio={(clave, texto) =>
              servicio &&
              setBorrador((b) => ({
                ...b,
                textos: { ...b.textos, [servicio]: { ...b.textos[servicio], [clave]: texto } },
              }))
            }
          />
        </Seccion>

        <Seccion
          numero={3}
          title="Datos del asiento"
          estado={esIsoValido(fecha) ? "ok" : "pendiente"}
        >
          <CtpAsientoProduccion
            fecha={fecha}
            onFecha={onFecha}
            linea={borrador.linea}
            onLinea={(v) => cambiar({ linea: v })}
            permiso={borrador.permiso}
            onPermiso={(v) => cambiar({ permiso: v })}
            observaciones={borrador.observaciones}
            onObservaciones={(v) => cambiar({ observaciones: v })}
            corridas={conEspecie}
            paquetes={paquetes}
            piezas={piezasEfectivas}
            trozas={trozas}
            especiesConocidas={especiesConocidas}
            onUsarEspecie={(nombre) => cambiar({ especieParaSinEspecie: nombre })}
          />
        </Seccion>
      </ModalBody>
    </AdminModal>
  );
}
