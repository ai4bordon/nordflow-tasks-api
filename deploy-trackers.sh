#!/usr/bin/env bash
# Развёртывание трёх трекеров на vps_finland (185.250.181.60).
# Схема как у уже работающего l1.veynx.xyz: контейнер в сети dokploy-network,
# маршрут и сертификат выдаёт Traefik Dokploy через letsencrypt.
# Запуск: bash /root/deploy-trackers.sh
set -euo pipefail

BASE=/opt/trackers
NET=dokploy-network
IMAGE=node:20-alpine
PORT_IN=3000

# имя_контейнера : репозиторий : домен
APPS=(
  "nordflow:nordflow-tasks-api:nordflow.veynx.xyz"
  "habitflow:habitflow-api:habitflow.veynx.xyz"
  "tenderpulse:tenderpulse-api:tenderpulse.veynx.xyz"
)

mkdir -p "$BASE"

echo "==> образ $IMAGE"
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE"

for spec in "${APPS[@]}"; do
  IFS=: read -r NAME REPO DOMAIN <<<"$spec"
  DIR="$BASE/$NAME"

  echo
  echo "==> $NAME  ($DOMAIN)"

  if [ -d "$DIR/.git" ]; then
    git -C "$DIR" fetch --quiet origin main
    git -C "$DIR" reset --hard --quiet origin/main
  else
    git clone --quiet --depth 1 "https://github.com/ai4bordon/$REPO.git" "$DIR"
  fi

  # Правило Traefik собираем без обратных слэшей: бэктики внутри одинарных кавычек.
  RULE='Host(`'"$DOMAIN"'`)'

  docker rm -f "$NAME" >/dev/null 2>&1 || true

  docker run -d --name "$NAME" \
    --restart unless-stopped \
    --network "$NET" \
    -e PORT="$PORT_IN" \
    -v "$DIR:/app" -w /app \
    --label traefik.enable=true \
    --label "traefik.docker.network=$NET" \
    --label "traefik.http.routers.$NAME-http.entrypoints=web" \
    --label "traefik.http.routers.$NAME-http.middlewares=redirect-to-https@file" \
    --label "traefik.http.routers.$NAME-http.rule=$RULE" \
    --label "traefik.http.routers.$NAME-https.entrypoints=websecure" \
    --label "traefik.http.routers.$NAME-https.rule=$RULE" \
    --label "traefik.http.routers.$NAME-https.tls=true" \
    --label "traefik.http.routers.$NAME-https.tls.certresolver=letsencrypt" \
    --label "traefik.http.services.$NAME.loadbalancer.server.port=$PORT_IN" \
    "$IMAGE" node server.js >/dev/null

  sleep 2
  echo -n "    контейнер: "
  docker ps --filter "name=^$NAME$" --format '{{.Status}}'
  echo -n "    ответ внутри сети: "
  docker run --rm --network "$NET" curlimages/curl:latest -s -o /dev/null -w '%{http_code}' "http://$NAME:$PORT_IN/api/demo" 2>/dev/null || echo "?"
  echo
done

echo
echo "==> готово. Контейнеры:"
docker ps --filter "name=nordflow" --filter "name=habitflow" --filter "name=tenderpulse" --format '  {{.Names}}  {{.Status}}'
