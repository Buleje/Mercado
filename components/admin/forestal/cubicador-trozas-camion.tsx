"use client";

/**
 * Placa y chofer del camión al guardar una cubicación de trozas (Brandon 24-10:
 * «hoy las cubicaciones de trozas no guardan ni placa ni chofer»). Opcionales:
 * la troza que llegó en chata o sin camión se guarda igual. Se ven después en
 * el detalle y en el comparador (`datosDeTrozas`).
 *
 * Sugiere los vehículos y los conductores del Directorio forestal. Si el
 * negocio no tiene un libro prendido, el Directorio responde 403 y los campos
 * quedan sin sugerencias, sin aviso: escribir a mano sigue andando.
 *
 * La placa se ordena al tipear como en la guía (`formatearAlTipear`: «W2D-853»);
 * una que no puede existir sólo se AVISA (es el camión de un tercero, como en
 * las guías de ingreso).
 */
import { useMemo } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { MAX_CHOFER } from "@/lib/forestal/cubicacion-cuenta";
import { EJEMPLO_PLACA, formatearAlTipear, leerPlaca, partirPlacasDeGuia } from "@/lib/forestal/placa-peru";
import { CAMPO_CUENTA } from "./cubicacion-cuenta-persona";

/* La etiqueta de `ETIQUETA_CUENTA` sin su margen: acá el margen lo lleva la fila con la ⓘ. */
const ETIQUETA = "text-sm font-semibold text-[var(--text-secondary)]";

const placaLegible = (p: string) => {
  const l = leerPlaca(p);
  return l.estado === "valida" ? l.formateada : p;
};

/** La placa de una guía («V2H-901 / W3A-123» en un casillero de SERFOR) → la del camión, ordenada. */
export const placaInicial = (v: string | null | undefined): string => (v ? formatearAlTipear(partirPlacasDeGuia(v).placa) : "");

export function CamposDelCamion({ placa, chofer, onPlaca, onChofer }: {
  placa: string;
  chofer: string;
  onPlaca: (v: string) => void;
  onChofer: (v: string) => void;
}) {
  const { vehiculosActivos, porRol } = useDirectorioForestal();
  const placas = useMemo(() => [...new Set(vehiculosActivos.map((v) => placaLegible(v.placa)))], [vehiculosActivos]);
  const choferes = useMemo(() => [...new Set(porRol("conductor").map((p) => p.nombre))], [porRol]);
  const lectura = leerPlaca(placa);

  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2" data-campos="camion">
      <div>
        <div className="mb-1 flex items-center gap-1">
          <label htmlFor="cub-placa" className={ETIQUETA}>Placa del camión (opcional)</label>
          <InfoTip
            what="El camión que trajo (o se llevó) estas trozas."
            affects="Sale en el detalle y en el comparador: así se sabe qué viaje fue cada cubicación."
            example={`${EJEMPLO_PLACA}. Las placas del Directorio aparecen al escribir.`}
          />
        </div>
        <input
          id="cub-placa"
          list="cub-placas"
          className={`${CAMPO_CUENTA} font-mono uppercase placeholder:normal-case`}
          value={placa}
          placeholder={`Ej.: ${EJEMPLO_PLACA}`}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onPlaca(formatearAlTipear(e.target.value))}
        />
        <datalist id="cub-placas">{placas.map((p) => <option key={p} value={p} />)}</datalist>
        {lectura.estado === "invalida" && (
          <p className="mt-1 flex items-start gap-1 text-sm text-[var(--data-warning-ink)]" data-aviso="placa">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{lectura.motivo} Si el camión la tiene así, déjala.</span>
          </p>
        )}
      </div>
      <div>
        <label htmlFor="cub-chofer" className={`mb-1 block ${ETIQUETA}`}>Chofer (opcional)</label>
        <input
          id="cub-chofer"
          list="cub-choferes"
          className={CAMPO_CUENTA}
          value={chofer}
          maxLength={MAX_CHOFER}
          placeholder="Ej.: Wilmer Ramírez"
          autoComplete="off"
          onChange={(e) => onChofer(e.target.value)}
        />
        <datalist id="cub-choferes">{choferes.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
    </div>
  );
}
