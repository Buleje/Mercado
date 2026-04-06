#!/bin/bash
# Setup Doppler for Bodega San Martin
# Prerequisites: Install Doppler CLI -> https://docs.doppler.com/docs/install-cli

set -e

echo "Configurando Doppler para Bodega San Martin..."
echo ""

# Check if Doppler is installed
if ! command -v doppler &> /dev/null; then
    echo "Doppler CLI no esta instalado."
    echo ""
    echo "Instalar con:"
    echo "  Windows: winget install DopplerHQ.doppler"
    echo "  macOS:   brew install dopplerhq/cli/doppler"
    echo "  Linux:   curl -sLf https://cli.doppler.com/install.sh | sh"
    echo ""
    exit 1
fi

# Login
echo "1. Iniciando sesion en Doppler..."
doppler login

# Setup project
echo "2. Configurando proyecto..."
doppler setup --project bodega-san-martin --config dev

# Verify
echo "3. Verificando secretos..."
doppler secrets --only-names

echo ""
echo "Doppler configurado correctamente!"
echo ""
echo "Uso:"
echo "  Desarrollo:  doppler run -- npm run dev"
echo "  Produccion:  doppler run --config prd -- npm run start"
echo "  CI/CD:       Usar DOPPLER_TOKEN como secret en GitHub Actions"
echo ""
echo "Variables a migrar desde .env.local:"
echo "  DATABASE_URL, DIRECT_URL, AUTH_SECRET,"
echo "  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,"
echo "  SENTRY_DSN, REDIS_URL, SMTP_USER, SMTP_PASS"
