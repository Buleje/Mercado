# Cumplimiento Ley 29733 — Protección de Datos Personales (Perú)

**Última actualización:** 2026-04-10
**Responsable:** Brandon Buleje (Titular del Banco de Datos)
**ADR:** 036
**Multa máxima por incumplimiento:** 100 UIT (~S/500,000)

---

## 1. Mapeo de Requerimientos Legales → Implementación Técnica

| Artículo | Requerimiento | Implementación | Estado |
|---|---|---|---|
| Art. 5 | Principio de consentimiento | `POST /api/compliance/consent` — registro explícito con timestamp + IP | ✅ |
| Art. 8 | Principio de seguridad | Audit log inmutable con hash chain SHA-256, Prisma middleware auto-log | ✅ |
| Art. 11 | Conservación de datos | Retención 5 años mínimo, particionado mensual | ✅ |
| Art. 13-14 | Consentimiento informado | Endpoint de consent con tipos (processing, marketing, whatsapp, third_party) | ✅ |
| Art. 18-20 | Derecho de acceso | `POST /api/compliance/data-export` — export completo por DNI | ✅ |
| Art. 21 | Derecho de eliminación | `POST /api/compliance/data-delete` — soft-delete con 30 días gracia | ✅ |
| Art. 18 | Derecho a saber quién accedió | `POST /api/compliance/access-log` — consulta audit log | ✅ |
| Art. 38 | Notificación de brechas | `POST /api/compliance/breach-report` — reporte interno + template ANPD | ✅ |
| Art. 32 | Registro ante ANPD | [Pendiente — registro manual en https://www.gob.pe/anpd] | ⚠️ |

## 2. Política de Retención por Tipo de Dato

| Tipo de dato | Retención | Base legal | Acción al vencer |
|---|---|---|---|
| Datos de cliente (nombre, DNI, teléfono) | 5 años post-última transacción | Art. 11 Ley 29733 | Anonimizar (mantener estadísticas) |
| Historial de compras | 5 años | Obligación tributaria SUNAT | Mantener, anonimizar cliente |
| Boletas/facturas | 5 años | Código Tributario Art. 43 | Mantener íntegro (SUNAT) |
| Datos de fiado | 5 años post-cierre | Art. 11 + gestión de riesgo | Anonimizar |
| Consentimientos | Indefinido | Art. 14 — prueba de consentimiento | Nunca eliminar |
| Audit log | 5 años | Art. 8 + seguridad | Archivar comprimido |
| Datos de marketing | Hasta revocación de consentimiento | Art. 13 | Eliminar inmediatamente |

## 3. Procedimiento ante Brecha de Datos

### Timeline obligatorio (72 horas)

```
Hora 0: Detección de la brecha
  → Activar runbook tenant-isolation-breach (P0 MAX)
  → Preservar evidencia (NO borrar logs)
  → Notificar a Brandon inmediatamente

Hora 0-4: Evaluación inicial
  → Identificar datos afectados
  → Contar clientes impactados
  → Determinar si hubo acceso no autorizado real
  → Ejecutar POST /api/compliance/breach-report

Hora 4-24: Contención
  → Aplicar fix (si es código)
  → Revocar accesos comprometidos
  → Verificar que la brecha está cerrada

Hora 24-48: Documentación
  → Completar reporte de brecha
  → Preparar notificación para ANPD
  → Preparar notificación para clientes afectados

Hora 48-72: Notificación
  → Enviar reporte a ANPD (Autoridad Nacional de Protección de Datos)
  → Notificar a clientes afectados (si aplica)
  → Publicar medidas correctivas
```

### Plantilla de notificación a ANPD

```
ASUNTO: Notificación de incidente de seguridad — Ley 29733 Art. 38

Titular del Banco de Datos: [Brandon Buleje / Bodega San Martín]
RUC: [XXXXXXXXXXX]
Fecha de detección: [YYYY-MM-DD HH:MM]
Fecha de notificación: [YYYY-MM-DD] (dentro de 72 horas)

Descripción del incidente: [breve descripción]
Datos afectados: [tipos de datos comprometidos]
Número de titulares afectados: [N]
Medidas adoptadas: [acciones de contención]
Medidas correctivas: [acciones para prevenir recurrencia]

Contacto: [email] / [teléfono]
```

## 4. Plantilla de Respuesta a Solicitudes de Titulares

### Solicitud de acceso (Art. 18-20)

```
Estimado/a [nombre],

En respuesta a su solicitud de acceso a datos personales con fecha [fecha],
le informamos que hemos recopilado la siguiente información sobre usted:

[Adjunto: export JSON/PDF con todos los datos]

De acuerdo con la Ley 29733, usted tiene derecho a:
- Solicitar la rectificación de datos incorrectos
- Solicitar la eliminación de sus datos (con las excepciones legales)
- Revocar el consentimiento otorgado

Para ejercer estos derechos, contacte a: [email]

Atentamente,
Bodega San Martín
```

## 5. Lista de Encargados de Tratamiento

| Proveedor | Datos que procesa | Ubicación | DPA |
|---|---|---|---|
| **Supabase** | Todos los datos (DB principal) | US/EU | Incluido en ToS |
| **Vercel** | Logs de acceso, cookies de sesión | US | Incluido en ToS |
| **Stripe** | Datos de pago (tarjeta, nombre) | US | PCI DSS + DPA |
| **Twilio** | Teléfono del cliente (WhatsApp) | US | DPA disponible |
| **Sentry** | Stack traces (puede incluir PII en errores) | US | DPA disponible |
| **MercadoPago** | Datos de pago | Argentina/Perú | Ley local + DPA |

### Análisis de transferencias internacionales

La Ley 29733 Art. 33 permite transferencias a países con nivel adecuado de protección o con garantías contractuales. EEUU tiene Privacy Shield invalidado (Schrems II), pero:

- Supabase, Vercel, Stripe, Twilio ofrecen Standard Contractual Clauses (SCCs)
- Los datos mínimos necesarios se transfieren (principio de minimización)
- Se recomienda evaluar hosting en región para datos sensibles cuando se escale

## 6. Registro ante ANPD

**Estado:** ⚠️ Pendiente

La Ley 29733 requiere registrar el banco de datos ante la ANPD:
- URL: https://www.gob.pe/anpd
- Formulario: Registro de Banco de Datos Personales
- Plazo: Antes de iniciar operaciones comerciales con datos de terceros

**Acción requerida:** Brandon debe completar el registro manualmente.

---

## 7. Implementación técnica (resumen)

| Componente | Path | Función |
|---|---|---|
| Prisma middleware | `lib/audit/prisma-middleware.ts` | Auto-log de accesos a datos personales |
| Hash chain | `lib/audit/hash-chain.ts` | SHA-256 para integridad del audit log |
| Data export | `app/api/compliance/data-export/route.ts` | Derecho de acceso |
| Data delete | `app/api/compliance/data-delete/route.ts` | Derecho al olvido |
| Access log | `app/api/compliance/access-log/route.ts` | Quién vio qué |
| Consent | `app/api/compliance/consent/route.ts` | Registro de consentimientos |
| Breach report | `app/api/compliance/breach-report/route.ts` | Reporte de brechas |
| Skills | `/compliance-status`, `/gdpr-export`, `/audit-search` | Operación desde Claude |

---

> Este documento debe revisarse cada 6 meses o ante cambios en la Ley 29733.
> Última revisión: 2026-04-10
