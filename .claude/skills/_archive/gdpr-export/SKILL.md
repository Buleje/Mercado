---
name: gdpr-export
description: |
  Genera export legal completo de datos de un cliente por DNI.
  Cumple Ley 29733 Art. 18-20 (derecho de acceso).
  Usar cuando un cliente pida sus datos o Brandon diga "export de datos",
  "dame los datos de [cliente]", "gdpr export", "derecho de acceso".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[DNI 8 dígitos]"
model: haiku
---

# GDPR Export — Derecho de Acceso (Ley 29733 Art. 18-20)

## Algoritmo

```
1. Validar DNI (8 dígitos)
2. Llamar POST /api/compliance/data-export con { dni, tenantId }
3. Recibir JSON con TODOS los datos del cliente:
   - Datos personales (nombre, DNI, teléfono, email, dirección)
   - Historial de compras (órdenes, items, montos)
   - Historial de fiados (créditos, pagos, saldos)
   - Boletas/facturas emitidas
   - Consentimientos otorgados
   - Log de accesos a sus datos
4. Formatear en tabla visual para Brandon
5. Ofrecer: "¿Guardar como JSON?" → archivo en reports/compliance/
```

## Plazo legal

La Ley 29733 da máximo 30 días calendario para responder. Nuestro sistema lo hace en segundos.

## Reglas

1. **Audit log obligatorio** — el acto de exportar se registra.
2. **Solo admin** puede ejecutar exports.
3. **Nunca mostrar datos de otros clientes** en el mismo export.
