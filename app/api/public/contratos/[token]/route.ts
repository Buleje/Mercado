import { NextRequest, NextResponse } from "next/server";
import { ContractsDB } from "@/lib/db/contracts.db";
import { estadoDeFirma } from "@/lib/contratos/firma-contrato";
import { TIPO_LABELS } from "@/lib/types/contracts";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Lo que ve quien recibió el link de firma. Devuelve sólo lo necesario para
 * decidir si firma: de qué contrato se trata, con quién, por cuánto y si le
 * toca. Nada de datos internos del tenant.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "contrato-firma-publica");
  if (_rl) return _rl;

  const { token } = await params;

  try {
    const encontrado = await ContractsDB.findBySignerToken(token);
    if (!encontrado) return NextResponse.json({ error: "link_invalido" }, { status: 404 });

    const { signer, contract } = encontrado;
    const propio = contract.firmantes.find((f) => f.id === signer.id);
    if (!propio) return NextResponse.json({ error: "link_invalido" }, { status: 404 });

    const estado = estadoDeFirma(contract, propio, signer.tokenExpiraEn);

    return NextResponse.json({
      contrato: {
        numero: contract.numero,
        tipo: contract.tipo,
        tipoLabel: TIPO_LABELS[contract.tipo] ?? contract.tipo,
        resumen: contract.resumen || contract.descripcion,
        monto: contract.monto,
        moneda: contract.moneda,
        fechaInicio: contract.fechaInicio,
        fechaVencimiento: contract.fechaVencimiento,
        otraParte: contract.clienteNombre,
      },
      firmante: {
        nombre: propio.nombre,
        documento: propio.documento,
        rol: propio.rol,
        estado: propio.estado,
        firmadoEn: propio.firmadoEn,
      },
      // Sin nombres completos de los demás: sólo el estado de cada turno.
      partes: contract.firmantes.map((f) => ({
        nombre: f.nombre,
        rol: f.rol,
        estado: f.estado,
        orden: f.orden,
        esVos: f.id === propio.id,
      })),
      puedeFirmar: estado.puedeFirmar,
      motivo: estado.motivo ?? null,
      esperandoA: estado.esperandoA ?? null,
    });
  } catch (e) {
    logger.error("[public/contratos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}
