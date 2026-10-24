import { describe, expect, it } from "vitest";
import { faltantesPorBloque } from "@/components/admin/forestal/ctp-guia-piezas";
import { faltantesGtf, gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";

/**
 * El estado de cada bloque de la pestaña «Datos de la guía» (rediseño
 * 2026-09-27) sale de `faltantesGtf`: la suma de los bloques tiene que dar lo
 * mismo que el pie del modal, salvo la fecha de inicio del traslado, que al
 * registrar se completa con la emisión y ninguna pestaña muestra.
 */
describe("faltantesPorBloque", () => {
  it("reparte los faltantes de la guía entre los bloques, sin perder ni duplicar", () => {
    const d = gtfDatosVacio();
    const b = faltantesPorBloque(d, "2026-09-27");
    const suma = b.documento.length + b.propietario.length + b.destinatario.length + b.transporte.length + b.traslado.length;
    const pie = faltantesGtf({ ...d, traslado: { ...d.traslado, fechaInicio: "2026-09-27" } });
    expect(suma).toBe(pie.length);
    expect(b.transporte).toEqual(expect.arrayContaining(["Transportista", "Placa del vehículo", "Conductor"]));
    expect(b.destinatario).toHaveLength(2);
  });

  it("la fecha de inicio se toma de la emisión: el traslado no pide un casillero que no se ve", () => {
    const d = gtfDatosVacio();
    expect(faltantesPorBloque(d, "2026-09-27").traslado).not.toContain("Fecha de inicio del traslado");
    expect(faltantesPorBloque(d, "").traslado).toContain("Fecha de inicio del traslado");
    expect(faltantesPorBloque(d, "").documento).toEqual(["Fecha de emisión"]);
  });

  it("guía completa: todos los bloques en cero", () => {
    const d = gtfDatosVacio();
    const llena = {
      ...d,
      propietario: { ...d.propietario, nombre: "Maderera San Martín SAC" },
      destinatario: { ...d.destinatario, nombre: "Distribuidora Callao SAC", direccion: "Av. Argentina 4500" },
      transportista: { ...d.transportista, nombre: "Transportes Amazonía SAC" },
      vehiculo: { ...d.vehiculo, placa: "AXQ-871", conductor: "Julio Paredes" },
      traslado: { ...d.traslado, puntoPartida: "Pucallpa", puntoLlegada: "Callao" },
      titulos: ["CONC-25-001"],
    };
    expect(Object.values(faltantesPorBloque(llena, "2026-09-27")).flat()).toEqual([]);
  });
});
