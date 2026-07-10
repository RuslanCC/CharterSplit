#!/bin/sh
# STANDALONE certbot: получает реальный сертификат Let's Encrypt через webroot
# (nginx уже отдаёт /.well-known/acme-challenge/ с самоподписанным серта на 443),
# затем раз в 12ч продлевает. Реальный серт перезаписывает самоподписанный по тому же пути.
set -eu

: "${DOMAIN:?DOMAIN must be set}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL must be set}"

# CERTBOT_STAGING=1 → тестовый CA (без исчерпания лимитов). Убрать/0 для прод-серта.
STAGING_FLAG=""
if [ "${CERTBOT_STAGING:-0}" = "1" ]; then
  STAGING_FLAG="--staging"
fi

# Дадим nginx время подняться и начать отдавать webroot.
sleep 10

obtain() {
  certbot certonly \
    --webroot -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${LETSENCRYPT_EMAIL}" \
    --agree-tos --no-eff-email --non-interactive \
    --keep-until-expiring \
    ${STAGING_FLAG} || echo "[certbot] issuance/renewal failed (проверьте DNS ${DOMAIN} → этот сервер и открытые порты 80/443)"
}

# Первый выпуск: если сейчас стоит самоподписанный (issuer == subject CN), certbot его заменит.
obtain

# Цикл продления.
while true; do
  sleep 12h &
  wait $! || true
  obtain
done
