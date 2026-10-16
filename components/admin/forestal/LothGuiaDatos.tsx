"use client";

/**
 * «Datos de la guía» del despacho con guía del Libro TH — con la cara del
 * talonario (Brandon 16-10-2026: «que se parezca lo más posible a esos
 * formatos que te envié, con ese color de texto, tamaños, formatos»).
 *
 * Una sola hoja, de arriba abajo como el papel: la cabecera de la imprenta con
 * el (1); (2)–(4); y las franjas «DATOS DEL ORIGEN DEL RECURSO O
 * PROCEDENCIA» (5)–(11c), «… DEL PROPIETARIO DEL PRODUCTO» (12)–(16), «… DEL
 * PUNTO DE PARTIDA» (17)–(20d), «… DEL DESTINATARIO» (21)–(24d), «… DEL
 * TRANSPORTISTA» (25)–(31) y «DETALLE DEL PRODUCTO» (32)–(34h), con (35)
 * Observaciones al pie. Los bloques son los MISMOS que los de la guía del CTP:
 * `FormularioPapel` les cambia la cara sólo acá, y `CLASE_PAPEL_FORM` tiñe las
 * cajas con la tinta del papel. Casi todo llega ya escrito; lo que el libro no
 * sabe queda vacío con «Falta» — nunca se rellena por rellenar.
 */

import { BloqueDestinatario, BloqueTransporte } from "./ctp-guia-bloques-partes";
import { FormularioPapel } from "./ctp-shared";
import { EncabezadoGtfPapel, PapelGtf, RenglonGtf } from "./gtf-papel";
import { BloquePropietarioLoth, parcheDe, type PropsGuiaLoth } from "./LothGuiaBloques";
import { BloquePartidaLoth } from "./LothGuiaPartida";
import { BloqueTrasladoLoth } from "./LothGuiaTraslado";
import LothDestinoCtp from "./LothDestinoCtp";
import LothGuiaDocumento from "./LothGuiaDocumento";
import LothGuiaLineaCopiada from "./LothGuiaLineaCopiada";
import { BloqueOrigenPapel } from "./loth-guia-papel-origen";
import { CLASE_PAPEL_FORM, encabezadoDelDespacho } from "./loth-guia-papel-piezas";
import PlantillasGuia from "./PlantillasGuia";

export default function LothGuiaDatos(
  props: PropsGuiaLoth & {
    /** El científico de cada especie, para el cuadro (34): el del catálogo del despacho. */
    cientificoDe?: (comun: string) => string | null | undefined;
  },
) {
  const { g, directorio, onAnotarParte, onAnotarVehiculo, onGuardarEnLibreta, cientificoDe } = props;
  const { datos, setDatos } = g;
  const set = parcheDe(setDatos);
  /* Lo que falta por bloque sale de la MISMA regla que frena el registro
     (`faltantesDespachoLoth`): la del CTP más el N°, la lista y la partida
     casillero por casillero. */
  const de = (...s: string[]) => g.faltan.filter((f) => s.includes(f.seccion)).map((f) => f.campo);
  /* Los de la partida van a su bloque; el resto del traslado, al del detalle. */
  const esDePartida = (campo: string) => campo.startsWith("Partida");
  const traslado = de("traslado");

  return (
    <FormularioPapel>
      {/* Fuera del papel: la línea de lo copiado y las plantillas. */}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2 [&>p]:mb-0 [&>p]:min-w-0 [&>p]:flex-1">
        {g.copiadaDe && <LothGuiaLineaCopiada {...g.copiadaDe} />}
        <PlantillasGuia g={g} />
      </div>
      <PapelGtf className={CLASE_PAPEL_FORM}>
        <div data-guia-datos>
          {/* El N° de registro lo pone SERFOR a mano en el talonario: el renglón va en blanco. */}
          <EncabezadoGtfPapel
            hoja="guia"
            {...encabezadoDelDespacho(g)}
            extra={<RenglonGtf rotulo="N° de registro" vacio="lo pone SERFOR" className="w-full max-w-xs" />}
          />
          <LothGuiaDocumento g={g} />
          <BloqueOrigenPapel g={g} faltaTitulo={de("titulos")} />
          <BloquePropietarioLoth {...props} faltan={de("propietario")} />
          <BloquePartidaLoth {...props} faltan={traslado.filter(esDePartida)} />
          <BloqueDestinatario
            datos={datos}
            set={set}
            directorio={directorio}
            onAnotarParte={onAnotarParte}
            onGuardarEnLibreta={onGuardarEnLibreta}
            faltan={de("destinatario")}
            llegada
          />
          <div className="px-3 pb-3 empty:hidden">
            <LothDestinoCtp g={g} />
          </div>
          <BloqueTransporte
            datos={datos}
            set={set}
            setDatos={setDatos}
            directorio={directorio}
            onAnotarParte={onAnotarParte}
            onAnotarVehiculo={onAnotarVehiculo}
            onGuardarEnLibreta={onGuardarEnLibreta}
            faltan={de("transportista", "vehiculo")}
          />
          <BloqueTrasladoLoth g={g} faltan={traslado.filter((c) => !esDePartida(c))} cientificoDe={cientificoDe} />
        </div>
      </PapelGtf>
    </FormularioPapel>
  );
}
