# 在原有Compose和Nginx基础上部署

方案：保留原docker-compose.yml，用增补Compose只新增nestopia服务；沿用chem-nginx网关和chem-network，不运行本项目默认compose.yaml与Caddy。新地址https://nestopia.catal.online，博客及其他原路由保留。

提供的本地证书仅覆盖catal.online和www.catal.online，有效期到2026-10-11，当前已过期；这不代表服务器上一定还是该旧证书。新子域名不能使用这份证书。

## 1. 确认现有目录和磁盘

在阿里云远程终端执行：

```bash
df -h /
docker inspect chem-nginx --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
docker inspect chem-nginx --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker compose version
```

第一条检查可用空间，截图显示磁盘已用93.82%，先扩容并扩展文件系统或清理已确认无用文件，建议至少8GB可用。不执行docker system prune -a或卷清理。

第二条显示原Compose目录；下面所有`原项目目录`都用该真实目录替换。若没有该标签，通过挂载列表定位原nginx目录，再确认docker-compose.yml所在位置。

## 2. DNS与证书

阿里云DNS新增A记录：主机记录nestopia，记录值8.145.59.194。原@与www记录不用改。

在阿里云数字证书管理控制台为nestopia.catal.online申请证书，按控制台完成DNS验证后下载Nginx版。将证书链PEM和私钥分别命名为nestopia.catal.online_bundle.pem、nestopia.catal.online.key，放进原项目的nginx/certs目录。不要上传CSR代替证书，不要在聊天中发送私钥。

证书申请参考：https://www.alibabacloud.com/help/en/ssl-certificate/apply-for-a-certificate

## 3. 上传并解压

本机PowerShell：

```powershell
scp D:\NestopiaComplianceAgent\output\nestopia-vps-release.tar.gz 用户名@8.145.59.194:/tmp/
```

服务器终端（先将cd路径改为第1步查到的真实目录）：

```bash
cd 原项目目录
mkdir -p nestopia
tar -xzf /tmp/nestopia-vps-release.tar.gz -C nestopia
cp nestopia/deploy/existing.env.example nestopia/.env.production
chmod 600 nestopia/.env.production
openssl rand -hex 24
nano nestopia/.env.production
```

填写ACCESS_PASSWORD（上一步随机密码）与DEEPSEEK_API_KEY，其他配置已指向nestopia.catal.online。用独立nestopia/.env.production，不改旧服务的.env。

上传新证书到nginx/certs后，可执行：

```bash
chmod 600 nginx/certs/nestopia.catal.online.key
openssl x509 -in nginx/certs/nestopia.catal.online_bundle.pem -noout -dates -ext subjectAltName
```

确认新证书覆盖nestopia.catal.online且未过期。

## 4. 只启动新服务

始终在原项目目录执行，使用原docker-compose.yml加增补文件：

```bash
docker compose -f docker-compose.yml -f nestopia/deploy/compose.existing.yml config --quiet
docker compose -f docker-compose.yml -f nestopia/deploy/compose.existing.yml build nestopia
docker compose -f docker-compose.yml -f nestopia/deploy/compose.existing.yml up -d --no-deps nestopia
docker compose -f docker-compose.yml -f nestopia/deploy/compose.existing.yml logs --tail=60 nestopia
```

看到Next Ready后再改Nginx。不要直接执行本项目默认docker compose up，它会与旧网关争用80/443。

## 5. 备份并更新Nginx

以下假设第1步挂载确认配置正是原项目下nginx/nginx.conf；实际路径不同则用实际路径。

```bash
cp nginx/nginx.conf nginx/nginx.conf.before-nestopia
cp nestopia/deploy/nginx.existing.conf nginx/nginx.conf
docker exec chem-nginx nginx -t
```

仅在nginx -t成功后执行：

```bash
docker exec chem-nginx nginx -s reload
```

新增配置保留用户提供的原Nginx内容，并在http{}最后增加子域名server；如果服务器现有配置比所提供文件更新，应只复制新增的两个Nestopia server块，不要覆盖更新内容。不要重启全部Compose服务。

若检查失败，先恢复配置，当前Nginx进程尚未reload，不会因为检测失败自动停掉：

```bash
cp nginx/nginx.conf.before-nestopia nginx/nginx.conf
```

## 6. 登录与维护

浏览器打开https://nestopia.catal.online，用户名nestopia，密码为新环境文件中的ACCESS_PASSWORD。先跑一组真实项目，刷新确认记录保留。

备份：

```bash
docker compose -f docker-compose.yml -f nestopia/deploy/compose.existing.yml exec -T nestopia npm run backup
mkdir -p nestopia-backups
docker compose -f docker-compose.yml -f nestopia/deploy/compose.existing.yml cp nestopia:/app/data/backups/. ./nestopia-backups/
```

后续重建新服务仍用第4步的两个-f参数，只更新nestopia；不要执行down -v或remove-orphans。数据库在独立命名卷，原MySQL/PostgreSQL不变。

中国内地服务器须确认主域名备案及阿里云接入状态。原catal.online旧证书是否需要续期，请与服务器实际已安装证书对照；不影响新增子域名证书单独申请。
