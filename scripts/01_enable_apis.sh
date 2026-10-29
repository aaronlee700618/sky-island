#!/usr/bin/env bash
# 把這次會用到的 API 一次打開（已開的會直接跳過）
set -euo pipefail
source "$(dirname "$0")/00_env.sh"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  --project "$PROJECT"
echo "API 都開好了"
