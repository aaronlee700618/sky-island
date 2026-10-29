#!/usr/bin/env bash
# 做完 Lab 把會產生費用的東西關掉
set -uo pipefail
source "$(dirname "$0")/00_env.sh"

echo "1. 刪 Cloud Run 服務"
gcloud run services delete "$SERVICE" --project "$PROJECT" --region "$REGION" --quiet

echo "2. 刪 Cloud Build 建出來的映像檔（Artifact Registry 會按容量收一點點錢）"
gcloud artifacts docker images list "$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$SERVICE" \
  --project "$PROJECT" --format="value(package,version)" 2>/dev/null | while read -r pkg ver; do
  gcloud artifacts docker images delete "$pkg@$ver" --project "$PROJECT" --quiet --delete-tags
done

echo "3. Firebase Hosting 下架（網址會變成 Site Not Found；Hosting 本身不收固定費）"
firebase hosting:disable --project "$PROJECT" --force 2>/dev/null || echo "   沒有 firebase CLI 就略過，到 Firebase 主控台手動 Disable"

echo "清理完成"
