"use client";

/**
 * Paso 2 de «Registrar producción»: las piezas. El formulario del paquete
 * (con dictado) arriba y lo cargado abajo, con «Traer del SNIFFS» — el mismo
 * orden de la planilla vieja, sin los bloques de material y corrida encima.
 */
import CtpPegarSniffs from "../CtpPegarSniffs";
import { Bloque } from "./campos";
import PaqueteForm from "./PaqueteForm";
import PaquetesCargados from "./PaquetesCargados";
import type { RegistrarProduccion } from "./use-registrar-produccion";
import type { RegistrarProduccionProps } from "./tipos";

export default function PasoPiezas({
  r,
  p,
  activo,
}: {
  r: RegistrarProduccion;
  p: RegistrarProduccionProps;
  /** El paso está a la vista: el dictado se corta al salir de él. */
  activo: boolean;
}) {
  const { lote, material, sniffsInicial, onSniffsLeido } = p;
  const {
    previo,
    paquetes,
    setPaquetes,
    codigosUsados,
    margen,
    proponerCodigo,
    prepararSiguiente,
    setDia,
  } = r;
  return (
    <div className="space-y-3">
      <PaqueteForm r={r} activo={activo} />

      {/* ── Producción cargada ── */}
      <Bloque
        titulo={
          previo > 0
            ? `Paquetes que se agregan (${paquetes.length})`
            : `Producción (${paquetes.length})`
        }
        meta={
          previo > 0
            ? `La corrida ya tiene ${codigosUsados?.length ?? 0} paquete(s) cargados`
            : undefined
        }
      >
        {/**
         * Traer del SNIFFS (ADR-397): la pantalla que el operador ya declaró
         * en SERFOR, pegada como captura o como texto, entra como filas para
         * revisar y después como paquetes — con el próximo código libre de
         * la serie, igual que si se cargaran a mano.
         */}
        <CtpPegarSniffs
          material={{ especie: material.especie, volumenM3: material.volumenM3 }}
          margenM3={margen}
          siguienteCodigo={proponerCodigo}
          onAgregar={(nuevos, detalle) => {
            setPaquetes((prev) => [...prev, ...nuevos]);
            prepararSiguiente(nuevos.map((p) => p.codigo));
            onSniffsLeido?.(detalle);
          }}
          /* Ampliando, la fecha es la del asiento que ya existe: no se ofrece. */
          onUsarFecha={previo > 0 ? undefined : setDia}
          compacto={paquetes.length > 0}
          detalleInicial={sniffsInicial}
          /* Pegar la captura de otro lote es el error más caro: se avisa. */
          loteSniffsEsperado={lote?.sniffs?.lote ?? null}
        />
        <PaquetesCargados r={r} material={material} />
      </Bloque>
    </div>
  );
}
