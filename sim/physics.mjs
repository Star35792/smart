import RAPIER from './vendor/rapier/rapier.mjs';
import { buildGraph, confirm, initialYaw } from './adg.mjs';

export const robotGeometry = { radius: 0.21, halfHeight: 0.16, mass: 3 };
const dt = 1 / 60;
const wallHeight = 0.72;
const gravity = 9.81;
const clamp = (value, max) => Math.max(-max, Math.min(max, value));
const rounded = (value) => Math.round(value * 1000) / 1000;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const quaternion = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
const yawOf = ({ y, w }) => wrap(2 * Math.atan2(y, w));
let physicsReady;

function createArena(world, map, friction) {
  const { width, height, rows, obstacleTiles } = map;
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  function box(x, y, z, hx, hy, hz, floor = false) {
    return world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setFriction(floor ? friction : 0.55)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), fixed);
  }
  const floor = box((width - 1) / 2, -0.15, (height - 1) / 2, width / 2 + 0.2, 0.15, height / 2 + 0.2, true);
  for (const z of [-0.6, height - 0.4]) box((width - 1) / 2, wallHeight / 2, z, width / 2 + 0.2, wallHeight / 2, 0.1);
  for (const x of [-0.6, width - 0.4]) box(x, wallHeight / 2, (height - 1) / 2, 0.1, wallHeight / 2, height / 2);
  for (let z = 0; z < height; z++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      if (x < width && obstacleTiles.includes(rows[z][x])) {
        if (start < 0) start = x;
      } else if (start >= 0) {
        box((start + x - 1) / 2, wallHeight / 2, z, (x - start) / 2, wallHeight / 2, 0.5);
        start = -1;
      }
    }
  }
  return floor.handle;
}

function createRobot(world, [x, z], plan) {
  const { radius, halfHeight, mass } = robotGeometry;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, halfHeight + 0.002, z).setRotation(quaternion(initialYaw))
    .enabledRotations(false, true, false).setCcdEnabled(true)
    .setLinearDamping(0.2).setAngularDamping(0.35));
  const collider = world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, radius)
    .setMass(mass).setFriction(1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  return { body, handle: collider.handle, plan, next: 0, driven: false };
}

function runEnd(robot) {
  const action = robot.plan[robot.next];
  let end = robot.next;
  while (end + 1 < robot.plan.length) {
    const next = robot.plan[end + 1];
    if (next.pending || next.type !== 'move' || next.dx !== action.dx || next.dz !== action.dz) break;
    end++;
  }
  return end;
}

function readyAction(robot) {
  const action = robot.plan[robot.next];
  return action?.pending === 0 ? action : undefined;
}

// A heading controller supplies yaw torque. The drive controller supplies
// longitudinal force and lateral tire grip to track the center of the lane.
function drive(robot, config) {
  const { body } = robot;
  const action = readyAction(robot);
  if (robot.driven) {
    body.resetForces(false);
    body.resetTorques(false);
  }
  robot.driven = Boolean(action);
  if (!action) return;
  const pos = body.translation();
  const vel = body.linvel();
  const angleError = wrap(action.yaw - yawOf(body.rotation()));
  const desiredOmega = clamp((7 + 9 * config.friction) * angleError, config.rotation);
  const groundFriction = config.friction * gravity;
  const { radius, mass } = robotGeometry;
  const angularAccel = clamp((desiredOmega - body.angvel().y) * 17, 42);
  const yawFriction = groundFriction * mass * radius * 0.78 * clamp(desiredOmega * 9, 1);
  body.addTorque({ x: 0, y: angularAccel * mass * radius ** 2 / 2 + yawFriction, z: 0 }, true);

  const goal = action.type === 'turn' ? action.goal : robot.plan[runEnd(robot)].goal;
  const errorX = goal[0] - pos.x;
  const errorZ = goal[1] - pos.z;
  let vx = clamp(5 * errorX, 0.85);
  let vz = clamp(5 * errorZ, 0.85);
  if (action.type === 'move') {
    const along = errorX * action.dx + errorZ * action.dz;
    const desiredSpeed = clamp(5 * along, Math.min(config.speed, Math.sqrt(2 * config.acceleration * Math.abs(along))));
    const alignment = Math.max(0, Math.cos(angleError));
    if (action.dx) vx = desiredSpeed * action.dx * alignment;
    if (action.dz) vz = desiredSpeed * action.dz * alignment;
  }
  const responseX = (vx - vel.x) * 11 + vel.x * 0.2;
  const responseZ = (vz - vel.z) * 11 + vel.z * 0.2;
  const traction = Math.min(1, config.acceleration / Math.max(0.001, Math.hypot(responseX, responseZ)));
  const frictionBoost = groundFriction / Math.max(0.08, Math.hypot(vx, vz));
  body.addForce({ x: mass * (responseX * traction + vx * frictionBoost), y: 0,
    z: mass * (responseZ * traction + vz * frictionBoost) }, true);
}

function advance(robot, maxStopSpeed) {
  const action = readyAction(robot);
  if (!action) return 0;
  const pos = robot.body.translation();
  const vel = robot.body.linvel();
  const ex = action.goal[0] - pos.x;
  const ez = action.goal[1] - pos.z;
  const stopped = Math.hypot(ex, ez) < 0.032 && Math.hypot(vel.x, vel.z) < maxStopSpeed;
  let reached = stopped;
  if (action.type === 'turn') {
    reached &&= Math.abs(wrap(action.yaw - yawOf(robot.body.rotation()))) < 0.068 && Math.abs(robot.body.angvel().y) < 0.14;
  } else if (runEnd(robot) > robot.next) {
    reached = ex * action.dx + ez * action.dz <= 0 && Math.abs(ex * action.dz - ez * action.dx) < 0.09;
  }
  if (!reached) return 0;
  robot.next++;
  confirm(action);
  return 1;
}

function snapshot(robots, tick) {
  return { t: rounded(tick * dt), robots: robots.map((robot) => {
    const { x, y, z } = robot.body.translation();
    const action = readyAction(robot);
    let state = 0;
    if (robot.next === robot.plan.length) state = 2;
    else if (action) state = action.type === 'turn' ? 3 : 1;
    return [rounded(x), rounded(y), rounded(z), rounded(yawOf(robot.body.rotation())), state, robot.next];
  }) };
}

export async function simulate({ title, map, robots: specs, config, push }) {
  physicsReady ??= RAPIER.init();
  await physicsReady;
  const { plans, stats: graph } = buildGraph(specs);
  const world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
  world.timestep = dt;
  const queue = new RAPIER.EventQueue(true);
  try {
    const floor = createArena(world, map, config.friction);
    const robots = specs.map(({ start }, id) => createRobot(world, start, plans[id]));
    const handles = new Map(robots.map(({ handle }, id) => [handle, id]));
    const maxTicks = Math.ceil(config.maxSeconds / dt);
    const stride = Math.max(6, Math.ceil(maxTicks * robots.length / 500_000));
    const maxStopSpeed = Math.min(0.15, Math.sqrt(0.04 * gravity * config.friction) + 0.006);
    const pushTick = push ? Math.max(1, Math.ceil(push.time / dt)) : -1;
    const frames = [snapshot(robots, 0)];
    const events = [];
    let robotContacts = 0;
    let wallContacts = 0;
    let actionsDone = 0;
    let tick = 0;
    let outcome = 'timeout';
    while (tick < maxTicks) {
      const observePush = push && tick < pushTick + 2 / dt;
      if (actionsDone === graph.actions && !observePush) {
        outcome = 'completed';
        break;
      }
      if (!observePush && robots.every((robot) => !readyAction(robot))) {
        outcome = 'blocked';
        break;
      }
      tick++;
      if (tick === pushTick) {
        robots[push.robot].body.applyImpulse({ x: push.x, y: 0, z: push.z }, true);
        events.push({ t: rounded(tick * dt), type: 'push', robots: [push.robot] });
      }
      for (const robot of robots) drive(robot, config);
      world.step(queue);
      queue.drainCollisionEvents((a, b, started) => {
        if (!started || a === floor || b === floor) return;
        const ids = [handles.get(a), handles.get(b)].filter((id) => id !== undefined);
        if (!ids.length) return;
        const type = ids.length === 2 ? 'robots' : 'wall';
        if (type === 'robots') robotContacts++;
        else wallContacts++;
        if (events.length < 1000) events.push({ t: rounded(tick * dt), type, robots: ids });
      });
      for (const robot of robots) actionsDone += advance(robot, maxStopSpeed);
      if (tick % stride === 0) frames.push(snapshot(robots, tick));
    }
    if (actionsDone === graph.actions && outcome === 'timeout') outcome = 'completed';
    if (tick % stride !== 0) frames.push(snapshot(robots, tick));
    const finished = robots.filter((robot) => robot.next === robot.plan.length).length;
    return { version: 1, title, map, robots: specs.map(({ start, goal, points }) => ({ start, goal, route: points.map(([x, z]) => [x, z]) })),
      geometry: { ...robotGeometry, wallHeight }, config, frames, events,
      stats: { ...graph, outcome, actionsDone, finished, robotContacts, wallContacts, seconds: rounded(tick * dt), sampleSeconds: rounded(stride * dt) } };
  } finally {
    queue.free();
    world.free();
  }
}
