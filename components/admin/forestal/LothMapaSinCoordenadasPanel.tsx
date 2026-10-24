"use client";

/**
 * LothMapaSinCoordenadasPanel — une la franja «N árboles sin coordenadas» con
 * el editor de coordenadas: calcula la lista desde el censo del mapa, abre el
 * editor del árbol elegido y, al guardar, mete el árbol al mapa (sin recargar)
 * y lo centra para que se vea que ya salió.
 */

import { useMemo, useState } from "react";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { LatLng } from "@/lib/forestal/loth-geo";
import LothArbolCoordenadasModal from "./LothArbolCoordenadasModal";
import LothMapaSinCoordenadas from "./LothMapaSinCoordenadas";
import { arbolesSinCoordenadas, zonaMasUsada } from "./loth-mapa-sin-coordenadas";
import { toCenso, type CensusTreeDTO } from "./loth-mapa-shared";

interface Props {
  trees: readonly CensusTreeDTO[];
  /** El servidor guardó las coordenadas: el árbol como quedó. */
  onGuardado: (arbol: CensusTreeDTO) => void;
  /** Centra el mapa en un punto. */
  onCentrar: (punto: LatLng) => void;
}

export default function LothMapaSinCoordenadasPanel({ trees, onGuardado, onCentrar }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const rol = useMiRol();
  const puedeEditar = puedePedir("PATCH /api/admin/forestal/plan/census", rol);
  /* Con el rol todavía cargando (`null`) no hay botones, pero tampoco se afirma
     que falte permiso: a un admin le parpadearía «lo hace el dueño». */
  const sinPermiso = rol != null && !puedeEditar;
  const arboles = useMemo(() => arbolesSinCoordenadas(trees), [trees]);
  const zona = useMemo(() => zonaMasUsada(trees), [trees]);
  const arbol = arboles.find((a) => a.id === editando) ?? null;

  return (
    <>
      <LothMapaSinCoordenadas arboles={arboles} puedeEditar={puedeEditar} sinPermiso={sinPermiso} onCargar={setEditando} />
      <LothArbolCoordenadasModal
        arbol={arbol}
        zonaInicial={zona}
        onClose={() => setEditando(null)}
        onGuardado={(guardado) => {
          onGuardado(guardado);
          const punto = toCenso([guardado])[0];
          if (punto) onCentrar([punto.lat, punto.lng]);
        }}
      />
    </>
  );
}
