#!/bin/bash
# Levanta en LOCAL (Docker, sin AWS) la misma pila que correrá en la instancia,
# con los mismos pasos y orden que instancia/bootstrap.sh, para probar ANTES de
# gastar un dólar. Qué cambia respecto a producción (y solo esto):
#   · Caddy escucha en http://localhost:8080 (sin TLS ni Let's Encrypt)
#   · volúmenes con nombre en vez de /data/...
#   · MAILER_AUTOCONFIRM=true (no hay SMTP)
#   · llaves aleatorias en .trabajo/.env en vez de SSM
# Lo que esto NO prueba: SSM, systemd, S3, DLM, el disco EBS, TLS real ni el
# user-data. Eso solo se ve en AWS.
#
# Uso (Git Bash, desde esta carpeta):   bash arranque-local.sh
# Luego, con las claves cargadas (set -a; . .trabajo/claves.txt; set +a):
#   node humo.mjs
#   desde la raíz del repo: SUPABASE_TEST_URL=http://localhost:8080 \
#     SUPABASE_TEST_ANON_KEY=$ANON_KEY SUPABASE_TEST_SERVICE_KEY=$SERVICE_ROLE_KEY npm run test:db
# Bajar y borrar todo:   cd .trabajo && docker compose down -v
set -euo pipefail
export MSYS_NO_PATHCONV=1
export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
cd "$(dirname "$0")"
REPO="$(cd ../../../.. && pwd)"
INSTANCIA="$(cd ../instancia && pwd)"

mkdir -p .trabajo/migraciones
sed -e 's|"80:80"|"8080:8080"|' -e '/"443:443"/d' \
    -e 's|/data/postgres:|yam_pg:|' -e 's|/data/storage:|yam_storage:|' -e 's|/data/caddy:|yam_caddy:|' \
    "$INSTANCIA/docker-compose.yml" > .trabajo/docker-compose.yml
printf '\nvolumes:\n  yam_pg:\n  yam_storage:\n  yam_caddy:\n' >> .trabajo/docker-compose.yml
cp "$INSTANCIA/Caddyfile" .trabajo/Caddyfile
cp "$REPO"/supabase/migrations/*.sql .trabajo/migraciones/
cp "$REPO"/docs/migracion-aws/staging-stubs/*.sql .trabajo/migraciones/
cd .trabajo

POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
SECRET_KEY_BASE=$(openssl rand -hex 48)

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
cat > .env <<ENV
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
SECRET_KEY_BASE=$SECRET_KEY_BASE
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
API_HOST=:8080
SITIO=localhost
ACME_EMAIL=prueba@localhost
MAILER_AUTOCONFIRM=true
SMTP_ADMIN_EMAIL=noreply@localhost
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=usuario
SMTP_PASS=clave
ENV
printf 'ANON_KEY=%s\nSERVICE_ROLE_KEY=%s\n' "$ANON_KEY" "$SERVICE_ROLE_KEY" > claves.txt

psql_db() { docker compose exec -T db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "== 1) base"
docker compose up -d db
for i in $(seq 1 60); do docker compose exec -T db pg_isready -U postgres -h localhost > /dev/null 2>&1 && break; sleep 5; done

echo "== 1a) contraseñas de los roles de servicio y esquema de Realtime"
docker compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  -v pgpass="$POSTGRES_PASSWORD" <<'SQL'
alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
alter user supabase_storage_admin with password :'pgpass';
create schema if not exists _realtime;
alter schema _realtime owner to supabase_admin;
SQL

echo "== 1b) auth y storage"
docker compose up -d auth storage
ok=f
for i in $(seq 1 60); do
  ok=$(psql_db -tAc "select to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null" 2>/dev/null || echo f)
  [ "$ok" = "t" ] && break
  sleep 5
done
[ "$ok" = "t" ] || { echo "auth/storage no crearon sus esquemas a tiempo" >&2; docker compose logs --tail 30 auth storage >&2; exit 1; }

echo "== 2) migraciones y stubs"
n=0
for f in $(LC_ALL=C ls migraciones/*.sql | LC_ALL=C sort); do
  n=$((n+1))
  docker compose exec -T db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -1 < "$f" || { echo "FALLÓ $f" >&2; exit 1; }
done
echo "aplicadas: $n"

echo "== 3) rest, realtime, caddy"
docker compose up -d rest realtime caddy
echo "LISTO en http://localhost:8080  (claves en .trabajo/claves.txt)"
