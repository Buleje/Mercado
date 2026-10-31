import { useArchivoMenu } from "./use-archivo-menu";
import { useArchivoAcciones } from "./use-archivo-acciones";
import { useArchivoSubidas } from "./use-archivo-subidas";
import { useArchivoCarpetas } from "./use-archivo-carpetas";
import { useArchivoIndice } from "./use-archivo-indice";
import { useArchivoLista } from "./use-archivo-lista";
import { useArchivoEstados } from "./use-archivo-estados";
import { useArchivoVista } from "./use-archivo-vista";
/** El estado entero del componente, por hooks encadenados en el MISMO orden del original. */
export function useArchivo() {
  const h0 = useArchivoVista();
  const h1 = { ...h0, ...useArchivoEstados(h0) };
  const h2 = { ...h1, ...useArchivoLista(h1) };
  const h3 = { ...h2, ...useArchivoIndice(h2) };
  const h4 = { ...h3, ...useArchivoCarpetas(h3) };
  const h5 = { ...h4, ...useArchivoSubidas(h4) };
  const h6 = { ...h5, ...useArchivoAcciones(h5) };
  const h7 = { ...h6, ...useArchivoMenu(h6) };
  return h7;
}
export type ModeloArchivo = ReturnType<typeof useArchivo>;
