# 部署说明（VPS：Debian 13 + nginx，无容器）

域名 `id.hub.tt2.li` 已 A 记录解析到 103.42.182.181。架构：nginx 托管前端静态文件 `dist/`，并把 `/api/` 反代到本机 8377 端口的 Node 后端（systemd 常驻）。

## 1. 上传代码

在本地项目目录执行（把 `dist/`、`server/` 打包上传）：

```bash
npm run build
tar czf /tmp/idcard.tar.gz dist server
scp /tmp/idcard.tar.gz root@103.42.182.181:/tmp/
```

## 2. VPS 上解压安装

```bash
mkdir -p /var/www/id.hub.tt2.li /opt/idcard
tar xzf /tmp/idcard.tar.gz -C /var/www/id.hub.tt2.li dist
tar xzf /tmp/idcard.tar.gz -C /opt/idcard server
mkdir -p /opt/idcard/server/data
```

说明：VPS 已有 Node v24，后端零依赖，无需 npm install。

## 3. systemd 服务 `/etc/systemd/system/idcard.service`

```ini
[Unit]
Description=HDU idcard backend
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/idcard/server/server.cjs
WorkingDirectory=/opt/idcard/server
Restart=always
RestartSec=3
User=root
Environment=NODE_ENV=production
# 如需修改管理员账号密码，取消下行注释：
# Environment=IDCARD_ADMIN_USER=cran IDCARD_ADMIN_PASS=cran

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now idcard
curl -s http://127.0.0.1:8377/api/health   # 应输出 {"ok":true,...}
```

## 4. nginx 站点 `/etc/nginx/sites-enabled/id.hub.tt2.li`

```nginx
server {
    listen 80;
    server_name id.hub.tt2.li;
    root /var/www/id.hub.tt2.li/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8377;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 30m;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

## 5. 签发 SSL 证书

复用现有 certbot，扩容签发（会自动改写 nginx 配置并 reload）：

```bash
certbot --nginx -d id.hub.tt2.li
```

## 6. 验证

- <https://id.hub.tt2.li> 首页可打开，提交一条记录；
- <https://id.hub.tt2.li/admin> 用 cran / cran 登录，能看到刚提交的记录；
- 导出 PNG/JPG/TIFF、ZIP 批量导入均正常。

## 7. 更新流程

```bash
# 本地
npm run build && tar czf /tmp/idcard.tar.gz dist server
scp /tmp/idcard.tar.gz root@103.42.182.181:/tmp/
# VPS
tar xzf /tmp/idcard.tar.gz -C /var/www/id.hub.tt2.li dist
tar xzf /tmp/idcard.tar.gz -C /opt/idcard server
systemctl restart idcard
```
