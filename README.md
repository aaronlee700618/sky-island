# 東東的天空之島

- 影片：https://youtu.be/QG00HMouaR0 （政策島怎麼做的？AI 兩天做一座島、免費放哪裡、搬上 GCP 要多少錢）

- 成品：https://dong-dong-gcp-3.web.app （Firebase Hosting）／ https://sky-island-600195576280.asia-east1.run.app （Cloud Run）

五座漂在雲上的六邊形小島：瀏覽器、前端、後端、資料庫、雲端。切換三個情境（空島模式、加投票功能、加 AI 問答），看一座網站哪幾塊會亮起來、哪幾塊才真的要錢、每一塊要顧什麼資安。

這是「雲端架構師養成班」的教學範例，用來說明 2026 年流行的「XX 島」互動網站背後的結構：**純靜態、沒有後端、沒有資料庫、沒有追蹤碼**。

## 技術

- 原生 HTML、CSS、JavaScript 模組，不用框架、不用打包工具
- Three.js 0.186.1 放在 `site/vendor/three/`，不吃外部 CDN
- 所有 3D 模型用程式畫，沒有外部模型檔
- 內容全部在 `site/data.json`，改文字不用碰程式
- 使用者沒有任何資料會送出去

## 本機預覽

```bash
cd site
python3 -m http.server 8000
# 打開 http://localhost:8000
```

## 部署

兩條真的做：

| 路線 | 腳本 | 適合 |
|---|---|---|
| Firebase Hosting | `scripts/02_firebase_hosting.sh`（或不用 CLI 的 `02b_firebase_rest_deploy.py`） | 最省事，沒綁卡也能用 |
| Cloud Run 跑 nginx 容器 | `scripts/03_cloud_run.sh` | 之後要加後端的人 |

```bash
export PROJECT=你的專案ID
./scripts/01_enable_apis.sh
./scripts/02_firebase_hosting.sh   # 在 Cloud Shell 跑
./scripts/03_cloud_run.sh
./scripts/99_cleanup.sh            # 做完關掉
```

第三條「Cloud Storage + Cloud CDN + HTTPS 負載平衡器」在教材裡用架構圖說明。

## 授權

程式 MIT。
