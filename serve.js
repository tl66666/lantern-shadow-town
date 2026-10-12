/**
 * 灯影古镇 · 零依赖本地服务器
 * ============================================================
 * 用法：node serve.js        （默认端口 8126，被占用自动 +1，就绪后自动开浏览器）
 *       PORT=9000 node serve.js
 *       DYGZ_NO_OPEN=1 node serve.js   （不自动打开浏览器）
 *
 * 必须通过 localhost 访问：摄像头手势要求安全上下文。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT, 10) || 8126;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function parseRange(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
  const parts = rangeHeader.replace('bytes=', '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) return null;
  return { start, end };
}

function findPort(startPort) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`端口 ${startPort} 被占用，尝试 ${startPort + 1}...`);
        findPort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
    srv.listen(startPort, () => {
      const port = srv.address().port;
      srv.close(() => { resolve(port); });
    });
  });
}

// —— 服务就绪后自动打开浏览器（服务器知道自己最终落在哪个端口，天然无竞态）——
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', `start "" "${url}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) { /* 打不开浏览器也不影响服务 */ }
}

// —— 探活：判断某端口上是否已有古镇服务在运行 ——
function probeAlive(port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: port, path: '/ping', timeout: timeoutMs || 600 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(String(data).trim() === 'DYGZ-OK'));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // 探活接口：启动脚本用它判断服务器已就绪
    if (urlPath === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('DYGZ-OK');
      return;
    }

    // 根路径 → 游戏首页
    if (urlPath === '/' || urlPath === '/index.html' || urlPath === '/index.htm') {
      sendFile(path.join(ROOT, 'index.html'), req, res);
      return;
    }

    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 禁止访问');
      return;
    }

    sendFile(filePath, req, res);
  });

  server.listen(port, () => {
    const url = 'http://localhost:' + port;
    console.log('');
    console.log('  ==========================================');
    console.log('   灯影古镇 · 本地服务器已启动');
    console.log('  ==========================================');
    console.log('');
    console.log('   请在浏览器打开：  ' + url);
    console.log('   （摄像头手势必须在 localhost 下才能使用）');
    console.log('');
    console.log('   停止服务：按 Ctrl + C 或直接关闭本窗口');
    console.log('');
    if (process.env.DYGZ_NO_OPEN === '1') {
      console.log('   （DYGZ_NO_OPEN=1，本次不自动打开浏览器）');
    } else {
      // 关键修复：等服务器真正监听后再开浏览器，杜绝“网页打不开”的竞态
      openBrowser(url);
    }
  });

  return server;
}

function sendFile(filePath, req, res) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 找不到：' + req.url);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    // Range 支持：视频 seek（切关截图/暂停回起点）依赖它
    const range = parseRange(req.headers.range, stat.size);
    if (range) {
      res.writeHead(206, {
        'Content-Type': mime,
        'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': range.end - range.start + 1,
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function main() {
  // 重复启动保护：若古镇已在运行（比如不小心双击了两次启动脚本），
  // 直接打开已有页面即可，不再重复起服务。
  if (process.env.DYGZ_NO_OPEN !== '1') {
    for (let p = PORT; p < PORT + 8; p++) {
      if (await probeAlive(p)) {
        console.log('');
        console.log('  检测到灯影古镇已在运行，直接为你打开页面……');
        openBrowser('http://localhost:' + p);
        setTimeout(() => process.exit(0), 300);
        return;
      }
    }
  }
  try {
    const port = await findPort(PORT);
    startServer(port);
  } catch (err) {
    console.error('服务器启动失败：', err);
    process.exit(1);
  }
}

main();
