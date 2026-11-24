import * as THREE from 'three';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';

const get = (id) => document.getElementById(id);
const readNumber = (id) => get(id).valueAsNumber;
const element = {
  viewport: get('render-target'), form: get('setup'), example: get('example'), agents: get('agents'),
  robot: get('robot'), play: get('play'), timeline: get('timeline'), message: get('message'),
};
const colors = [0xf4ae63, 0x66dbc5, 0x79b3ff, 0xb5a2ff].map((hex) => new THREE.Color(hex));
const stateNames = ['等待依赖', '移动中', '已到达', '转向中'];
const clock = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat('zh-CN');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101923);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1500);
const content = new THREE.Group();
scene.add(content, new THREE.HemisphereLight(0xdceaff, 0x647382, 2.05));
const light = new THREE.DirectionalLight(0xffffff, 2.05);
light.position.set(-35, 65, -20);
scene.add(light);
const dummy = new THREE.Object3D();
const raycaster = new THREE.Raycaster();
const ray = new THREE.Vector2();
let renderer, controls, trace, bodies, caps, noses, goals, route, marker, selectionRing;
let current = 0;
let selected = -1;
let playing = false;
let dirty = true;
let lastTick = performance.now();
let activeRequest;

function setMessage(text, error = false) {
  element.message.textContent = text;
  element.message.dataset.error = String(error);
}

function initialize3D() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.canvas = renderer.domElement;
  renderer.canvas.setAttribute('aria-label', '可旋转的 3D 机器人地图');
  element.viewport.append(renderer.canvas);
  controls = new OrbitControls(camera, renderer.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.13;
  controls.maxPolarAngle = Math.PI / 2.04;
  controls.minDistance = 1.4;
  controls.addEventListener('change', () => { dirty = true; });
  new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  }).observe(element.viewport);
  let down;
  renderer.canvas.addEventListener('pointerdown', (event) => { down = [event.clientX, event.clientY]; });
  renderer.canvas.addEventListener('pointerup', (event) => {
    if (!bodies || !down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return;
    const rect = renderer.canvas.getBoundingClientRect();
    ray.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(ray, camera);
    const hits = raycaster.intersectObject(bodies);
    if (hits.length) selectRobot(hits[0].instanceId);
  });
  requestAnimationFrame(draw);
}

function clearScene() {
  content.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
    if (object.isInstancedMesh) object.dispose();
  });
  content.clear();
  route = undefined;
  marker = undefined;
  selectionRing = undefined;
}

function resetView(top = false) {
  if (!trace || !controls) return;
  const { width, height } = trace.map;
  const center = new THREE.Vector3((width - 1) / 2, 0, (height - 1) / 2);
  const direction = top ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.34, 0.83, 0.63);
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = 4;
  for (const x of [-width / 2 - 0.2, width / 2 + 0.2]) {
    for (const z of [-height / 2 - 0.2, height / 2 + 0.2]) {
      const corner = new THREE.Vector3(x, trace.geometry.wallHeight, z);
      const depth = corner.dot(direction);
      distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / (vertical * camera.aspect * 0.94),
        depth + Math.abs(corner.dot(up)) / (vertical * 0.82));
    }
  }
  controls.target.copy(center);
  controls.maxDistance = distance * 3;
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.update();
  dirty = true;
}

function addMesh(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  content.add(mesh);
  return mesh;
}

function addInstances(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  content.add(mesh);
  return mesh;
}

function place(mesh, id, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, yaw, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(id, dummy.matrix);
}

function buildScene() {
  clearScene();
  const { width, height, rows, obstacleTiles } = trace.map;
  const { wallHeight, radius, halfHeight } = trace.geometry;
  const cx = (width - 1) / 2;
  const cz = (height - 1) / 2;
  addMesh(new THREE.BoxGeometry(width + 0.4, 0.3, height + 0.4),
    new THREE.MeshStandardMaterial({ color: 0x233644, roughness: 0.94 }), cx, -0.15, cz);
  const grid = [];
  for (let x = 0; x <= width; x++) grid.push(x - 0.5, 0.003, -0.5, x - 0.5, 0.003, height - 0.5);
  for (let z = 0; z <= height; z++) grid.push(-0.5, 0.003, z - 0.5, width - 0.5, 0.003, z - 0.5);
  content.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(grid, 3)),
    new THREE.LineBasicMaterial({ color: 0x617a8a, transparent: true, opacity: 0.23 })));
  const blocks = [];
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (obstacleTiles.includes(rows[z][x])) blocks.push([x, z, 1, 1, 0x486072]);
    }
  }
  for (const z of [-0.6, height - 0.4]) blocks.push([cx, z, width + 0.4, 0.2, 0x2c4354]);
  for (const x of [-0.6, width - 0.4]) blocks.push([x, cz, 0.2, height, 0x2c4354]);
  const walls = addInstances(new THREE.BoxGeometry(1, wallHeight, 1), new THREE.MeshStandardMaterial({ roughness: 0.86 }), blocks.length);
  blocks.forEach(([x, z, sx, sz, color], id) => {
    place(walls, id, x, wallHeight / 2, z, 0, sx, 1, sz);
    walls.setColorAt(id, new THREE.Color(color));
  });
  const count = trace.robots.length;
  bodies = addInstances(new THREE.CylinderGeometry(radius, radius, halfHeight * 1.85, 16),
    new THREE.MeshStandardMaterial({ roughness: 0.46, metalness: 0.14 }), count);
  caps = addInstances(new THREE.CylinderGeometry(radius * 0.71, radius * 0.81, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0x192d3f, roughness: 0.64 }), count);
  noses = addInstances(new THREE.BoxGeometry(radius * 0.46, 0.035, radius * 0.37),
    new THREE.MeshBasicMaterial({ color: 0xeafaff }), count);
  const goalGeometry = new THREE.RingGeometry(0.19, 0.24, 18).rotateX(-Math.PI / 2);
  goals = addInstances(goalGeometry, new THREE.MeshBasicMaterial({ color: 0x79b3ff, transparent: true, opacity: 0.66 }), count);
  trace.robots.forEach(({ goal }, id) => place(goals, id, goal[0], 0.009, goal[1]));
  goals.visible = get('show-goals').checked;
  marker = addMesh(new THREE.RingGeometry(0.25, 0.35, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff3bc, depthTest: false }), 0, 0.033, 0);
  marker.visible = false;
  selectionRing = addMesh(new THREE.RingGeometry(radius + 0.035, radius + 0.069, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff3bc, depthTest: false }), 0, 0.034, 0);
  selectionRing.visible = false;
  resetView();
}

function selectRobot(id) {
  if (!trace) return;
  selected = id;
  element.robot.value = id < 0 ? '' : String(id);
  if (route) {
    route.removeFromParent();
    route.geometry.dispose();
    route.material.dispose();
    route = undefined;
  }
  if (id >= 0) {
    const { route: path, goal } = trace.robots[id];
    route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.map(([x, z]) => new THREE.Vector3(x, 0.034, z))),
      new THREE.LineBasicMaterial({ color: 0xffe3a1 }));
    content.add(route);
    route.visible = get('show-route').checked;
    marker.position.set(goal[0], 0.034, goal[1]);
  }
  marker.visible = id >= 0 && get('show-goals').checked;
  selectionRing.visible = id >= 0;
  showFrame();
}

function frameIndex(time) {
  let lo = 0;
  let hi = trace.frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (trace.frames[mid].t > time) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}

function showFrame() {
  if (!trace) return;
  const index = frameIndex(current);
  const a = trace.frames[index];
  const b = trace.frames[index + 1] ?? a;
  const progress = b.t > a.t ? (current - a.t) / (b.t - a.t) : 0;
  const { halfHeight, radius } = trace.geometry;
  let arrived = 0;
  let steps = 0;
  for (let id = 0; id < a.robots.length; id++) {
    const [ax, ay, az, heading, state, action] = a.robots[id];
    const [bx, by, bz, nextHeading] = b.robots[id];
    const x = ax + (bx - ax) * progress;
    const y = ay + (by - ay) * progress;
    const z = az + (bz - az) * progress;
    const angle = nextHeading - heading;
    const yaw = heading + Math.atan2(Math.sin(angle), Math.cos(angle)) * progress;
    place(bodies, id, x, y, z, yaw);
    place(caps, id, x, y + halfHeight * 0.94, z, yaw);
    place(noses, id, x + Math.cos(yaw) * radius * 0.78, y + halfHeight * 0.74, z - Math.sin(yaw) * radius * 0.78, yaw);
    bodies.setColorAt(id, colors[state]);
    if (id === selected) {
      selectionRing.position.set(x, Math.max(0.034, y - halfHeight + 0.03), z);
      const [gx, gz] = trace.robots[id].goal;
      get('robot-info').textContent = `${stateNames[state]} · 动作 ${action} · 位置 (${x.toFixed(2)}, ${z.toFixed(2)}) · 目标 (${gx}, ${gz})`;
    }
    if (state === 2) arrived++;
    steps += action;
  }
  for (const group of [bodies, caps, noses]) {
    group.instanceMatrix.needsUpdate = true;
    group.frustumCulled = false;
  }
  bodies.boundingSphere = null;
  bodies.instanceColor.needsUpdate = true;
  element.timeline.value = current;
  get('clock').textContent = `${clock.format(current)} / ${clock.format(trace.stats.seconds)} s`;
  get('stat-finished').textContent = `${countFormat.format(arrived)} / ${countFormat.format(trace.robots.length)}`;
  get('stat-actions').textContent = `${countFormat.format(steps)} / ${countFormat.format(trace.stats.actions)}`;
  if (selected < 0) get('robot-info').textContent = '也可以点击场景中的机器人。';
  dirty = true;
}

function setPlaying(next) {
  playing = next;
  element.play.textContent = playing ? '❚❚' : '▶';
  element.play.setAttribute('aria-label', playing ? '暂停' : '播放');
  lastTick = performance.now();
}

function draw(now) {
  if (playing) {
    current = Math.min(trace.stats.seconds, current + Math.min(0.08, (now - lastTick) / 1000) * Number(get('rate').value));
    if (current >= trace.stats.seconds) setPlaying(false);
    showFrame();
  }
  lastTick = now;
  controls.update();
  if (dirty) {
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(draw);
}

function showEvents(events) {
  const eventsBox = get('event-list');
  if (!events.length) {
    eventsBox.textContent = '本次仿真没有机器人、障碍物接触或外力事件。';
    return;
  }
  const labels = { robots: '机器人接触', wall: '障碍物接触', push: '外力冲量' };
  const rows = document.createDocumentFragment();
  for (const event of events) {
    const row = document.createElement('div');
    row.className = 'event';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${event.t.toFixed(2)} s`;
    button.addEventListener('click', () => {
      setPlaying(false);
      current = event.t;
      selectRobot(event.robots[0]);
    });
    row.append(button, `${labels[event.type]} · ${event.robots.map((id) => `#${id}`).join('、')}`);
    rows.append(row);
  }
  eventsBox.replaceChildren(rows);
}

function showTrace(result) {
  trace = result;
  current = 0;
  const { map, stats } = trace;
  get('scene-title').textContent = result.title;
  get('scene-meta').textContent = `${map.width} × ${map.height} 格 · ${trace.robots.length} 台机器人`;
  get('stat-edges').textContent = countFormat.format(stats.dependencyEdges);
  get('stat-robots').textContent = countFormat.format(stats.robotContacts);
  get('stat-walls').textContent = countFormat.format(stats.wallContacts);
  element.timeline.max = stats.seconds;
  element.timeline.disabled = element.play.disabled = stats.seconds === 0;
  get('export').disabled = false;
  element.robot.disabled = false;
  element.robot.replaceChildren(new Option('选择机器人', ''), ...trace.robots.map((_, id) => new Option(`机器人 ${id}`, String(id))));
  buildScene();
  selectRobot(-1);
  showEvents(trace.events);
  setPlaying(stats.seconds > 0);
  const outcomes = { completed: '全部动作已完成', blocked: '依赖阻塞，剩余动作无法释放', timeout: '已达到仿真时限' };
  setMessage(`${outcomes[stats.outcome]} · ${stats.finished}/${trace.robots.length} 台到达。`, stats.outcome !== 'completed');
}

async function run(event) {
  event.preventDefault();
  setPlaying(false);
  const controller = new AbortController();
  activeRequest = controller;
  get('run').disabled = true;
  get('cancel').hidden = false;
  setMessage('正在计算动作依赖和 3D 物理…');
  try {
    const request = { example: element.example.value, agents: readNumber('agents'), speed: readNumber('speed'),
      acceleration: readNumber('acceleration'), rotation: readNumber('rotation'), friction: readNumber('friction'), maxSeconds: readNumber('max-seconds') };
    if (request.example === 'custom') {
      const files = ['map-file', 'scene-file', 'path-file'].map((id) => get(id).files[0]);
      if (files.some((file) => !file)) throw new Error('请选择地图、场景和路径文件。');
      if (files.reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024) throw new Error('导入数据最多 8 MiB。');
      [request.map, request.scenario, request.paths] = await Promise.all(files.map((file) => file.text()));
      request.order = get('order').value;
    }
    if (get('apply-push').checked) {
      request.push = { robot: readNumber('push-robot'), time: readNumber('push-time'), x: readNumber('push-x'), z: readNumber('push-z') };
      if (Object.values(request.push).some((value) => !Number.isFinite(value))) throw new Error('请填写所有外力参数。');
    }
    const response = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '本地仿真失败。');
    showTrace(result);
  } catch (error) {
    setMessage(controller.signal.aborted ? '已取消计算。' : error.message, !controller.signal.aborted);
  } finally {
    activeRequest = undefined;
    get('run').disabled = false;
    get('cancel').hidden = true;
  }
}

function changeExample() {
  const example = element.example.value;
  const limit = example === 'random' ? 50 : 1000;
  element.agents.max = limit;
  get('agent-range').textContent = `1–${limit}`;
  get('files').hidden = example !== 'custom';
  if (readNumber('agents') > limit) element.agents.value = limit;
  if (example === 'warehouse' && readNumber('max-seconds') < 600) get('max-seconds').value = 600;
  get('push-robot').max = Math.max(0, readNumber('agents') - 1);
}

try {
  initialize3D();
  element.form.addEventListener('submit', run);
  element.example.addEventListener('change', changeExample);
  element.agents.addEventListener('input', () => { get('push-robot').max = Math.max(0, readNumber('agents') - 1); });
  get('apply-push').addEventListener('change', (event) => { get('push-fields').hidden = !event.target.checked; });
  get('cancel').addEventListener('click', () => activeRequest?.abort());
  get('top').addEventListener('click', () => resetView(true));
  get('reset-view').addEventListener('click', () => resetView());
  get('show-route').addEventListener('change', (event) => { if (route) route.visible = event.target.checked; dirty = true; });
  get('show-goals').addEventListener('change', (event) => {
    if (goals) goals.visible = event.target.checked;
    if (marker) marker.visible = event.target.checked && selected >= 0;
    dirty = true;
  });
  element.robot.addEventListener('change', () => selectRobot(element.robot.value === '' ? -1 : Number(element.robot.value)));
  element.play.addEventListener('click', () => {
    if (!playing && current >= trace.stats.seconds) current = 0;
    setPlaying(!playing);
  });
  element.timeline.addEventListener('input', () => {
    setPlaying(false);
    current = Number(element.timeline.value);
    showFrame();
  });
  get('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smart-trace.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  element.form.requestSubmit();
} catch (error) {
  console.error(error);
  element.form.addEventListener('submit', (event) => event.preventDefault());
  get('run').disabled = true;
  get('scene-meta').textContent = '浏览器未能启动 WebGL 2';
  setMessage('请启用浏览器硬件加速，或用命令行运行仿真。', true);
}
