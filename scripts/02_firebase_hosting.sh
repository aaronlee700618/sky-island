#!/usr/bin/env bash
# 路線一：Firebase Hosting（全球 CDN、自動 HTTPS、沒綁卡也能用）
# 在 Cloud Shell 跑最省事：firebase CLI 已經裝好、帳號已經登入
set -euo pipefail
source "$(dirname "$0")/00_env.sh"
cd "$(dirname "$0")/.."

# 0. firebase CLI 跟 gcloud 是分開登入的，第一次要登入一次（照畫面開網址、貼回授權碼）
#    不想登入的話，改用 scripts/02b_firebase_rest_deploy.py，它只靠 gcloud 直接打 Hosting 的 API
if ! firebase login:list 2>/dev/null | grep -q "@"; then
  echo "firebase 還沒登入，照畫面開網址、貼回授權碼："
  firebase login --no-localhost
fi

# 1. 把 Firebase 加到這個 GCP 專案（只做一次；注意：加了就拆不掉，只能連專案一起刪）
if ! firebase projects:list 2>/dev/null | grep -q " $PROJECT "; then
  firebase projects:addfirebase "$PROJECT"
fi

# 2. 部署 site/ 資料夾（firebase.json 裡的 public）
firebase deploy --only hosting --project "$PROJECT" --non-interactive

echo "打開：https://$PROJECT.web.app"
