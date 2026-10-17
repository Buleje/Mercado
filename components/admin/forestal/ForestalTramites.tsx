"use client";

/**
 * ForestalTramites — «Trámites y Oficios» (`forestal-tramites`, ADR-308).
 *
 * Desde la ola 2 del plan «panel unificado» (2026-10-10) los trámites son la
 * fase «Trámites» de Herramientas y trámites (`forestal-herramientas`): el id
 * viejo queda como alias de `?vista=catalogo` y este componente abre esa misma
 * cabina parada en Formatos. Así un enlace guardado, un aviso o el «Usar en un
 * formato» del Libro TH (`tramite-guias-url`, que navega a este id) siguen
 * llegando aunque la rama del router todavía apunte acá.
 *
 * El cuerpo —autollenado, formato abierto, expediente, plantaciones y el
 * bloque «Pendientes»— vive en `TramitesCuerpo`.
 */

import ForestalHerramientas from "./ForestalHerramientas";

export default function ForestalTramites() {
  return <ForestalHerramientas initialTab="catalogo" />;
}
