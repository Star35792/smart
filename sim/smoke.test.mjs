import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildGraph } from './adg.mjs';
import { loadInput, InputError } from './input.mjs';
import { simulate } from './physics.mjs';

const fixture = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const same = (a, b) => a.every((value, index) => value === b[index]);

function customMap(row, starts) {
  const width = row.length;
  const height = 3;
  return {
    example: 'custom', agents: starts.length, maxSeconds: 4,
    map: `type octile\nheight ${height}\nwidth ${width}\nmap\n${'.'.repeat(width)}\n${row}\n${'.'.repeat(width)}\n`,
    scenario: 'version 1\n' + starts.map((x) => `0 local.map ${width} ${height} ${x} 1 ${x} 1 0`).join('\n'),
    paths: starts.map((x, id) => `Agent ${id}:(${x},1)`).join('\n'),
  };
}

const execute = async (request) => simulate(await loadInput(request));

test('XY and YX normalize identically and indexed ADG matches the pairwise SMART rule', async () => {
  const [map, scenario, paths] = await Promise.all([
    fixture('random-32-32-20.map'), fixture('random-32-32-20-random-1.scen'), fixture('example_paths_yx.txt'),
  ]);
  const original = await loadInput({ example: 'random', agents: 50 });
  const flipped = await loadInput({ example: 'custom', agents: 50, map, scenario, paths, order: 'yx' });
  assert.deepEqual(flipped.robots, original.robots);
  await assert.rejects(() => loadInput({ example: 'custom', agents: 50, map, scenario, paths, order: 'xy' }), InputError);
  const { plans, stats } = buildGraph(original.robots);
  const order = new Map(plans.flat().map((action, id) => [action, id]));
  const pairs = new Set(plans.flat().flatMap((action) => action.dependents.map((next) => `${order.get(action)}>${order.get(next)}`)));
  let counted = 0;
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      for (const a of plans[i]) {
        for (const b of plans[j]) {
          if (same(a.start, b.goal) && a.time <= b.time) {
            assert.ok(pairs.has(`${order.get(a)}>${order.get(b)}`));
            counted++;
          } else if (same(b.start, a.goal) && b.time <= a.time) {
            assert.ok(pairs.has(`${order.get(b)}>${order.get(a)}`));
            counted++;
          }
        }
      }
    }
  }
  assert.equal(pairs.size, counted);
  assert.equal(stats.dependencyEdges, counted);
});

test('both example maps bring 50 robots to their goals through the physics engine', async () => {
  for (const example of ['random', 'warehouse']) {
    const result = await execute({ example, agents: 50 });
    assert.equal(result.stats.outcome, 'completed');
    assert.equal(result.stats.finished, 50);
    assert.equal(result.stats.actionsDone, result.stats.actions);
    result.frames.at(-1).robots.forEach(([x, y, z], id) => {
      const [gx, gz] = result.robots[id].goal;
      assert.ok(Math.hypot(gx - x, gz - z) < 0.06);
      assert.ok(Math.abs(y - result.geometry.halfHeight) < 0.01);
    });
  }
});

test('external impulses cause physical contact and floor friction changes travel', async () => {
  const push = { time: 0.3, x: 12 };
  const wall = await execute({ ...customMap('...@...', [1]), push });
  assert.ok(wall.stats.wallContacts > 0);
  assert.ok(wall.events.some(({ type }) => type === 'wall'));
  assert.ok(wall.frames.every(({ robots }) => robots[0][0] < 2.32));
  const robots = await execute({ ...customMap('.......', [1, 3]), push });
  assert.ok(robots.stats.robotContacts > 0);
  assert.ok(robots.frames.at(-1).robots[1][0] > 3.1);
  const free = await execute({ ...customMap('........................', [1]), push, friction: 0 });
  const grippy = await execute({ ...customMap('........................', [1]), push, friction: 0.6 });
  assert.ok(free.frames.at(-1).robots[0][0] > grippy.frames.at(-1).robots[0][0] + 2);
  assert.equal(free.stats.wallContacts, 0);
});

test('invalid inputs give readable errors', async () => {
  const base = customMap('.....', [1]);
  await assert.rejects(() => loadInput({ ...base, friction: 2 }), InputError);
  await assert.rejects(() => loadInput({ ...base, push: null }), InputError);
  await assert.rejects(() => loadInput({ ...base, paths: 'Agent 0:(1,1)->(3,1)' }), /跨格/);
});
