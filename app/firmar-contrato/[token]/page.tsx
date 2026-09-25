import { Metadata } from "next";
import { ContractsDB } from "@/lib/db/contracts.db";
import { estadoDeFirma } from "@/lib/contratos/firma-contrato";
import { TIPO_LABELS } from "@/lib/types/contracts";
import { FirmarContratoView } from "./FirmarContratoView";

export const metadata: Metadata = {
  title: "Firmar contrato · Buleje",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

function Aviso({ titulo, cuerpo }: { titulo: string; cuerpo: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
      <div className="bg-white rounded-3xl border border-[var(--rule-base,#e5e7eb)] shadow-sm p-10 max-w-md text-center">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary,#0f172a)]">{titulo}</h1>
        <p className="text-base text-[var(--text-secondary,#475569)] mt-3 leading-relaxed">{cuerpo}</p>
      </div>
    </main>
  );
}

export default async function FirmarContratoPage({ params }: Props) {
  const { token } = await params;
  const encontrado = await ContractsDB.findBySignerToken(token);

  if (!encontrado) {
    return (
      <Aviso
        titulo="Este enlace no está disponible"
        cuerpo="El link de firma venció, fue reemplazado o nunca existió. Pedile a quien te lo mandó que genere uno nuevo."
      />
    );
  }

  const { signer, contract } = encontrado;
  const propio = contract.firmantes.find((f) => f.id === signer.id);
  if (!propio) {
    return <Aviso titulo="Este enlace no está disponible" cuerpo="No pudimos identificar a quién le corresponde firmar." />;
  }

  const estado = estadoDeFirma(contract, propio, signer.tokenExpiraEn);

  return (
    <FirmarContratoView
      token={token}
      firmante={{ nombre: propio.nombre, documento: propio.documento, rol: propio.rol, estado: propio.estado }}
      contrato={{
        numero: contract.numero,
        tipoLabel: TIPO_LABELS[contract.tipo] ?? contract.tipo,
        resumen: contract.resumen || contract.descripcion,
        monto: contract.monto,
        moneda: contract.moneda,
        fechaInicio: contract.fechaInicio,
        fechaVencimiento: contract.fechaVencimiento,
        otraParte: contract.clienteNombre,
      }}
      partes={contract.firmantes.map((f) => ({
        nombre: f.nombre,
        rol: f.rol,
        estado: f.estado,
        orden: f.orden,
        esVos: f.id === propio.id,
      }))}
      puedeFirmar={estado.puedeFirmar}
      motivo={estado.motivo ?? null}
      esperandoA={estado.esperandoA ?? null}
    />
  );
}
