#!/bin/bash
# Respaldo cada 6 horas. Publica la métrica RespaldoExitoso SOLO si todo salió
# bien; la alarma `yam-respaldo-no-se-hizo` suena si pasan 18 horas sin ella.
#
# Qué NO es: recuperación al minuto. El punto de recuperación es el último
# dump (hasta 6 h) o el último snapshot del disco (hasta 24 h).
set -euo pipefail
# shellcheck disable=SC1091
source /etc/yam.env
cd /opt/yam

FECHA=$(date -u +%Y%m%dT%H%M%SZ)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
DUMP="$TMP/yam-$FECHA.dump"

# Formato custom (-Fc): comprimido y restaurable por partes con pg_restore.
# supabase_admin es el superusuario de la imagen: lee también auth y storage.
docker compose exec -T db pg_dump -U supabase_admin -d postgres -Fc --no-owner > "$DUMP"

# Un dump vacío o ilegible NO cuenta como respaldo.
[ "$(stat -c %s "$DUMP")" -gt 10000 ]
docker compose exec -T db pg_restore -l < "$DUMP" > /dev/null

aws s3 cp "$DUMP" "s3://$BUCKET/dumps/yam-$FECHA.dump" --sse AES256 --only-show-errors --region "$REGION"
# Sin --delete: un archivo borrado por error en la app sigue en el respaldo.
aws s3 sync /data/storage "s3://$BUCKET/archivos/" --sse AES256 --only-show-errors --region "$REGION"

aws cloudwatch put-metric-data --namespace YAM/Respaldo --metric-name RespaldoExitoso --value 1 --region "$REGION"
echo "respaldo $FECHA ok"
