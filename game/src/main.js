// Boot and the one loop: a fixed 60 Hz simulation (input, movement, bots, rounds) feeding a
// render at the display's rate. The simulation never reads the clock, so a round replays the
// same way twice; ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes the loop and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SPAWNS, ROUTES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GEAR } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createRounds } from './rounds.js';

const FIXED_STEP = 1 / 60;
const MAX_HP = 100;
const KILL_REWARD = 300;
const GRENADE_FUSE = 2.2;
const GRENADE_RADIUS = 5.5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(shot ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 72);
const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots({ scene, world, random });
const weapon = createWeapon(camera);
const hud = createHud();
const rounds = createRounds();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const shotPoint = new THREE.Vector3();
const impact = new THREE.Vector3();
const botMuzzle = new THREE.Vector3();
const botImpact = new THREE.Vector3();
const hittables = world.shootables.concat(bots.hitMeshes);

// The charge and the frag are the only objects the game adds after the round begins.
const charge = new THREE.Group();
const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.24), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 }));
const chargeBlink = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 2 }));
chargeBlink.position.set(0, 0.12, 0);
charge.add(chargeBody, chargeBlink);
const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 6, 2);
charge.add(chargeLight);
charge.visible = false;
scene.add(charge);

const grenadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.4, metalness: 0.4 }));
grenadeMesh.visible = false;
scene.add(grenadeMesh);
const blastMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.6, depthWrite: false }));
blastMesh.visible = false;
scene.add(blastMesh);

// A small pool of tracer streaks: one is enough per shot, and none is built while the game runs.
const tracers = [];
const tracerGeometry = new THREE.BoxGeometry(0.025, 0.025, 1);
const tracerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false });
for (let index = 0; index < 10; index += 1) {
  const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial);
  mesh.visible = false;
  scene.add(mesh);
  tracers.push({ mesh, life: 0 });
}
let tracerCursor = 0;

function tracer(from, to, length) {
  const slot = tracers[tracerCursor];
  tracerCursor = (tracerCursor + 1) % tracers.length;
  slot.life = 0.05;
  slot.mesh.visible = true;
  slot.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  slot.mesh.lookAt(to);
  slot.mesh.scale.set(1, 1, Math.max(0.3, length));
}

function stepTracers(dt) {
  for (const slot of tracers) {
    if (slot.life <= 0) continue;
    slot.life = Math.max(0, slot.life - dt);
    if (slot.life === 0) slot.mesh.visible = false;
  }
}

const body = player.state;
const grenade = { live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, blast: 0 };
const keysSeen = new Set();
const edges = new Set();

let hp = MAX_HP;
let armour = 0;
let frags = 0;
let ownedWeapon = 'cadet';
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let kills = 0;
let elapsed = 0;

bots.setPlayer(body.position.x, body.position.z, true, false);

// Edge detection on the key set: a press is the frame the code first appears in it.
function pollEdges() {
  edges.clear();
  for (const code of input.state.keys) if (!keysSeen.has(code)) edges.add(code);
  keysSeen.clear();
  for (const code of input.state.keys) keysSeen.add(code);
}

function tapped(code) {
  return edges.has(code);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (player.alive()) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(x, y, z) {
  const dx = x - body.position.x;
  const dy = y - (body.position.y + body.eye);
  const dz = z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function hurt(amount, fromTeam) {
  if (!player.alive()) return;
  if (armour > 0) {
    const absorbed = Math.min(armour, amount * 0.5);
    armour -= absorbed;
    amount -= absorbed;
  }
  hp = Math.max(0, hp - amount);
  hud.setHealth(hp);
  hud.damage(0.35 + Math.min(0.5, amount / 40));
  if (hp === 0 && fromTeam) {
    player.setAlive(false);
    hud.showOverlay('dead');
    if (document.pointerLockElement) document.exitPointerLock();
    hud.kill(`Salt ${fromTeam.slot + 1} took you`, 'salt');
  }
}

function addMoney(amount) {
  rounds.state.money = Math.min(9000, rounds.state.money + amount);
  hud.setMoney(rounds.state.money);
}

function shoot() {
  const def = weapon.definition();
  if (weapon.state.reloadLeft > 0) return;
  if (!weapon.takeRound()) return;
  const speed = player.groundSpeed();
  const spread = weapon.spread(speed);
  camera.getWorldDirection(direction);
  scene.updateMatrixWorld(true);
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    shotPoint.copy(direction);
    if (spread > 0) {
      shotPoint.x += (random() * 2 - 1) * spread;
      shotPoint.y += (random() * 2 - 1) * spread;
      shotPoint.z += (random() * 2 - 1) * spread;
    }
    shotPoint.normalize();
    raycaster.set(camera.position, shotPoint);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(hittables, false);
    const stop = hits.length ? hits[0] : null;
    for (const hit of hits) {
      const victim = hit.object.userData.agent;
      if (!victim) break;
      if (!victim.alive) continue;
      const head = hit.object.userData.part === 'head';
      const damage = head ? def.damage * def.head : def.damage;
      const killed = bots.damage(victim, damage);
      hud.hitMarker(killed, shot ? 4000 : 120);
      if (killed) {
        kills += 1;
        addMoney(KILL_REWARD);
        hud.kill(`${def.name} killed Salt ${victim.slot + 1}${head ? ' (head)' : ''}`, 'tide');
      }
      break;
    }
    if (stop) impact.copy(stop.point);
    else impact.copy(camera.position).addScaledVector(shotPoint, def.range);
    tracer(camera.position, impact, camera.position.distanceTo(impact));
  }
  weapon.pullTrigger();
  player.recoil(def.recoil * (speed > 1 ? 1.4 : 1), (random() * 2 - 1) * def.recoil * 0.5);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function throwFrag() {
  if (frags <= 0 || grenade.live) return;
  frags -= 1;
  camera.getWorldDirection(direction);
  grenade.live = true;
  grenade.fuse = GRENADE_FUSE;
  grenade.x = camera.position.x + direction.x * 0.4;
  grenade.y = camera.position.y + direction.y * 0.4;
  grenade.z = camera.position.z + direction.z * 0.4;
  grenade.vx = direction.x * 13;
  grenade.vy = direction.y * 13 + 3.4;
  grenade.vz = direction.z * 13;
  grenadeMesh.visible = true;
}

function stepGrenade(dt) {
  if (!grenade.live) {
    blastMesh.visible = false;
    return;
  }
  grenade.fuse = Math.max(0, grenade.fuse - dt);
  grenade.vy -= 18 * dt;
  grenade.x += grenade.vx * dt;
  grenade.y += grenade.vy * dt;
  grenade.z += grenade.vz * dt;
  if (grenade.y < 0.11) {
    grenade.y = 0.11;
    grenade.vy = -grenade.vy * 0.35;
    grenade.vx *= 0.6;
    grenade.vz *= 0.6;
  }
  grenadeMesh.position.set(grenade.x, grenade.y, grenade.z);
  if (grenade.fuse > 0) return;
  grenade.live = false;
  grenadeMesh.visible = false;
  grenade.blast = 0.4;
  blastMesh.position.set(grenade.x, 0.6, grenade.z);
  blastMesh.visible = true;
  for (const agent of bots.agents) {
    if (!agent.alive || agent.team === 'tide') continue;
    const distance = Math.hypot(agent.x - grenade.x, agent.z - grenade.z);
    if (distance > GRENADE_RADIUS) continue;
    const damage = 95 * (1 - distance / GRENADE_RADIUS);
    if (bots.damage(agent, damage)) {
      kills += 1;
      addMoney(KILL_REWARD);
      hud.kill('Frag killed Salt ' + (agent.slot + 1), 'tide');
    }
  }
  const own = Math.hypot(body.position.x - grenade.x, body.position.z - grenade.z);
  if (own < GRENADE_RADIUS) hurt(90 * (1 - own / GRENADE_RADIUS), { slot: 0 });
}

function beginRound() {
  const round = rounds.state.round;
  const laneA = round % 2 === 1 ? 'quayToA' : 'yardToB';
  const laneB = round % 2 === 1 ? 'yardToB' : 'quayToA';
  const plan = {
    tide: {
      1: { x: SPAWNS.tide[1].x, z: SPAWNS.tide[1].z, route: ROUTES[laneA] },
      2: { x: SPAWNS.tide[2].x, z: SPAWNS.tide[2].z, route: ROUTES[laneB] },
    },
    salt: {
      0: { x: SPAWNS.salt[0].x, z: SPAWNS.salt[0].z, route: ROUTES.holdMid },
      1: { x: SPAWNS.salt[1].x, z: SPAWNS.salt[1].z, route: ROUTES.holdA },
      2: { x: SPAWNS.salt[2].x, z: SPAWNS.salt[2].z, route: ROUTES.holdB },
    },
  };
  body.position.set(SPAWNS.tide[0].x, 0, SPAWNS.tide[0].z);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  hp = MAX_HP;
  player.setAlive(true);
  bots.resetRound(plan);
  bots.setPlayer(body.position.x, body.position.z, true, false);
  weapon.equip(ownedWeapon, false);
  charge.visible = false;
  grenade.live = false;
  grenadeMesh.visible = false;
  blastMesh.visible = false;
  frags = frags > 0 ? 1 : 0;
  hud.setHealth(hp);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.definition().name);
  hud.setRound(rounds.state.round);
  hud.setScore(rounds.state.score.tide, rounds.state.score.salt);
  hud.setMoney(rounds.state.money);
  if (!shot && !document.pointerLockElement) hud.showOverlay(started ? 'paused' : 'start');
  syncCamera();
}

// The buy menu: rows are the catalogue, owned marks what is already in hand.
function buyRows() {
  const rows = [];
  let slot = 0;
  for (const key of Object.keys(WEAPONS)) {
    slot += 1;
    rows.push({ slot, key, label: `${WEAPONS[key].name} (${WEAPONS[key].kind})`, price: WEAPONS[key].price, owned: ownedWeapon === key });
  }
  rows.push({ slot: 5, key: 'armour', label: 'Vest (halves damage)', price: GEAR.armour.price, owned: armour > 0 });
  rows.push({ slot: 6, key: 'frag', label: 'Frag grenade', price: GEAR.frag.price, owned: frags > 0 });
  return rows;
}

function openBuy() {
  if (rounds.state.phase !== 'buy') return;
  hud.openBuy(buyRows(), rounds.state.money);
}

function pick(row) {
  if (rounds.state.phase !== 'buy' || row.owned) return;
  if (!rounds.buy(row.price)) return;
  if (WEAPONS[row.key]) {
    ownedWeapon = row.key;
    weapon.equip(row.key, false);
    hud.setWeapon(WEAPONS[row.key].name);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  } else if (row.key === 'armour') {
    armour = 50;
  } else if (row.key === 'frag') {
    frags += 1;
  }
  hud.setMoney(rounds.state.money);
  hud.closeBuy();
}

hud.onBuy(pick);
hud.onPlay(() => {
  if (shot) return;
  input.requestLock();
});

const playerView = { x: 0, z: 0, alive: true };
const roundCtx = {
  player: playerView,
  alive(team) {
    return bots.aliveCount(team);
  },
  bombCarrier() {
    return bots.agents.find((agent) => agent.team === 'tide' && agent.alive && agent.hasBomb) ?? null;
  },
  defuserNear(x, z, radius) {
    return bots.agents.find((agent) => agent.team === 'salt' && agent.alive && Math.hypot(agent.x - x, agent.z - z) < radius) ?? null;
  },
  enemyNear(x, z, radius, team) {
    return bots.agents.some((agent) => agent.team === team && agent.alive && Math.hypot(agent.x - x, agent.z - z) < radius)
      || (team === 'tide' && player.alive() && Math.hypot(body.position.x - x, body.position.z - z) < radius);
  },
  playerHoldingUse() {
    return input.state.keys.has('KeyE');
  },
  readyToGo() {
    return tapped('Enter');
  },
};

const botCtx = {
  damagePlayer(amount, team) {
    hurt(amount, team);
  },
  // A bot's shot is a hitscan line: the same tracer the player's gun draws, from its muzzle.
  onBotShot(from, dir, distance) {
    botMuzzle.set(from.x, from.y, from.z);
    botImpact.copy(botMuzzle).addScaledVector(dir, distance);
    tracer(botMuzzle, botImpact, distance);
  },
  onBotKilled(victim, killer) {
    if (victim.alive) bots.damage(victim, 1);
    hud.kill(`${killer.team === 'tide' ? 'Tide' : 'Salt'} ${killer.slot + 1} killed ${victim.team === 'tide' ? 'Tide' : 'Salt'} ${victim.slot + 1}`, killer.team);
  },
};

function step(dt) {
  elapsed += dt;
  pollEdges();
  if (player.alive()) {
    player.step(dt, input.state.keys);
    const look = input.takeLook();
    player.look(look.x, look.y);
  }
  body.position.x = Math.max(-19.5, Math.min(19.5, body.position.x));
  body.position.z = Math.max(-17.5, Math.min(17.5, body.position.z));
  bots.setPlayer(body.position.x, body.position.z, player.alive(), player.crouching());
  playerView.x = body.position.x;
  playerView.z = body.position.z;
  playerView.alive = player.alive();
  bots.step(dt, botCtx);
  weapon.step(dt);
  stepGrenade(dt);
  stepTracers(dt);
  if (blastMesh.visible) {
    grenade.blast = Math.max(0, grenade.blast - dt);
    blastMesh.scale.setScalar(1 + (0.4 - grenade.blast) * 9);
    blastMesh.material.opacity = grenade.blast;
    if (grenade.blast === 0) blastMesh.visible = false;
  }

  const events = rounds.step(dt, roundCtx);
  for (const event of events) {
    if (event.kind === 'plant') {
      charge.visible = true;
      charge.position.set(rounds.state.bomb.x, 0.1, rounds.state.bomb.z);
      hud.setBomb(`Charge planted at ${event.site}`);
      hud.kill(`Tide planted the charge at ${event.site}`, 'tide');
    } else if (event.kind === 'round') {
      hud.setBomb(null);
      hud.setScore(rounds.state.score.tide, rounds.state.score.salt);
      hud.setMoney(rounds.state.money);
      charge.visible = false;
      if (player.alive()) hud.showOverlay(event.winner === 'tide' ? 'won' : 'lost', `${event.reason}.`);
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (event.kind === 'round-start') {
      beginRound();
    } else if (event.kind === 'explode') {
      charge.visible = false;
      blastMesh.position.set(event.x, 0.8, event.z);
      blastMesh.visible = true;
      grenade.blast = 0.4;
    }
  }

  // Bomb clock and the plant hint are HUD facts derived from the round, never a second timer.
  const bomb = rounds.state.bomb;
  if (bomb.planted) {
    hud.setBomb(`Charge at ${bomb.site}: ${Math.ceil(bomb.timer)}s`);
    chargeBlink.visible = Math.sin(elapsed * 8) > 0;
  }
  const site = rounds.siteAt(body.position.x, body.position.z);
  if (site && !bomb.planted && player.alive()) hud.setHint('Hold E to plant the charge');
  else hud.setHint(null);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    if (!shot) handleInput();
    syncCamera();
  }
  renderer.render(scene, camera);
}

function handleInput() {
  if (rounds.state.phase === 'buy') {
    if (tapped('KeyB')) {
      if (hud.buyOpen()) hud.closeBuy();
      else openBuy();
    }
    for (let slot = 1; slot <= 6; slot += 1) if (tapped(`Digit${slot}`)) hud.pickBuySlot(slot);
  } else if (hud.buyOpen()) {
    hud.closeBuy();
  }
  if (tapped('KeyR')) weapon.reload();
  if (tapped('KeyG')) throwFrag();
  if (input.state.firing && weapon.ready() && player.alive()) shoot();
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function poseBots(list) {
  for (const pose of list) {
    const agent = bots.agents.find((candidate) => candidate.team === pose.team && candidate.slot === pose.slot);
    if (!agent) continue;
    agent.x = pose.x;
    agent.z = pose.z;
    agent.yaw = pose.yaw ?? 0;
    agent.alive = true;
    agent.health = 100;
    agent.state = 'hold';
    agent.group.position.set(pose.x, 0, pose.z);
    agent.group.rotation.set(0, agent.yaw, 0);
  }
}

function runShot(name) {
  hud.hideOverlay();
  hud.closeBuy();
  hud.setBomb(null);
  beginRound();
  if (name === 'start') {
    openBuy();
    settle(30);
  } else if (name === 'play') {
    body.position.set(-5.2, 0, 6.4);
    body.yaw = 0.12;
    poseBots([
      { team: 'salt', slot: 0, x: -5.6, z: -2.2, yaw: 0 },
      { team: 'salt', slot: 1, x: -10.2, z: -3.4, yaw: 0.5 },
      { team: 'tide', slot: 1, x: -7.4, z: 3.4, yaw: 0.05 },
      { team: 'tide', slot: 2, x: -1.4, z: 4.2, yaw: -0.2 },
    ]);
    settle(20);
    aimAt(-5.6, 1.4, -2.2);
    for (let burst = 0; burst < 3; burst += 1) {
      shoot();
      settle(6);
      aimAt(-5.6 + (random() - 0.5) * 0.5, 1.2, -2.2);
    }
    settle(1);
  } else if (name === 'plant') {
    body.position.set(-14.4, 0, -7.2);
    poseBots([
      { team: 'salt', slot: 1, x: -9.4, z: -11.4, yaw: 0.9 },
      { team: 'tide', slot: 1, x: -12.6, z: -5.4, yaw: 0.2 },
    ]);
    rounds.plant(-14, 0, 'A', []);
    charge.visible = true;
    charge.position.set(-14, 0.1, -9);
    hud.setBomb('Charge planted at A');
    aimAt(-14, 0.6, -9);
    settle(24);
  } else {
    rounds.state.score.tide = 3;
    rounds.state.score.salt = 1;
    hud.setScore(3, 1);
    settle(12);
    hud.showOverlay('won', 'The charge went off at A.');
  }
  hud.setHealth(hp);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.definition().name);
  hud.setMoney(rounds.state.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted >= 2) {
      // Two frames are on screen; stop, so a capture is a still page and the loop costs nothing.
      window.__shotReady = true;
      frozen = true;
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else {
  beginRound();
  requestAnimationFrame(frame);
}