# 天空之島：用 nginx 送靜態檔案的最小容器
# Cloud Run 會用環境變數 PORT 告訴容器要聽哪個埠，nginx 官方映像檔會自動把 templates 裡的 ${PORT} 換掉
FROM nginx:1.27-alpine
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY site/ /usr/share/nginx/html/
EXPOSE 8080
