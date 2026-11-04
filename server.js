// 测试工作台 · 本地静态服务（纯本地、无登录、不上云）
// Excel 由浏览器在用户明确选择后本地读取，服务端不再保存、扫描或监听文件夹。
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = process.env.PORT || 8788;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, code, body, mime) {
  res.writeHead(code, { 'Content-Type': mime || 'text/plain; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res, requestPath) {
  const rel = requestPath.replace(/^\/+/, '').split('?')[0] || 'index.html';
  const full = path.resolve(PUBLIC, rel);
  if (full !== PUBLIC && !full.startsWith(PUBLIC + path.sep)) return false;
  try {
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(full).pipe(res);
      return true;
    }
  } catch (e) {}
  return false;
}

const server = http.createServer(async (req, res) => {
  if (serveStatic(req, res, req.url || '/')) return;
  send(res, 404, 'not found');
});

server.listen(PORT, () => {
  console.log('测试工作台已启动： http://localhost:' + PORT);
});
