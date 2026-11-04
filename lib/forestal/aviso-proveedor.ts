/**
 * Aviso de proveedor sancionado — lo que el panel dice SOLO (sin tocar nada) al
 * registrar o recepcionar un ingreso: ¿el titular, su RUC/DNI o el permiso de
 * la guía figuran en el Registro de Infractores de SERFOR o en la lista roja /
 * PAU de OSINFOR? Es como pedir el DNI antes de fiar: nunca bloquea, avisa.
 *
 * Reusa el cálculo de «Revisar a todos» (`revisarGrupo`): un proveedor = un
 * grupo con el permiso de la guía. Acá solo se decide QUÉ consultar y QUÉ
 * decir; las consultas a la red las hace la ruta.
 *
 * PURO y client-safe (sin fetch, sin Date.now).
 */

import { PROVEEDOR_INVENTARIO_APERTURA } from "./ctp-serfor-a-libro";
import { codigoConsultable, type NivelOsinfor } from "./osinfor-supervisiones";
import type { FilaRevision, NivelRevision } from "./revision-proveedores";
import { codigoComparable, documentoDe, nombreComparable, type CoincidenciaInfractor } from "./serfor-infractores";

/** Lo que el formulario sabe del proveedor de la guía. */
export interface DatosProveedor {
  nombre?: string | null;
  documento?: string | null;
  /** Código de origen / título habilitante escrito en la guía. */
  codigo?: string | null;
  /** El permiso del negocio al que se imputa el ingreso (ADR-421). */
  contratoId?: string | null;
}

/** La consulta ya limpia; null = no hay con qué buscar (no se llama a nadie). */
export interface ConsultaProveedor {
  nombre: string | null;
  documento: string | null;
  codigo: string | null;
  contratoId: string | null;
  /** Para no repetir la misma consulta: cambia solo si cambia algo que se busca. */
  clave: string;
}

export function consultaDeProveedor(d: DatosProveedor): ConsultaProveedor | null {
  const crudo = (d.nombre ?? "").trim();
  // La existencia de apertura no tiene titular que la venda: no hay a quién revisar.
  const nombre = crudo && crudo !== PROVEEDOR_INVENTARIO_APERTURA && nombreComparable(crudo) ? crudo : null;
  const documento = documentoDe(d.documento);
  const codigo = codigoComparable(d.codigo) && codigoConsultable(d.codigo) ? (d.codigo ?? "").trim() : null;
  const contratoId = (d.contratoId ?? "").trim() || null;
  if (!nombre && !documento && !codigo && !contratoId) return null;
  const clave = [
    nombreComparable(nombre) ?? "",
    documento ?? "",
    codigoComparable(codigo) ?? "",
    contratoId ?? "",
  ].join("|");
  return { nombre, documento, codigo, contratoId, clave };
}

/** El tono del aviso: rojo y ámbar se ven fuerte; «revisado» es una línea discreta. */
export type TonoAviso = "rojo" | "ambar" | "nombre" | "revisado" | "incompleto";

export interface PermisoDelAviso {
  codigo: string;
  /** null = OSINFOR no respondió. */
  nivel: NivelOsinfor | null;
  enRoja: number;
  pauEnTramite: number;
}

export interface FuenteDelAviso {
  /** «Registro de Infractores de SERFOR» · «Mapa de OSINFOR». */
  nombre: string;
  /** YYYY-MM-DD de la lista (SERFOR) o ISO de la consulta (OSINFOR); null = no se sabe. */
  fecha: string | null;
  /** «lista al» (dato publicado) o «consultado el» (en vivo). */
  como: "lista_al" | "consultado";
  /** false = no respondió: el aviso NO puede decir «limpio» por ella. */
  respondio: boolean;
}

export interface AvisoProveedor {
  tono: TonoAviso;
  titulo: string;
  /** Una línea: qué hacer. El detalle largo va en el ⓘ. */
  detalle: string;
  sanciones: CoincidenciaInfractor[];
  totalSanciones: number;
  permisos: PermisoDelAviso[];
  fuentes: FuenteDelAviso[];
  /** A quién se buscó, tal cual (para decirlo en pantalla). */
  nombre: string;
  documento: string | null;
}

/** Sanciones que se muestran sin abrir nada; el resto, «y N más». */
export const MAX_SANCIONES_VISTAS = 3;

/** «2023-09-12» → «12/09/2023» (date-only: sin zona horaria). */
export function fechaDelDato(iso: string | null): string {
  if (!iso) return "sin fecha";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "sin fecha";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function tonoDe(nivel: NivelRevision, completo: boolean): TonoAviso {
  if (nivel === "rojo" || nivel === "ambar" || nivel === "nombre") return nivel;
  // Sin una fuente no se puede decir «no figura»: queda «incompleto», nunca verde.
  return completo ? "revisado" : "incompleto";
}

/**
 * La fila de la revisión → el aviso que se pinta. `serforRespondio` = la lista de SERFOR estaba;
 * los permisos sin `osinfor` son los que OSINFOR no contestó.
 */
export function armarAviso(
  fila: FilaRevision,
  fuentes: { corteSerfor: string | null; serforRespondio: boolean; consultadoEn: string },
): AvisoProveedor {
  const permisos: PermisoDelAviso[] = fila.permisos.map((p) => ({
    codigo: p.codigo,
    nivel: p.osinfor?.nivel ?? null,
    enRoja: p.osinfor?.enRoja ?? 0,
    pauEnTramite: p.osinfor?.pauEnTramite ?? 0,
  }));
  const osinforRespondio = permisos.every((p) => p.nivel != null);
  const listaFuentes: FuenteDelAviso[] = [
    {
      nombre: "Registro de Infractores de SERFOR",
      fecha: fuentes.corteSerfor,
      como: "lista_al",
      respondio: fuentes.serforRespondio,
    },
    ...(permisos.length
      ? [
          {
            nombre: "Mapa de OSINFOR",
            fecha: fuentes.consultadoEn,
            como: "consultado" as const,
            respondio: osinforRespondio,
          },
        ]
      : []),
  ];
  const completo = listaFuentes.every((f) => f.respondio);
  const tono = tonoDe(fila.nivel, completo);

  const seguras = fila.sanciones.filter((s) => s.motivo === "documento" || s.motivo === "permiso");
  const delPermiso = fila.sanciones.filter((s) => s.motivo === "permiso_otro");
  const roja = permisos.filter((p) => p.nivel === "rojo");
  const pau = permisos.filter((p) => p.nivel === "ambar");
  const ultima = (lista: CoincidenciaInfractor[]) =>
    lista.reduce((m, s) => ((s.fecha ?? "") > m ? (s.fecha ?? "") : m), "");

  let titulo: string;
  let detalle: string;
  if (fila.certeza === "segura" && seguras.length) {
    const u = ultima(seguras);
    titulo = `Sancionado en SERFOR: ${plural(seguras.length, "sanción", "sanciones")}${u ? ` (la última del ${fechaDelDato(u)})` : ""}`;
    detalle = roja.length
      ? `Y el permiso ${roja[0]?.codigo} está en la lista roja de OSINFOR. Lee la resolución antes de pagar.`
      : "Coincide su RUC/DNI o el permiso con una sanción firme. Lee la resolución antes de pagar.";
  } else if (roja.length) {
    titulo = `Permiso en la lista roja de OSINFOR: ${roja.map((p) => p.codigo).join(", ")}`;
    detalle = "OSINFOR halló aprovechamiento no autorizado en ese permiso. Revisa la resolución antes de pagar.";
  } else if (fila.certeza === "del_permiso" && delPermiso.length) {
    titulo = `El permiso tiene ${plural(delPermiso.length, "sanción", "sanciones")} a otra persona`;
    detalle = "Puede ser un titular anterior. Lee la resolución para saber si el permiso quedó afectado.";
  } else if (pau.length) {
    titulo = `Proceso sancionador (PAU) en OSINFOR: ${pau.map((p) => p.codigo).join(", ")}`;
    detalle = "OSINFOR todavía no resuelve o ya lo cerró. Pide al proveedor el estado y guarda la constancia.";
  } else if (tono === "nombre") {
    titulo = `Alguien con el mismo nombre figura en SERFOR (${plural(fila.sanciones.length, "sanción", "sanciones")})`;
    detalle = "Puede ser otra persona: compara el RUC/DNI de la resolución con el de tu proveedor.";
  } else if (tono === "revisado") {
    titulo = "No figura en SERFOR ni en la lista roja de OSINFOR";
    detalle = "Revisado solo con datos públicos del Estado.";
  } else {
    const falta = listaFuentes.filter((f) => !f.respondio).map((f) => f.nombre);
    titulo = `No se pudo revisar del todo: ${falta.join(" y ")} no respondió`;
    detalle = "Vuelve a abrir en unos minutos. Lo que sí respondió no muestra sanciones.";
  }

  return {
    tono,
    titulo,
    detalle,
    sanciones: fila.sanciones.slice(0, MAX_SANCIONES_VISTAS),
    totalSanciones: fila.sanciones.length,
    permisos,
    fuentes: listaFuentes,
    nombre: fila.nombre,
    documento: fila.documento,
  };
}
