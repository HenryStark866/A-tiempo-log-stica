#!/bin/bash
# Se ejecuta UNA vez en el primer arranque (y es seguro repetirlo): genera las
# llaves, levanta la base y los servicios que migran sus propios esquemas, aplica
# las migraciones del proyecto y deja el respaldo programado.
#
# BORRADOR SIN PROBAR DE EXTREMO A EXTREMO. Probar primero en local con Docker.
set -euo pipefail
# shellcheck disable=SC1091
source /etc/yam.env
cd /opt/yam

P=/yam/instancia
getp() { aws ssm get-parameter --region "$REGION" --name "$P/$1" --with-decryption --query Parameter.Value --output text 2>/dev/null || true; }
putp() { aws ssm put-parameter --region "$REGION" --name "$P/$1" --type SecureString --value "$2" --no-overwrite > /dev/null; }

# Lee la llave de SSM; si no existe, la crea. Así una máquina reconstruida
# conserva las MISMAS llaves (si cambiara JWT_SECRET, todas las sesiones y las
# claves anon/service dejarían de valer).
secreto() {
  local v; v=$(getp "$1")
  if [ -z "$v" ] || [ "$v" = "None" ]; then v=$(openssl rand -hex "$2"); putp "$1" "$v"; fi
  echo "$v"
}
# Opcional: valor de SSM o el por omisión.
opcional() {
  local v; v=$(getp "$1")
  if [ -z "$v" ] || [ "$v" = "None" ]; then echo "$2"; else echo "$v"; fi
}

POSTGRES_PASSWORD=$(secreto postgres_password 24)
JWT_SECRET=$(secreto jwt_secret 32)
SECRET_KEY_BASE=$(secreto secret_key_base 48)

# Las claves anon y service_role son JWT firmados con JWT_SECRET. Se derivan, no
# se guardan: con el mismo secreto salen siempre iguales.
b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() {
  local h p s
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64)
  p=$(printf '%s' "$1" | b64)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64)
  echo "$h.$p.$s"
}
ANON_KEY=$(jwt '{"role":"anon","iss":"supabase","iat":1700000000,"exp":2300000000}')
SERVICE_ROLE_KEY=$(jwt '{"role":"service_role","iss":"supabase","iat":1700000000,"exp":2300000000}')

umask 077
cat > /opt/yam/.env <<ENV
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
SECRET_KEY_BASE=$SECRET_KEY_BASE
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
API_HOST=$API_HOST
SITIO=$SITIO
ACME_EMAIL=$ACME_EMAIL
MAILER_AUTOCONFIRM=$(opcional mailer_autoconfirm false)
SMTP_ADMIN_EMAIL=$(opcional smtp_admin_email noreply@$SITIO)
SMTP_HOST=$(opcional smtp_host localhost)
SMTP_PORT=$(opcional smtp_port 587)
SMTP_USER=$(opcional smtp_user usuario)
SMTP_PASS=$(opcional smtp_pass clave)
ENV
mkdir -p /data/caddy

psql_db() { docker compose exec -T db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

# 1) La base, y los dos servicios que crean sus propios esquemas (auth, storage):
#    las migraciones del proyecto dependen de auth.users y storage.objects.
docker compose up -d db
for i in $(seq 1 60); do docker compose exec -T db pg_isready -U postgres -h localhost > /dev/null 2>&1 && break; sleep 5; done
# La imagen crea los roles de servicio pero NO les pone la contraseña: sin esto
# GoTrue, Storage y PostgREST fallan con "password authentication failed"
# (lo encontró la prueba local). Es idempotente: se repite sin problema.
docker compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  -v pgpass="$POSTGRES_PASSWORD" <<'SQL'
alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
alter user supabase_storage_admin with password :'pgpass';
-- Realtime guarda su propio estado en `_realtime` (distinto del esquema
-- `realtime` de la imagen). La guía oficial lo crea con un realtime.sql; sin él
-- el contenedor muere en su primera migración.
create schema if not exists _realtime;
alter schema _realtime owner to supabase_admin;
SQL

docker compose up -d auth storage
for i in $(seq 1 60); do
  ok=$(psql_db -tAc "select to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null" 2>/dev/null || echo f)
  [ "$ok" = "t" ] && break
  sleep 5
done
[ "$ok" = "t" ] || { echo "auth/storage no crearon sus esquemas a tiempo" >&2; exit 1; }

# 2) Migraciones del proyecto + stubs de staging, una sola vez. Mismo orden que
#    el staging local (orden de nombre de archivo, bytes). Cada archivo en una
#    transacción, como hace el CLI de Supabase.
if [ ! -f /data/.esquema-aplicado ]; then
  for f in $(LC_ALL=C ls /opt/yam/migraciones/*.sql | LC_ALL=C sort); do
    echo "aplicando $(basename "$f")"
    docker compose exec -T db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -1 < "$f"
  done
  touch /data/.esquema-aplicado
fi

# 3) El resto de servicios y la puerta de entrada (Caddy saca el certificado).
docker compose up -d rest realtime caddy

# 4) Respaldo nocturno: 03:00 en Medellín = 08:00 UTC, una hora después del
#    snapshot de disco.
cat > /etc/systemd/system/yam-respaldo.service <<'UNIT'
[Unit]
Description=Respaldo de YAM (pg_dump y archivos a S3)
After=docker.service

[Service]
Type=oneshot
ExecStart=/opt/yam/respaldo.sh
UNIT
cat > /etc/systemd/system/yam-respaldo.timer <<'UNIT'
[Unit]
Description=Respaldo nocturno de YAM

[Timer]
OnCalendar=*-*-* 08:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
UNIT
chmod +x /opt/yam/respaldo.sh
systemctl daemon-reload
systemctl enable --now yam-respaldo.timer

echo "listo: https://$API_HOST (el certificado sale cuando el DNS de $API_HOST apunte a esta IP)"
