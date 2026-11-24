import { readFile } from 'node:fs/promises';

export const obstacleTiles = '@OTWS#';
const examplesDir = new URL('../examples/', import.meta.url);
export const examples = {
  random: {
    title: '随机障碍',
    map: 'random/random-32-32-20.map',
    scenario: 'random/random-32-32-20-random-1.scen',
    paths: 'random/example_paths_xy.txt',
    order: 'xy',
    agents: 50,
  },
  warehouse: {
    title: '大型仓库',
    map: 'warehouse/warehouse-10-20-10-2-1.map',
    scenario: 'warehouse/warehouse-10-20-10-2-1-random-1.scen',
    paths: 'warehouse/scen_1_1000_paths.txt',
    order: 'yx',
    agents: 1000,
  },
};

export class InputError extends Error {}

const lines = (text) => text.replace(/^\uFEFF/, '').split(/\r?\n/);
const entries = (text) => lines(text).map((line) => line.trim()).filter(Boolean);
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const pointPattern = /^\(\s*(-?\d+)\s*,\s*(-?\d+)\s*(?:,\s*((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*)?\)$/i;

export function parseMap(text) {
  const [type, heightLine, widthLine, header, ...rows] = lines(text.trimEnd());
  const height = Number(/^height\s+(\d+)$/.exec(heightLine)?.[1]);
  const width = Number(/^width\s+(\d+)$/.exec(widthLine)?.[1]);
  if (!/^type\s+\S+$/.test(type) || header !== 'map' || !(width > 0 && height > 0) ||
      width * height > 100_000 || rows.length !== height || rows.some((row) => row.length !== width)) {
    throw new InputError('地图文件的格式或网格尺寸无效（最多 100,000 格）。');
  }
  return { width, height, rows, obstacleTiles };
}

function parsePaths(text, scenarioText, map, count, order) {
  const [version, ...scenarios] = entries(scenarioText);
  const paths = entries(text);
  if (!/^version\s+\S+$/.test(version)) throw new InputError('场景文件缺少 version 行。');
  if (count > paths.length || count > scenarios.length) throw new InputError('路径或场景中的机器人数量不足。');
  const occupied = new Set();
  let totalPoints = 0;
  return paths.slice(0, count).map((line, index) => {
    const scene = scenarios[index].split(/\s+/);
    if (scene.length < 8 || Number(scene[2]) !== map.width || Number(scene[3]) !== map.height) {
      throw new InputError(`场景第 ${index + 1} 行的地图尺寸不符。`);
    }
    const start = scene.slice(4, 6).map(Number);
    const goal = scene.slice(6, 8).map(Number);
    const prefix = /^Agent\s+(\d+)\s*:\s*/.exec(line);
    if (Number(prefix?.[1]) !== index) throw new InputError(`路径第 ${index + 1} 行应以 Agent ${index}: 开头。`);
    const tokens = line.slice(prefix[0].length).split('->');
    if (tokens.at(-1).trim() === '') tokens.pop();
    totalPoints += tokens.length;
    if (!tokens.length || totalPoints > 200_000) throw new InputError('路径为空或总路径点超过 200,000。');
    let previous;
    let hasTime;
    const points = tokens.map((token, step) => {
      const match = pointPattern.exec(token.trim());
      if (!match) throw new InputError(`机器人 ${index} 的第 ${step + 1} 个路径点格式错误。`);
      const [, a, b, rawTime] = match;
      const [x, z] = (order === 'yx' ? [b, a] : [a, b]).map(Number);
      const time = rawTime === undefined ? step : Number(rawTime);
      if (x < 0 || z < 0 || x >= map.width || z >= map.height || obstacleTiles.includes(map.rows[z][x])) {
        throw new InputError(`机器人 ${index} 的路径点 (${x}, ${z}) 位于障碍物内或超出地图。`);
      }
      if (hasTime !== undefined && hasTime !== (rawTime !== undefined) || !Number.isFinite(time) ||
          previous && time <= previous[2]) {
        throw new InputError(`机器人 ${index} 的路径点须使用统一格式，时间戳须严格递增。`);
      }
      if (previous && Math.abs(x - previous[0]) + Math.abs(z - previous[1]) > 1) {
        throw new InputError(`机器人 ${index} 的路径包含跨格或斜向移动。`);
      }
      hasTime = rawTime !== undefined;
      previous = [x, z, time];
      return previous;
    });
    if (!samePoint(start, points[0]) || !samePoint(goal, points.at(-1))) {
      throw new InputError(`机器人 ${index} 的路径起终点与场景不符，请核对 XY/YX 坐标顺序。`);
    }
    if (occupied.has(start.join(','))) throw new InputError(`机器人 ${index} 的起点与其他机器人重复。`);
    occupied.add(start.join(','));
    return { start, goal, points };
  });
}

function numeric(value, fallback, min, max, label, integer = false) {
  const number = value ?? fallback;
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new InputError(`${label}须在 ${min} 至 ${max} 之间${integer ? '并使用整数' : ''}。`);
  }
  return number;
}

export async function loadInput(request) {
  if (!request || typeof request !== 'object') throw new InputError('请求格式无效。');
  const example = Object.hasOwn(examples, request.example) ? examples[request.example] : undefined;
  if (!example && request.example !== 'custom') throw new InputError('请选择场景。');
  const agents = numeric(request.agents, 20, 1, example?.agents ?? 1000, '机器人数量', true);
  const order = request.order ?? example?.order ?? 'xy';
  if (!['xy', 'yx'].includes(order)) throw new InputError('坐标顺序必须为 XY 或 YX。');
  const config = {
    speed: numeric(request.speed, 2.5, 0.15, 4, '最高速度'),
    acceleration: numeric(request.acceleration, 3, 0.3, 10, '最大加速度'),
    rotation: numeric(request.rotation, 3, 0.5, 8, '最高转速'),
    friction: numeric(request.friction, 0.12, 0, 1, '地面摩擦系数'),
    maxSeconds: numeric(request.maxSeconds, example === examples.warehouse ? 600 : 300, 1, 600, '仿真时限'),
  };
  const files = example ? await Promise.all([example.map, example.scenario, example.paths].map((name) =>
    readFile(new URL(name, examplesDir), 'utf8'))) : [request.map, request.scenario, request.paths];
  if (files.some((text) => typeof text !== 'string')) throw new InputError('请上传地图、场景和路径三个文件。');
  const map = parseMap(files[0]);
  const robots = parsePaths(files[2], files[1], map, agents, order);
  let push;
  if (request.push !== undefined) {
    if (!request.push || typeof request.push !== 'object') throw new InputError('外力参数格式无效。');
    push = {
      robot: numeric(request.push.robot, 0, 0, agents - 1, '受力机器人编号', true),
      time: numeric(request.push.time, 1, 0, config.maxSeconds, '施力时刻'),
      x: numeric(request.push.x, 0, -30, 30, 'X 方向冲量'),
      z: numeric(request.push.z, 0, -30, 30, 'Z 方向冲量'),
    };
  }
  return { title: example?.title ?? '自定义场景', map, robots, config, push };
}
