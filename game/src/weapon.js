// The arsenal: four guns, their numbers in one table, and the view model the camera carries.
// This module owns the magazine, the reload and the recoil; the caller owns the ray and the
// damage. Spread grows with ground speed, so stopping before firing pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  cadet: {
    name: 'Cadet', kind: 'pistol', price: 200, damage: 26, head: 3.2, pellets: 1,
    mag: 13, reserve: 52, gap: 0.15, reload: 1.5, spreadStill: 0.004, spreadMove: 0.045,
    recoil: 0.016, range: 55, size: [0.055, 0.07, 0.22],
  },
  sounder: {
    name: 'Sounder', kind: 'smg', price: 1250, damage: 23, head: 2.6, pellets: 1,
    mag: 30, reserve: 90, gap: 0.075, reload: 2.0, spreadStill: 0.006, spreadMove: 0.055,
    recoil: 0.012, range: 45, size: [0.08, 0.1, 0.36],
  },
  verdict: {
    name: 'Verdict', kind: 'rifle', price: 2700, damage: 34, head: 4.0, pellets: 1,
    mag: 25, reserve: 75, gap: 0.1, reload: 2.4, spreadStill: 0.002, spreadMove: 0.062,
    recoil: 0.021, range: 80, size: [0.09, 0.11, 0.46],
  },
  breach: {
    name: 'Breach', kind: 'shotgun', price: 1900, damage: 11, head: 1.8, pellets: 7,
    mag: 6, reserve: 24, gap: 0.8, reload: 2.8, spreadStill: 0.03, spreadMove: 0.07,
    recoil: 0.055, range: 22, size: [0.085, 0.1, 0.5],
  },
};

export const GEAR = {
  armour: { name: 'Vest', price: 650, kind: 'gear' },
  frag: { name: 'Frag', price: 300, kind: 'gear' },
};

const MUZZLE_TIME = 0.06;
const MOVE_REFERENCE = 5.2;

export function createWeapon(camera) {
  const gripMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35, emissive: new THREE.Color(PALETTE.ink), emissiveIntensity: 0.16 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), bodyMaterial);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), gripMaterial);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), gripMaterial);
  model.add(receiver, barrel, stock);
  model.position.set(0.3, -0.24, -0.52);
  model.scale.setScalar(1.7);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { key: 'cadet', mag: 0, reserve: 0, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };

  // The view model is three boxes resized to the equipped gun, so a swap reads at once.
  function shape(key) {
    const def = WEAPONS[key];
    const [w, h, l] = def.size;
    receiver.geometry.dispose();
    receiver.geometry = new THREE.BoxGeometry(w, h, l * 0.45);
    barrel.geometry.dispose();
    barrel.geometry = new THREE.BoxGeometry(w * 0.45, h * 0.45, l * 0.6);
    barrel.position.set(0, h * 0.2, -l * 0.45);
    stock.geometry.dispose();
    stock.geometry = new THREE.BoxGeometry(w * 0.75, h * 0.8, l * 0.32);
    stock.position.set(0, -h * 0.15, l * 0.35);
  }

  function equip(key, keepAmmo) {
    const def = WEAPONS[key];
    state.key = key;
    if (!keepAmmo) {
      state.mag = def.mag;
      state.reserve = def.reserve;
    }
    state.reloadLeft = 0;
    state.cooldown = 0;
    shape(key);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const def = WEAPONS[state.key];
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const take = Math.min(def.mag - state.mag, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  equip('sounder', false);

  return {
    state,
    equip,
    step,
    definition() {
      return WEAPONS[state.key];
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    dry() {
      return state.mag === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.key].gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.key];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = WEAPONS[state.key];
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMove;
    },
    refill() {
      equip(state.key, false);
      state.flash = 0;
      state.kick = 0;
    },
  };
}