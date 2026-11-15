// The bots: three a side, each a body of boxes with a head the ray can find, walking a route
// through the map, holding an angle when it gets there, and firing at what it can see. Eyes are
// a real ray against the map, so a wall stops a bot's sight as surely as it stops yours. Aim
// error, reaction time and burst length come from the agent's skill, never from the frame rate.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { ROUTES } from './world.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.58;
const WALK = 3.4;
const REACT = [0.42, 0.75, 0.58];
const SKILL = [0.72, 0.55, 0.63];
const ENGAGE_RANGE = 26;
const CLOSE_IN_RANGE = 18;
const SIGHT_INTERVAL = 0.1;

export function createBots({ scene, world, random }) {
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.7, metalness: 0.05 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const tideMark = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.tide), roughness: 0.5, emissive: new THREE.Color(TEAM.tide), emissiveIntensity: 0.35 });
  const saltMark = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.salt), roughness: 0.5, emissive: new THREE.Color(TEAM.salt), emissiveIntensity: 0.35 });
  const torsoGeometry = new THREE.BoxGeometry(0.5, 0.72, 0.34);
  const headGeometry = new THREE.SphereGeometry(0.155, 14, 10);
  const legsGeometry = new THREE.BoxGeometry(0.36, 0.72, 0.32);
  const armGeometry = new THREE.BoxGeometry(0.14, 0.6, 0.16);
  const gunGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.72);
  const markGeometry = new THREE.BoxGeometry(0.54, 0.1, 0.36);
  const flashGeometry = new THREE.PlaneGeometry(0.3, 0.3);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });

  const agents = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const losRay = new THREE.Raycaster();
  const shotRay = new THREE.Raycaster();
  const sightTimer = [];

  let now = 0;

  function blocked(x, z) {
    probe.min.set(x - RADIUS, 0.1, z - RADIUS);
    probe.max.set(x + RADIUS, HEIGHT - 0.1, z + RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  // Three a side: the player wears Tide's first slot, so the bots fill the two beside it.
  const ROSTER = [['tide', 1], ['tide', 2], ['salt', 0], ['salt', 1], ['salt', 2]];
  for (const [team, slot] of ROSTER) {
    const group = new THREE.Group();
    const legs = new THREE.Mesh(legsGeometry, vest);
    legs.position.y = 0.36;
    const torso = new THREE.Mesh(torsoGeometry, skin);
    torso.position.y = 1.06;
    const head = new THREE.Mesh(headGeometry, skin);
    head.position.y = 1.6;
    const armLeft = new THREE.Mesh(armGeometry, vest);
    armLeft.position.set(-0.33, 1.1, -0.06);
    const armRight = new THREE.Mesh(armGeometry, vest);
    armRight.position.set(0.33, 1.1, -0.06);
    const gunMesh = new THREE.Mesh(gunGeometry, vest);
    gunMesh.position.set(0.22, 1.12, -0.44);
    const mark = new THREE.Mesh(markGeometry, team === 'tide' ? tideMark : saltMark);
    mark.position.y = 1.2;
    const flash = new THREE.Mesh(flashGeometry, flashMaterial.clone());
    flash.position.set(0.22, 1.2, -0.86);
    flash.visible = false;
    group.add(legs, torso, head, armLeft, armRight, gunMesh, mark, flash);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const agent = {
      team,
      slot,
      group,
      legs,
      torso,
      head,
      flash,
      health: 100,
      alive: true,
      x: 0,
      z: 0,
      yaw: 0,
      route: [],
      routeIndex: 0,
      hold: null,
      state: 'route',
      hasBomb: false,
      fireCooldown: 0,
      burst: 0,
      react: 0,
      target: null,
      skill: SKILL[slot],
      moving: false,
      seenAt: -10,
      strafe: 1,
      strafeUntil: 0,
      mag: 30,
      flashTimer: 0,
    };
    torso.userData.agent = agent;
    torso.userData.part = 'torso';
    head.userData.agent = agent;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    agents.push(agent);
    sightTimer.push(slot * 0.03 + (team === 'salt' ? 0.05 : 0));
  }

  // The player's body: two invisible boxes bots can hit, moved every step to the player's eyes.
  const proxy = new THREE.Group();
  const proxyTorso = new THREE.Mesh(torsoGeometry, skin);
  proxyTorso.position.y = 1.06;
  const proxyHead = new THREE.Mesh(headGeometry, skin);
  proxyHead.position.y = 1.6;
  proxyTorso.visible = false;
  proxyHead.visible = false;
  proxy.add(proxyTorso, proxyHead);
  scene.add(proxy);
  const player = { team: 'tide', isPlayer: true, alive: true, x: 0, z: 0, crouching: false, target: null };
  proxyTorso.userData.agent = player;
  proxyTorso.userData.part = 'torso';
  proxyHead.userData.agent = player;
  proxyHead.userData.part = 'head';
  const playerMeshes = [proxyTorso, proxyHead];
  const tideAgents = agents.filter((agent) => agent.team === 'tide');
  const saltAgents = agents.filter((agent) => agent.team === 'salt');
  const hittables = world.shootables.concat(hitMeshes, playerMeshes);

  function setPlayer(x, z, alive, crouching) {
    player.x = x;
    player.z = z;
    player.alive = alive;
    player.crouching = crouching;
    proxy.position.set(x, 0, z);
    proxyTorso.position.y = crouching ? 0.78 : 1.06;
    proxyHead.position.y = crouching ? 1.22 : 1.6;
  }

  const tideTargets = tideAgents.concat(player);

  function targetsFor(agent) {
    return agent.team === 'tide' ? saltAgents : tideTargets;
  }

  // A real ray: the first map surface it meets decides whether the line of sight is open.
  function canSee(agent, target) {
    eye.set(agent.x, EYE, agent.z);
    const tx = target.isPlayer ? target.x : target.x;
    const tz = target.isPlayer ? target.z : target.z;
    const ty = target.isPlayer ? (target.crouching ? 1.1 : 1.5) : 1.45;
    aim.set(tx, ty, tz);
    const distance = eye.distanceTo(aim);
    if (distance > ENGAGE_RANGE) return 0;
    jitter.copy(aim).sub(eye).normalize();
    losRay.set(eye, jitter);
    losRay.far = distance;
    const hit = losRay.intersectObjects(world.shootables, false)[0];
    if (hit && hit.distance < distance - 0.25) return 0;
    return distance;
  }

  function shootAt(agent, target, distance, ctx) {
    const base = target.isPlayer ? (target.crouching ? 1.05 : 1.5) : 1.45;
    const tx = target.isPlayer ? target.x : target.x;
    const tz = target.isPlayer ? target.z : target.z;
    eye.set(agent.x, EYE, agent.z);
    aim.set(tx, base, tz);
    jitter.copy(aim).sub(eye).normalize();
    const error = (0.01 + (1 - agent.skill) * 0.055) * (0.6 + distance / 26) * (target.moving ? 1.5 : 1);
    jitter.x += (random() * 2 - 1) * error;
    jitter.y += (random() * 2 - 1) * error * 0.7;
    jitter.z += (random() * 2 - 1) * error;
    jitter.normalize();
    shotRay.set(eye, jitter);
    shotRay.far = 60;
    const hits = shotRay.intersectObjects(hittables, false);
    agent.flashTimer = 0.07;
    agent.flash.rotation.z = random() * 3;
    let hitBody = null;
    for (const hit of hits) {
      if (hit.object.userData.agent) {
        hitBody = hit;
        break;
      }
      break;
    }
    if (!hitBody) {
      ctx.onBotShot(eye, jitter, distance, null);
      return;
    }
    const part = hitBody.object.userData.part;
    const victim = hitBody.object.userData.agent;
    if (victim.team === agent.team) {
      ctx.onBotShot(eye, jitter, distance, null);
      return;
    }
    const damage = part === 'head' ? 92 : 26;
    ctx.onBotShot(eye, jitter, hitBody.distance, part);
    if (victim.isPlayer) ctx.damagePlayer(damage, agent.team);
    else {
      victim.health -= damage;
      if (victim.health <= 0 && victim.alive) ctx.onBotKilled(victim, agent);
    }
  }

  function face(agent, targetYaw, dt) {
    let diff = ((targetYaw - agent.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    agent.yaw += diff * Math.min(1, dt * 7);
  }

  function walk(agent, dt) {
    const node = agent.route[agent.routeIndex];
    if (!node) {
      agent.state = 'hold';
      return;
    }
    const dx = node[0] - agent.x;
    const dz = node[1] - agent.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.55) {
      agent.routeIndex += 1;
      if (agent.routeIndex >= agent.route.length) {
        agent.state = 'hold';
        agent.hold = node;
      }
      return;
    }
    const dirX = dx / distance;
    const dirZ = dz / distance;
    const stepX = dirX * WALK * dt;
    const stepZ = dirZ * WALK * dt;
    agent.moving = true;
    if (!blocked(agent.x + stepX, agent.z)) agent.x += stepX;
    if (!blocked(agent.x, agent.z + stepZ)) agent.z += stepZ;
    face(agent, Math.atan2(-dirX, -dirZ), dt);
    agent.group.position.set(agent.x, 0, agent.z);
    agent.group.rotation.y = agent.yaw;
    agent.legs.rotation.x = Math.sin(now * 9 + agent.slot) * 0.35;
  }

  function hold(agent, dt) {
    agent.moving = false;
    agent.legs.rotation.x = 0;
    // Scan the angle: a slow sweep of the ground it was told to watch.
    agent.yaw += Math.sin(now * 0.6 + agent.slot * 1.9) * dt * 0.5;
    agent.group.rotation.y = agent.yaw;
  }

  function step(dt, ctx) {
    now += dt;
    // Bodies moved since the last render, so the rays below need fresh world matrices.
    scene.updateMatrixWorld(true);
    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      agent.flashTimer = Math.max(0, agent.flashTimer - dt);
      agent.flash.visible = agent.flashTimer > 0;
      if (!agent.alive) continue;
      agent.fireCooldown = Math.max(0, agent.fireCooldown - dt);
      sightTimer[index] -= dt;
      agent.moving = false;

      let best = null;
      let bestDistance = 0;
      if (sightTimer[index] <= 0) {
        sightTimer[index] = SIGHT_INTERVAL + random() * 0.04;
        for (const target of targetsFor(agent)) {
          if (target.isPlayer ? !player.alive : !target.alive) continue;
          const distance = canSee(agent, target);
          if (distance && (!best || distance < bestDistance)) {
            best = target;
            bestDistance = distance;
          }
        }
        if (best) {
          if (agent.target !== best) agent.react = REACT[agent.slot] + random() * 0.2;
          agent.target = best;
          agent.seenAt = now;
        } else if (now - agent.seenAt > 1.4) {
          agent.target = null;
        }
      }

      if (agent.target && (agent.target.isPlayer ? player.alive : agent.target.alive)) {
        const target = agent.target;
        const distance = Math.hypot(target.x - agent.x, target.z - agent.z);
        face(agent, Math.atan2(-(target.x - agent.x), -(target.z - agent.z)), dt);
        agent.react = Math.max(0, agent.react - dt);
        // A step to the side between bursts: a bot that stands still is a free kill.
        if (now > agent.strafeUntil) {
          agent.strafe = random() < 0.5 ? -1 : 1;
          agent.strafeUntil = now + 0.7 + random() * 0.8;
        }
        const sideX = Math.cos(agent.yaw) * agent.strafe * 1.6 * dt;
        const sideZ = -Math.sin(agent.yaw) * agent.strafe * 1.6 * dt;
        if (!blocked(agent.x + sideX, agent.z + sideZ)) {
          agent.x += sideX;
          agent.z += sideZ;
          agent.moving = distance > 12;
        }
        // A long shot is not a fight yet: an attacker keeps closing on its site, a defender
        // holds the angle. Under ten metres a bot stops and trades.
        if (agent.team === 'tide' && agent.state === 'route' && distance > 10) walk(agent, dt * 0.7);
        else if (distance > CLOSE_IN_RANGE) walk(agent, dt);
        if (agent.react === 0 && agent.fireCooldown === 0 && distance < ENGAGE_RANGE) {
          if (agent.mag <= 0) {
            agent.mag = 30;
            agent.fireCooldown = 1.6;
          } else {
            agent.mag -= 1;
            agent.fireCooldown = 0.09 + random() * 0.05;
            shootAt(agent, target, distance, ctx);
          }
        }
      } else if (agent.state === 'route') {
        walk(agent, dt);
      } else if (agent.state === 'hold') {
        hold(agent, dt);
      }
      agent.group.position.set(agent.x, 0, agent.z);
    }
  }

  function damage(agent, amount) {
    if (!agent.alive) return false;
    agent.health -= amount;
    if (agent.health > 0) return false;
    agent.alive = false;
    agent.group.rotation.x = -Math.PI / 2;
    agent.group.position.y = 0.1;
    return true;
  }

  function aliveCount(team) {
    return agents.filter((agent) => agent.team === team && agent.alive).length + (team === 'tide' && player.alive ? 1 : 0);
  }

  function claimBomb(team) {
    const candidates = agents.filter((agent) => agent.team === team && agent.alive);
    for (const agent of candidates) agent.hasBomb = false;
    if (candidates.length) candidates[candidates.length - 1].hasBomb = true;
  }

  function resetRound(plan) {
    now = 0;
    player.alive = true;
    for (const agent of agents) {
      const spec = plan[agent.team][agent.slot];
      agent.alive = true;
      agent.health = 100;
      agent.x = spec.x;
      agent.z = spec.z;
      agent.yaw = agent.team === 'tide' ? Math.PI : 0;
      agent.route = spec.route.map((node) => node);
      agent.routeIndex = 0;
      agent.state = spec.route.length ? 'route' : 'hold';
      agent.hold = null;
      agent.target = null;
      agent.seenAt = -10;
      agent.fireCooldown = 0.4;
      agent.mag = 30;
      agent.moving = false;
      agent.flashTimer = 0;
      agent.flash.visible = false;
      agent.group.rotation.set(0, agent.yaw, 0);
      agent.group.position.set(agent.x, 0, agent.z);
      agent.legs.rotation.x = 0;
    }
    claimBomb('tide');
  }

  function route(name) {
    return ROUTES[name] ?? [];
  }

  return {
    agents,
    hitMeshes,
    player,
    setPlayer,
    step,
    damage,
    aliveCount,
    claimBomb,
    resetRound,
    route,
  };
}