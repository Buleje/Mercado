import { fmtMonedas } from "@/components/admin/adelantos/shared";
import { porcentaje } from "@/lib/admin/inicio/formato-tablero";
import { valorConDato } from "@/lib/admin/inicio/hay-datos";
import { formatNumber } from "@/lib/format";
import { cantidadDelPeriodo, type InicioForestal } from "@/lib/forestal/inicio-forestal";
import type { OverviewData } from "@/lib/admin/overview-tipos";
import type { CifraTira } from "../resumen/cifras-tira";
import { guiasVigentes } from "../use-forestal-inicio";
import { CTP, LOTH, m3, plural, TINTA } from "./comun";
import { rotulo, tramosConMovimiento } from "./serie";

/**
 * La tira de cifras del Inicio forestal (2026-10-31): la misma tira del
 * Resumen (`TiraDeCifras`), con la mini-serie de cada semana y la variación
 * contra el período anterior. Ninguna cifra nace acá: todas llegan armadas del
 * agregador; esto sólo elige el rótulo y la línea de abajo.
 *
 * Una cifra sin dato no se dibuja: se nombra en «Sin movimiento en el período».
 */
export function cifrasForestal(
  d: InicioForestal,
  movimiento: boolean,
): { cifras: CifraTira[]; sinMovimiento: string[] } {
  const cifras: CifraTira[] = [];
  const sinMovimiento: string[] = [];
  const agregar = (ok: boolean, c: CifraTira, nombre: string) => (ok ? cifras.push(c) : sinMovimiento.push(nombre));
  const { ctp, loth, adelantos } = d;

  if (ctp && movimiento) {
    const puntos = tramosConMovimiento(ctp.serie);
    const etiquetas = puntos.map((p) => rotulo(p.fecha, ctp.serie.paso));
    const conSerie = puntos.length >= 2;
    const cmp = ctp.comparacion;
    const vs = cmp ? textoComparacion(cmp.desde, cmp.hasta) : undefined;
    const serie = (k: "ingresoM3" | "producido" | "despachado") => (conSerie ? puntos.map((p) => p[k]) : undefined);
    const enM3 = (u: string | null) => (u === "m3" ? "m3" : "cantidad");

    agregar(
      valorConDato(ctp.ingresoM3),
      {
        id: "ingreso",
        label: "Ingresado al CTP",
        value: m3(ctp.ingresoM3),
        hint: "Troza que entró con su guía validada, del Tablero del Libro CTP para el mismo período.",
        sub: "troza con guía validada",
        delta: cmp?.ingreso ?? null,
        deltaLabel: vs,
        serie: serie("ingresoM3"),
        serieColor: TINTA.entra,
        serieFormato: "m3",
        serieEtiquetas: etiquetas,
      },
      "Ingresado",
    );
    agregar(
      valorConDato(ctp.producido),
      {
        id: "producido",
        label: "Producido",
        value: cantidadDelPeriodo(ctp.producido, ctp.unidadProducido),
        hint: "Lo que salió de las corridas de aserrío. Lleva unidad sólo si todo el período se declaró en una (m³ o pt): la suma no convierte pt a m³.",
        sub: `de ${m3(ctp.consumoM3)} de troza${ctp.unidadProducido == null ? " · varias unidades" : ""}`,
        delta: cmp?.producido ?? null,
        deltaLabel: vs,
        serie: serie("producido"),
        serieColor: TINTA.producto,
        serieFormato: enM3(ctp.unidadProducido),
        serieEtiquetas: etiquetas,
      },
      "Producido",
    );
    agregar(
      ctp.rendimiento > 0,
      {
        id: "rendimiento",
        label: "Rendimiento",
        value: porcentaje(ctp.rendimiento, 1),
        hint: `Producto entre troza aserrada, el del Tablero: ponderado por lo que entró a la sierra y sólo con corridas en m³${ctp.corridasOtraUnidad > 0 ? ` (${plural(ctp.corridasOtraUnidad, "corrida en otra unidad quedó", "corridas en otra unidad quedaron")} fuera)` : ""}.`,
        sub: "producto ÷ troza aserrada",
      },
      "Rendimiento",
    );
    agregar(
      valorConDato(ctp.despachado),
      {
        id: "despachado",
        label: "Despachado",
        value: cantidadDelPeriodo(ctp.despachado, ctp.unidadDespachado),
        hint: "Producto que salió del CTP con su guía, del Tablero del Libro CTP.",
        sub: ctp.unidadDespachado == null ? "salida · varias unidades" : "salida de producto",
        delta: cmp?.despachado ?? null,
        deltaLabel: vs,
        serie: serie("despachado"),
        serieColor: TINTA.sale,
        serieFormato: enM3(ctp.unidadDespachado),
        serieEtiquetas: etiquetas,
      },
      "Despachado",
    );
  }

  if ((ctp || loth) && movimiento) {
    const g = guiasVigentes(d);
    const vigentes = g.ctp + g.th;
    const sinVerificar = ctp?.guias.sinVerificar ?? 0;
    const partes = [ctp ? `CTP ${g.ctp}` : null, loth ? `TH ${g.th}` : null].filter(Boolean).join(" · ");
    agregar(
      vigentes > 0,
      {
        id: "guias",
        label: "Guías emitidas",
        value: formatNumber(vigentes),
        hint: `Guías vigentes del período: las de salida del CTP y las GTF del Libro TH. Las anuladas van aparte${g.anuladas > 0 ? ` (${g.anuladas})` : ""}.`,
        sub: sinVerificar > 0 ? `${partes} · ${sinVerificar} sin verificar` : partes,
        subTono: sinVerificar > 0 ? "aviso" : "normal",
      },
      "Guías",
    );
  }

  if (ctp) {
    const p = ctp.patio;
    const conTrozas = !!p && (valorConDato(p.trozas) || valorConDato(p.m3));
    agregar(
      !!p,
      {
        id: "patio",
        label: "En el patio hoy",
        value: conTrozas && p ? m3(p.m3) : "Vacío",
        hint: "Volumen disponible del Libro CTP: trozas libres y en lote, sin las de guías por recepcionar. Es una foto de hoy: no depende del período.",
        sub: conTrozas && p ? `${plural(p.trozas, "troza", "trozas")} · ≈ ${formatNumber(p.pt)} pt` : "no queda troza por aserrar",
        subTono: (p?.anejas?.trozas ?? 0) > 0 ? "aviso" : "normal",
      },
      "Patio (no se pudo leer)",
    );
  }

  const conSaldo = (adelantos ?? []).filter((a) => valorConDato(a.saldoPendiente));
  if (conSaldo.length > 0) {
    const abiertos = conSaldo.reduce((a, x) => a + x.abiertos, 0);
    cifras.push({
      id: "adelantos",
      label: "Adelantos por cobrar",
      value: fmtMonedas(Object.fromEntries(conSaldo.map((a) => [a.moneda, a.saldoPendiente]))),
      hint: "Lo que te deben hoy por adelantos (saldo del módulo Adelantos), cada moneda por su lado.",
      sub: `${plural(abiertos, "abierto", "abiertos")} · saldo de hoy`,
    });
  }
  return { cifras, sinMovimiento };
}

/** «vs los 31 días anteriores» · «vs el día anterior» (los dos bordes cuentan). */
function textoComparacion(desde: string, hasta: string): string {
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
  if (!Number.isFinite(dias) || dias < 1) return "vs período anterior";
  return dias === 1 ? "vs el día anterior" : `vs los ${dias} días anteriores`;
}

/**
 * Lo primero que hay que mirar, en una línea con su botón. Por gravedad: un
 * permiso pasado o por vencer, guías que amparan madera sin origen, troza que
 * se queda en el patio y, si no hay nada de eso, cómo se movió el patio.
 */
export function consejoForestal(d: InicioForestal, movimiento: boolean): OverviewData["insight"] {
  const permisos = d.loth?.permisos ?? [];
  const excedido = permisos.find((p) => p.excedido);
  if (excedido) {
    return {
      type: "warning",
      text: `El permiso ${excedido.numero} ya pasó lo ${excedido.tipo === "PLANTACION" ? "registrado" : "autorizado"}.`,
      cta: { label: "Ver control", href: `${LOTH}&vista=tablero` },
    };
  }
  const vence = permisos
    .filter((p) => p.vigencia && ["vencido", "por_vencer", "suspendido"].includes(p.vigencia.nivel))
    .sort((a, b) => (a.vigencia?.diasRestantes ?? -1e9) - (b.vigencia?.diasRestantes ?? -1e9))[0];
  if (vence?.vigencia) {
    return {
      type: "warning",
      text: `Permiso ${vence.numero}: ${vence.vigencia.texto.charAt(0).toLowerCase()}${vence.vigencia.texto.slice(1)}.`,
      cta: { label: "Ver permiso", href: `${LOTH}&vista=tablero` },
    };
  }
  const ctp = d.ctp;
  const sinOrigen = ctp?.guias.sinOrigen ?? 0;
  if (sinOrigen > 0) {
    return {
      type: "warning",
      text: `${plural(sinOrigen, "guía de salida ampara", "guías de salida amparan")} madera sin corrida de origen.`,
      cta: { label: "Ver guías", href: `${CTP}&vista=despacho&sub=guias` },
    };
  }
  const anejas = ctp?.patio?.anejas;
  if (anejas && anejas.trozas > 0) {
    return {
      type: "info",
      text: `${plural(anejas.trozas, "troza lleva", "trozas llevan")} ${ctp?.patio?.diasAneja ?? 15} días o más en el patio (${m3(anejas.m3)}).`,
      cta: { label: "Ver patio", href: `${CTP}&vista=disponibles` },
    };
  }
  const variacion = ctp?.variacionPatioM3 ?? 0;
  if (movimiento && Math.abs(variacion) >= 0.01) {
    return {
      type: variacion > 0 ? "info" : "opportunity",
      text:
        variacion > 0
          ? `Entró más troza de la que se aserró: el patio sumó ${m3(variacion)} en el período.`
          : `Se aserró más de lo que entró: el patio bajó ${m3(-variacion)} en el período.`,
    };
  }
  return null;
}
