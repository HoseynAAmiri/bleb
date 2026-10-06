// Small needs and favorite places. Position choices intentionally allow overlap with page content.
export const QUIET = ['eating', 'nap', 'sunbathing', 'think', 'bubble', 'lookAround', 'hum', 'fishing', 'tv', 'popcorn', 'stargazing', 'phone', 'newspaper', 'read'];
const COST = { newton: 2, blackHole: 5, portal: 6, retro: -3, digitized: 2, pacman: 7, follow: 5, hide: 3, ghost: 3, eating: -8, summer: -4, rainy: -2, snowy: 2, autumn: 2, detective: 4, baseball: 13, basketball: 16, soccer: 16, tennis: 14, swimming: 12, hop: 8, twirl: 7, roll: 6, flip: 9, stroll: 4, faraway: 5, nap: -20, sunbathing: -12, hum: -3, fishing: -4, dancing: 10, biking: 12, kite: 6, cooking: 3, tv: -4, popcorn: -3, stargazing: -6, phone: -2, newspaper: -3 };
const SEQUENCES = [['newton', 'think', 'blackHole', 'portal'], ['retro', 'digitized', 'pacman', 'nap'], ['follow', 'think', 'nap'], ['hide', 'ghost', 'stargazing', 'nap'], ['eating', 'hum', 'nap'], ['summer', 'swimming', 'nap'], ['rainy', 'think', 'sunbathing'], ['snowy', 'hum', 'nap'], ['autumn', 'stroll', 'newspaper'], ['detective', 'lookAround', 'newspaper', 'think'], ['baseball', 'stretch', 'nap'], ['basketball', 'sunbathing', 'hum'], ['roll', 'flip', 'stretch', 'sunbathing'], ['hop', 'flip', 'hum'], ['soccer', 'stretch', 'sunbathing', 'nap'], ['tennis', 'stretch', 'fishing'], ['swimming', 'sunbathing', 'nap'], ['lookAround', 'bubble', 'hum'], ['stroll', 'read', 'think', 'fishing'], ['dancing', 'stretch', 'popcorn'], ['cooking', 'popcorn', 'tv'], ['biking', 'kite', 'sunbathing'], ['stargazing', 'think', 'nap'], ['phone', 'read', 'think', 'tv'], ['hum', 'phone', 'nap'], ['newspaper', 'think', 'nap']];
export function createLife(storageKey) {
  let energy = 80, curiosity = 55, health = 100, recoveredAt = 0, injuredAt = 0, hurtHealth = 100, last = Date.now();
  let favorites = [], queue = [];
  try { const data = JSON.parse(localStorage.getItem(storageKey + '.favorites')); if (Array.isArray(data)) favorites = data.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(-5); } catch {}
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function sync() {
    const now = Date.now(), seconds = Math.max(0, now - last) / 1000; last = now;
    energy = Math.min(100, energy + seconds * .16); curiosity = Math.min(100, curiosity + seconds * .3);
    if (recoveredAt) {
      health = Math.min(100, hurtHealth + (100 - hurtHealth) * (now - injuredAt) / (recoveredAt - injuredAt));
      if (now >= recoveredAt) { health = 100; recoveredAt = 0; }
    }
  }
  return {
    get state() { sync(); return { energy, curiosity, health, recovering: !!recoveredAt, recoveryRemaining: Math.max(0, recoveredAt - Date.now()), favorites: favorites.map(p => ({...p})), sequence: [...queue] }; },
    remember(p) {
      const point = { x: p.x / innerWidth, y: p.y / innerHeight };
      favorites = favorites.filter(q => Math.hypot(q.x - point.x, q.y - point.y) > .08); favorites.push(point); favorites = favorites.slice(-5);
      try { localStorage.setItem(storageKey + '.favorites', JSON.stringify(favorites)); } catch {}
    },
    destination(home) {
      sync(); curiosity = Math.max(0, curiosity - 30);
      if (favorites.length && Math.random() < .6) { const p = pick(favorites); return {x:p.x * innerWidth,y:p.y * innerHeight}; }
      return Math.random() < .2 ? home : {x:24 + Math.random() * Math.max(0,innerWidth - 150),y:65 + Math.random() * Math.max(0,innerHeight - 200)};
    },
    choose() {
      sync();
      if (recoveredAt || energy < 30) { queue = []; return pick(QUIET); }
      if (!queue.length) queue = [...pick(SEQUENCES)];
      return queue.shift();
    },
    performed(name) { sync(); energy = Math.max(0, Math.min(100, energy - (COST[name] || 1))); },
    interrupt() { queue = []; },
    injure(speed) {
      sync(); injuredAt = Date.now(); hurtHealth = Math.max(20, 65 - (speed - 650) / 28); health = hurtHealth;
      recoveredAt = injuredAt + Math.max(60000, Math.min(120000, 60000 + (speed - 650) * 60));
      energy = Math.min(energy, 20); queue = [];
    },
  };
}
