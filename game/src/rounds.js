// The round: buy phase, live phase, the charge, and who won. One state object holds the clock,
// the score, the money and the bomb; main.js feeds it the player and the bots, and it answers
// with what changed. Nothing here renders and nothing here reads the clock.
import { SITES } from './world.js';

const BUY_TIME = 12;
const ROUND_TIME = 100;
const OVER_TIME = 5;
const PLANT_TIME = 3.2;
const DEFUSE_TIME = 5;
const BOMB_TIME = 40;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1400;
const PLANT_REWARD = 300;
const START_MONEY = 800;

export function createRounds({ siteRadius = 3.2 } = {}) {
  const state = {
    phase: 'buy',
    round: 1,
    timer: BUY_TIME,
    score: { tide: 0, salt: 0 },
    money: START_MONEY,
    bomb: { planted: false, site: null, timer: 0, defuse: 0, plant: 0, x: 0, z: 0 },
    result: null,
    roundStartMoney: START_MONEY,
  };

  function siteAt(x, z) {
    for (const key of Object.keys(SITES)) {
      const site = SITES[key];
      if (Math.hypot(x - site.x, z - site.z) <= siteRadius) return key;
    }
    return null;
  }

  function setPhase(phase, timer) {
    state.phase = phase;
    state.timer = timer;
  }

  function endRound(winner, reason, events) {
    if (state.phase === 'over') return;
    state.score[winner] += 1;
    state.result = { winner, reason, round: state.round };
    state.money = Math.min(9000, state.money + (winner === 'tide' ? WIN_REWARD : LOSS_REWARD) + (state.bomb.planted && winner === 'salt' ? PLANT_REWARD : 0));
    setPhase('over', OVER_TIME);
    events.push({ kind: 'round', winner, reason });
  }

  function startRound(events) {
    state.round += 1;
    state.bomb = { planted: false, site: null, timer: 0, defuse: 0, plant: 0, x: 0, z: 0 };
    state.result = null;
    setPhase('buy', BUY_TIME);
    events.push({ kind: 'round-start', round: state.round });
  }

  function plant(x, z, site, events) {
    state.bomb.planted = true;
    state.bomb.site = site;
    state.bomb.timer = BOMB_TIME;
    state.bomb.x = x;
    state.bomb.z = z;
    state.bomb.defuse = 0;
    events.push({ kind: 'plant', site });
  }

  function explode(events) {
    endRound('tide', 'the charge went off', events);
    events.push({ kind: 'explode', x: state.bomb.x, z: state.bomb.z });
  }

  // dt is the fixed step; ctx answers what the world looks like now.
  function step(dt, ctx) {
    const events = [];
    if (state.phase === 'over') {
      state.timer = Math.max(0, state.timer - dt);
      if (state.timer === 0) startRound(events);
      return events;
    }

    state.timer = Math.max(0, state.timer - dt);

    if (state.phase === 'buy') {
      if (state.timer === 0 || ctx.readyToGo()) {
        setPhase('live', ROUND_TIME);
        events.push({ kind: 'live' });
      }
      return events;
    }

    const tideAlive = ctx.alive('tide');
    const saltAlive = ctx.alive('salt');

    if (!state.bomb.planted) {
      // An attacker standing on a site with the charge starts the plant; the player must hold E.
      const carrier = ctx.bombCarrier();
      if (carrier && carrier.alive) {
        const site = siteAt(carrier.x, carrier.z);
        if (site) state.bomb.plant += dt;
      }
      const playerSite = ctx.player.alive ? siteAt(ctx.player.x, ctx.player.z) : null;
      if (ctx.playerHoldingUse() && playerSite) state.bomb.plant += dt;
      if (state.bomb.plant >= PLANT_TIME) {
        const planter = ctx.playerHoldingUse() ? { x: ctx.player.x, z: ctx.player.z } : carrier;
        const site = siteAt(planter.x, planter.z);
        if (site) {
          plant(planter.x, planter.z, site, events);
          state.bomb.plant = 0;
        }
      }
    } else {
      state.bomb.timer = Math.max(0, state.bomb.timer - dt);
      // A defender inside the site with nobody of ours watching cuts the wire.
      const defuser = ctx.defuserNear(state.bomb.x, state.bomb.z, 1.6);
      if (defuser && ctx.alive('tide') > 0 && !ctx.enemyNear(state.bomb.x, state.bomb.z, 7, 'tide')) {
        state.bomb.defuse += dt;
        if (state.bomb.defuse >= DEFUSE_TIME) {
          endRound('salt', 'the charge was defused', events);
          return events;
        }
      } else {
        state.bomb.defuse = Math.max(0, state.bomb.defuse - dt * 0.5);
      }
      if (state.bomb.timer === 0) explode(events);
    }

    if (!state.bomb.planted && tideAlive === 0) endRound('salt', 'attackers eliminated', events);
    else if (saltAlive === 0 && !state.bomb.planted) endRound('tide', 'defenders eliminated', events);
    else if (saltAlive === 0 && state.bomb.planted) {
      // No defenders left: the charge only has to finish its clock.
    } else if (!state.bomb.planted && state.timer === 0) endRound('salt', 'the clock ran out', events);

    return events;
  }

  function buy(price) {
    if (state.phase !== 'buy') return false;
    if (state.money < price) return false;
    state.money -= price;
    return true;
  }

  function canBuy(price) {
    return state.phase === 'buy' && state.money >= price;
  }

  function refund(price) {
    state.money = Math.min(9000, state.money + price);
  }

  return {
    state,
    step,
    buy,
    canBuy,
    refund,
    siteAt,
    plant,
    // The site the attackers were pointed at this round, for the HUD's one-line brief.
    brief() {
      return state.bomb.site;
    },
  };
}