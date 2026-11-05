#!/usr/bin/env node
/*
  市场销售工作台 · AI 本地转发
  ------------------------------------------------------------
  有些 AI 服务商不允许网页直接调用（浏览器跨域限制），这时用它在本机转发一下。

  用法：
    1. 电脑装好 Node.js（https://nodejs.org ，装 LTS 版即可）
    2. 在这个文件所在的文件夹打开终端，运行：node ai-proxy.js
       （想换端口：node ai-proxy.js 9000）
    3. 工作台「设置 → AI 接口」里，把接口地址改成  http://127.0.0.1:8787/  加原地址，例如：
         http://127.0.0.1:8787/https://api.deepseek.com
    4. 用的时候保持这个窗口开着；不用了直接关掉。

  说明：只监听本机 127.0.0.1，外部访问不到；只转发，不保存、不记录任何内容；不需要安装任何依赖。
  Developed by @赛博老爸
*/
'use strict';
const http = require('http');
const https = require('https');

const PORT = parseInt(process.argv[2] || process.env.PORT || '8787', 10);
const HOST = '127.0.0.1';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400'
};
// 这些请求头由浏览器附带，转发给 AI 服务商时去掉
const DROP_REQ = /^(host|origin|referer|connection|keep-alive|accept-encoding|sec-|proxy-|cookie$)/i;
// 这些响应头不原样传回，由本程序重新设置
const DROP_RES = /^(access-control-|connection$|keep-alive$|transfer-encoding$)/i;

function targetOf(reqUrl) {
  let s = reqUrl.replace(/^\/+/, '');
  s = s.replace(/^(https?):\/+/i, '$1://');
  if (!/^https?:\/\//i.test(s)) return null;
  try { return new URL(s); } catch (e) { return null; }
}

function sendJSON(res, code, msg) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
  res.end(JSON.stringify({ error: { message: msg } }));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.url === '/' || req.url === '/favicon.ico') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS));
    res.end('AI 本地转发已启动。在工作台里把接口地址改成 http://127.0.0.1:' + PORT + '/ 加原地址即可。');
    return;
  }
  const target = targetOf(req.url);
  if (!target) { sendJSON(res, 400, '地址格式不对，应该是 http://127.0.0.1:' + PORT + '/https://服务商地址'); return; }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!DROP_REQ.test(k)) headers[k] = v;
  headers.host = target.host;

  const lib = target.protocol === 'https:' ? https : http;
  const up = lib.request(target, { method: req.method, headers }, (ur) => {
    const out = {};
    for (const [k, v] of Object.entries(ur.headers)) if (!DROP_RES.test(k)) out[k] = v;
    res.writeHead(ur.statusCode || 502, Object.assign(out, CORS));
    ur.pipe(res);
  });
  up.setTimeout(300000, () => up.destroy(new Error('等待超时')));
  up.on('error', (e) => {
    if (res.headersSent) { res.end(); return; }
    sendJSON(res, 502, '转发失败：' + e.message + '（检查网络，或确认服务商地址是否正确）');
  });
  req.on('aborted', () => up.destroy());
  req.pipe(up);
  console.log(new Date().toLocaleTimeString(), req.method, target.origin + target.pathname);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('端口 ' + PORT + ' 被占用了，换一个试试：node ai-proxy.js 9000');
  else console.error(e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('AI 本地转发已启动：http://' + HOST + ':' + PORT + '/');
  console.log('在工作台「设置 → AI 接口」把接口地址改成：http://' + HOST + ':' + PORT + '/https://api.deepseek.com （按你用的服务商替换）');
  console.log('用的时候保持这个窗口开着，按 Ctrl+C 退出。');
});
