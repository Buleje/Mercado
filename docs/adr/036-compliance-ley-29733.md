# ADR-036 — Compliance Ley 29733 Perú — Protección Legal vs Riesgo de S/500k

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-001 (multi-tenancy), ADR-013 (chat security), ADR-025 (Phase 2)

---

## 1. Contexto

La Ley 29733 de Protección de Datos Personales aplica a TODO tratamiento de datos personales en Perú. Buleje procesa: nombres, DNI, teléfonos, direcciones, historial de compras, datos de fiado (crédito), y datos de pago. Como SaaS multi-tenant, el riesgo se multiplica por cada bodega conectada.

**Multa máxima:** 100 UIT (~S/500,000). No es teórica — la ANPD ha multado a empresas peruanas.

**Sin este ADR:** El sistema maneja datos personales sin audit log, sin mecanismo de export/delete, sin registro de consentimientos, y sin procedimiento de brechas. Esto es ilegalpara una empresa que procesa datos de clientes.

## 2. Decisión

Implementar compliance completa Ley 29733 con 7 componentes técnicos:

### Audit log inmutable
- Prisma middleware auto-intercepta queries en tablas sensibles (Customer, Order, Fiado, Payment, Invoice, Address)
- Hash chain SHA-256 para detectar tampering
- Append-only (trigger PostgreSQL rechaza UPDATE/DELETE)
- Retención 5 años mínimo

### 5 endpoints de compliance
| Endpoint | Artículo | Función |
|---|---|---|
| `/api/compliance/data-export` | Art. 18-20 | Export completo por DNI |
| `/api/compliance/data-delete` | Art. 21 | Soft-delete con 30 días gracia |
| `/api/compliance/access-log` | Art. 18 | Quién accedió a datos |
| `/api/compliance/consent` | Art. 13-14 | Registro de consentimientos |
| `/api/compliance/breach-report` | Art. 38 | Reporte interno + template ANPD |

### Skills de operación
- `/compliance-status` — dashboard de cumplimiento
- `/gdpr-export [DNI]` — export legal
- `/audit-search [DNI]` — búsqueda de accesos

## 3. Alternativas evaluadas

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| Compliance manual | Sin costo técnico | Alto riesgo de multa, no escalable | ❌ |
| DPO externo ($$$) | Expertise legal | $500-2000/mes, no integrado al código | ❌ |
| Logging mínimo | Rápido | Insuficiente para Ley 29733 | ❌ |
| Compliance full con audit log | Protección legal completa | Complejidad técnica, leve impacto en performance | ✅ |

## 4. Consecuencias

✅ Protección legal contra multas de hasta S/500,000
✅ Cada acceso a datos personales queda registrado
✅ Clientes pueden ejercer sus derechos (acceso, eliminación)
✅ Procedimiento de brechas documentado (72 hrs ANPD)
⚠️ Audit log crece (particionado mensual mitiga)
⚠️ Prisma middleware añade latencia (mitigado con fire-and-forget)
⚠️ Registro ante ANPD requiere acción manual de Brandon

## 5. Estado

- [x] Prisma middleware auto-logging
- [x] Hash chain SHA-256
- [x] 5 endpoints de compliance
- [x] 3 skills de operación
- [x] Documento legal LEY_29733_COMPLIANCE.md
- [x] ADR-036
- [ ] Registro ante ANPD (acción manual)
- [ ] Migración Prisma para tabla audit_log (requiere DIRECT_URL)
- [ ] Tests de integración de endpoints
