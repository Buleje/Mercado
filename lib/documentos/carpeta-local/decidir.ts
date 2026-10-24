/**
 * carpeta-local/decidir — qué hacer con cada archivo, sin tocar nada.
 *
 * El corazón del sync entre una carpeta del escritorio y el drive del panel.
 * Es PURO a propósito: recibe tres fotos (lo que hay en disco, lo que hay en el
 * panel, y lo que había la última vez) y devuelve la lista de acciones. Así se
 * puede probar cada caso —incluido el conflicto— sin navegador, sin red y sin
 * archivos de verdad.
 *
 * Es la misma lógica que corre el agente de Windows (`tools/buleje-sync`,
 * ADR-307), reescrita en TypeScript con tests. Si se cambia una regla acá,
 * revisar `decidirAcciones` allá.
 *
 * ⚠️ El estado previo NO es un detalle: sin él no se puede distinguir "archivo
 * nuevo en el panel" de "archivo que borraste en tu PC". Las dos situaciones se
 * ven igual (está en el panel y no en disco) y hacen lo contrario.
 */

/** Un archivo tal como está en la carpeta del escritorio. */
export interface ArchivoLocal {
  /** Ruta lógica dentro de la carpeta vinculada, con `/` y sin barra inicial. */
  ruta: string;
  /** Ruta real en disco: puede diferir si el nombre tuvo que sanearse. */
  rutaLocal: string;
  size: number;
  /** `lastModified` del File, en ms. */
  modificado: number;
}

/** Un documento del panel, ya traducido a ruta lógica. */
export interface DocumentoRemoto {
  ruta: string;
  id: string;
  /** ISO. Cambia con cada versión nueva o edición de nombre. */
  updatedAt: string;
  size: number;
}

/** Lo que sabíamos de ese archivo la última vez que se sincronizó. */
export interface EstadoPrevio {
  documentId: string;
  /** Huella del contenido local cuando quedó sincronizado. */
  huella: string;
  /** El `updatedAt` que tenía el documento en el panel. */
  serverUpdatedAt: string;
  /** Cómo se llamó el archivo en disco (el nombre saneado). */
  rutaLocal: string;
}

export type Accion =
  | { tipo: "subir"; ruta: string; documentId: string | null }
  | { tipo: "bajar"; ruta: string; documentId: string; updatedAt: string }
  | { tipo: "borrar-local"; ruta: string }
  | { tipo: "borrar-remoto"; ruta: string; documentId: string }
  | { tipo: "conflicto"; ruta: string; documentId: string; updatedAt: string }
  /** Ya no está de ningún lado: sacarlo del estado y listo. */
  | { tipo: "olvidar"; ruta: string };

/**
 * Huella barata del archivo local: tamaño + fecha de modificación.
 *
 * No se hashea el contenido porque habría que LEER los 264 archivos en cada
 * vuelta, y el navegador se lo come todo en memoria. Guardar un archivo siempre
 * mueve su `lastModified`, así que la huella cambia con cualquier edición real.
 */
export function huellaDe(a: { size: number; modificado: number }): string {
  return `${a.size}:${a.modificado}`;
}

/**
 * Cruza las tres fotos y decide. No ejecuta nada.
 *
 * Reglas, en castellano:
 * · está sólo en disco y nunca se sincronizó → **subir**
 * · está sólo en disco pero ya se había sincronizado → lo borraron en el panel → **borrar local**
 * · está sólo en el panel y nunca se sincronizó → **bajar**
 * · está sólo en el panel pero ya se había sincronizado → lo borraste vos → **borrar remoto** (papelera)
 * · está en los dos y cambió de un lado → copiar hacia el otro
 * · está en los dos y cambió de LOS DOS → **conflicto** (se conservan las dos versiones)
 */
export function decidirAcciones(entrada: {
  locales: Map<string, ArchivoLocal>;
  remotos: Map<string, DocumentoRemoto>;
  previos: Record<string, EstadoPrevio>;
}): Accion[] {
  const { locales, remotos, previos } = entrada;
  const acciones: Accion[] = [];
  const rutas = new Set([...locales.keys(), ...remotos.keys(), ...Object.keys(previos)]);

  for (const ruta of rutas) {
    const local = locales.get(ruta);
    const remoto = remotos.get(ruta);
    const previo = previos[ruta];

    if (local && !remoto) {
      if (previo?.documentId) acciones.push({ tipo: "borrar-local", ruta });
      else acciones.push({ tipo: "subir", ruta, documentId: null });
      continue;
    }

    if (!local && remoto) {
      if (previo) acciones.push({ tipo: "borrar-remoto", ruta, documentId: remoto.id });
      else acciones.push({ tipo: "bajar", ruta, documentId: remoto.id, updatedAt: remoto.updatedAt });
      continue;
    }

    if (!local || !remoto) {
      // Fantasma: quedó en el estado pero no existe de ningún lado.
      if (previo) acciones.push({ tipo: "olvidar", ruta });
      continue;
    }

    const cambioLocal = !previo || previo.huella !== huellaDe(local);
    const cambioRemoto = !previo || previo.serverUpdatedAt !== remoto.updatedAt;

    if (cambioLocal && cambioRemoto) {
      acciones.push({ tipo: "conflicto", ruta, documentId: remoto.id, updatedAt: remoto.updatedAt });
    } else if (cambioLocal) {
      acciones.push({ tipo: "subir", ruta, documentId: remoto.id });
    } else if (cambioRemoto) {
      acciones.push({ tipo: "bajar", ruta, documentId: remoto.id, updatedAt: remoto.updatedAt });
    }
  }

  return acciones;
}

/** `nota.txt` → `nota (del panel).txt`, para no pisar nada cuando hay conflicto. */
export function nombreDeConflicto(ruta: string): string {
  const punto = ruta.lastIndexOf(".");
  const barra = ruta.lastIndexOf("/");
  if (punto <= barra + 1) return `${ruta} (del panel)`;
  return `${ruta.slice(0, punto)} (del panel)${ruta.slice(punto)}`;
}

/**
 * Traduce lo escaneado en disco a rutas LÓGICAS del drive.
 *
 * Hace falta porque un documento puede llamarse `Reunión 10:30.pdf` en el panel
 * y tener que guardarse como `Reunión 10_30.pdf` en el disco. Sin esta
 * traducción, la vuelta siguiente ve un archivo desconocido y sube un duplicado
 * (bug real del agente, ADR-307).
 */
export function aRutasLogicas(
  escaneadas: Map<string, { size: number; modificado: number }>,
  previos: Record<string, EstadoPrevio>,
): Map<string, ArchivoLocal> {
  const inverso = new Map<string, string>();
  for (const [logica, dato] of Object.entries(previos)) {
    if (dato.rutaLocal) inverso.set(dato.rutaLocal, logica);
  }

  const salida = new Map<string, ArchivoLocal>();
  for (const [rutaLocal, dato] of escaneadas) {
    const logica = inverso.get(rutaLocal) ?? rutaLocal;
    salida.set(logica, { ruta: logica, rutaLocal, size: dato.size, modificado: dato.modificado });
  }
  return salida;
}

/** Un resumen para mostrar antes de tocar nada ("se van a bajar 12, subir 3…"). */
export function resumirAcciones(acciones: Accion[]): {
  subir: number;
  bajar: number;
  borrarLocal: number;
  borrarRemoto: number;
  conflictos: number;
  total: number;
} {
  const cuenta = (t: Accion["tipo"]) => acciones.filter((a) => a.tipo === t).length;
  const subir = cuenta("subir");
  const bajar = cuenta("bajar");
  const borrarLocal = cuenta("borrar-local");
  const borrarRemoto = cuenta("borrar-remoto");
  const conflictos = cuenta("conflicto");
  return {
    subir,
    bajar,
    borrarLocal,
    borrarRemoto,
    conflictos,
    total: subir + bajar + borrarLocal + borrarRemoto + conflictos,
  };
}
