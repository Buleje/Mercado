/**
 * ADR-461 (02-10 noche) — Brandon: «se importará también los datos […] y
 * opción para poder guardar en el directorio si es dato o permiso nuevo».
 *
 * Lo PURO: la ficha entera que viaja con la guía (`fichaSerfor`), los
 * casilleros que faltaban (partida/llegada desarmadas, remolque, rayas «-»),
 * las partes que nombra la guía y su cruce con el directorio, y lo que la
 * pantalla marca y manda. Sobre las fichas anonimizadas de Blas
 * (`forestal-loth-importar-guia.fichas-blas.json`); los DNI, brevetes y placas
 * que se agregan acá son INVENTADOS (Ley 29733).
 */
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha, gtfDatosDesdeFicha, placasDeLaGuia, vistaPreviaDeTanda } from "@/lib/forestal/loth-importar-guia";
import { fichaDeGuiaImportada, fichaParaMostrar } from "@/lib/forestal/loth-importar-guia-ficha";
import {
  armarDirectorio,
  claveDocumento,
  cruzarConDirectorio,
  datosParaCompletar,
  type ContextoDirectorio,
  type ParteDelDirectorio,
} from "@/lib/forestal/loth-importar-guia-directorio";
import { pedidoImportarSchema } from "@/lib/forestal/loth-importar-guia-esquemas";
import {
  accionPosible,
  cuantasAlDirectorio,
  decisionesDirectorioIniciales,
  pedidoDirectorio,
} from "@/components/admin/forestal/hooks/importar-guias-pantalla";

const FICHAS = fichasJson as unknown as Record<string, GtfSerfor>;
/** GTF 010-001-0000014 · PMFI 10-HUA-PUE/PER-FMP-2026-007 · titular = propietario (tras reparar «MUÃ?OZ»). */
const G14 = "1-10-0474633";
/** GTF 019-001-0000013 · plantación · el propietario NO es el titular. */
const G13PLT = "110-19-0472267";
const RUC_BLAS = "20605859438";
/** Inventados: el JSON trae nombres en esos casilleros (lo redactó el anonimizador). */
const CONDUCTOR = { transportistaDni: "11111111", licenciaConducir: "Q11111111" };
const ficha = (registro: string, cambio: Partial<GtfSerfor> = {}): GtfSerfor => ({ ...structuredClone(FICHAS[registro]), ...CONDUCTOR, ...cambio });

const parteDir = (p: Partial<ParteDelDirectorio> & Pick<ParteDelDirectorio, "id" | "nombre">): ParteDelDirectorio => ({
  roles: ["proveedor"],
  docTipo: null,
  docNumero: null,
  direccion: null,
  region: null,
  provincia: null,
  distrito: null,
  licencia: null,
  tituloHabilitante: null,
  resolucion: null,
  planManejo: null,
  arffs: null,
  representante: null,
  ...p,
});

function contexto(partes: ParteDelDirectorio[] = [], extra: Partial<ContextoDirectorio> = {}): ContextoDirectorio {
  const porDoc = new Map<string, ParteDelDirectorio>();
  for (const p of partes) if (p.docTipo && p.docNumero) porDoc.set(claveDocumento(p.docTipo, p.docNumero), p);
  return { partesPorDocumento: porDoc, partes, vehiculos: new Map(), permisos: [], rucPropio: RUC_BLAS, ...extra };
}

describe("todos los datos de la guía quedan con ella", () => {
  it("la ficha que viaja: reparada, con el cuadro de productos, sin la lista de trozas y con `campos` reducido", () => {
    /* SERFOR repite cada casillero en `campos`; «Codigo de control» no lo muestra ninguno (Blas, 02-10). */
    const g = ficha(G14);
    g.campos = { "Estado de la GTF": String(g.estado), "Codigo de control": "CTRL-0001" };
    expect(g.propietario).toContain("Ã");
    const f = fichaParaMostrar(g);
    expect(f.propietario).toBe("PEREZ MUÑOZ JUAN CARLOS");
    expect(f.trozas).toEqual([]);
    expect(f.productos.length).toBe(g.productos.length);
    expect(f.productos.length).toBeGreaterThan(0);
    expect(f.estado).toBe(g.estado);
    expect(f.direccionTitular).toBe(g.direccionTitular);
    /* `campos` sólo con lo que ningún casillero muestra. */
    expect(f.campos).toEqual({ "Codigo de control": "CTRL-0001" });
  });

  it("gtfDatos guarda la ficha en su llave aparte y se lee de vuelta tal cual (como sale de la base)", () => {
    const g = ficha(G14);
    const datos = JSON.parse(JSON.stringify(gtfDatosConFicha(g, true))) as unknown;
    const leida = fichaDeGuiaImportada(datos);
    expect(leida?.verificada).toBe(true);
    expect(leida?.ficha.gtfNumber).toBe(g.gtfNumber);
    expect(leida?.ficha.productos).toEqual(fichaParaMostrar(g).productos);
    expect(leida?.ficha.guiaRemision).toBe(g.guiaRemision);
    expect(leida?.ficha.licenciaConducir).toBe("Q11111111");
    expect(fichaDeGuiaImportada(JSON.parse(JSON.stringify(gtfDatosConFicha(g, false))))?.verificada).toBe(false);
    /* Una guía anotada a mano (sin la llave) o un JSON roto no tienen ficha. */
    expect(fichaDeGuiaImportada(gtfDatosDesdeFicha(g))).toBeNull();
    expect(fichaDeGuiaImportada({ fichaSerfor: { gtfNumber: 5 } })).toBeNull();
    expect(fichaDeGuiaImportada(null)).toBeNull();
  });

  it("los casilleros: partida y llegada desarmadas, el remolque aparte y las rayas «-» vacías", () => {
    const g = ficha(G14, { placa: "ABC-109 / XYZ-981", guiaRemision: "---------", listaTrozas: "-" });
    const d = gtfDatosDesdeFicha(g);
    expect(d.traslado.partida).toMatchObject({ departamento: g.departamento, provincia: g.provincia, distrito: g.distrito });
    expect(d.traslado.llegada).toMatchObject({ direccion: g.destinatarioDireccion, distrito: g.destinatarioDistrito });
    expect(d.traslado.puntoPartida).toBe([g.distrito, g.provincia, g.departamento].join(", "));
    expect(d.vehiculo).toMatchObject({ placa: "ABC-109", placaRemolque: "XYZ-981", conductorDni: "11111111", licencia: "Q11111111" });
    expect(d.comprobante).toEqual({ tipo: "ninguno", numero: "" });
    expect(d.guia.guiaRemisionNro).toBe("");
    expect(d.guia.listaTrozasNro).toBe("");
    expect(placasDeLaGuia("ABC-101 / -")).toEqual({ placa: "ABC-101", remolque: "" });
    expect(placasDeLaGuia("ABC-102 /")).toEqual({ placa: "ABC-102", remolque: "" });
    expect(placasDeLaGuia("-")).toEqual({ placa: "", remolque: "" });
  });

  it("la vista previa lleva la ficha de cada guía (sin la lista: ésa va en `trozas`)", () => {
    const g = ficha(G14);
    const [v] = vistaPreviaDeTanda(
      [{ clave: "serfor:x", fuente: { tipo: "serfor", numeroRegistro: G14 }, ficha: g, verificada: true, falla: null, planElegido: null }],
      { planes: [], contratos: [], libro: { trozados: [], talas: [], salidas: [], guias: [], cierres: [] }, bajoDmc: new Map() },
    );
    expect(v.ficha?.gtfNumber).toBe(g.gtfNumber);
    expect(v.ficha?.trozas).toEqual([]);
    expect(v.trozas.length).toBe(g.trozas.length);
    expect(v.directorio).toBeNull();
  });
});

describe("quién de la guía va al directorio", () => {
  it("titular = propietario: UNA parte con el RUC del propietario, el título, la resolución, el plan y la ARFFS; nunca el RUC de la instancia", () => {
    const g = ficha(G14);
    const a = armarDirectorio(g);
    expect(a.partes.map((p) => p.clave)).toEqual(["titular", "destinatario", "transportista"]);
    const t = a.partes[0];
    expect(t).toMatchObject({ papel: "Titular y propietario", roles: ["proveedor"], nombre: "PEREZ MUÑOZ JUAN CARLOS", docTipo: "RUC", docNumero: g.propietarioDoc });
    expect(t.docNumero).not.toBe(g.rucInstancia);
    expect(t.datos).toMatchObject({ tituloHabilitante: g.numeroTitulo, resolucion: g.numeroResolucion, planManejo: "PMFI", arffs: g.instanciaRegistra });
    /* El domicilio, entero del propietario (16-19); nunca el ubigeo del ORIGEN (10-12) pegado a otra dirección. */
    expect(t.datos).toMatchObject({ direccion: g.propietarioDireccion, region: g.propietarioDepartamento, distrito: g.propietarioDistrito });
    expect(a.partes[1]).toMatchObject({ roles: ["destinatario"], docTipo: "RUC", docNumero: RUC_BLAS });
    expect(a.partes[2]).toMatchObject({ roles: ["transportista", "conductor"], docTipo: "DNI", docNumero: "11111111" });
    expect(a.partes[2].datos.licencia).toBe("Q11111111");
    expect(a.vehiculo).toEqual({ placa: "ABC-109", placaRemolque: null, tipo: g.tipoVehiculo });
    expect(a.permiso).toMatchObject({ codigo: g.numeroTitulo, tipo: "PER-FMP", titularNombre: "PEREZ MUÑOZ JUAN CARLOS" });
  });

  it("titular ≠ propietario: el titular va SIN documento (la guía no lo publica) y el propietario aparte con el suyo", () => {
    const g = ficha(G13PLT);
    const a = armarDirectorio(g);
    const t = a.partes.find((p) => p.clave === "titular");
    expect(t).toMatchObject({ papel: "Titular del permiso", docNumero: null, nombre: g.titular });
    expect(t?.aviso).toMatch(/no publica el RUC/);
    expect(t?.datos.planManejo).toBe("Plantación");
    expect(a.partes.find((p) => p.clave === "propietario")).toMatchObject({ nombre: g.propietario, docTipo: "RUC", docNumero: g.propietarioDoc });
  });

  it("frente al directorio: tu negocio no se ofrece; el mismo RUC ya está (y se completa lo que falta); lo demás es nuevo", () => {
    const g = ficha(G14);
    const titularYa = parteDir({ id: "p-tit", nombre: "PEREZ MUÑOZ JUAN CARLOS", docTipo: "RUC", docNumero: g.propietarioDoc, resolucion: "R-ESCRITA-A-MANO" });
    const d = cruzarConDirectorio(armarDirectorio(g), contexto([titularYa]));
    const [tit, dest, tra] = d.partes;
    expect(dest.estado).toBe("propio");
    expect(accionPosible(dest.estado, dest.existente)).toBeNull();
    expect(tit.estado).toBe("existe");
    expect(tit.existente).toMatchObject({ id: "p-tit", por: "documento", mismoNombre: true });
    /* La resolución ya estaba escrita: no se pisa. */
    expect(tit.existente?.faltan).toContain("direccion");
    expect(tit.existente?.faltan).not.toContain("resolucion");
    expect(datosParaCompletar(tit)).not.toHaveProperty("resolucion");
    expect(accionPosible(tit.estado, tit.existente)).toBe("completar");
    expect(tra.estado).toBe("nuevo");
    expect(d.vehiculo?.estado).toBe("nuevo");
    expect(d.permiso?.estado).toBe("nuevo");
  });

  it("el mismo RUC con otro nombre: se avisa y «completar» no va marcado", () => {
    const g = ficha(G14);
    const otro = parteDir({ id: "p-x", nombre: "COMUNIDAD NATIVA SAN LUIS", docTipo: "RUC", docNumero: g.propietarioDoc });
    const d = cruzarConDirectorio(armarDirectorio(g), contexto([otro]));
    expect(d.partes[0].existente?.mismoNombre).toBe(false);
    expect(d.partes[0].aviso).toMatch(/figura como «COMUNIDAD NATIVA SAN LUIS»/);
    expect(decisionesDirectorioIniciales(d).titular?.marcada).toBe(false);
  });

  it("sin documento se reconoce sólo por el nombre exacto y no se completa; con otro documento y el mismo nombre se avisa y no se marca", () => {
    const g = ficha(G13PLT);
    const porNombre = cruzarConDirectorio(armarDirectorio(g), contexto([parteDir({ id: "p-n", nombre: String(g.titular) })]));
    const t = porNombre.partes.find((p) => p.clave === "titular");
    expect(t?.existente?.por).toBe("nombre");
    expect(accionPosible(t?.estado ?? "nuevo", t?.existente ?? null)).toBeNull();

    const g14 = ficha(G14);
    const tocayo = parteDir({ id: "p-t", nombre: "PEREZ MUÑOZ JUAN CARLOS", docTipo: "DNI", docNumero: "22222222" });
    const d = cruzarConDirectorio(armarDirectorio(g14), contexto([tocayo]));
    expect(d.partes[0].estado).toBe("nuevo");
    expect(d.partes[0].parecida?.id).toBe("p-t");
    expect(decisionesDirectorioIniciales(d).titular?.marcada).toBe(false);
  });

  it("vehículo por placa normalizada; una placa imposible no se guarda; permiso por código tramo a tramo, con lo que le falta", () => {
    const g = ficha(G14);
    const ctx = contexto([], {
      vehiculos: new Map([["ABC109", { id: "v1", placa: "ABC109", placaRemolque: null, tipo: null }]]),
      permisos: [
        {
          id: "c1",
          codigo: "10-hua-pue/per-fmp-2026-7",
          titularNombre: "(por confirmar)",
          titularId: null,
          resolucionNumero: null,
          arffs: "YA ESCRITA",
          region: null,
          provincia: null,
          distrito: null,
          planId: null,
        },
      ],
    });
    const d = cruzarConDirectorio(armarDirectorio(g), ctx);
    expect(d.vehiculo?.estado).toBe("existe");
    expect(d.vehiculo?.existente?.faltan).toEqual(["tipo"]);
    expect(d.permiso?.estado).toBe("existe");
    expect(d.permiso?.existente?.faltan).toEqual(expect.arrayContaining(["titular", "titularNombre", "resolucionNumero"]));
    expect(d.permiso?.existente?.faltan).not.toContain("arffs");
    expect(d.permiso?.existente?.mismoNombre).toBe(true);

    const mala = cruzarConDirectorio(armarDirectorio(ficha(G14, { placa: "QQ / -" })), contexto());
    expect(mala.vehiculo?.estado).toBe("no_valido");
    expect(decisionesDirectorioIniciales(mala).vehiculo).toBeUndefined();
  });
});

describe("lo que la pantalla marca y manda", () => {
  it("lo nuevo va marcado; se corrige el documento; destildar lo saca; el pedido pasa el esquema del POST", () => {
    const g = ficha(G13PLT);
    const d = cruzarConDirectorio(armarDirectorio(g), contexto());
    const dec = decisionesDirectorioIniciales(d);
    expect(dec.titular?.marcada).toBe(true);
    expect(dec.vehiculo?.marcada).toBe(true);
    expect(dec.permiso?.marcada).toBe(true);
    expect(dec.destinatario).toBeUndefined(); // es tu negocio

    dec.titular = { ...dec.titular, docTipo: "DNI", docNumero: "33333333" };
    dec.vehiculo = { ...dec.vehiculo, marcada: false };
    const p = pedidoDirectorio(d, dec);
    expect(p?.partes.find((x) => x.clave === "titular")).toMatchObject({ accion: "agregar", docTipo: "DNI", docNumero: "33333333" });
    expect(p?.vehiculo).toBeUndefined();
    expect(p?.permiso).toEqual({ accion: "agregar" });
    expect(cuantasAlDirectorio(p)).toBe((p?.partes.length ?? 0) + 1);

    const r = pedidoImportarSchema.safeParse({
      items: [{ fuente: { tipo: "serfor", numeroRegistro: G13PLT }, planDestino: { tipo: "existente", planId: "p1" }, crearTala: false, directorio: p }],
    });
    expect(r.success).toBe(true);
    /* Nada marcado = nada que mandar. */
    expect(pedidoDirectorio(d, {})).toBeUndefined();
    expect(pedidoDirectorio(null, dec)).toBeUndefined();
  });
});
