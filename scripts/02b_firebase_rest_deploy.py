#!/usr/bin/env python3
"""不裝 firebase CLI 也能部署：直接呼叫 Firebase Hosting 的 REST API。

firebase deploy 底下做的其實就是這五步：
  1. 開一個新版本（帶 firebase.json 的 headers 設定）
  2. 告訴它每個檔案壓縮後的 sha256
  3. 把它說「還沒有」的檔案上傳
  4. 把版本標成 FINALIZED
  5. 發布（release）

用法：
  export PROJECT=你的專案ID
  python3 scripts/02b_firebase_rest_deploy.py
只需要 gcloud 已登入；Firebase 要先加到專案（01_enable_apis.sh 之後跑過 02_firebase_hosting.sh，或在 Firebase 主控台加）。
"""
import gzip
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

PROJECT = os.environ.get("PROJECT")
if not PROJECT:
    sys.exit("請先 export PROJECT=你的專案ID")
SITE = os.environ.get("SITE", PROJECT)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "site"))
API = "https://firebasehosting.googleapis.com/v1beta1"

TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()


def call(method, url, body=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": ctype,
        "x-goog-user-project": PROJECT,
    })
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url}\n{e.code} {e.read().decode()[:800]}")


# 1. 新版本：把 firebase.json 的 headers 轉成 API 的格式
hosting = json.load(open(os.path.join(HERE, "..", "firebase.json"), encoding="utf-8"))["hosting"]
api_headers = [
    {"glob": rule["source"], "headers": {h["key"]: h["value"] for h in rule["headers"]}}
    for rule in hosting.get("headers", [])
]
version = call("POST", f"{API}/sites/{SITE}/versions", {
    "config": {"headers": api_headers, "cleanUrls": bool(hosting.get("cleanUrls", False))}
})
vname = version["name"]
print("版本：", vname)

# 2. 每個檔案 gzip 後算 sha256
files = {}
for dirpath, _, names in os.walk(ROOT):
    for n in names:
        if n.startswith("."):
            continue
        full = os.path.join(dirpath, n)
        rel = "/" + os.path.relpath(full, ROOT).replace(os.sep, "/")
        gz = gzip.compress(open(full, "rb").read(), mtime=0)
        files[rel] = (hashlib.sha256(gz).hexdigest(), gz)
print(f"檔案：{len(files)} 個")

pop = call("POST", f"{API}/{vname}:populateFiles", {"files": {p: h for p, (h, _) in files.items()}})
need = set(pop.get("uploadRequiredHashes", []))
print(f"要上傳：{len(need)} 個（其他的 Firebase 已經有一樣的內容）")

# 3. 上傳
by_hash = {h: gz for (h, gz) in files.values()}
for h in need:
    call("POST", f"{pop['uploadUrl']}/{h}", raw=by_hash[h], ctype="application/octet-stream")

# 4. 定稿、5. 發布
call("PATCH", f"{API}/{vname}?update_mask=status", {"status": "FINALIZED"})
call("POST", f"{API}/sites/{SITE}/releases?versionName={vname}", {})
print(f"部署完成：https://{SITE}.web.app")
