import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadInput, examples, InputError } from './input.mjs';

const assets = new Map([
  ['/', ['./public/index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['./public/app.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['./public/style.css', 'text/css; charset=utf-8']],
  ['/vendor/three/build/three.module.js', ['./vendor/three/build/three.module.js', 'text/javascript; charset=utf-8']],
  ['/vendor/three/build/three.core.js', ['./vendor/three/build/three.core.js', 'text/javascript; charset=utf-8']],
  ['/vendor/three/examples/jsm/controls/OrbitControls.js', ['./vendor/three/examples/jsm/controls/OrbitControls.js', 'text/javascript; charset=utf-8']],
]);

async function run(request) {
  const input = await loadInput(request);
  const { simulate } = await import('./physics.mjs');
  return simulate(input);
}

function reply(response, status, value, mime = 'application/json; charset=utf-8') {
  if (response.destroyed) return;
  const data = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  response.writeHead(status, { 'Content-Type': mime, 'Content-Length': data.length, 'X-Content-Type-Options': 'nosniff' });
  response.end(data);
}

async function readRequest(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new InputError('请求须为 JSON。');
  const maxBytes = 8 * 1024 * 1024;
  if (Number(request.headers['content-length']) > maxBytes) throw new InputError('导入数据最多 8 MiB。');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= maxBytes) chunks.push(chunk);
  }
  if (size > maxBytes) throw new InputError('导入数据最多 8 MiB。');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('JSON 格式无效。'); }
}

function startServer(host, port) {
  let active = 0;
  const server = createServer(async (request, response) => {
    try {
      const path = request.url?.split('?')[0];
      if (request.method === 'GET' && assets.has(path)) {
        const [file, mime] = assets.get(path);
        reply(response, 200, await readFile(new URL(file, import.meta.url)), mime);
      } else if (request.method === 'GET' && path === '/healthz') {
        reply(response, 200, { ready: true });
      } else if (request.method === 'POST' && path === '/api/simulate') {
        const input = await readRequest(request);
        if (response.destroyed) return;
        if (active >= 2) return reply(response, 429, { error: '已有两次仿真正在运行，请稍后重试。' });
        const worker = new Worker(new URL(import.meta.url), { workerData: input });
        active++;
        const timer = setTimeout(() => {
          reply(response, 504, { error: '计算超过 180 秒，请减少机器人数量或缩短仿真时限。' });
          void worker.terminate();
        }, 180_000);
        response.once('close', () => {
          if (!response.writableEnded) void worker.terminate();
        });
        worker.once('message', ({ status, payload }) => reply(response, status, Buffer.from(payload)));
        worker.once('error', (error) => {
          console.error(error);
          reply(response, 500, { error: '仿真执行失败，详情见本地终端。' });
        });
        worker.once('exit', () => {
          active--;
          clearTimeout(timer);
          if (!response.writableEnded) reply(response, 500, { error: '仿真进程提前退出。' });
        });
      } else {
        reply(response, 404, { error: '没有这个页面。' });
      }
    } catch (error) {
      if (!(error instanceof InputError)) console.error(error);
      reply(response, error instanceof InputError ? 400 : 500, { error: error instanceof InputError ? error.message : '请求失败，详情见本地终端。' });
    }
  });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，可用 --port 指定其他端口。` : error);
    process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`SMART 3D 本地仿真已启动：http://${host === '0.0.0.0' ? 'localhost' : host}:${server.address().port}`));
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, host: { type: 'string' }, port: { type: 'string' },
    example: { type: 'string' }, agents: { type: 'string' }, map: { type: 'string' }, scenario: { type: 'string' },
    paths: { type: 'string' }, order: { type: 'string' }, speed: { type: 'string' }, acceleration: { type: 'string' },
    rotation: { type: 'string' }, friction: { type: 'string' }, 'max-seconds': { type: 'string' },
    'push-robot': { type: 'string' }, 'push-time': { type: 'string' }, 'push-x': { type: 'string' }, 'push-z': { type: 'string' },
    output: { type: 'string', short: 'o' },
  } });
  const command = positionals[0] ?? 'serve';
  if (values.help) {
    console.log(`node sim/server.mjs [serve] [--host 127.0.0.1] [--port 8765]
node sim/server.mjs run [--example ${Object.keys(examples).join('|')}] [--agents 50] [--output trace.json]
node sim/server.mjs run --map file.map --scenario file.scen --paths paths.txt --order xy --agents 20
参数：--speed --acceleration --rotation --friction --max-seconds --push-robot --push-time --push-x --push-z`);
    return;
  }
  if (positionals.length > 1) throw new InputError('请使用 serve 或 run。');
  if (command === 'serve') {
    const port = Number(values.port ?? process.env.SMART_PORT ?? 8765);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new InputError('端口须在 1 至 65535 之间。');
    startServer(values.host ?? process.env.SMART_HOST ?? '127.0.0.1', port);
    return;
  }
  if (command !== 'run') throw new InputError('请使用 serve 或 run。');
  const number = (key) => values[key] === undefined ? undefined : Number(values[key]);
  const input = { example: values.example ?? 'random', agents: number('agents'), order: values.order,
    speed: number('speed'), acceleration: number('acceleration'), rotation: number('rotation'),
    friction: number('friction'), maxSeconds: number('max-seconds') };
  if (values.map || values.scenario || values.paths) {
    if (!values.map || !values.scenario || !values.paths) throw new InputError('请同时指定 --map、--scenario 和 --paths。');
    input.example = 'custom';
    [input.map, input.scenario, input.paths] = await Promise.all([values.map, values.scenario, values.paths].map((file) => readFile(file, 'utf8')));
  }
  if (['push-x', 'push-z', 'push-robot', 'push-time'].some((key) => values[key] !== undefined)) {
    input.push = { robot: number('push-robot'), time: number('push-time'), x: number('push-x'), z: number('push-z') };
  }
  const result = await run(input);
  if (values.output) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(values.output, JSON.stringify(result));
  }
  console.log(JSON.stringify(result.stats, null, 2));
  if (result.stats.outcome !== 'completed') process.exitCode = 2;
}

if (isMainThread) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else {
  try {
    const payload = new TextEncoder().encode(JSON.stringify(await run(workerData)));
    parentPort.postMessage({ status: 200, payload }, [payload.buffer]);
  } catch (error) {
    const inputError = error instanceof InputError;
    if (!inputError) console.error(error);
    parentPort.postMessage({ status: inputError ? 400 : 500,
      payload: Buffer.from(JSON.stringify({ error: inputError ? error.message : '仿真执行失败，详情见本地终端。' })) });
  }
}
