/**
 * gtf-autocompletar — completar la guía con lo que el sistema YA sabe (ADR-371).
 *
 * Los veinte casilleros de una GTF casi nunca son nuevos: el propietario es el
 * CTP, el destinatario es el mismo comprador de siempre, el camión es el que
 * viene todos los martes y los títulos son los de la Ficha. Todo eso está
 * guardado —en la Ficha del CTP y en la libreta (ADR-317, ordenada por uso)— y
 * sin embargo se re-tipeaba guía por guía.
 *
 * Esto arma el relleno de una sola pasada. Dos reglas que no se negocian:
 *
 * 1. **No inventa datos.** Lo que no está guardado queda vacío y se dice cuál.
 *    Un formulario "completo" con un RUC de fantasía es peor que uno a medias:
 *    lo primero que hace un control es cotejarlo.
 * 2. **No pisa lo tipeado.** Se rellena lo que está en blanco; lo que alguien
 *    escribió queda como está, aunque la libreta diga otra cosa.
 *
 * PURO y client-safe: recibe lo guardado y devuelve el parche.
 */

import type { GtfDatos } from "./ctp-gtf-datos";

/** Una parte de la libreta, en lo que el relleno necesita de ella. */
export interface ParteGuardada {
  nombre: string;
  docTipo?: string | null;
  docNumero?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  registroMtc?: string | null;
  licencia?: string | null;
}

export interface VehiculoGuardado {
  placa?: string | null;
  marca?: string | null;
  tipo?: string | null;
  modo?: string | null;
  embarcacion?: string | null;
  placaRemolque?: string | null;
}

export interface FichaParaGuia {
  razonSocial?: string | null;
  nombreCtp?: string | null;
  ruc?: string | null;
  direccion?: string | null;
  region?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  arffs?: string | null;
  titulos?: readonly { codigo?: string | null }[] | null;
}

export interface FuentesDeRelleno {
  ficha?: FichaParaGuia | null;
  /**
   * La ÚLTIMA guía emitida con datos.
   *
   * Es la fuente que faltaba: el transportista, el camión y el chofer casi nunca
   * están en la libreta la primera vez, pero sí en la guía de la semana pasada
   * —que los declaró de verdad—. Se usa después de la libreta y antes de rendirse.
   */
  ultimaGuia?: Partial<GtfDatos> | null;
  /** El destinatario más usado de la libreta. */
  destinatario?: ParteGuardada | null;
  transportista?: ParteGuardada | null;
  conductor?: ParteGuardada | null;
  vehiculo?: VehiculoGuardado | null;
  /** Destino del despacho, si ya se eligió: es el punto de llegada. */
  destino?: string | null;
  /** Fecha de emisión de la guía (`AAAA-MM-DD`). */
  emision?: string | null;
  /** Días de vigencia que suele dar la ARFFS. */
  diasVigencia?: number;
  /**
   * El permiso CITES del INGRESO de origen.
   *
   * Vive en las notas del ingreso (`parseCitesPermiso`) y es el papel que
   * ampara mover esa especie protegida. Antes sólo se heredaba de la guía
   * anterior: si era la primera salida de la especie, el casillero quedaba
   * vacío teniendo el dato a un salto de distancia.
   */
  citesPermiso?: string | null;
  /**
   * Si lo que sale incluye alguna especie CITES.
   *
   * Cambia cómo se lee un casillero vacío: sin especie protegida, el permiso
   * en blanco es lo normal; CON especie protegida es un faltante que hay que
   * cargar antes de que salga el camión.
   */
  llevaCites?: boolean;
}

export interface ResultadoRelleno {
  datos: GtfDatos;
  /** Qué se completó, para poder decirlo: «propietario, destinatario y camión». */
  completados: string[];
  /** Qué sigue vacío porque no está guardado en ningún lado. */
  faltantes: string[];
  /**
   * Casilleros que van vacíos A PROPÓSITO.
   *
   * El formato tiene la casilla de DNI **y** la de RUC para cada parte, y sólo
   * se llena la que corresponde; el remolque existe si hay remolque; el permiso
   * CITES sólo si la especie es protegida; el N° de comprobante es único de cada
   * venta. Decirlo evita que alguien los complete con cualquier cosa para «que
   * no quede nada en blanco».
   */
  aProposito: string[];
}

const vacio = (v: unknown) => !String(v ?? "").trim();
/** Toma el guardado sólo si el campo está en blanco. */
const tomar = (actual: string | undefined, guardado: string | null | undefined) =>
  vacio(actual) && !vacio(guardado) ? String(guardado).trim() : (actual ?? "");

/** `AAAA-MM-DD` + n días, sin arrastrar la hora ni el huso. */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return "";
  const t = Date.UTC(a, m - 1, d) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const DIAS_VIGENCIA_DEFAULT = 15;

/** Por río se pide matrícula y patrón; por carretera, placa y conductor. */
const esFluvial = (modo: string | undefined) => modo === "fluvial";

/**
 * Devuelve la guía completada con lo guardado, más el detalle de qué entró y
 * qué falta. No toca la lista de productos: esa es otra pestaña y otro acto.
 */
export function rellenarGuia(datos: GtfDatos, f: FuentesDeRelleno): ResultadoRelleno {
  const completados: string[] = [];
  const faltantes: string[] = [];
  const ficha = f.ficha ?? null;
  const planta = [ficha?.direccion, ficha?.distrito, ficha?.provincia, ficha?.region]
    .filter(Boolean)
    .join(", ");

  // ── Propietario: el CTP, salvo que ya diga otra cosa ──
  const propietario = { ...datos.propietario };
  if (propietario.esElCtp !== false) {
    propietario.esElCtp = true;
    propietario.nombre = tomar(propietario.nombre, ficha?.razonSocial ?? ficha?.nombreCtp);
    propietario.docNumero = tomar(propietario.docNumero, ficha?.ruc);
    if (!vacio(propietario.docNumero)) propietario.docTipo = "RUC";
    /* La Ficha manda; la guía anterior es red. Un CTP que nunca cargó el
       domicilio de la planta igual lo declaró la primera vez a mano, y esa
       dirección sirve para las siguientes: sin esta red el casillero volvía a
       salir vacío guía tras guía aunque el dato ya estuviera escrito. */
    const prevProp = f.ultimaGuia?.propietario;
    propietario.direccion = tomar(tomar(propietario.direccion, planta), prevProp?.direccion);
    propietario.departamento = tomar(tomar(propietario.departamento, ficha?.region), prevProp?.departamento);
    propietario.provincia = tomar(tomar(propietario.provincia, ficha?.provincia), prevProp?.provincia);
    propietario.distrito = tomar(tomar(propietario.distrito, ficha?.distrito), prevProp?.distrito);
    propietario.zona = tomar(propietario.zona, prevProp?.zona);
  }
  if (vacio(propietario.nombre) || vacio(propietario.docNumero)) faltantes.push("propietario");
  else completados.push("propietario");

  // ── Destinatario: el más usado de la libreta ──
  const destinatario = { ...datos.destinatario };
  if (f.destinatario) {
    destinatario.nombre = tomar(destinatario.nombre, f.destinatario.nombre);
    destinatario.docNumero = tomar(destinatario.docNumero, f.destinatario.docNumero);
    if (!vacio(f.destinatario.docTipo) && vacio(datos.destinatario.docNumero)) {
      destinatario.docTipo = (f.destinatario.docTipo as GtfDatos["destinatario"]["docTipo"]) ?? destinatario.docTipo;
    }
    destinatario.direccion = tomar(destinatario.direccion, f.destinatario.direccion);
    destinatario.departamento = tomar(destinatario.departamento, f.destinatario.departamento);
    destinatario.provincia = tomar(destinatario.provincia, f.destinatario.provincia);
    destinatario.distrito = tomar(destinatario.distrito, f.destinatario.distrito);
  }
  const dPrevio = f.ultimaGuia?.destinatario;
  destinatario.nombre = tomar(tomar(destinatario.nombre, f.destino), dPrevio?.nombre);
  destinatario.docNumero = tomar(destinatario.docNumero, dPrevio?.docNumero);
  destinatario.direccion = tomar(destinatario.direccion, dPrevio?.direccion);
  destinatario.departamento = tomar(destinatario.departamento, dPrevio?.departamento);
  destinatario.provincia = tomar(destinatario.provincia, dPrevio?.provincia);
  destinatario.distrito = tomar(destinatario.distrito, dPrevio?.distrito);
  destinatario.zona = tomar(destinatario.zona, dPrevio?.zona);
  if (vacio(destinatario.nombre) || vacio(destinatario.direccion)) faltantes.push("destinatario");
  else completados.push("destinatario");

  // ── Transportista y su vehículo ──
  const transportista = { ...datos.transportista };
  const tPrevio = f.ultimaGuia?.transportista;
  if (f.transportista || tPrevio) {
    transportista.nombre = tomar(tomar(transportista.nombre, f.transportista?.nombre), tPrevio?.nombre);
    transportista.docNumero = tomar(tomar(transportista.docNumero, f.transportista?.docNumero), tPrevio?.docNumero);
    const docTipo = f.transportista?.docTipo ?? tPrevio?.docTipo;
    if (!vacio(docTipo) && vacio(datos.transportista.docNumero)) {
      transportista.docTipo = (docTipo as GtfDatos["transportista"]["docTipo"]) ?? transportista.docTipo;
    }
    transportista.direccion = tomar(tomar(transportista.direccion, f.transportista?.direccion), tPrevio?.direccion);
    transportista.registroMtc = tomar(
      tomar(transportista.registroMtc, f.transportista?.registroMtc),
      tPrevio?.registroMtc,
    );
  }
  /**
   * Transporte PRIVADO = el vehículo es del titular, así que el transportista
   * ES el propietario (el CTP). No es un dato inventado: es lo que declara el
   * casillero cuando nadie contrató a un tercero, y es el caso de la mayoría de
   * los aserraderos chicos. Con transporte público hace falta la empresa.
   */
  const esPrivado = (datos.vehiculo.tipoTransporte ?? "privado") !== "publico";
  if (vacio(transportista.nombre) && esPrivado && !vacio(propietario.nombre)) {
    transportista.nombre = propietario.nombre;
    transportista.docTipo = propietario.docTipo;
    transportista.docNumero = propietario.docNumero;
    transportista.direccion = propietario.direccion;
    completados.push("transportista (el propio CTP: transporte privado)");
  } else if (vacio(transportista.nombre)) {
    faltantes.push("transportista (es transporte público: cargá la empresa)");
  } else {
    completados.push("transportista");
  }

  const vehiculo = { ...datos.vehiculo };
  const vPrevio = f.ultimaGuia?.vehiculo;
  vehiculo.placa = tomar(tomar(vehiculo.placa, f.vehiculo?.placa), vPrevio?.placa).toUpperCase();
  vehiculo.marca = tomar(tomar(vehiculo.marca, f.vehiculo?.marca), vPrevio?.marca);
  vehiculo.tipo = tomar(tomar(vehiculo.tipo, f.vehiculo?.tipo), vPrevio?.tipo);
  vehiculo.embarcacion = tomar(tomar(vehiculo.embarcacion, f.vehiculo?.embarcacion), vPrevio?.embarcacion);
  vehiculo.placaRemolque = tomar(tomar(vehiculo.placaRemolque, f.vehiculo?.placaRemolque), vPrevio?.placaRemolque);
  const modo = f.vehiculo?.modo ?? vPrevio?.modo;
  if (modo === "fluvial" || modo === "multimodal" || modo === "terrestre") vehiculo.modo = modo;
  if (vPrevio?.tipoTransporte === "publico" || vPrevio?.tipoTransporte === "privado") {
    vehiculo.tipoTransporte = vPrevio.tipoTransporte;
  }
  /* El chofer: la libreta primero, la guía anterior después. En la selva la
     empresa pone el camión y el chofer suele ser el mismo del viaje pasado. */
  vehiculo.conductor = tomar(tomar(vehiculo.conductor, f.conductor?.nombre), vPrevio?.conductor);
  vehiculo.conductorDni = tomar(tomar(vehiculo.conductorDni, f.conductor?.docNumero), vPrevio?.conductorDni);
  vehiculo.licencia = tomar(tomar(vehiculo.licencia, f.conductor?.licencia), vPrevio?.licencia);
  /* Dos cosas distintas, dos avisos: con «vehículo o conductor» el operador que
     ya tenía al chofer cargado igual leía que le faltaba. */
  if (vacio(vehiculo.placa)) {
    faltantes.push(
      esFluvial(vehiculo.modo)
        ? "matrícula de la embarcación (guardá el bote en la libreta y la próxima sale solo)"
        : "placa del camión (guardalo en la libreta y la próxima sale solo)",
    );
  } else completados.push("vehículo");
  if (vacio(vehiculo.conductor)) faltantes.push("conductor (guardalo en la libreta con su licencia)");
  else completados.push("conductor");

  // ── Traslado: de la planta al destino, con la vigencia de siempre ──
  const traslado = { ...datos.traslado };
  const trPrevio = f.ultimaGuia?.traslado;
  /* De dónde sale: la planta de la Ficha, la guía anterior, o el domicilio del
     propietario — que para un CTP que despacha de su propio patio es el mismo
     lugar. Es el casillero que los controles cotejan contra el permiso. */
  traslado.puntoPartida = tomar(
    tomar(tomar(traslado.puntoPartida, planta), trPrevio?.puntoPartida),
    propietario.esElCtp !== false ? propietario.direccion : "",
  );
  traslado.puntoLlegada = tomar(
    tomar(traslado.puntoLlegada, f.destino ?? destinatario.direccion),
    trPrevio?.puntoLlegada,
  );
  traslado.ruta = tomar(
    tomar(traslado.ruta, trPrevio?.ruta),
    [traslado.puntoPartida, traslado.puntoLlegada].filter(Boolean).join(" → "),
  );
  traslado.fechaInicio = tomar(traslado.fechaInicio, f.emision);
  if (vacio(traslado.fechaFin) && !vacio(traslado.fechaInicio)) {
    /* La vigencia la fija la ARFFS por ruta y distancia: acá se propone la
       habitual para que el campo no salga vacío, y se puede corregir. */
    traslado.fechaFin = sumarDias(traslado.fechaInicio, f.diasVigencia ?? DIAS_VIGENCIA_DEFAULT);
  }
  if (vacio(traslado.puntoPartida)) {
    faltantes.push("punto de partida (cargá el domicilio de la planta en la Ficha CTP y sale en todas)");
  }
  if (vacio(traslado.puntoLlegada)) faltantes.push("punto de llegada");
  else completados.push("traslado");

  // ── Autoridad, títulos, CITES y comprobante ──
  const gPrevio = f.ultimaGuia?.guia;
  const guia = {
    ...datos.guia,
    autoridad: tomar(tomar(datos.guia.autoridad, ficha?.arffs), gPrevio?.autoridad),
    guiaRemisionNro: tomar(datos.guia.guiaRemisionNro, gPrevio?.guiaRemisionNro),
  };
  const titulos = datos.titulos.length
    ? datos.titulos
    : (ficha?.titulos ?? []).map((t) => t?.codigo ?? "").filter(Boolean).slice(0, 1);
  if (titulos.length === 0) faltantes.push("título habilitante");
  else completados.push("títulos");

  /* El ingreso de origen manda: es el permiso que ampara ESTA madera. La guía
     anterior queda de red, para cuando el origen no lo tiene cargado. */
  const citesPermiso = tomar(tomar(datos.citesPermiso, f.citesPermiso), f.ultimaGuia?.citesPermiso);
  if (f.llevaCites) {
    if (vacio(citesPermiso)) faltantes.push("N° de permiso CITES (la especie es protegida)");
    else completados.push("permiso CITES");
  }
  /* El TIPO de comprobante se hereda (siempre se factura igual); el NÚMERO no:
     es único por operación y copiarlo sería declarar dos ventas con el mismo. */
  const comprobante = {
    ...datos.comprobante,
    tipo:
      datos.comprobante.tipo !== "ninguno"
        ? datos.comprobante.tipo
        : (f.ultimaGuia?.comprobante?.tipo ?? datos.comprobante.tipo),
  };
  if (vacio(datos.comprobante.numero)) faltantes.push("N° de comprobante (es único de cada venta)");

  /* La lista completa de lo que queda en blanco tras un click, medida sobre el
     formulario real: 9 casilleros de 41, y ninguno se puede saber de antemano. */
  const aProposito = [
    "la casilla de DNI cuando la parte declara RUC (y al revés)",
    "el remolque, si el camión no lleva",
    /* Con especie protegida el permiso NO es un vacío normal: es un faltante,
       y ya se nombró como tal. Listarlo acá lo volvería a excusar. */
    ...(f.llevaCites ? [] : ["el permiso CITES, si la especie no es protegida"]),
    "la zona o caserío, si la dirección no lo usa",
    "la guía de remisión del transportista, si no la emitió",
    "el N° de constancia SNIFFS, que lo da SERFOR al verificar la guía",
  ];

  return {
    datos: {
      ...datos,
      propietario, destinatario, transportista, vehiculo, traslado, guia, titulos,
      citesPermiso,
      comprobante,
      observaciones: tomar(datos.observaciones, f.ultimaGuia?.observaciones),
    },
    completados,
    faltantes,
    aProposito,
  };
}

/**
 * El siguiente N° de la serie: `001-00000025` → `001-00000026`.
 *
 * Es el mismo correlativo que asigna «Emitir GTF», propuesto **antes** de
 * guardar para que el formulario no quede con un casillero obligatorio en
 * blanco. Devuelve `null` si el último no termina en número: ahí inventar la
 * serie sería peor que dejarlo vacío.
 */
export function siguienteNumeroGtf(ultimo: string): string | null {
  const m = ultimo.trim().match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const [, prefijo, numero] = m;
  return `${prefijo}${String(Number(numero) + 1).padStart(numero.length, "0")}`;
}
