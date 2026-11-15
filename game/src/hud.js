// The DOM HUD: health, ammunition, the round clock, the two scores, the money, the kill feed,
// the buy menu and the overlay. It never touches the simulation; main.js pushes numbers in and
// reads callbacks out. Text is only written when the value it shows changes.
const COPY = {
  start: {
    title: 'Harbor Line',
    copy: 'Dusk at the fish market. Tide squad attacks, Salt holds. Plant the charge or clear the site. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Harbor Line',
    copy: 'Paused. Click to resume the round.',
    action: 'Click to resume',
  },
  dead: {
    title: 'Down',
    copy: 'Your squad carries on without you. Next round when the clock turns.',
    action: 'Click to spectate',
  },
  won: {
    title: 'Round won',
    copy: 'Tide takes the round.',
    action: 'Click to continue',
  },
  lost: {
    title: 'Round lost',
    copy: 'Salt holds. Buy again next round.',
    action: 'Click to continue',
  },
};

const KILL_HOLD_MS = 4200;

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const health = document.getElementById('health');
  const healthFill = document.getElementById('health-fill');
  const timer = document.getElementById('timer');
  const roundValue = document.getElementById('round-value');
  const tideScore = document.getElementById('tide-score');
  const saltScore = document.getElementById('salt-score');
  const money = document.getElementById('money');
  const bombState = document.getElementById('bombstate');
  const hint = document.getElementById('hint');
  const killfeed = document.getElementById('killfeed');
  const damage = document.getElementById('damage');
  const hitmarker = document.getElementById('hitmarker');
  const buy = document.getElementById('buy');
  const buyList = document.getElementById('buy-list');

  let hitTimer = 0;
  let damageTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastTimer = '';
  let lastRound = -1;
  let lastTide = -1;
  let lastSalt = -1;
  let lastMoney = -1;
  let lastBomb = null;
  let lastHint = null;
  let lastWeapon = '';
  let buyPick = null;

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      if (name === lastWeapon) return;
      lastWeapon = name;
      weaponName.textContent = name;
    },
    setHealth(value) {
      if (value === lastHealth) return;
      lastHealth = value;
      health.firstChild.textContent = String(Math.max(0, Math.round(value)));
      healthFill.style.width = `${Math.max(0, Math.min(100, value))}%`;
      health.classList.toggle('hurt', value <= 35);
    },
    setTimer(seconds, low) {
      const whole = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
      if (text !== lastTimer) {
        lastTimer = text;
        timer.textContent = text;
      }
      timer.classList.toggle('low', Boolean(low));
    },
    setRound(round) {
      if (round === lastRound) return;
      lastRound = round;
      roundValue.textContent = String(round);
    },
    setScore(tide, salt) {
      if (tide !== lastTide) {
        lastTide = tide;
        tideScore.textContent = String(tide);
      }
      if (salt !== lastSalt) {
        lastSalt = salt;
        saltScore.textContent = String(salt);
      }
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      money.textContent = `$${value}`;
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombState.hidden = text === null;
      if (text !== null) bombState.textContent = text;
    },
    setHint(text) {
      if (text === lastHint) return;
      lastHint = text;
      hint.hidden = text === null;
      if (text !== null) hint.textContent = text;
    },
    kill(text, team) {
      const line = document.createElement('div');
      const mark = document.createElement('b');
      mark.className = team;
      mark.textContent = text;
      line.appendChild(mark);
      killfeed.appendChild(line);
      while (killfeed.childElementCount > 4) killfeed.firstElementChild.remove();
      setTimeout(() => line.remove(), KILL_HOLD_MS);
    },
    damage(power = 0.7) {
      damage.style.opacity = String(Math.min(0.9, power));
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => {
        damage.style.opacity = '0';
      }, 110);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra ? `${text.copy} ${extra}` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      buy.hidden = true;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    // The buy menu is a list of rows; a row knows its own key, so the same handler serves a
    // click and the number keys main.js forwards.
    openBuy(rows, wallet) {
      buyList.replaceChildren();
      buyPick = null;
      for (const row of rows) {
        const item = document.createElement('li');
        const index = document.createElement('i');
        index.textContent = String(row.slot);
        const label = document.createElement('span');
        label.textContent = row.label;
        const price = document.createElement('i');
        price.textContent = row.owned ? 'owned' : `$${row.price}`;
        item.appendChild(index);
        item.appendChild(label);
        item.appendChild(price);
        item.classList.toggle('poor', !row.owned && row.price > wallet);
        item.classList.toggle('owned', Boolean(row.owned));
        item.addEventListener('click', () => {
          if (buyPick) buyPick(row);
        });
        buyList.appendChild(item);
      }
      buy.hidden = false;
    },
    closeBuy() {
      buy.hidden = true;
      buyPick = null;
    },
    buyOpen() {
      return !buy.hidden;
    },
    pickBuySlot(slot) {
      if (buy.hidden) return false;
      const rows = buyList.children;
      for (let index = 0; index < rows.length; index += 1) {
        const item = rows[index];
        if (item.firstChild.textContent === String(slot)) {
          item.click();
          return true;
        }
      }
      return false;
    },
    onBuy(handler) {
      buyPick = handler;
    },
  };
}