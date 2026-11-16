# VPS 上线

适用：Linux VPS、一个域名、一个实例、持久化磁盘。建议2核4GB内存及足够磁盘。先将域名A记录指向服务器；开放80/443，3000不对外开放。服务器需安装 Docker Engine 和 Compose v2，参考[Docker官方安装说明](https://docs.docker.com/engine/install/)。

## 1. 上传与配置

上传源码包并解压，在项目目录执行：

```bash
cp deploy/production.env.example .env.production
chmod 600 .env.production
openssl rand -hex 24
```

将随机密码填入 `ACCESS_PASSWORD`；填写实际 `APP_DOMAIN`、`APP_ORIGIN=https://实际域名`、服务端 `DEEPSEEK_API_KEY`。APP_ORIGIN只能为根地址，不带路径；ACCESS_USER默认nestopia。不要把密钥当登录密码，不要将环境文件发给他人。

本版为一个共享工作空间；登录用户可查看、修改和删除所有项目记录。HTTPS启用后浏览器弹出用户名密码登录框。不要向无授权用户分发密码。

## 2. 构建并启动

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 app caddy
```

Caddy自动签发HTTPS证书。镜像包含Poppler，用于直接读取官方PDF。首次编译需要联网，等待完成后再访问域名。

在已安装Node并完成npm ci的环境可先运行 `npm run check:release -- .env.production`；该命令验证配置，不打印密钥。不要把 `.env.local` 上传至服务器。

## 3. 持久化与备份

每份备份目录包含nestopia.sqlite、不可变原始PDF目录sources及清单。数据库在命名卷 `app-data:/app/data`，容器重建不会清空。备份：

```bash
docker compose exec -T app npm run backup
mkdir -p backups
docker compose cp app:/app/data/backups/. ./backups/
```

每日执行并把备份复制到服务器之外，备份包含地址和报告，按敏感数据保存。应配置磁盘占用告警及保留策略。`docker compose down`保留卷；**不要执行down -v**。

恢复时先备份当前文件，再停止app、用临时app容器复制选定备份的SQLite快照到 `/app/data/nestopia.sqlite`、sources目录到 `/app/data/sources`，恢复node用户读写权限，最后启动app。不要把运行中快照覆盖到正在工作的实例。锁文件含原进程身份，失效锁启动时会清理；不要删除活实例的锁。

## 4. 上线验收

1. 域名HTTPS正常；未登录访问主页和API得到401。
2. 正确登录可进入“合规性检查”，开发者入口及 `/api/developer`、`/?view=developer` 返回404。
3. 新建真实项目，检查官方来源、引用、20项评价、9类许可与时长依据。
4. 勾选材料后刷新仍保留；服务重启后记录保留，运行中的当前版本任务恢复。
5. 下载备份，在另一隔离目录恢复，确认记录数与材料一致。
6. 核对供应商余额和网络、磁盘、容器健康；无失败后再分发访问凭据。

目前本机Docker引擎未运行，因此容器实际构建、Linux文件权限、域名DNS和TLS必须在VPS上完成验收。这里没有替你执行公网部署。若无域名，先准备域名再启用这份HTTPS配置。

## 5. 更新与回滚

先备份，保留上一版源码/镜像，再 `docker compose up -d --build`。不要并行启动第二个app实例或扩容副本。回滚应用前确认数据库迁移兼容，必要时连同更新前快照一起恢复。公共访问有密码保护和同源校验；无多用户权限隔离、SSO或审计管理页面。
