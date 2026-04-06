# Vercel Rolling Releases — Setup Guide

## Qué es
Rolling Releases permite hacer deployments graduales (canary) en Vercel.
En lugar de enviar el 100% del tráfico a la nueva versión de golpe,
puedes enviar un 5% → 25% → 50% → 100% con monitoreo entre cada paso.

## Cómo activar

### 1. Dashboard de Vercel
1. Ir a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Seleccionar el proyecto **Bodega San Martín**
3. Settings → General → Rolling Releases
4. Activar "Enable Rolling Releases"

### 2. Configurar estrategia
Recomendado para producción:
- **Stage 1**: 5% del tráfico → esperar 30 min → monitorear errores
- **Stage 2**: 25% del tráfico → esperar 15 min
- **Stage 3**: 50% del tráfico → esperar 10 min
- **Stage 4**: 100% del tráfico (rollout completo)

### 3. Métricas a monitorear entre stages
- Error rate en Sentry (debe mantenerse < 1%)
- Latencia p95 en Vercel Analytics (debe ser < 500ms)
- Core Web Vitals (LCP, FID, CLS)

### 4. Rollback automático
Si alguna métrica se degrada:
- Vercel detiene el rollout automáticamente
- El tráfico regresa a la versión anterior
- Se crea un alert en el dashboard

## Cuándo usar
- **Siempre** en deploys a producción con cambios significativos
- **Opcional** para fixes menores o cambios de documentación
- **Recomendado** después de migraciones de BD o cambios de schema

## Referencia
- [Vercel Rolling Releases Docs](https://vercel.com/docs/rolling-releases)
- GA desde Junio 2025
