#!/bin/bash
# Primer arranque de la instancia. Es corto A PROPÓSITO (el límite de user-data
# es 16 KB): instala Docker, monta el disco de datos y baja de S3 el "paquete"
# con compose, Caddy, bootstrap y migraciones. Nada secreto vive aquí: las
# llaves se generan en la máquina y quedan en SSM Parameter Store.
#
# Convención de la plantilla: para el shell solo se usa $VARIABLE sin llaves;
# las construcciones con llaves y signo de dólar las rellena Terraform.
set -euxo pipefail
exec > >(tee /var/log/yam-userdata.log) 2>&1

BUCKET="${bucket}"
REGION="${region}"
VOL="${volume_id}"
COMPOSE_VERSION="${compose_version}"

dnf install -y docker
systemctl enable --now docker

# Plugin de compose, con la versión fijada y comprobando el hash publicado en
# la misma versión. (Protege de una descarga corrupta; NO de un release
# comprometido: esa es la confianza que se le da a github.com/docker/compose.)
mkdir -p /usr/local/lib/docker/cli-plugins
BASE="https://github.com/docker/compose/releases/download/v$COMPOSE_VERSION"
curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose "$BASE/docker-compose-linux-aarch64"
curl -fsSL -o /tmp/compose.sha256 "$BASE/docker-compose-linux-aarch64.sha256"
echo "$(awk '{print $1}' /tmp/compose.sha256)  /usr/local/lib/docker/cli-plugins/docker-compose" | sha256sum -c -
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Disco de datos (el que sobrevive a la máquina). El volumen aparece como NVMe;
# su serial es el id sin el guion.
DEV="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_$(echo "$VOL" | tr -d '-')"
for i in $(seq 1 60); do [ -e "$DEV" ] && break; sleep 5; done
[ -e "$DEV" ]
blkid "$DEV" || mkfs.xfs -L yamdata "$DEV"
mkdir -p /data
grep -q yamdata /etc/fstab || echo "LABEL=yamdata /data xfs defaults,nofail 0 2" >> /etc/fstab
mount -a
mkdir -p /data/postgres /data/storage /opt/yam

# 2 GB de swap como colchón (decidido 2026-10-18: se empieza en t4g.medium, 4 GB).
# Evita que un pico de memoria mate a Postgres; no sustituye medir y, si aprieta,
# subir a t4g.large. Vive en el disco raíz, no en el de datos.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  grep -q '^/swapfile' /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
swapon -a || true

# El paquete lo sube la persona que opera DESPUÉS del apply (el bucket no existe
# antes). Se espera hasta 60 minutos; si no llega, queda el log y no pasa nada.
for i in $(seq 1 120); do
  aws s3 cp "s3://$BUCKET/bootstrap/instancia.tgz" /tmp/instancia.tgz --region "$REGION" && break
  sleep 30
done
[ -s /tmp/instancia.tgz ]
tar -xzf /tmp/instancia.tgz -C /opt/yam

cat > /etc/yam.env <<ENV
BUCKET=$BUCKET
REGION=$REGION
API_HOST=${api_host}
SITIO=${sitio}
ACME_EMAIL=${correo_acme}
ENV
chmod 600 /etc/yam.env

bash /opt/yam/bootstrap.sh
