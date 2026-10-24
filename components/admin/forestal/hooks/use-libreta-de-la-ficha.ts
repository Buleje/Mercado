"use client";

/**
 * Las sugerencias del Directorio para la ficha de una cubicación (modal
 * «Guardar cubicación», 24-10): compradores, comunidades (las CCNN son
 * proveedores, p. ej. «COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI»), permisos,
 * placas y choferes. Se puede escribir cualquier otro nombre: el Directorio
 * sólo sugiere y, si el nombre coincide, ata la ficha (`*ParteId`).
 */
import { useCallback, useMemo } from "react";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { claveBusqueda, type Parte } from "@/lib/forestal/directorio";
import { permisosDeParte, permisosOfrecibles } from "@/lib/forestal/permisos-de-parte";

/** Cada nombre una vez, en el orden en que llega (el de uso). */
const unicos = (nombres: readonly string[]) => {
  const vistos = new Set<string>();
  return nombres.filter((n) => {
    const k = claveBusqueda(n);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
};

export function useLibretaDeLaFicha(activo: boolean) {
  const dir = useDirectorioForestal({ activo });
  const { contratos } = usePermisosForestal({ activo });
  const { partes, porRol, receptores, vehiculosActivos } = dir;

  const libreta = useMemo(() => {
    const vivas = partes.filter((p) => p.activo);
    /* Primero los clientes y destinatarios; después cualquiera de la libreta. */
    const compradores = [...receptores(), ...vivas.filter((p) => !p.roles.includes("cliente") && !p.roles.includes("destinatario"))];
    /* Las CCNN primero; después los demás proveedores (predios, titulares). */
    const comunidades = [
      ...vivas.filter((p) => p.categoria === "ccnn"),
      ...porRol("proveedor").filter((p) => p.categoria !== "ccnn"),
    ];
    const destinos = [...porRol("establecimiento"), ...receptores()];
    return {
      compradores,
      comunidades,
      nombresCompradores: unicos(compradores.map((p) => p.nombre)),
      nombresComunidades: unicos(comunidades.map((p) => p.nombre)),
      nombresDestinos: unicos(destinos.map((p) => p.nombre)),
      choferes: unicos(porRol("conductor").map((p) => p.nombre)),
      placas: unicos(vehiculosActivos.map((v) => v.placa)),
      permisos: unicos(contratos.filter((c) => c.isActive).map((c) => c.codigo)),
    };
  }, [partes, porRol, receptores, vehiculosActivos, contratos]);

  /** La ficha cuyo nombre es ESE (sin mayúsculas, tildes ni espacios de más). */
  const buscar = useCallback((lista: readonly Parte[], nombre: string): Parte | null => {
    const k = claveBusqueda(nombre);
    return k ? lista.find((p) => claveBusqueda(p.nombre) === k) ?? null : null;
  }, []);

  /** El permiso de una comunidad: el de su ficha o, si tiene uno solo, ese. */
  const permisoDe = useCallback((p: Parte): string | null => {
    if (p.tituloHabilitante?.trim()) return p.tituloHabilitante.trim();
    const suyos = permisosOfrecibles(permisosDeParte({ id: p.id, nombre: p.nombre }, contratos));
    return suyos.length === 1 ? suyos[0].codigo : null;
  }, [contratos]);

  return { ...libreta, buscar, permisoDe, cargando: dir.cargando };
}
