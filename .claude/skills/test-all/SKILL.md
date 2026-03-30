---
name: test-all
description: Ejecutar la suite completa de verificacion del proyecto (lint, build, unit tests, e2e). Usar cuando el usuario quiera validar que todo funciona correctamente.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep
---

# Test All — Buleje

Ejecutar la suite completa de verificacion para el proyecto Buleje.

## Pasos

Todos los comandos se ejecutan desde el directorio `buleje/`.

### 1. Lint

```bash
cd buleje && npm run lint
```

Registrar resultado: cantidad de errores y warnings.

### 2. Build

```bash
cd buleje && npm run build
```

Registrar resultado: si compilo exitosamente o fallo, y los errores relevantes.

### 3. Unit tests

```bash
cd buleje && npm run test
```

Registrar resultado: cantidad de tests passed, failed, skipped.

### 4. E2E tests (si estan disponibles)

```bash
cd buleje && npm run test:e2e
```

Si el comando no existe o no hay tests e2e configurados, marcar como "Omitido" en el reporte.

Registrar resultado: cantidad de tests passed, failed.

## Reporte final

Al terminar TODOS los pasos, mostrar esta tabla resumen:

| Paso | Estado | Detalles |
|------|--------|----------|
| Lint | (completado/fallido) | Errores: X, Warnings: Y |
| Build | (completado/fallido) | Tiempo de build o mensaje de error |
| Unit Tests | (completado/fallido) | X passed, Y failed, Z skipped |
| E2E Tests | (completado/fallido/omitido) | X passed, Y failed |

## Reglas

- Ejecutar TODOS los pasos aunque alguno falle — el reporte debe estar completo
- No intentar corregir errores automaticamente; solo reportar
- Si un paso tarda mas de 5 minutos, reportar timeout
- Incluir los mensajes de error relevantes en la columna "Detalles"
