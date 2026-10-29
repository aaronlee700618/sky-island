# 共用變數：先 source 這支，再跑其他腳本
#   export PROJECT=你的專案ID   （不設的話用 gcloud 目前的專案）
export PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
export REGION="${REGION:-asia-east1}"
export SERVICE="${SERVICE:-sky-island}"
echo "專案：$PROJECT ／ 區域：$REGION ／ Cloud Run 服務名：$SERVICE"
