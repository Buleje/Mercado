/**
 * Calibración del talonario medida con regla (Brandon 17-10, «Calibracion_GTF_Aguachini.json»):
 * cada valor tiene que salir con su INICIO en la x medida y su BASE en la y
 * medida, ambas desde el recuadro impreso más el margen del papel. Se mide en
 * la salida real (`renglonesDeLaPagina` → PDF / ESC/P), no en la hoja guardada.
 */
import { describe, expect, it } from "vitest";
import cal from "./forestal-gtf-matricial-calibracion.aguachini.json";
import { aplicarCalibracion, alRecuadro, calibracionSchema, moverRecuadro, papelYRecuadro } from "@/lib/forestal/gtf-matricial-calibracion";
import { CATALOGO, hojaDeFabrica, mmPorCaracter, normalizarHoja, type DisposicionHoja } from "@/lib/forestal/gtf-matricial-disposicion";
import { renglonesDeLaPagina, xInicio } from "@/lib/forestal/gtf-salida-geometria";
import { transformacionDe } from "@/lib/forestal/gtf-matricial-perfiles";
import { ptAMm } from "@/lib/forestal/gtf-matricial-edicion";

const parsed = calibracionSchema.safeParse(cal);
if (!parsed.success) throw new Error("fixture inválido");
const CAL = parsed.data;
const t = transformacionDe({ offsetXMm: 0, offsetYMm: 0 }, null);

/** El renglón que sale para UN campo con este texto. */
function renglonDe(hoja: DisposicionHoja, id: string, texto = "ABC") {
  const [r] = renglonesDeLaPagina(hoja, CATALOGO.guia, { campos: { [id]: texto }, filas: [] }, t);
  return r;
}

describe("aplicarCalibracion (talonario Aguachini)", () => {
  const res = aplicarCalibracion(hojaDeFabrica("guia"), CAL);
  const { hoja, recuadro: m } = res;

  it("supone Oficio con el recuadro centrado: 195 × 299,5 no entra en A4", () => {
    expect(m).toMatchObject({ anchoMm: 216, altoMm: 330, x: 10.5, y: 15.25, papel: "Oficio" });
    expect(hoja.marco).toEqual({ x: 10.5, y: 15.25, ancho: 195, alto: 299.5 });
    expect(hoja.plantilla).toBe("imprenta-2024-v2");
  });

  it("cada campo sale con el inicio en x + margen y la base en y + margen (±0,02 mm)", () => {
    let medidos = 0;
    for (const p of res.pares.filter((x) => x.tipo === "campo")) {
      const c = CAL.campos.find((k) => k.clave === p.clave);
      const id = p.ids[0];
      const pos = hoja.campos[id];
      if (!c || !pos || pos.alinea !== "izq") continue;
      const r = renglonDe(hoja, id);
      expect(r, p.clave).toBeDefined();
      expect(Math.abs(xInicio(r, mmPorCaracter(r.letraPt)) - (m.x + c.x)), `${p.clave} x`).toBeLessThan(0.02);
      expect(Math.abs(r.baseMm - (m.y + c.y)), `${p.clave} base`).toBeLessThan(0.02);
      medidos++;
    }
    expect(medidos).toBeGreaterThanOrEqual(40);
  });

  it("DNI/RUC del mismo renglón: el RUC al principio y el DNI después, en la misma base", () => {
    const c = CAL.campos.find((k) => k.clave === "propietario_ruc");
    const [ruc, dni] = res.pares.find((p) => p.clave === "propietario_ruc")?.ids ?? [];
    expect(c && ruc && dni).toBeTruthy();
    if (!c || !ruc || !dni) return;
    const a = hoja.campos[ruc];
    const b = hoja.campos[dni];
    expect(a.x).toBeCloseTo(m.x + c.x, 2);
    expect(b.x).toBeCloseTo(a.x + a.anchoMm, 2);
    expect(a.anchoMm + b.anchoMm).toBeCloseTo(c.ancho, 1);
    expect(renglonDe(hoja, ruc, "20123456789").baseMm).toBeCloseTo(renglonDe(hoja, dni, "12345678").baseMm, 2);
  });

  it("la X de cada casilla cae con su centro en el centro medido", () => {
    let medidas = 0;
    for (const p of res.pares.filter((x) => x.tipo === "casilla")) {
      const c = CAL.casillas?.find((k) => k.clave === p.clave);
      /* Las del (5) son «5:concesion»…; las del (36), «36a3»/«36a4». Las ocultas (2015) no salen. */
      const r = c && hoja.campos[p.ids[0]]?.visible ? renglonDe(hoja, p.ids[0], "X") : undefined;
      if (!c || !r) continue;
      medidas++;
      const w = mmPorCaracter(r.letraPt);
      expect(Math.abs(xInicio(r, w) + w / 2 - (m.x + c.x_centro)), `${p.clave} x`).toBeLessThan(0.05);
      /* El centro de la mayúscula (base − media altura de mayúscula) sobre el centro medido. */
      expect(Math.abs(r.baseMm - (ptAMm(r.letraPt) * 1170) / 2048 / 2 - (m.y + c.y_centro)), `${p.clave} y`).toBeLessThan(0.05);
    }
    expect(medidas).toBeGreaterThanOrEqual(8);
  });

  it("el cuadro (34): cada fila en su raya medida (±0,1 mm) y cada columna en su x", () => {
    const tabla = CAL.tabla_34;
    expect(tabla).toBeDefined();
    if (!tabla) return;
    expect(hoja.tabla.maxFilas).toBe(7);
    expect(hoja.tabla.altoFilaMm).toBeCloseTo(4.97, 2);
    const filas = tabla.y_lineas.map(() => Object.fromEntries(CATALOGO.guia.columnas.map((col) => [col.id, "1"])));
    const renglones = renglonesDeLaPagina(hoja, CATALOGO.guia, { campos: {}, filas }, t);
    tabla.y_lineas.forEach((y, i) => {
      const enFila = renglones.filter((r) => Math.abs(r.baseMm - (m.y + y)) < 0.1);
      expect(enFila.length, `fila ${i + 1}`).toBeGreaterThan(0);
    });
    for (const p of res.pares.filter((x) => x.tipo === "columna")) {
      const c = tabla.columnas.find((k) => k.clave === p.clave);
      const col = hoja.tabla.columnas[p.ids[0]];
      expect(col.x, p.clave).toBeCloseTo(m.x + (c?.x ?? NaN), 2);
      expect(col.anchoMm, p.clave).toBeCloseTo(c?.ancho ?? NaN, 2);
    }
  });

  it("lo que el sistema no llena queda dicho, con su motivo", () => {
    expect(res.sinPar.map((s) => s.clave).sort()).toEqual(["cb_anexo01", "cb_anexo02", "emisor_doc", "emisor_nombre", "observaciones_2", "registro"]);
    expect(res.pares).toHaveLength(64);
  });

  it("se guarda: el recuadro sobrevive a normalizarHoja y volver a cargar no pisa el margen medido", () => {
    const medido = moverRecuadro(hoja, 12, 17);
    const guardada = normalizarHoja("guia", JSON.parse(JSON.stringify(medido)));
    expect(guardada.marco).toEqual({ x: 12, y: 17, ancho: 195, alto: 299.5 });
    expect(papelYRecuadro(CAL.marco_medido_mm, guardada)).toMatchObject({ x: 12, y: 17, papel: null });
    const otra = aplicarCalibracion(guardada, CAL);
    const c = CAL.campos.find((k) => k.clave === "titular");
    const id = otra.pares.find((p) => p.clave === "titular")?.ids[0] ?? "";
    expect(renglonDe(otra.hoja, id).baseMm).toBeCloseTo(17 + (c?.y ?? NaN), 2);
  });

  it("mover el recuadro corre todo junto (la base se mueve lo mismo que el recuadro)", () => {
    const id = res.pares.find((p) => p.clave === "titular")?.ids[0] ?? "";
    const antes = renglonDe(hoja, id).baseMm;
    const movida = alRecuadro(hoja, { x: m.x, y: m.y + 3, ancho: 195, alto: 299.5 });
    expect(renglonDe(movida, id).baseMm).toBeCloseTo(antes + 3, 2);
  });
});
