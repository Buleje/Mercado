import { NextResponse } from "next/server";
import {
  BeneficiarioNoEncontradoError,
  BeneficiarioYaVinculadoError,
  DocumentoDuplicadoError,
  DocumentoInvalidoError,
  DocumentoNoCoincideError,
  DocumentoOcupadoError,
  EstadoInvalidoError,
  FechaInvalidaError,
  MarcasDespuesDelCeseError,
  NoEstaCesadoError,
  PuestoNoEncontradoError,
  TarifaInvalidaError,
  UsuarioNoEncontradoError,
  UsuarioYaVinculadoError,
} from "@/lib/db/rrhh-colaboradores.db";

/**
 * Traduce los errores de negocio de `ColaboradoresDB` al código HTTP del
 * contrato (ADR-414 §API). `null` = no es uno de estos: el caller sigue con
 * su propio manejo (typicamente 503 + log).
 */
export function respuestaErrorColaborador(e: unknown): NextResponse | null {
  if (e instanceof DocumentoDuplicadoError) {
    return NextResponse.json(
      { error: "documento_duplicado", colaboradorId: e.existente.id, nombre: e.existente.nombre, message: e.message },
      { status: 409 },
    );
  }
  if (e instanceof DocumentoInvalidoError) {
    return NextResponse.json({ error: "documento_invalido", message: e.message }, { status: 422 });
  }
  if (e instanceof DocumentoNoCoincideError) {
    return NextResponse.json({ error: "documento_no_coincide", message: e.message }, { status: 409 });
  }
  if (e instanceof DocumentoOcupadoError) {
    return NextResponse.json(
      { error: "documento_ocupado", colaboradorId: e.existente.id, nombre: e.existente.nombre, message: e.message },
      { status: 409 },
    );
  }
  if (e instanceof PuestoNoEncontradoError) {
    return NextResponse.json({ error: "puesto_no_encontrado", message: e.message }, { status: 404 });
  }
  if (e instanceof BeneficiarioNoEncontradoError) {
    return NextResponse.json({ error: "beneficiario_no_encontrado", message: e.message }, { status: 404 });
  }
  if (e instanceof BeneficiarioYaVinculadoError) {
    return NextResponse.json({ error: "beneficiario_ya_vinculado", message: e.message }, { status: 409 });
  }
  if (e instanceof UsuarioNoEncontradoError) {
    return NextResponse.json({ error: "usuario_no_encontrado", message: e.message }, { status: 404 });
  }
  if (e instanceof UsuarioYaVinculadoError) {
    return NextResponse.json({ error: "usuario_ya_vinculado", message: e.message }, { status: 409 });
  }
  if (e instanceof EstadoInvalidoError) {
    return NextResponse.json({ error: "estado_invalido", message: e.message }, { status: 409 });
  }
  if (e instanceof NoEstaCesadoError) {
    return NextResponse.json({ error: "no_esta_cesado", message: e.message }, { status: 409 });
  }
  if (e instanceof MarcasDespuesDelCeseError) {
    return NextResponse.json(
      { error: "marcas_despues_del_cese", n: e.n, primera: e.primera, message: e.message },
      { status: 409 },
    );
  }
  if (e instanceof TarifaInvalidaError) {
    return NextResponse.json({ error: "tarifa_invalida", message: e.message }, { status: 422 });
  }
  if (e instanceof FechaInvalidaError) {
    return NextResponse.json({ error: "fecha_invalida", message: e.message }, { status: 422 });
  }
  return null;
}
