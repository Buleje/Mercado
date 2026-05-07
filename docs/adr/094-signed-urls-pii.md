# ADR-094 — Signed URLs para PII (delivery proofs, payment proofs)

- **Status:** Accepted
- **Date:** 2026-05-05
- **Deciders:** Brandon (owner), Architect agent
- **Tags:** security, storage, pii, supabase, ley-29733

---

## Context

Buleje almacena en Supabase Storage **artefactos visuales con PII**:

- Foto de prueba de entrega (delivery proof): puede mostrar la fachada
  de la casa del cliente, su rostro, la firma manuscrita.
- Captura de Yape / comprobante de pago: muestra nombre completo,
  últimos dígitos del teléfono, monto, hora.
- Documentos de vendor onboarding: DNI, RUC, foto del local.
- (Futuro) XMLs SUNAT con datos del comprador.

El patrón histórico era usar `supabase.storage.from(bucket).getPublicUrl(path)`
con paths determinísticos:

```
proofs/{orderId}/proof.jpg
proofs/{orderId}/signature.png
yape/{conversationId}/{ts}.jpg
```

El bucket está marcado como **público** y la URL no requiere
autenticación. Aunque CUIDs son largos, el path es enumerable a través
de `orderId` (que es secuencial en algunos casos legacy) y de
`conversationId`. Ataque trivial:

```bash
for i in $(seq 1 100000); do curl -s https://.../proofs/$i/proof.jpg -o $i.jpg; done
```

Esto viola la **Ley 29733 PE** (datos personales) y nuestro compromiso
GDPR-equivalente con clientes.

## Decision

Adoptamos como **patrón canónico** para todo PII en storage:

### 1. Bucket privado + UUID v4 criptográfico en path

```ts
import { randomUUID } from "node:crypto";

const fileId = randomUUID();          // 36 chars, 122 bits de entropía
const path = `delivery-proofs/${fileId}.jpg`;

await supabase.storage
  .from("private-pii")
  .upload(path, file, { contentType: "image/jpeg", upsert: false });

// Persistir SOLO el path en DB
await prisma.deliveryProof.create({
  data: { orderId, tenantId, path, uploadedAt: new Date() },
});
```

**Reglas:**

1. El bucket `private-pii` es **privado**. La policy de Supabase rechaza
   cualquier GET sin token firmado.
2. El path **nunca incluye** identificadores enumerables (`orderId`,
   `customerId`, `conversationId`). Sólo el UUID.
3. La asociación `path ↔ recurso` se guarda en una tabla de la DB. Esa
   tabla tiene `tenantId` (ADR-093 aplica para lookup).

### 2. Generación on-demand de signed URL en GET autenticado

```ts
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await requireAdmin(req, ["delivery_partner", "admin"]);
  const tenantId = auth.tenantId;

  const proof = await prisma.deliveryProof.findFirst({
    where: { id: ctx.params.id, tenantId },          // ADR-093
    select: { path: true },
  });
  if (!proof) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await supabase.storage
    .from("private-pii")
    .createSignedUrl(proof.path, 60 * 60);            // 60 min

  if (error || !data) {
    return NextResponse.json({ error: "signing_failed" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
```

**TTL recomendados por tipo:**

| Tipo de PII | TTL signed URL | Justificación |
|---|---|---|
| Delivery proof (admin viendo) | 60 min | Sesión de revisión típica |
| Yape capture (validador IA) | 5 min | Pipeline interno, lectura única |
| Vendor docs (compliance review) | 24 h | Sesión larga + descargas |
| SUNAT XML (futuro) | 15 min | Solo lectura puntual |

### 3. Aplicación inmediata (lista de migración)

| Endpoint | Estado actual | Acción |
|---|---|---|
| `app/api/delivery/me/assignments/[id]/proof` | **Aplicado 2026-05-05** | — |
| `app/api/whatsapp/yape-capture` | Path determinístico | Migrar a UUID v4 |
| `app/api/marketplace/payment-proof` | Path con `orderId` | Migrar a UUID v4 |
| `app/api/supplier/register` (DNI/RUC) | `getPublicUrl` | Migrar a bucket privado |
| `app/api/sunat/comprobante/*/pdf` (futuro) | — | Nacer ya en privado |

### 4. Logging y revocación

Cada `createSignedUrl` debe loggear `{userId, tenantId, path, ttl}` en
`audit_log`. La revocación de un signed URL no es directa en Supabase
(las URLs son self-contained); para casos donde se sospeche abuso, se
debe **mover el archivo** a otro path (cambia el HMAC implícito).

## Trade-offs / Consequences

**Positivo:**
- Brute force imposible: 122 bits de entropía + bucket privado.
- Cumplimiento Ley 29733 / GDPR — sólo la URL firmada vive 1 hora.
- Audit log completo de quién accedió a qué PII.

**Negativo:**
- 1 round-trip extra: el cliente pide la URL al backend y luego al
  storage. Latencia +50ms p50.
- Las URLs firmadas no son cacheables fuerte: cada request genera una
  nueva. Aceptable para PII.
- Migración de PII existente: scripts de re-upload con UUID + UPDATE
  en DB. ~3000 archivos delivery proofs hoy.

**Riesgo residual:**
- Si un admin comparte la signed URL fuera de Buleje durante la
  ventana de 60 min, hay leak. Mitigación parcial: añadir watermark
  (overlay con `userId@timestamp`) en el render del proof, no en el
  storage.

## Alternatives considered

1. **Token JWT en query param hacia un endpoint propio que streamea
   el archivo.** Más control, pero el endpoint se vuelve un proxy
   pesado. Supabase signed URL ya hace lo correcto.
2. **Cifrar el archivo con clave por tenant.** Excesivo para fotos de
   entrega. Reservar para futuros flujos de KYC/AML.
3. **Path con CUID en lugar de UUID v4.** CUID es ordenable en el
   tiempo — leak indirecto de cuándo se subió la foto. UUID v4 es
   uniforme aleatorio.
4. **Bucket público con paths >256 bits.** Funciona criptográficamente
   pero pierde la auditoría: cualquiera con la URL puede acceder
   indefinidamente.
