import { InputError } from './input.mjs';

const key = ([x, z]) => `${x},${z}`;
export const initialYaw = Math.PI / 2;

function actionsFor(points) {
  const actions = [];
  let yaw = initialYaw;
  for (let index = 1; index < points.length; index++) {
    const [x, z, time] = points[index - 1];
    const [nextX, nextZ] = points[index];
    const dx = nextX - x;
    const dz = nextZ - z;
    if (!dx && !dz) continue;
    const nextYaw = -Math.atan2(dz, dx);
    const start = [x, z];
    const goal = [nextX, nextZ];
    const mid = [x + dx / 2, z + dz / 2];
    if (nextYaw !== yaw) actions.push({ type: 'turn', start, goal: start, yaw: nextYaw, time });
    actions.push({ type: 'move', start, goal: mid, yaw: nextYaw, time, dx, dz });
    actions.push({ type: 'move', start: mid, goal, yaw: nextYaw, time, dx, dz });
    yaw = nextYaw;
  }
  return actions.map((action) => ({ ...action, pending: 0, dependents: [] }));
}

// Mirrors SMART's pairwise precedence rule. The position index avoids comparing
// pairs that cannot share an endpoint. Equal-time reverse edges lose to the
// forward edge when the lower-numbered robot is also at the shared endpoint.
export function buildGraph(robots) {
  const plans = robots.map(({ points }) => actionsFor(points));
  const arrivals = new Map();
  const stats = { actions: 0, moves: 0, turns: 0, sequenceEdges: 0, dependencyEdges: 0 };
  plans.forEach((plan, robot) => {
    stats.actions += plan.length;
    stats.sequenceEdges += Math.max(0, plan.length - 1);
    for (const action of plan) {
      action.robot = robot;
      action.startKey = key(action.start);
      action.goalKey = key(action.goal);
      stats[action.type === 'move' ? 'moves' : 'turns']++;
      if (!arrivals.has(action.goalKey)) arrivals.set(action.goalKey, []);
      arrivals.get(action.goalKey).push(action);
    }
  });
  let candidates = 0;
  for (const plan of plans) {
    for (const from of plan) {
      const matching = arrivals.get(from.startKey) ?? [];
      candidates += matching.length;
      if (candidates > 50_000_000) throw new InputError('场景的动作依赖过于密集，请减少机器人数量或路径长度。');
      for (const to of matching) {
        if (from.robot === to.robot || from.time > to.time) continue;
        if (from.robot > to.robot && from.time === to.time && from.goalKey === to.startKey) continue;
        if (stats.dependencyEdges >= 8_000_000) throw new InputError('场景的动作依赖超过 800 万条，请减少机器人数量。');
        from.dependents.push(to);
        to.pending++;
        stats.dependencyEdges++;
      }
    }
  }
  return { plans, stats };
}

export function confirm(action) {
  for (const dependent of action.dependents) dependent.pending--;
}
