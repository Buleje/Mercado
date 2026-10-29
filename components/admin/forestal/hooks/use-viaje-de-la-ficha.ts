"use client";

/**
 * «Igual que la anterior» y «la placa trae al chofer» del modal «Guardar
 * cubicación» (Brandon 28-10). Lee las guardadas una vez al abrir la ventana
 * (la misma lista de Guardadas) y llena SÓLO lo vacío; lo que llenó se puede
 * deshacer con un toque. Las cuentas están en `cubicacion-ficha-anterior.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import type { CubicacionRegistro, FichaCubicacion } from "@/lib/forestal/cubicacion-registro";
import {
  completarVacios, NOMBRE_DEL_CAMPO, viajeAnterior, viajeDeLaPlaca, type CampoDelViaje,
} from "@/lib/forestal/cubicacion-ficha-anterior";
import { formatearPlaca, type Vehiculo } from "@/lib/forestal/directorio";

export interface AvisoDelViaje {
  /** Dónde se muestra: arriba de los datos (la anterior) o bajo la placa. */
  donde: "anterior" | "placa";
  texto: string;
  /** La ficha de antes de llenar, para «Deshacer». */
  antes: FichaCubicacion;
}

const lista = (campos: CampoDelViaje[]) => campos.map((c) => NOMBRE_DEL_CAMPO[c]).join(", ");

export function useViajeDeLaFicha({ ficha, ponerFicha, actualizando, vehiculos, choferes }: {
  ficha: FichaCubicacion;
  /** Reemplaza la ficha entera. */
  ponerFicha: (f: FichaCubicacion) => void;
  /** El nombre de la guardada que se actualiza: no se copia de sí misma. */
  actualizando: string | null;
  vehiculos: readonly Vehiculo[];
  choferes: readonly string[];
}) {
  const [guardadas, setGuardadas] = useState<CubicacionRegistro[]>([]);
  const [aviso, setAviso] = useState<AvisoDelViaje | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch("/api/admin/forestal/cubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { cubicaciones?: CubicacionRegistro[] } | null) => { if (vivo && j?.cubicaciones) setGuardadas(j.cubicaciones); })
      .catch((err) => logger.warn("[cubicador.viaje] no se leyeron las guardadas", { error: String(err) }));
    return () => { vivo = false; };
  }, []);

  const anterior = useMemo(() => viajeAnterior(guardadas, actualizando), [guardadas, actualizando]);
  /* Sólo se ofrece si tiene algo que poner donde hoy está vacío. */
  const ofreceAnterior = !!anterior && completarVacios(ficha, anterior.datos).puestos.length > 0;

  const copiarAnterior = () => {
    if (!anterior) return;
    const r = completarVacios(ficha, anterior.datos);
    if (r.puestos.length === 0) return;
    ponerFicha(r.ficha);
    setAviso({ donde: "anterior", texto: `Copiado de «${anterior.nombre}»: ${lista(r.puestos)}.`, antes: ficha });
  };

  /** La placa escrita: si ya vino antes (o está en el Directorio), su chofer y su transportista donde estén vacíos. */
  const alCambiarPlaca = (placa: string) => {
    const conPlaca = { ...ficha, placa };
    const r = completarVacios(conPlaca, viajeDeLaPlaca(guardadas, placa, vehiculos, choferes));
    ponerFicha(r.ficha);
    if (r.puestos.length > 0) setAviso({ donde: "placa", texto: `Con la ${formatearPlaca(placa)} vino antes: ${lista(r.puestos)}.`, antes: conPlaca });
    else if (aviso?.donde === "placa") setAviso(null);
  };

  const deshacer = () => {
    if (aviso) ponerFicha(aviso.antes);
    setAviso(null);
  };

  return { anterior, ofreceAnterior, copiarAnterior, alCambiarPlaca, aviso, deshacer };
}
