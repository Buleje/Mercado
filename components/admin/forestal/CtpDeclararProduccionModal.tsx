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
 *  - **Un registro por dueño** (Brandon, 23-09: «que proponga 2 registros
 *    solos»). Con piezas de dos dueños o más, arriba se elige cuál se declara:
 *    el resumen, los paquetes y el cobro son sólo de las suyas, el servicio se
 *    PROPONE desde su ficha, y al registrar salen de la libreta sólo ésas —el
 *    modal sigue con el dueño que queda—. Con un solo dueño, todo como antes.
 *
 * El borrador (servicio, cuenta, precios, permiso…) vive en el componente de
 * afuera, que no se desmonta al cerrar: volver a cubicar para corregir una
 * especie y regresar no borra lo que ya se había puesto.
 */
import { useMemo, useState } from "react";
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
} from "@/lib/forestal/declarar-produccion";
import { etiquetaDeGrupo } from "@/lib/forestal/declarar-por-dueno";
import { useTarifaAserrio } from "./hooks/use-tarifa-aserrio";
import { useTratoDelCliente } from "./hooks/use-trato-del-cliente";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { useRegistrarProduccionSinLote } from "./hooks/use-registrar-produccion-sin-lote";
import {
  bloquesDeEspecie,
  faltaParaRegistrar,
  lineasDePrecio,
  mensajeDeRegistro,
  notaDelPie,
  preciosDelPedido,
  totalDePrecios,
} from "./hooks/declarar-produccion-pantalla";
import {
  preciosDeVentaRecordados,
  quitarDeLaLibretaProduccion,
  recordarPreciosDeVenta,
} from "./hooks/libreta-produccion";
import { useDeclararPorDueno, type DeclararPorDueno } from "./hooks/use-declarar-por-dueno";
import { Btn, ModalBody, ModalFooter, Seccion } from "./ctp-shared";
import CtpAsientoProduccion from "./CtpAsientoProduccion";
import CtpAvisoSinEspecie, { AvisoEspeciePuesta } from "./CtpAvisoSinEspecie";
import CtpLoQueSeDeclara from "./CtpLoQueSeDeclara";
import CtpServicioProduccion from "./CtpServicioProduccion";
import CtpGruposDeDueno, { AvisoDuenoRegistrado } from "./CtpGruposDeDueno";

import type { BorradorDeclaracion } from "./hooks/use-declarar-por-dueno";

export type { BorradorDeclaracion };

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
  /**
   * Ya quedó registrado. `quedan` vacío = no queda nada que declarar y la
   * libreta se vació (como siempre). Con piezas de otro dueño, sólo salieron
   * las declaradas: `quedan` son las otras, este modal sigue abierto con el
   * siguiente dueño y `codigos` son los paquetes que la planta acaba de tomar.
   */
  onRegistrado: (
    mensaje: string,
    detalle: { quedan: readonly PiezaCubicada[]; codigos: readonly string[] },
  ) => void;
}

export default function CtpDeclararProduccionModal(props: Props) {
  /* El borrador y el dueño elegido viven acá afuera: cerrar para volver a
     cubicar no los borra. */
  const porDueno = useDeclararPorDueno(props.piezas);
  if (!props.abierto) return null;
  return (
    <Dialogo
      {...props}
      onCerrar={() => {
        porDueno.cerrarAviso();
        props.onCerrar();
      }}
      porDueno={porDueno}
    />
  );
}

function Dialogo({
  onCerrar,
  codigosEnPlanta,
  fecha,
  onFecha,
  trozas,
  onRegistrado,
  porDueno,
}: Omit<Props, "abierto" | "piezas"> & { porDueno: DeclararPorDueno }) {
  const { borrador, setBorrador, piezas, grupo, separados } = porDueno;
  const cambiar = (parcial: Partial<BorradorDeclaracion>) =>
    setBorrador((b) => ({ ...b, ...parcial }));
  const { servicio, parteId, compradorId, textos, especieParaSinEspecie } = borrador;

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
  /* El trato del cliente (ADR-430): el de aserrío del tercero, o el de venta
     de quien compra la madera propia. Con los grupos de la planta: el cobro
     del servidor los usa, la vista previa también. */
  const clienteId = servicio === "tercero" ? parteId : servicio === "propia" ? compradorId : null;
  const trato = useTratoDelCliente(clienteId);
  const catalogo = useEspeciesCatalogo();
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
        tarifasCliente: trato.tarifas,
        grupos: catalogo.grupos,
        fecha,
      }),
    [resumen.especies, corridas, servicio, textos, recordados, version, trato.tarifas, catalogo.grupos, fecha],
  );
  const total = useMemo(() => totalDePrecios(lineas), [lineas]);
  /* Lo que se cobraría, para que la línea del trato sepa si el trato le pone
     precio a algo de esta madera (si no, no ofrece adelantarlo). */
  const bloquesDelTrato = useMemo(() => corridas.flatMap(bloquesDeEspecie), [corridas]);
  const directorio = useDirectorioForestal({ activo: servicio != null });
  const nombreDe = (id: string | null) =>
    id ? (directorio.partes.find((p) => p.id === id)?.nombre ?? null) : null;
  const cliente = nombreDe(parteId);
  /* Los grupos sólo importan si alguien cobra por grupo: si no, esperar el
     catálogo sería frenar por nada. */
  const usaGrupos =
    trato.tarifas.some((t) => t.grupos.length > 0) || (version?.grupos?.length ?? 0) > 0;

  /* Sin precio a mano en alguna especie, el cargo depende de lo que se está leyendo. */
  const calculandoCargo =
    servicio === "tercero" &&
    lineas.some((l) => l.precio == null) &&
    (trato.cargando || tarifa.cargando || (catalogo.cargando && usaGrupos));

  const lineasVista = useMemo(
    () => (calculandoCargo ? lineas.map((l) => (l.precio == null ? { ...l, calculando: true, importe: null, desde: null } : l)) : lineas),
    [calculandoCargo, lineas],
  );

  const falta = faltaParaRegistrar({
    corridas,
    servicio,
    parteId,
    lineas,
    fechaValida: esIsoValido(fecha),
    tarifa: { cargando: tarifa.cargando, error: tarifa.error },
    trato: { cargando: trato.cargando, error: trato.error, cliente },
    grupos: { cargando: catalogo.cargando && usaGrupos, error: !!catalogo.errorLectura && usaGrupos },
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
    /* Sólo salen de la libreta las piezas DECLARADAS, por id —también en el
       último registro—: una pieza dictada mientras viajaba el pedido no se
       declaró y no se puede borrar. Si no queda ninguna, `quitar…` vacía la
       libreta entera como siempre. */
    const { quedan, ids, mensaje } = porDueno.registrado(mensajeDeRegistro(resp, servicio, cliente));
    quitarDeLaLibretaProduccion(ids);
    onRegistrado(mensaje, { quedan, codigos: paquetes.map((p) => p.codigo) });
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
        separados && grupo ? `${etiquetaDeGrupo(grupo)} · ` : ""
      }${conEspecie.length === 1 ? "1 corrida" : `${conEspecie.length} corridas, una por especie`}`}
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
            /* Con el nombre del dueño el rótulo se alarga: a 400 px se recorta
               el nombre, no el botón. */
            className="min-w-0 max-w-full"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Boxes className="h-4 w-4" aria-hidden />
            )}
            {guardando ? (
              "Registrando…"
            ) : (
              <span className="min-w-0 truncate">
                {conEspecie.length > 1 ? `Registrar ${conEspecie.length} corridas` : "Registrar producción"}
                {separados && grupo
                  ? grupo.nombre || grupo.parteId
                    ? ` de ${etiquetaDeGrupo(grupo)}`
                    : " sin dueño"
                  : ""}
              </span>
            )}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        {porDueno.aviso && (
          <AvisoDuenoRegistrado mensaje={porDueno.aviso} onCerrar={porDueno.cerrarAviso} />
        )}
        {separados && (
          <CtpGruposDeDueno
            grupos={porDueno.grupos}
            clave={grupo?.clave ?? null}
            onElegir={porDueno.elegir}
            propuestaVigente={Boolean(grupo?.parteId) && servicio === "tercero" && parteId === grupo?.parteId}
          />
        )}
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
              compradorId={compradorId}
              onComprador={(id) => cambiar({ compradorId: id })}
              fecha={fecha}
              directorio={directorio}
              cargo={total}
              trato={trato}
              grupos={catalogo.grupos}
              bloques={bloquesDelTrato}
              calculando={calculandoCargo}
            />
          </div>
        </Seccion>

        <Seccion numero={2} title="Lo que se declara" hint="PT · m³ · piezas">
          <CtpLoQueSeDeclara
            resumen={resumen}
            paquetes={paquetes}
            servicio={servicio}
            lineas={lineasVista}
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
