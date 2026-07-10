#!/bin/sh
# STANDALONE nginx entrypoint: решает cold-start проблему TLS.
# 1) если реального серта ещё нет — создаём временный самоподписанный,
#    чтобы nginx смог поднять listen 443 ssl;
# 2) рендерим конфиг из шаблона (подстановка ${DOMAIN});
# 3) запускаем nginx и раз в 6ч перечитываем конфиг (подхватываем обновлённый серт).
set -eu

: "${DOMAIN:?DOMAIN must be set}"

LIVE="/etc/letsencrypt/live/${DOMAIN}"

if [ ! -f "${LIVE}/fullchain.pem" ]; then
  echo "[nginx-entrypoint] real cert not found — generating temporary self-signed for ${DOMAIN}"
  mkdir -p "${LIVE}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "${LIVE}/privkey.pem" \
    -out "${LIVE}/fullchain.pem" \
    -subj "/CN=${DOMAIN}" >/dev/null 2>&1
fi

# Рендерим только ${DOMAIN}, не трогая nginx-переменные ($host, $uri, ...).
export DOMAIN
envsubst '${DOMAIN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

nginx -g 'daemon off;' &
NGINX_PID=$!

# Периодический reload — подхватить обновлённый certbot'ом сертификат.
while true; do
  sleep 6h &
  wait $! || true
  nginx -s reload 2>/dev/null || true
done &

wait "${NGINX_PID}"
