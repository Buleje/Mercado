/**
 * serfor-gtf-a-datos — la ficha que publica SERFOR, leída como el cuerpo de la
 * guía (ADR-336).
 *
 * El ingreso ya guardaba la ficha entera (`WoodEntry.serforGtf`), pero como un
 * blob de la consulta: se podía mostrar y no se podía comparar contra lo que el
 * operador declara cuando carga la guía a mano. Esto la traduce al MISMO
 * esquema que usa el formulario manual y la guía de salida (`GtfDatos`), así
 * los dos caminos dejan el mismo dato en el libro.
 *
 * Regla: **manda el documento y no se inventa nada**. Lo que la ficha no trae
 * queda vacío — un campo autocompletado con una suposición es peor que uno en
 * blanco, porque parece verificado.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { gtfDatosVacio, type GtfDatos } from "./ctp-gtf-datos";
import type { GtfSerfor } from "./serfor-gtf";

const txt = (v: string | null | undefined, max = 250): string => (v ?? "").trim().slice(0, max);

/**
 * De qué tipo es el documento que trae la ficha. SERFOR lo publica en un solo
 * campo ("N° RUC/DNI") sin decir cuál es: se deduce por la forma —11 dígitos
 * que arrancan con 10/15/17/20 es RUC en Perú, 8 dígitos es DNI— y ante la duda
 * se deja RUC, que es el caso de las empresas y comunidades que mueven madera.
 */
export function tipoDeDocumento(doc: string | null | undefined): "RUC" | "DNI" | "CE" | "PASAPORTE" {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 8) return "DNI";
  if (d.length === 11) return "RUC";
  return "RUC";
}

/**
 * SERFOR a veces publica los dos documentos juntos ("20156701263 / 04314730").
 * Se toma el primero: es el del titular de la fila, y el otro sin etiqueta no
 * se puede asignar a nadie sin adivinar.
 */
const primerDoc = (v: string | null | undefined): string => txt(v, 40).split(/[/,;]/)[0]?.trim() ?? "";

/** `dd/mm/aaaa` de SERFOR → `YYYY-MM-DD` de un `<input type="date">`. */
export function aISO(f: string | null | undefined): string {
  const m = (f ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Ya venía en ISO: se acepta tal cual (la consulta cambió de formato una vez).
  return /^\d{4}-\d{2}-\d{2}$/.test((f ?? "").trim()) ? (f ?? "").trim() : "";
}

/**
 * Traduce la ficha oficial al cuerpo de la guía.
 *
 * `previo` es lo que el operador ya tenía escrito: **no se pisa**, salvo que
 * esté vacío. Si escribió el transportista antes de consultar, ese dato es más
 * fresco que el del documento (el chofer se cambia a último momento) y el
 * módulo avisa de la diferencia en vez de tapársela.
 */
export function gtfDatosDesdeSerfor(g: GtfSerfor, previo?: GtfDatos): GtfDatos {
  const base = previo ?? gtfDatosVacio();
  /** Toma el valor de la ficha sólo si no había nada escrito. */
  const con = (actual: string, dela: string): string => (actual.trim() ? actual : dela);

  return {
    ...base,
    propietario: {
      ...base.propietario,
      // En un INGRESO el dueño de la madera es el de la guía, nunca este CTP.
      esElCtp: false,
      nombre: con(base.propietario.nombre, txt(g.propietario, 200)),
      docTipo: base.propietario.nombre.trim()
        ? base.propietario.docTipo
        : tipoDeDocumento(primerDoc(g.propietarioDoc)),
      docNumero: con(base.propietario.docNumero, primerDoc(g.propietarioDoc)),
      direccion: con(base.propietario.direccion, txt(g.propietarioDireccion)),
      departamento: con(base.propietario.departamento, txt(g.propietarioDepartamento, 80)),
      provincia: con(base.propietario.provincia, txt(g.propietarioProvincia, 80)),
      distrito: con(base.propietario.distrito, txt(g.propietarioDistrito, 80)),
    },
    destinatario: {
      ...base.destinatario,
      nombre: con(base.destinatario.nombre, txt(g.destinatario, 200)),
      docTipo: base.destinatario.nombre.trim()
        ? base.destinatario.docTipo
        : tipoDeDocumento(primerDoc(g.destinatarioDoc)),
      docNumero: con(base.destinatario.docNumero, primerDoc(g.destinatarioDoc)),
      direccion: con(base.destinatario.direccion, txt(g.destinatarioDireccion)),
      departamento: con(base.destinatario.departamento, txt(g.destinatarioDepartamento, 80)),
      provincia: con(base.destinatario.provincia, txt(g.destinatarioProvincia, 80)),
      distrito: con(base.destinatario.distrito, txt(g.destinatarioDistrito, 80)),
    },
    transportista: {
      ...base.transportista,
      // (32) es el CONDUCTOR; la empresa de transporte la guía no la separa, así
      // que el nombre del conductor se usa también como transportista sólo si
      // no hay nada cargado — es lo único que el documento afirma.
      nombre: con(base.transportista.nombre, txt(g.transportista, 200)),
      docTipo: "DNI",
      docNumero: con(base.transportista.docNumero, txt(g.transportistaDni, 20)),
    },
    vehiculo: {
      ...base.vehiculo,
      // (30) "Terrestre" | "Fluvial": lo que dice la guía manda sobre el default.
      modo: /fluvial|flu/i.test(txt(g.tipoTransporte, 40))
        ? "fluvial"
        : /multi/i.test(txt(g.tipoTransporte, 40))
          ? "multimodal"
          : base.vehiculo.modo,
      placa: con(base.vehiculo.placa, txt(g.placa, 15)),
      tipo: con(base.vehiculo.tipo, txt(g.tipoVehiculo, 40)),
      conductor: con(base.vehiculo.conductor, txt(g.transportista, 120)),
      conductorDni: con(base.vehiculo.conductorDni, txt(g.transportistaDni, 15)),
      licencia: con(base.vehiculo.licencia, txt(g.licenciaConducir, 30)),
    },
    traslado: {
      ...base.traslado,
      // (3) y (4) del formato: desde cuándo vale la guía y hasta cuándo.
      fechaInicio: con(base.traslado.fechaInicio, aISO(g.fechaExpedicion)),
      fechaFin: con(base.traslado.fechaFin, aISO(g.fechaVencimiento)),
      puntoPartida: con(
        base.traslado.puntoPartida,
        [txt(g.distrito, 80), txt(g.provincia, 80), txt(g.departamento, 80)].filter(Boolean).join(", "),
      ),
    },
    // (6) El título habilitante con el que salió del bosque: es lo que acredita
    // el origen legal, así que viaja con el ingreso y no sólo en la ficha.
    titulos: base.titulos.length > 0 ? base.titulos : [txt(g.numeroTitulo, 80)].filter(Boolean),
    guia: {
      ...base.guia,
      autoridad: con(base.guia.autoridad, txt(g.instanciaRegistra, 120)),
      listaTrozasNro: con(base.guia.listaTrozasNro, txt(g.listaTrozas, 40)),
      // (29) La guía de remisión del transportista NO es el comprobante de
      // compra/venta (20)(21): son dos papeles distintos y el control pide los
      // dos. Mezclarlos haría que una guía de remisión aparezca como factura.
      guiaRemisionNro: con(base.guia.guiaRemisionNro, txt(g.guiaRemision, 40)),
    },
  };
}

/**
 * En qué NO coincide lo que el operador declara con lo que dice la guía.
 *
 * No bloquea nada: el que descarga el camión puede saber algo que el documento
 * no dice (el chofer cambió en la ruta). Lo que no puede pasar es que difieran
 * **y nadie se entere** — es lo primero que cruza una fiscalización.
 */
export function discrepanciasConLaGuia(d: GtfDatos, g: GtfSerfor): string[] {
  const avisos: string[] = [];
  const dif = (mio: string, suyo: string | null | undefined, que: string) => {
    const a = mio.trim().toUpperCase();
    const b = txt(suyo).toUpperCase();
    if (a && b && a !== b) avisos.push(`${que}: el ingreso dice «${mio.trim()}» y la guía «${txt(suyo)}».`);
  };
  dif(d.propietario.nombre, g.propietario, "Propietario del producto");
  dif(d.propietario.docNumero, primerDoc(g.propietarioDoc), "Documento del propietario");
  dif(d.destinatario.nombre, g.destinatario, "Destinatario");
  dif(d.vehiculo.placa, g.placa, "Placa del vehículo");
  dif(d.vehiculo.conductor, g.transportista, "Conductor");
  return avisos;
}
