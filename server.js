// 测试工作台 · 本地服务（纯本地、无登录、不上云、只读 Excel）
// 职责：静态托管 index.html；读取本地 Excel 文件夹；监听文件变动自动推送刷新。
const http = require('http');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const PORT = process.env.PORT || 8788;

// ---------- 配置（Excel 文件夹路径）----------
function defaultFolder() {
  return path.join(ROOT, 'cases-sample');
}
function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (c && c.casesFolder) return c.casesFolder;
  } catch (e) {}
  return defaultFolder();
}
let casesFolder = loadConfig();
function saveConfig(folder) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ casesFolder: folder }, null, 2), 'utf8');
}

// ---------- 列名映射（中英文别名，忽略大小写与空格）----------
const ALIASES = {
  id: ['用例编号', '编号', '案例编号', 'caseid', 'case id', 'id'],
  name: ['验证名称', '用例名称', '用例标题', '名称', '标题', '测试点', '验证点', '测试名称'],
  priority: ['优先级', '优先', '等级', 'priority'],
  type: ['用例类型', '类型', '测试类型', 'casetype', 'case type'],
  precond: ['前置条件', '前置', '前提条件', '前提'],
  steps: ['操作步骤', '步骤', '操作', '测试步骤'],
  expected: ['预期结果', '期望结果', '预期', '期望'],
  result: ['测试结果', '结果', '执行结果', '状态']
};
const RESULT_OPTIONS = ['已通过', '失败', '无法验证', '未执行', '无需验证', '待确认', '部分通过', '后续优化'];

function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
function pick(row, field) {
  const want = ALIASES[field].map(norm);
  for (const k of Object.keys(row)) {
    if (want.includes(norm(k))) {
      const v = row[k];
      return v == null ? '' : String(v).trim();
    }
  }
  return '';
}

// ---------- 解析一个 Excel 为一个需求 ----------
function parseFile(file) {
  const full = path.join(casesFolder, file);
  const wb = XLSX.readFile(full);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const cases = rows.map((r, i) => ({
    id: pick(r, 'id') || ('ROW' + (i + 1)),
    name: pick(r, 'name'),
    priority: pick(r, 'priority'),
    type: pick(r, 'type'),
    precond: pick(r, 'precond'),
    steps: pick(r, 'steps'),
    expected: pick(r, 'expected'),
    result: pick(r, 'result')
  }));
  const total = cases.length;
  const passed = cases.filter(c => c.result === '已通过').length;
  const failed = cases.filter(c => c.result === '失败').length;
  const passRate = total ? Math.round(passed / total * 100) : 0;
  let status = '进行中';
  if (total && failed > 0) status = '存在失败';
  else if (total && passed === total) status = '已完成';
  return {
    requirement: file.replace(/\.xlsx?$/i, ''),
    file,
    total, passed, failed, passRate, status,
    cases
  };
}

// ---------- 读取整个文件夹 ----------
function readAll() {
  let files = [];
  try {
    files = fs.readdirSync(casesFolder).filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~$'));
  } catch (e) {
    return { error: '文件夹无法读取：' + casesFolder, requirements: [], stats: emptyStats() };
  }
  const requirements = files.map(parseFile);
  const stats = {
    总需求数: requirements.length,
    总用例: requirements.reduce((s, r) => s + r.total, 0),
    已通过: requirements.reduce((s, r) => s + r.passed, 0),
    失败: requirements.reduce((s, r) => s + r.failed, 0),
    整体通过率: 0
  };
  const t = stats.总用例;
  stats.整体通过率 = t ? Math.round(stats.已通过 / t * 100) : 0;
  return { casesFolder, requirements, stats, options: RESULT_OPTIONS };
}
function emptyStats() { return { 总需求数: 0, 总用例: 0, 已通过: 0, 失败: 0, 整体通过率: 0 }; }

// ---------- 文件夹监听（SSE 推送）----------
const clients = new Set();
let watcher = null;
let watchTimer = null;
function broadcast() {
  const payload = JSON.stringify(readAll());
  for (const res of clients) {
    res.write('event: update\n');
    res.write('data: ' + payload + '\n\n');
  }
}
function startWatch(folder) {
  if (watcher) { try { watcher.close(); } catch (e) {} watcher = null; }
  if (!fs.existsSync(folder)) return;
  try {
    watcher = fs.watch(folder, { persistent: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(broadcast, 300);
    });
  } catch (e) { /* 监听失败不影响读取 */ }
}

// ---------- HTTP 服务 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
function send(res, code, body, mime) {
  res.writeHead(code, { 'Content-Type': mime || 'application/json; charset=utf-8' });
  res.end(body);
}
function serveStatic(req, res, url) {
  const rel = url.replace(/^\/+/, '').split('?')[0];
  const full = path.join(PUBLIC, rel);
  if (!full.startsWith(PUBLIC)) return false; // 防目录穿越
  try {
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(full).pipe(res);
      return true;
    }
  } catch (e) {}
  return false;
}
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    fs.readFile(path.join(PUBLIC, 'index.html'), (err, data) => {
      if (err) return send(res, 500, 'index.html 缺失');
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      res.end(data);
    });
    return;
  }
  if (url.startsWith('/api/')) {
    // API 路由见下方
  } else {
    if (serveStatic(req, res, url)) return;
    return send(res, 404, JSON.stringify({ error: 'not found' }));
  }
  if (url === '/api/config' && req.method === 'GET') {
    return send(res, 200, JSON.stringify({ casesFolder }));
  }
  if (url === '/api/config' && req.method === 'POST') {
    let buf = '';
    req.on('data', d => buf += d);
    req.on('end', () => {
      try {
        const body = JSON.parse(buf);
        const f = body.casesFolder;
        if (!f || !fs.existsSync(f) || !fs.statSync(f).isDirectory()) {
          return send(res, 400, JSON.stringify({ error: '文件夹不存在或不是目录：' + f }));
        }
        casesFolder = f;
        saveConfig(f);
        startWatch(f);
        send(res, 200, JSON.stringify({ casesFolder: f, data: readAll() }));
      } catch (e) {
        send(res, 400, JSON.stringify({ error: '参数错误' }));
      }
    });
    return;
  }
  if (url === '/api/cases' && req.method === 'GET') {
    return send(res, 200, JSON.stringify(readAll()));
  }
  if (url === '/api/cases/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('retry: 3000\n\n');
    clients.add(res);
    res.on('close', () => clients.delete(res));
    return;
  }
  send(res, 404, JSON.stringify({ error: 'not found' }));
});

startWatch(casesFolder);
server.listen(PORT, () => {
  console.log('测试工作台已启动： http://localhost:' + PORT);
  console.log('Excel 文件夹：' + casesFolder);
});
