#!/usr/bin/env bash
# 路線二：Cloud Run 跑一個 nginx 容器
# --source 會把目前資料夾丟給 Cloud Build 建映像檔，本機不用裝 Docker
set -euo pipefail
source "$(dirname "$0")/00_env.sh"
cd "$(dirname "$0")/.."

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --port 8080 \
  --quiet

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format="value(status.url)"
