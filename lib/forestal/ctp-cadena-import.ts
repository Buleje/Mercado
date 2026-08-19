/**
 * Armar la cadena de custodia a partir del libro importado.
 *
 * EL PROBLEMA. Importar las cinco secciones por separado deja cinco listas
 * sueltas: ingresos que nunca se consumieron, corridas que salieron de la nada y
 * despachos sin origen. Los saldos del libro se DERIVAN de esas relaciones
 * (`Σ ingresos − Σ consumido`, `Σ producido − Σ despachado`), así que sin
 * enlazarlas el aserradero muestra todo disponible aunque el libro diga que se
 * aserró la mitad. Un fiscalizador ve exactamente eso: madera que entró y nunca
 * se transformó.
 *
 * LA LLAVE ES EL LOTE. Los formatos del SNIFFS ya traen la relación, sólo que
 * repartida en tres columnas que nadie estaba cruzando:
 *
 *     Ingreso    «Codigo de CTP»        3012263
 *        ↓
 *     Consumo    «Codigo de Origen…»    3012263   ·  Lote 9-2026
 *        ↓
 *     Producción                                     Lote 9-2026
 *        ↓
 *     Salida                                         Lote 9-2026
 *
 * Un lote es una corrida: lo que se consumió con ese lote alimentó lo que se
 * produjo con ese lote, y eso es lo que se despachó con ese lote.
 *
 * PURO: recibe filas ya parseadas y devuelve el plan de enlace. No escribe nada
 * —eso es del endpoint, con sus locks e invariantes— pero decide QUÉ se enlaza
 * con qué, que es la parte que hay que poder probar sin base de datos.
 */

import type { FilaParseada } from "./ctp-formatos-serfor";
import { esConsumoInterno } from "./ctp-marcas-libro";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Cuánto puede diferir una suma sin que sea un hallazgo.
 *
 * El libro escribe volúmenes con 3 decimales, así que sumar cientos de filas
 * arrastra milésimas. Con un umbral de 0.0001 m³ —una décima de litro— cada
 * lote grande denunciaba «rompe I3» por 0.001 de diferencia: siete avisos rojos
 * falsos que enseñan a ignorar la lista entera, justo donde tiene que estar la
 * atención.
 *
 * 10 litros es más fino que lo que mide una cinta en el patio y más grueso que
 * el ruido de la aritmética. Un desvío real —despachar madera que no se
 * produjo— nunca es de milésimas.
 */
const TOLERANCIA_M3 = 0.01;
const txt = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

export type ConsumoDeLote = {
  fila: number;
  /** El código que identifica la troza o el retrozo que entró a la sierra. */
  codigoOrigen: string;
  especie: string;
  volumenM3: number;
  fecha: string | null;
};

export type ProduccionDeLote = {
  fila: number;
  tipoProducto: string;
  especie: string;
  cantidad: number;
  fecha: string | null;
};

export type SalidaDeLote = {
  fila: number;
  numeroDocumento: string;
  tipoProducto: string;
  cantidad: number;
  fecha: string | null;
};

export type Corrida = {
  /** El lote tal como figura en el libro («9-2026»). */
  lote: string;
  consumos: ConsumoDeLote[];
  producciones: ProduccionDeLote[];
  salidas: SalidaDeLote[];
  /** Σ de lo consumido: la materia prima que entró a esta corrida. */
  entradaM3: number;
  /** Σ de lo producido con ese lote. */
  salidaProducidaM3: number;
  /** Σ de lo despachado con ese lote. */
  despachadoM3: number;
  /**
   * Coeficiente de rendimiento (producido / consumido × 100).
   *
   * Es el número que SERFOR mira para saber si el aserradero declara una
   * transformación creíble. `null` si no hay consumo: sin denominador no hay
   * rendimiento, y un 0 se leería como «no rindió nada».
   */
  rendimientoPct: number | null;
};

export type AvisoCadena = {
  lote: string;
  nivel: "error" | "aviso";
  mensaje: string;
};

export type PlanDeCadena = {
  corridas: Corrida[];
  /** Lo que quedó sin lote: no se puede enlazar, pero tampoco se pierde. */
  sueltos: { consumos: ConsumoDeLote[]; producciones: ProduccionDeLote[]; salidas: SalidaDeLote[] };
  avisos: AvisoCadena[];
};

/**
 * Normaliza el lote para que el mismo lote sea uno solo.
 *
 * En el libro real los lotes son `001`, `002`, `005` —tres dígitos con ceros
 * adelante— y a veces el mismo se escribe `1` o `01`. Como el lote es la llave
 * que une consumo con producción, dejarlos distintos parte la corrida en dos:
 * una mitad denuncia que produce sin consumo y la otra que consume sin producir.
 *
 * Los lotes con texto (`CUM R 01/30`) se dejan como están: no hay forma de
 * normalizarlos sin arriesgarse a fundir dos que el operador quiso separados.
 */
export function normalizarLote(v: unknown): string {
  const s = txt(v).toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  /* El libro escribe «-» o «null» donde no hay lote —en Salidas es la mayoría—
     y tomarlos como texto creaba una corrida fantasma que juntaba despachos que
     no tienen nada que ver entre sí. Sin lote es sin lote. */
  if (/^-+$/.test(s) || s === "NULL" || s === "N/A" || s === "S/N") return "";
  /* Puro número: «001» y «1» son el lote 1. */
  if (/^\d+$/.test(s)) return String(Number(s));
  /* Formato «N-AAAA» del SNIFFS. */
  const m = s.match(/^0*(\d+)-(\d{4})$/);
  return m ? `${m[1]}-${m[2]}` : s;
}

/**
 * Agrupa las tres secciones por lote y arma el plan.
 *
 * Sólo entran las filas SIN problemas: una fila incompleta ya se reportó en la
 * pantalla, y meterla acá contaminaría el rendimiento de una corrida con un
 * volumen que nadie pudo leer.
 */
export function armarCadena(
  filas: { consumos?: readonly FilaParseada[]; produccion?: readonly FilaParseada[]; salidas?: readonly FilaParseada[] },
): PlanDeCadena {
  const limpias = (fs?: readonly FilaParseada[]) => (fs ?? []).filter((f) => f.problemas.length === 0);

  const porLote = new Map<string, Corrida>();
  const sueltos: PlanDeCadena["sueltos"] = { consumos: [], producciones: [], salidas: [] };

  const corrida = (lote: string): Corrida => {
    const c = porLote.get(lote) ?? {
      lote,
      consumos: [],
      producciones: [],
      salidas: [],
      entradaM3: 0,
      salidaProducidaM3: 0,
      despachadoM3: 0,
      rendimientoPct: null,
    };
    porLote.set(lote, c);
    return c;
  };

  for (const f of limpias(filas.consumos)) {
    const item: ConsumoDeLote = {
      fila: f.fila,
      codigoOrigen: txt(f.datos.codigoOrigen),
      especie: txt(f.datos.especieComun),
      volumenM3: num(f.datos.cantidad),
      fecha: (f.datos.fecha as string) ?? null,
    };
    const lote = normalizarLote(f.datos.lote);
    if (!lote) { sueltos.consumos.push(item); continue; }
    corrida(lote).consumos.push(item);
  }

  for (const f of limpias(filas.produccion)) {
    const item: ProduccionDeLote = {
      fila: f.fila,
      tipoProducto: txt(f.datos.tipoProducto),
      especie: txt(f.datos.especieComun),
      cantidad: num(f.datos.cantidad),
      fecha: (f.datos.fecha as string) ?? null,
    };
    const lote = normalizarLote(f.datos.lote);
    if (!lote) { sueltos.producciones.push(item); continue; }
    corrida(lote).producciones.push(item);
  }

  for (const f of limpias(filas.salidas)) {
    const item: SalidaDeLote = {
      fila: f.fila,
      numeroDocumento: txt(f.datos.numeroDocumento),
      tipoProducto: txt(f.datos.tipoProducto),
      cantidad: num(f.datos.cantidad),
      fecha: (f.datos.fecha as string) ?? null,
    };
    const lote = normalizarLote(f.datos.lote);
    if (!lote) { sueltos.salidas.push(item); continue; }
    corrida(lote).salidas.push(item);
  }

  const avisos: AvisoCadena[] = [];
  for (const c of porLote.values()) {
    c.entradaM3 = r4(c.consumos.reduce((s, x) => s + x.volumenM3, 0));
    c.salidaProducidaM3 = r4(c.producciones.reduce((s, x) => s + x.cantidad, 0));
    c.despachadoM3 = r4(c.salidas.reduce((s, x) => s + x.cantidad, 0));
    c.rendimientoPct = c.entradaM3 > 0 ? Math.round((c.salidaProducidaM3 / c.entradaM3) * 10_000) / 100 : null;

    /* Estos avisos son los que un fiscalizador levantaría del mismo libro: se
       muestran ANTES de escribir para que el operador corrija el archivo, no
       después de que el dato ya entró. */
    if (c.consumos.length === 0 && c.producciones.length > 0) {
      avisos.push({
        lote: c.lote,
        nivel: "error",
        mensaje: `Produce ${c.salidaProducidaM3} m³ sin consumo declarado: la corrida no tendría de dónde salir.`,
      });
    }
    if (c.producciones.length === 0 && c.salidas.length > 0) {
      avisos.push({
        lote: c.lote,
        nivel: "error",
        mensaje: `Despacha ${c.despachadoM3} m³ sin producción declarada (rompe la invariante I3).`,
      });
    }
    if (c.despachadoM3 > c.salidaProducidaM3 + TOLERANCIA_M3 && c.producciones.length > 0) {
      avisos.push({
        lote: c.lote,
        nivel: "error",
        mensaje: `Despacha ${c.despachadoM3} m³ y sólo produjo ${c.salidaProducidaM3} m³ (rompe I3).`,
      });
    }
    if (c.rendimientoPct != null && c.rendimientoPct > 100) {
      avisos.push({
        lote: c.lote,
        nivel: "error",
        mensaje: `Rendimiento ${c.rendimientoPct}%: produce más de lo que consume.`,
      });
    } else if (c.rendimientoPct != null && c.rendimientoPct < 30) {
      /* Un aserradero rinde 45-60%. Por debajo de 30 no es ilegal, pero o
         falta producción por cargar o hay un error de unidad. */
      avisos.push({
        lote: c.lote,
        nivel: "aviso",
        mensaje: `Rendimiento ${c.rendimientoPct}%: muy bajo para un aserradero. ¿Falta producción por cargar?`,
      });
    }
  }

  if (sueltos.consumos.length > 0) {
    avisos.push({
      lote: "—",
      nivel: "aviso",
      mensaje: `${sueltos.consumos.length} consumos sin lote: no se pueden atribuir a una corrida.`,
    });
  }

  return {
    corridas: [...porLote.values()].sort((a, b) => a.lote.localeCompare(b.lote, "es", { numeric: true })),
    sueltos,
    avisos,
  };
}

/**
 * El puente entre el código de troza y la guía con la que entró.
 *
 * El consumo del SNIFFS apunta a la pieza por su «Código de Origen /
 * Procedencia / CTP» (`3012263`), pero la atribución se guarda contra la GTF
 * del ingreso (`019-0000002`), que es el documento que acredita origen legal.
 * La sección Ingresos del MISMO archivo tiene las dos columnas, así que el
 * puente sale del libro y no de una suposición.
 *
 * El retrozado agrega un salto: un consumo puede apuntar a `3012263/A`, que es
 * un pedazo de la troza `3012263`. La guía es la de la madre —cortar una troza
 * no le cambia el origen— así que se resuelve cayendo al código sin sufijo.
 */
export function mapaCodigoAGuia(ingresos: readonly FilaParseada[] | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of ingresos ?? []) {
    if (f.problemas.length > 0) continue;
    const gtf = txt(f.datos.numeroDocumento);
    if (!gtf) continue;
    const codigo = txt(f.datos.codigoCtp);
    /* Sólo el primero: si dos ingresos declaran el mismo código de CTP, el
       libro ya tiene un problema y pisar el mapa lo escondería. */
    if (codigo && !m.has(codigo)) m.set(codigo, gtf);
  }
  return m;
}

/** Busca la guía de un código, cayendo a la troza madre si es un retrozo. */
export function guiaDelCodigo(codigo: string, mapa: Map<string, string>): string | null {
  const c = txt(codigo);
  if (!c) return null;
  const directo = mapa.get(c);
  if (directo) return directo;
  /* Se quita el ÚLTIMO sufijo, no se parte en todos los separadores:
     `R7-900/A` → `R7-900`, no `R7`. Partir de más dejaba sin resolver cualquier
     código que ya tuviera un guión adentro —que es la mayoría— y la corrida
     entraba con cero consumos. */
  const corte = Math.max(c.lastIndexOf("/"), c.lastIndexOf("-"));
  const madre = corte > 0 ? c.slice(0, corte).trim() : "";
  return (madre && madre !== c ? mapa.get(madre) : null) ?? null;
}

/**
 * Los consumos de una corrida, ya traducidos a lo que espera el endpoint.
 *
 * Suma por guía: si la corrida consumió tres trozas de la misma GTF, van como
 * un solo consumo de esa guía. Los que no resuelven se devuelven aparte —no se
 * descartan en silencio— porque un consumo sin origen es justo lo que un
 * fiscalizador pregunta.
 */
export function consumosDeCorrida(
  corrida: Corrida,
  mapa: Map<string, string>,
): { atribuidos: { gtfIngreso: string; volumeM3: number }[]; sinResolver: string[] } {
  const porGuia = new Map<string, number>();
  const sinResolver: string[] = [];

  for (const c of corrida.consumos) {
    const gtf = guiaDelCodigo(c.codigoOrigen, mapa);
    if (!gtf) {
      if (c.codigoOrigen) sinResolver.push(c.codigoOrigen);
      continue;
    }
    porGuia.set(gtf, r4((porGuia.get(gtf) ?? 0) + c.volumenM3));
  }

  return {
    atribuidos: [...porGuia.entries()]
      .filter(([, v]) => v > 0)
      .map(([gtfIngreso, volumeM3]) => ({ gtfIngreso, volumeM3 })),
    sinResolver: [...new Set(sinResolver)],
  };
}

/**
 * Reparte el consumo del lote entre las corridas que produjo.
 *
 * Una corrida del libro rinde varias líneas de producción —tablas, tablillas y
 * cuartones salen del mismo aserrío— pero el modelo guarda una fila por
 * producto. Darle a cada fila la lista completa de consumos contaría la misma
 * madera tantas veces como productos tenga: exactamente lo que las invariantes
 * I1 e I2 existen para impedir.
 *
 * Se reparte a prorrata de lo producido: si el lote consumió 10 m³ y produjo 3
 * de tablas y 1 de tablillas, las tablas cargan 7.5 y las tablillas 2.5. Es el
 * único reparto defendible cuando el libro no dice más —y el rendimiento del
 * lote se conserva, que es el número que mira SERFOR.
 *
 * La última línea absorbe el redondeo, así que la suma de las partes es
 * exactamente el total: sin eso, tres tercios de 10 dan 9.9999 y aparece un
 * m³ fantasma sin atribuir.
 */
export function repartirConsumos(
  consumos: readonly { gtfIngreso: string; volumeM3: number }[],
  producciones: readonly { cantidad: number }[],
): { gtfIngreso: string; volumeM3: number }[][] {
  const n = producciones.length;
  if (n === 0) return [];
  if (n === 1) return [consumos.map((c) => ({ ...c }))];

  const total = producciones.reduce((s, p) => s + p.cantidad, 0);
  const partes: { gtfIngreso: string; volumeM3: number }[][] = producciones.map(() => []);

  for (const c of consumos) {
    let repartido = 0;
    for (let i = 0; i < n; i++) {
      const esUltima = i === n - 1;
      /* Sin producción total no hay proporción posible: se reparte en partes
         iguales antes que perder el consumo. */
      const cuota = esUltima
        ? r4(c.volumeM3 - repartido)
        : r4(total > 0 ? (c.volumeM3 * producciones[i].cantidad) / total : c.volumeM3 / n);
      repartido = r4(repartido + cuota);
      if (cuota > 0) partes[i].push({ gtfIngreso: c.gtfIngreso, volumeM3: cuota });
    }
  }
  return partes;
}

/**
 * A qué corridas se atribuye un despacho (invariantes I3/I4/I5).
 *
 * El formato de Salida no nombra la corrida, pero trae el Lote — y las corridas
 * que se acaban de importar con ese lote son, por definición del libro, las que
 * lo respaldan. Cuando el lote produjo varias líneas, el despacho se reparte
 * entre ellas a prorrata de lo que produjo cada una.
 *
 * NUNCA atribuye más de lo que la corrida produjo ni más de lo que el despacho
 * saca: se corta en el menor de los dos. Forzar el cuadre inventaría el origen
 * que I5 existe para proteger; el faltante queda sin atribuir y el operador lo
 * completa (el libro admite el hueco, el certificado no).
 */
export function origenesDelDespacho(
  cantidadDespachada: number,
  corridasDelLote: readonly { id: string; cantidad: number }[],
): { produccionEntryId: string; quantity: number }[] {
  if (!(cantidadDespachada > 0) || corridasDelLote.length === 0) return [];

  const total = corridasDelLote.reduce((s, c) => s + c.cantidad, 0);
  if (!(total > 0)) return [];

  const origenes: { produccionEntryId: string; quantity: number }[] = [];
  let restante = r4(Math.min(cantidadDespachada, total));

  for (let i = 0; i < corridasDelLote.length && restante > 0; i++) {
    const c = corridasDelLote[i];
    const esUltima = i === corridasDelLote.length - 1;
    /* La última toma lo que queda, así el reparto suma exacto. Igual se topea
       contra lo que esa corrida produjo: nunca por encima (I5). */
    const cuota = r4(Math.min(c.cantidad, esUltima ? restante : (cantidadDespachada * c.cantidad) / total, restante));
    if (cuota > 0) {
      origenes.push({ produccionEntryId: c.id, quantity: cuota });
      restante = r4(restante - cuota);
    }
  }
  return origenes;
}

/**
 * Reinterpreta los errores del preview que se resuelven solos al importar.
 *
 * El preview no escribe nada, así que cuando revisa los Consumos los ingresos
 * del mismo archivo todavía no existen y el server responde «ese código no está
 * en el libro». Es cierto AHORA y falso dentro de un segundo: al importar de
 * verdad los ingresos van primero y el consumo encuentra su troza.
 *
 * Mostrarlo como error hace que el operador abandone una importación sana —o
 * peor, que salga a «arreglar» un archivo que estaba bien. Se reetiqueta sólo
 * cuando el código FIGURA en los ingresos de este mismo archivo: si no está, el
 * error es de verdad y se deja como está.
 */
export function seResuelveAlImportar(mensaje: string, codigo: string, mapa: Map<string, string>): boolean {
  if (!/no existe en el libro|no encontrad|importá los ingresos primero|cargá primero el ingreso/i.test(mensaje)) {
    return false;
  }
  /* El mensaje puede traer el código de la troza o el número de guía: se acepta
     cualquiera de los dos, porque el mapa conoce las dos puntas. */
  const c = txt(codigo);
  if (c && (guiaDelCodigo(c, mapa) !== null || [...mapa.values()].includes(c))) return true;
  return [...mapa.keys()].some((k) => mensaje.includes(k)) || [...mapa.values()].some((g) => mensaje.includes(g));
}

/**
 * El estado del aserradero que sale de este libro.
 *
 * Es lo mismo que calcula `ForestCtpDB.saldos` contra la base, pero sobre el
 * archivo: sirve para que el operador VEA cómo va a quedar antes de importar,
 * y para cuadrarlo contra lo que el libro oficial declara.
 */
export type EstadoDelLibro = {
  ingresadoM3: number;
  consumidoM3: number;
  /** Materia prima que sigue en el patio. */
  enPatioM3: number;
  producidoM3: number;
  /** Lo que salió a un tercero, con su guía. */
  despachadoM3: number;
  /**
   * Lo que se usó adentro (marca `C/I` del libro).
   *
   * Sale del depósito igual que un despacho, pero NO es una venta: no lleva GTF
   * y no va contra un cliente. Sumarlo a lo despachado —como se hacía— infla la
   * salida comercial: en el libro real son 423 m³ de 771 filas.
   */
  consumoInternoM3: number;
  /**
   * Trozas que salieron SIN transformar («MADERA EN ROLLO» en Salidas).
   *
   * El libro pone todas las salidas juntas, pero no son lo mismo: una troza
   * revendida entera nunca pasó por la sierra. El SNIFFS las separa —van a las
   * Salidas del Cuadro 1 (trozas), no del Cuadro 2 (producto transformado)— y
   * contarlas como producto infla la salida de aserrada con madera que salió
   * como entró. En el libro real son 222.968 m³.
   *
   * Descuentan del PATIO, no del depósito.
   */
  salidaRollizaM3: number;
  /** Producto terminado que sigue en el depósito. */
  enDepositoM3: number;
  rendimientoPct: number | null;
  lotes: number;
  /**
   * Cuánto producto terminado hacía falta tener ANTES del primer día del
   * archivo para que el depósito nunca quedara en negativo.
   *
   * Un libro que arranca a mitad de la operación despacha producto que se
   * aserró antes: en el libro real hay salidas desde el 17/05 y la primera
   * producción es del 06/06. Sin declarar esa apertura el depósito da negativo
   * y parece que se despachó madera que no existe.
   *
   * Se calcula recorriendo el libro en orden de fecha y quedándose con el punto
   * más bajo. NO es un invento: es el mínimo que el propio archivo exige para
   * ser coherente consigo mismo.
   */
  aperturaNecesariaM3: number;
};

export function estadoDelLibro(
  filas: {
    ingresos?: readonly FilaParseada[];
    consumos?: readonly FilaParseada[];
    produccion?: readonly FilaParseada[];
    salidas?: readonly FilaParseada[];
  },
): EstadoDelLibro {
  const suma = (fs: readonly FilaParseada[] | undefined, campo = "cantidad") =>
    r4((fs ?? []).filter((f) => f.problemas.length === 0).reduce((s, f) => s + num(f.datos[campo]), 0));

  const ingresadoM3 = suma(filas.ingresos);
  const consumidoM3 = suma(filas.consumos);
  const producidoM3 = suma(filas.produccion);

  /* Las salidas se parten en dos: lo que se vendió y lo que se usó adentro. Las
     dos vacían el depósito, pero sólo una es un despacho. */
  const todasLasSalidas = (filas.salidas ?? []).filter((f) => f.problemas.length === 0);

  /* La rolliza sale del PATIO, no del depósito: es materia prima revendida sin
     aserrar. Mezclarla con el producto terminado descuadra las dos puntas. */
  const esRolliza = (f: FilaParseada) => /rollo|rolliza|troza/i.test(txt(f.datos.tipoProducto));
  const salidaRollizaM3 = r4(todasLasSalidas.filter(esRolliza).reduce((s, f) => s + num(f.datos.cantidad), 0));

  const salidasLimpias = todasLasSalidas.filter((f) => !esRolliza(f));
  const despachadoM3 = r4(
    salidasLimpias.filter((f) => !esConsumoInterno(f.datos.observaciones)).reduce((s, f) => s + num(f.datos.cantidad), 0),
  );
  const consumoInternoM3 = r4(
    salidasLimpias.filter((f) => esConsumoInterno(f.datos.observaciones)).reduce((s, f) => s + num(f.datos.cantidad), 0),
  );
  const lotes = new Set(
    [...(filas.consumos ?? []), ...(filas.produccion ?? []), ...(filas.salidas ?? [])]
      .map((f) => normalizarLote(f.datos.lote))
      .filter(Boolean),
  ).size;

  /* El punto más bajo del depósito, recorriendo por fecha. Si nunca baja de
     cero, la apertura necesaria es 0 y el libro cierra solo. */
  const eventos: { fecha: string; delta: number }[] = [];
  for (const f of (filas.produccion ?? []).filter((x) => x.problemas.length === 0)) {
    eventos.push({ fecha: String(f.datos.fecha ?? ""), delta: num(f.datos.cantidad) });
  }
  for (const f of salidasLimpias) {
    eventos.push({ fecha: String(f.datos.fecha ?? ""), delta: -num(f.datos.cantidad) });
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acumulado = 0;
  let minimo = 0;
  for (const e of eventos) {
    acumulado = r4(acumulado + e.delta);
    if (acumulado < minimo) minimo = acumulado;
  }

  return {
    aperturaNecesariaM3: r4(Math.abs(Math.min(0, minimo))),
    ingresadoM3,
    consumidoM3,
    /* Puede dar negativo si el archivo declara más consumo que ingreso: NO se
       recorta a 0. Un saldo negativo es justamente el hallazgo que hay que
       mostrar, y esconderlo detrás de un `Math.max` lo haría invisible. */
    enPatioM3: r4(ingresadoM3 - consumidoM3 - salidaRollizaM3),
    producidoM3,
    despachadoM3,
    consumoInternoM3,
    salidaRollizaM3,
    /* El consumo interno también sale del depósito: no está más ahí aunque no
       se haya vendido. */
    enDepositoM3: r4(producidoM3 - despachadoM3 - consumoInternoM3),
    rendimientoPct: consumidoM3 > 0 ? Math.round((producidoM3 / consumidoM3) * 10_000) / 100 : null,
    lotes,
  };
}
