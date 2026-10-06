import { TEMPLATE, LINES, LEVELS, TEMPER, SPORT } from './content.js';
import { MOVES, createActivities } from './activities.js';
import { createLife, QUIET } from './life.js';
import { throwBleb } from './inertia.js';

// One Bleb per page. The host supplies a home position and work events, never DOM internals.
export function createBleb({ mount = document.body, getHome = () => ({ x: 40, y: 100 }), storageKey = 'bleb.home', getReadingTarget = () => null } = {}) {
  if (document.getElementById('jelly')) throw new Error('Bleb is already mounted');
  const holder = document.createElement('div'); holder.innerHTML = TEMPLATE;
  const J = holder.firstElementChild; mount.append(J);
  const $ = id => J.querySelector('#' + id);
  const controller = new AbortController(), { signal } = controller;
  const life = createLife(storageKey);
  let residence = null, residenceUntil = Date.now() + 30000, flight = null, cancelFlight = null, dizzyUntil = 0, recentlyRecovered = false;
  const timers = new Set(), intervals = new Set(), particles = new Set(), worldEffects = new Set();
  const setTimeout = (fn, ms) => { const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimeout = id => { window.clearTimeout(id); timers.delete(id); };
  const setInterval = (fn, ms) => { const id = window.setInterval(fn, ms); intervals.add(id); return id; };
  const clearInterval = id => { window.clearInterval(id); intervals.delete(id); };
  // ---- jelly ----
  // Bleb only watches what you do and comments now and then; nothing here touches the text.
  // It lives above the outline, hops to the middle of the screen for the messages that matter,
  // and can be dragged anywhere (that spot becomes its home; double-click sends it back).
  // Clicking or moving it over and over makes it nervous, then angry; it calms down if left alone.
  // After 45 minutes of work without a five-minute break it tells you to rest.
  // It also moves in depth: backing away small into the page or coming up close.
  const JB = J.querySelector('.body'), HOP = J.querySelector('.hop');
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let level = 'middle', levelUntil = 0, movingUntil = 0, total = 0, activity = null;
  const lastLine = new Map();
  function line(key) { const list = LINES[key] || []; const choices = list.filter(x => x !== lastLine.get(key)); const text = pick(choices.length ? choices : list); lastLine.set(key, text); return text; }
  function holdLevel() { const [a, b] = LEVELS[level].dwell; levelUntil = Date.now() + a + Math.random() * (b - a); }
  function setLevel(name) {
    if (!(name in LEVELS)) throw new Error('Unknown depth level: ' + name);
    if (gone || drag || busy || flight || life.state.recovering) return false;
    stopPlay(); level = name; holdLevel(); movingUntil = Date.now() + 2100; walkDepth(LEVELS[level].scale); return true;
  }
  holdLevel();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = Date.now(), spoke = 0, nudged = false, asleep = false, typed = 0, doneSeen = null;
  let pos = { x: 0, y: 0 }, home = null, drag = null, sayId = 0, busy = false, ptr = null, poke = 0, gone = false, since = Date.now(), tempTimer, coolAt = Infinity;
  try { home = JSON.parse(localStorage.getItem(storageKey)); } catch { }

  const mood = m => {
    if (life.state.recovering && !['held', 'sleepy', 'dizzy'].includes(m)) m = Date.now() < dizzyUntil ? 'dizzy' : 'sore';
    J.className = J.className.replace(/\b(happy|excited|joy|curious|held|sleepy|nervous|angry|cheeky|wink|smug|think|dizzy|sore|woozy)\b/, m);
    J.classList.toggle('mad', poke >= 6 && !asleep);
  };
  // Temper starts cooling after an uninterrupted quiet period, then drops slowly by one step.
  const base = () => life.state.recovering ? (Date.now() < dizzyUntil ? 'dizzy' : 'sore') : asleep ? 'sleepy' : poke >= 6 ? 'angry' : poke >= 3 ? 'nervous' : 'happy';
  // Show the thermometer for a moment; dir is +1 when the temper rises, -1 when it cools.
  function temp(dir) {
    const T = $('temp');
    T.style.setProperty('--t', poke / 8); T.dataset.dir = dir > 0 ? '▲' : '▼';
    T.classList.add('on');
    clearTimeout(tempTimer); tempTimer = setTimeout(() => T.classList.remove('on'), 3000);
  }
  // Pushed to the limit it sometimes storms off: says so, turns its back, walks away and is gone in a puff of smoke.
  // It comes back on its own once it has cooled to merely nervous.
  let vanishedAt = null, vanishedDepth = 1;
  function storm() {
    if (gone || flight || life.state.recovering) return;
    coolAt = Date.now() + TEMPER.quietBeforeCooling;
    vanishedDepth = LEVELS[level].scale;
    const m = new DOMMatrixReadOnly(getComputedStyle(J).transform);
    vanishedAt = { x: m.m41, y: m.m42 };
    J.classList.add('drag'); moveTo(vanishedAt); void J.offsetWidth; J.classList.remove('drag');
    say(pick(LINES.leave), { force: true, feel: 'angry' });
    gone = true;
    setTimeout(() => {
      hush();
      walkDepth(0, 1500, () => {  // turns its back and stomps off until it is a dot
        for (let k = 0; k < 7; k++) floaty('', `width:20px; height:20px; margin:${10 + Math.random() * 30}px 0 0 ${-30 + Math.random() * 40}px; border-radius:50%; filter:blur(3px); background:color-mix(in srgb, var(--fg) 50%, white)`,
          { transform: ['scale(.4)', `translate(${(Math.random() - .5) * 70}px, ${-20 - Math.random() * 40}px) scale(2.2)`], opacity: [.8, 0] }, 900 + Math.random() * 500);
        J.classList.add('gone');
      });
    }, 1700);
  }
  function comeBack() {
    gone = false; busy = true;
    J.classList.remove('gone', 'back'); moveTo(vanishedAt || pos);
    walkDepth(vanishedDepth, 1500, () => say(pick(LINES.sulked), { force: true, stay: true }));  // walks back in from the distance
  }
  function poked() {
    if (gone) return true;
    if (life.state.recovering) { say(line('hurt'), {force:true, stay:true}); return true; }
    poke = Math.min(8, poke + 1);
    coolAt = Date.now() + TEMPER.quietBeforeCooling;
    if (poke >= 2) temp(1);
    if (poke >= 8 && Math.random() < .7) { storm(); return true; }
    if (poke >= 3) say(pick(poke >= 6 ? LINES.angry : LINES.nervous), { force: true });
    return poke >= 3;
  }
  // One-off moves, played on .hop so they stack with the looping vibe of the body.

  const FEEL = { think: 'nod', cheeky: 'squish', wink: 'nod', smug: 'squish', happy: 'nod', excited: 'jump', joy: 'spin', curious: 'rock', nervous: 'squish', angry: 'squish' };
  function act(name) {
    if (calm || (life.state.recovering && !['nod', 'squish'].includes(name))) return;
    const [frames, duration, iterations = 1] = MOVES[name];
    HOP.animate({ transform: frames }, { duration, iterations, easing: 'ease-out' });
    if (name === 'flip') {
      const owner=playId, message=sayId;
      for (let i=0;i<iterations;i++) {
        setTimeout(() => { if (owner===playId && message===sayId && !drag && !gone && !flight) J.classList.add('back'); }, i*duration+duration*.25);
        setTimeout(() => { if (owner===playId && message===sayId) J.classList.remove('back'); }, i*duration+duration*.75);
      }
    }
    if (['roll','flip'].includes(name) && Math.random() < .35) {
      const owner = playId, message = sayId;
      setTimeout(() => {
        if (owner !== playId || message !== sayId || drag || gone || flight || life.state.recovering) return;
        mood('woozy');
        HOP.animate({transform:['rotate(-9deg)','rotate(8deg)','rotate(-5deg)','rotate(4deg)','rotate(0)']}, {duration:2400,easing:'ease-in-out'});
        setTimeout(() => {
          if (owner === playId && message === sayId && !drag && !gone && !flight && !life.state.recovering) mood(playing ? 'joy' : base());
        },2400);
      },duration * iterations);
    }
  }
  function confetti(n) {
    if (calm || life.state.recovering) return;
    const b = JB.getBoundingClientRect(), colors = ['#e8b84a', '#e0667a', '#5aa9e6', '#7fb8a6', '#b58be0'];
    for (let k = 0; k < n; k++) {
      const c = document.createElement('i'), a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 90 + Math.random() * 170;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v, r = (Math.random() - .5) * 720;
      c.style.cssText = `position:fixed; left:${b.left + b.width / 2}px; top:${b.top + 12}px; width:7px; height:${4 + Math.random() * 6}px; background:${pick(colors)}; border-radius:1.5px; pointer-events:none; z-index:19`;
      document.body.append(c); particles.add(c);
      c.animate([{ transform: 'translate(0, 0) rotate(0)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${r}deg)`, opacity: 1, offset: .35 },
      { transform: `translate(${dx * 1.4}px, ${dy + 280}px) rotate(${r * 3}deg)`, opacity: 0 }],
        { duration: 1500 + Math.random() * 800, easing: 'cubic-bezier(.2, .8, .4, 1)' }).onfinish = () => { c.remove(); particles.delete(c); };
    }
  }
  // Stop whatever it is saying.
  const hush = () => { sayId++; busy = false; J.classList.remove('talk'); };
  const inView = p => ({ x: Math.max(4, Math.min(p.x, innerWidth - 80)), y: Math.max(4, Math.min(p.y, innerHeight - 78)) });
  function moveTo(p) {
    pos = inView(p);
    J.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(var(--s, 1))`;
  }
  // Depth: 1 is its normal distance, below 1 it backs away into the page, above 1 it comes up close.
  let zNow = 1, walkId = 0;
  const setZ = z => { zNow = z; J.style.setProperty('--s', z); J.classList.toggle('far', z < .8); };
  // Snap to a depth with a springy pop, dropping any walk in progress.
  function depth(z) {
    walkId++; setZ(z);
    J.classList.remove('walk');
    if (z >= .8) J.classList.remove('back');
  }
  // Walk to depth z over ms, waddling. Heading off into the distance it first turns its back on
  // you, walks away, and (unless it is leaving for good, z = 0) turns round to look at you once
  // it gets there. Coming toward you it walks facing you.
  function walkDepth(z, ms = 1600, then) {
    if (calm) { depth(z); then?.(); return; }
    const id = ++walkId, away = z < zNow, t0 = away ? 340 : 0;
    const step = (fn, at) => setTimeout(() => { if (id === walkId) fn(); }, at);
    const turn = (toBack, at) => {
      step(() => HOP.animate({ transform: ['scaleX(1)', 'scaleX(0)', 'scaleX(1)'] }, 340), at);
      step(() => J.classList.toggle('back', toBack), at + 170);
    };
    if (away) turn(true, 0);
    step(() => {
      J.style.setProperty('--walk', ms + 'ms'); J.classList.add('walk'); setZ(z);
      HOP.animate({ transform: ['rotate(-8deg) translateY(0)', 'rotate(0) translateY(-5px)', 'rotate(8deg) translateY(0)', 'rotate(0) translateY(-5px)', 'rotate(-8deg) translateY(0)'] },
        { duration: 420, iterations: Math.max(1, Math.round(ms / 420)) });
    }, t0);
    step(() => { J.classList.remove('walk'); if (away && z > 0) turn(false, 0); then?.(); }, t0 + ms);
  }
  // From far away it walks home; from its normal distance it leaps.
  function goHome() {
    movingUntil = Date.now() + 2100;
    moveTo(homePos()); walkDepth(LEVELS[level].scale);
  }
  // Travel there with a leap (a short move is just a slide).
  function leapTo(p) {
    if (Math.hypot(p.x - pos.x, p.y - pos.y) > 60) act('leap');
    moveTo(p);
  }
  // Home is where you dropped it, else just above the outline.
  function homePos() {
    if (residence) return inView(residence);
    if (home) return home;
    return getHome();
  }
  const settle = () => { if (!drag && !busy && !gone && !playing && !flight) moveTo(homePos()); };  // never pulls it back mid-message
  window.addEventListener('resize', settle, { signal });

  // Each pupil turns toward the pointer on its own, so the eyes converge on it when it is close.
  function look() {
    if (!ptr || daydream || Date.now() < dizzyUntil) return;  // while it daydreams the eyes wander on their own
    for (const eye of J.querySelectorAll('.eye')) {
      const b = eye.getBoundingClientRect(), dx = ptr.x - b.left - b.width / 2, dy = ptr.y - b.top - b.height / 2;
      const d = Math.hypot(dx, dy) || 1, m = Math.min(4, d / 25);
      eye.style.setProperty('--px', dx / d * m + 'px'); eye.style.setProperty('--py', dy / d * m + 'px');
    }
  }
  J.addEventListener('transitionend', look);

  // Speed lines: n short dashes left behind the blob, along the direction it is moving (angle a).
  function dashes(a, n) {
    const b = JB.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    for (let k = 0; k < n; k++) {
      const d = document.createElement('i'), back = 34 + Math.random() * 16, side = (Math.random() - .5) * 46;
      d.style.cssText = `position:fixed; left:${cx - Math.cos(a) * back - Math.sin(a) * side}px; top:${cy - Math.sin(a) * back + Math.cos(a) * side}px; width:${12 + Math.random() * 16}px; height:3px; margin:-1px 0 0 -10px; border-radius:2px; background:var(--fg); pointer-events:none; z-index:19`;
      document.body.append(d); particles.add(d);
      d.animate({ transform: [`rotate(${a}rad) translateX(0)`, `rotate(${a}rad) translateX(-26px)`], opacity: [.85, 0] }, { duration: 480, easing: 'ease-out' }).onfinish = () => { d.remove(); particles.delete(d); };
    }
  }
  // Get away to p with a cheeky face: one big jump, a slow scurry with quick little steps, or a
  // retreat into the distance where it sits small and blurry, either straight back on the spot
  // or sideways at the same time. The sideways ones trail speed lines.
  function escape(p) {
    const a = Math.atan2(p.y - pos.y, p.x - pos.x);
    mood('cheeky');
    if (calm) return moveTo(p);
    const how = Math.random();
    if (how < .15) return walkDepth(.36, 900);  // turns and hurries straight back into the page, without moving sideways
    if (how < .3) { dashes(a, 5); walkDepth(.42, 900); return setTimeout(() => { if (!busy && !drag) trot(p); }, 340); }  // turns and runs off sideways into the distance
    if (how < .6) {
      dashes(a, 6); leapTo(p);
      setTimeout(() => act('squish'), 760);
      return;
    }
    trot(p);
    const trail = setInterval(() => dashes(a, 2), 110);
    setTimeout(() => { clearInterval(trail); act('squish'); }, 1500);
  }
  // Walk to p over a second and a half with quick little steps, leaning the way it goes.
  let trotTimer, trotId = 0;
  function trot(p, turn = false) {
    const id = ++trotId;
    if (turn && !calm) {
      HOP.animate({ transform: ['scaleX(1)', 'scaleX(.08)', 'scaleX(1)'] }, 360);
      setTimeout(() => { if (id === trotId && !drag && !gone) trot(p); }, 360);
      return;
    }
    const lean = p.x > pos.x ? -14 : 14;
    J.classList.add('run'); moveTo(p);
    HOP.animate({ transform: [`translateY(0) skewX(${lean}deg)`, `translateY(-7px) skewX(${lean}deg) scale(.96,1.05)`, `translateY(0) skewX(${lean}deg) scale(1.06,.94)`] }, { duration: 190, iterations: 8 });
    clearTimeout(trotTimer); trotTimer = setTimeout(() => J.classList.remove('run'), 1500);
  }

  // Now and then it plays by itself, like a kid who has stopped paying attention to you: hums a
  // tune, looks around, twirls, wanders off a few steps and back, blows a bubble, hops, comes up
  // close to peek at you, backs straight into the page, bobs in and out, walks off sideways into
  // the distance and back, thinks a thought out loud, or naps.
  let ghosted = false, ghostTimer = null, ghostVersion = 0, following = null;
  let attention = null, attentionAfter = Date.now() + 90000;
  let finale = null, completionPending = false;
  let playing = false, daydream = false, playId = 0;
  function stopPlay() {
    if (following) { clearInterval(following.timer); following = null; busy = false; J.classList.remove('following','pursuing'); }
    if (attention) { attention = null; busy = false; J.classList.remove('attention'); }
    endFinale(false);
    if (activity === 'flip') J.classList.remove('back');
    playId++; playing = false; daydream = false; activity = null; J.classList.remove('talk');
    J.querySelectorAll('.sport-scene').forEach(el => el.remove());
    worldEffects.forEach(el => el.remove()); worldEffects.clear();
    J.classList.remove('portal-jump');
    J.classList.remove('reading', 'tiptoe', 'back'); $('say').replaceChildren();
    for (const c of [...J.classList]) if (c.startsWith('sport-')) J.classList.remove(c);
    HOP.getAnimations().forEach(a => a.cancel());
  }


  function floaty(text, css, frames, duration) {
    const b = JB.getBoundingClientRect(), el = document.createElement('i');
    el.textContent = text;
    const tone = getComputedStyle(J).getPropertyValue('--accent').trim();
    el.style.cssText = `position:fixed; left:${b.left + b.width / 2}px; top:${b.top}px; pointer-events:none; z-index:19; font:700 15px system-ui, sans-serif; --accent:${tone}; color:var(--accent); text-shadow:0 0 6px color-mix(in srgb, var(--accent) 40%, transparent); ${css}`;
    document.body.append(el); particles.add(el);
    el.animate(frames, { duration, easing: 'ease-out' }).onfinish = () => { el.remove(); particles.delete(el); };
  }
  const mine = fn => { const id = playId; return (...a) => { if (id === playId && playing && !busy && !drag && !gone) fn(...a); }; };  // later steps are dropped if you interrupt
  const PLAY = createActivities({
    J, HOP, mood, mine, floaty, act, trot, homePos, depth, walkDepth, pick, say,
    addWorldEffect: el => { document.body.append(el); worldEffects.add(el); },
    teleport: p => { J.classList.add('portal-jump'); moveTo(p); void J.offsetWidth; J.classList.remove('portal-jump'); residence = {...pos}; residenceUntil = Date.now()+45000; },
    setDaydream: value => { daydream = value; }, restingDepth: () => LEVELS[level].scale, setTimeout, getReadingTarget, moveTo, position: () => ({...pos})
  });

  function play(name) {
    if (calm || gone || drag || busy || flight || Date.now() < movingUntil) return false;
    if (name === 'ghost') return becomeGhost();
    if (name === 'follow') return followCursor();
    if (name && !(name in PLAY)) throw new Error('Unknown activity: ' + name);
    if (name && life.state.recovering && !QUIET.includes(name)) return false;
    stopPlay(); playing = true; const id = playId;
    activity = name || life.choose();
    if (activity === 'ghost') { playing = false; activity = null; return becomeGhost(); }
    if (activity === 'follow') { playing = false; activity = null; return followCursor(); }
    life.performed(activity);
    const ms = PLAY[activity]();
    if (activity !== 'read' && playing && LINES[activity] && Math.random() < .6) {
      $('say').textContent = line(activity); $('say').className = pos.y < 80 ? 'right' : ''; J.classList.add('talk');
      setTimeout(mine(() => J.classList.remove('talk')), Math.min(ms, 3500));
    }  // humming, thinking and napping come up more
    setTimeout(() => { if (id !== playId) return; stopPlay(); if (!busy && !drag && !gone) { mood(base()); depth(LEVELS[level].scale); } }, ms);
    return true;
  }
  // Sometimes, when the pointer comes close, it gets out of reach (more often when nervous, never
  // when angry). After three escapes in a row it stays put for a while so you can catch it.
  let wasNear = false, dodges = 0, dodgeAfter = 0, dodgeTimer;
  function maybeDodge() {
    if (ghosted || following) return;
    const cx = pos.x + 38, cy = pos.y + 33, near = Math.hypot(ptr.x - cx, ptr.y - cy) < 80;
    const go = near && !wasNear && !['fishing', 'phone'].includes(activity) && !busy && !drag && !asleep && !gone && !flight && !life.state.recovering && Date.now() >= movingUntil && poke < 6 && Date.now() > dodgeAfter && Math.random() < (poke >= 3 ? .7 : .35);
    wasNear = near;
    if (!go) return;
    const a = Math.atan2(cy - ptr.y, cx - ptr.x) + (Math.random() - .5) * 1.2;
    const to = t => inView({ x: pos.x + 180 * Math.cos(t), y: pos.y + 180 * Math.sin(t) });
    let p = to(a);
    if (Math.hypot(p.x + 38 - ptr.x, p.y + 33 - ptr.y) < 110) p = to(a + (Math.random() < .5 ? 1 : -1) * Math.PI / 2);  // cornered: go sideways
    if (++dodges >= 3) { dodges = 0; dodgeAfter = Date.now() + 12000; } else dodgeAfter = Date.now() + 700;
    stopPlay(); escape(p);
    clearTimeout(dodgeTimer);
    if (Math.random() < .4) say(pick(LINES.dodge), { force: true, feel: 'cheeky' });
    else dodgeTimer = setTimeout(() => { if (!busy && !drag && !gone) { mood(base()); goHome(); } }, 3500);
  }

  // Unprompted lines are spaced at least 25 s apart; replies to something you did (force) always show.
  // travel: leap to the middle of the screen to say it, then go back home. party: confetti pieces.
  function say(text, { force, travel, feel = base(), party = 0, stay = false } = {}) {
    if (!force && Date.now() - spoke < 25000) return;
    if (gone || flight) return;
    life.interrupt();
    if (life.state.recovering) { travel = false; stay = true; party = 0; }
    stopPlay(); spoke = Date.now(); busy = true; daydream = false; J.classList.remove('run'); if (travel) depth(1);
    const id = ++sayId, S = $('say');
    travel = travel && !drag;
    const speak = () => {
      if (id !== sayId) return;
      mood(feel);
      S.textContent = text; S.className = '';
      if (innerWidth - pos.x - 76 < S.offsetWidth + 30) S.className = 'left';  // no room on the right
      else if (pos.y < S.offsetHeight + 20) S.className = 'right';  // no room on top
      J.classList.add('talk'); act(feel === 'joy' ? pick(['jump','spin','flip','roll','rock','squish']) : FEEL[feel] || 'squish'); confetti(party);
    };
    if (travel) { leapTo({ x: innerWidth / 2 - 38, y: innerHeight / 2 - 33 }); setTimeout(speak, calm ? 0 : 780); } else speak();
    setTimeout(() => {
      if (id !== sayId) return;
      J.classList.remove('talk'); busy = false;
      if (!drag) { mood(base()); if (!stay) goHome(); }
    }, travel ? 5600 : 4200);
  }
  function becomeGhost() {
    if (ghosted || calm || gone || drag || flight || busy || life.state.recovering) return false;
    stopPlay(); hush();
    ghosted = true; $('say').dataset.ghost = ''; const version = ++ghostVersion;
    const avatar = document.createElementNS('http://www.w3.org/2000/svg','svg');
    avatar.setAttribute('viewBox','0 0 180 125'); avatar.setAttribute('class','ghost-avatar'); avatar.setAttribute('aria-hidden','true');
    avatar.innerHTML = SPORT.ghost; HOP.append(avatar);
    J.classList.add('ghost-mode','ghost-enter'); busy = true;
    $('say').textContent = 'Boo. You can’t catch a ghost.'; $('say').className = ''; J.classList.add('talk');
    setTimeout(() => {
      if (version !== ghostVersion) return;
      J.classList.remove('ghost-enter','talk'); busy = false; movingUntil = Date.now();
      if (ptr && Math.random() < .85) followCursor();
    },2600);
    ghostTimer = setTimeout(() => {
      if (version !== ghostVersion) return;
      J.classList.add('ghost-return');
      setTimeout(() => {
        if (version !== ghostVersion) return;
        ghosted = false; delete $('say').dataset.ghost; avatar.remove(); J.classList.remove('ghost-mode','ghost-return');
      },1800);
    },90000);
    return true;
  }
  function followCursor() {
    if (calm || gone || drag || flight || busy || life.state.recovering) return false;
    stopPlay(); hush(); life.interrupt(); walkId++; trotId++;
    clearTimeout(trotTimer); clearTimeout(dodgeTimer);
    depth(1); J.classList.remove('run','walk','back'); J.classList.add('following');
    busy = true; mood('curious');
    const chase = {start:Date.now(),last:Date.now(),phase:0,timer:null}; following = chase;
    const speak = text => { $('say').textContent=text; $('say').className=''; J.classList.add('talk'); };
    speak('Oh, don’t mind me. Just looking.');
    chase.timer = setInterval(() => {
      if (following !== chase) return;
      const now = Date.now(), elapsed = now-chase.start, dt = Math.min(.2,(now-chase.last)/1000); chase.last=now;
      if (elapsed > 30000) { stopPlay(); say('Okay, you’re interesting. I admit it.',{force:true,feel:'happy'}); return; }
      if (elapsed > 6000 && chase.phase === 0) { chase.phase=1; speak('Where are you going?'); }
      if (elapsed > 15000 && chase.phase === 1) { chase.phase=2; J.classList.add('pursuing'); mood('excited'); speak('Wait! I need to investigate!'); }
      if (!ptr) return;
      const dx=ptr.x-(pos.x+38), dy=ptr.y-(pos.y+33), distance=Math.hypot(dx,dy);
      const gap=chase.phase===2 ? 45 : chase.phase===1 ? 75 : 115;
      const speed=chase.phase===2 ? 180 : chase.phase===1 ? 85 : 35;
      // Pauses between the first little steps make the approach look tentative.
      if (distance > gap && (chase.phase || elapsed%1600<750)) {
        const step=Math.min(distance-gap,speed*dt);
        moveTo({x:pos.x+dx/distance*step,y:pos.y+dy/distance*step});
      }
      look();
    },100);
    return true;
  }
  function seekAttention() {
    if (ghosted || busy || gone || drag || flight || asleep || poke || life.state.recovering) return false;
    stopPlay(); hush(); life.interrupt(); walkId++; trotId++;
    clearTimeout(trotTimer); clearTimeout(dodgeTimer);
    const owner = {}; attention = owner; attentionAfter = Date.now() + 180000;
    busy = true; spoke = Date.now(); J.classList.remove('run','walk','back');
    depth(1.15); mood('curious');
    const target = ptr ? {x:ptr.x + 65,y:ptr.y + 35} : {x:innerWidth*.6,y:innerHeight*.55};
    if (!calm) leapTo(inView(target));
    J.classList.add('attention','talk'); $('say').className = 'left'; $('say').textContent = line('attention');
    for (const delay of [12000,26000]) setTimeout(() => {
      if (attention !== owner) return;
      $('say').textContent = line('attention'); act('nod');
    },delay);
    setTimeout(() => {
      if (attention !== owner) return;
      stopPlay(); say('I’ll be over here when you want company.', {force:true,feel:'happy'});
    },45000);
    return true;
  }
  function endFinale(returnHome = true) {
    if (!finale) return;
    finale.remove(); finale = null; sayId++;
    J.classList.remove('finale', 'talk', 'back'); busy = false;
    HOP.getAnimations().forEach(a => a.cancel());
    particles.forEach(el => el.remove()); particles.clear();
    depth(LEVELS[level].scale); mood(base());
    if (returnHome && !drag) goHome();
  }
  function celebrateCompletion() {
    if (gone || drag || flight) return false;
    stopPlay(); hush(); life.interrupt(); walkId++; trotId++;
    clearTimeout(trotTimer); clearTimeout(dodgeTimer);
    busy = true; asleep = false; spoke = Date.now();
    const stage = document.createElement('div');
    stage.className = 'bleb-finale' + (calm ? ' still' : '');
    stage.innerHTML = '<div class="finale-light"></div><div class="finale-heading" role="status"><span>Every chunk. Every word.</span><strong>Review complete!</strong><small>Take a bow. You earned this.</small></div><div class="finale-curtain left"></div><div class="finale-curtain right"></div>';
    document.body.append(stage); finale = stage;
    J.classList.remove('run','walk','back'); J.classList.add('finale');
    if (!life.state.recovering) { depth(1.65); leapTo({x:innerWidth/2-38,y:innerHeight*.58-33}); }
    const step = (ms, fn) => setTimeout(() => { if (finale === stage) fn(); }, ms);
    const message = text => { $('say').className=''; $('say').textContent=text; J.classList.add('talk'); };
    step(calm ? 0 : 850, () => { mood('joy'); message('You did it. Every single chunk!'); act('jump'); confetti(100); });
    if (!calm) {
      step(2900, () => { act('spin'); message('A tiny dance for a HUGE achievement.'); });
      step(4500, () => act('rock'));
      step(6100, () => { act('jump'); confetti(65); });
      step(8100, () => {
        message('And a bow for my favorite reviewer.'); mood('happy');
        if (!life.state.recovering) HOP.animate({transform:['scale(1)','translateY(8px) scale(1.16,.72) rotate(-8deg)','translateY(8px) scale(1.16,.72) rotate(-8deg)','scale(1)']},{duration:2000,easing:'ease-in-out'});
      });
      step(10500, () => { J.classList.remove('talk'); stage.classList.add('closed'); });
      step(13000, () => { stage.classList.remove('closed'); message('That’s a wrap. Go enjoy your break!'); act('nod'); });
    }
    step(calm ? 6000 : 16000, () => endFinale());
    return true;
  }
  window.addEventListener('keydown', e => { if (e.key === 'Escape') endFinale(); }, {signal});
  function progress(n, count) {
    total = count;
    const N = total, q = k => Math.floor(4 * k / N);
    if (doneSeen != null && n > doneSeen) {
      if (N > 0 && n >= N) completionPending = !celebrateCompletion();
      else if (q(n) > q(doneSeen)) say(LINES.quarter[q(n)], { force: true, travel: true, feel: 'joy', party: Math.random() < .35 ? 80 : 0 });
      else say(`${n} of ${N} reviewed. ${pick(LINES.next)}`, { force: true, travel: true, feel: 'joy', party: Math.random() < .12 ? 30 : 0 });
    }
    if (n < N) completionPending = false;
    const first = doneSeen == null;
    doneSeen = n;
    requestAnimationFrame(() => { if (signal.aborted) return; settle(); if (first) say(pick(LINES.greet), { force: true, feel: 'wink' }); });  // the outline may have moved
  }
  function awake(e) {
    if (Date.now() - active > 100000) since = Date.now();  // back from a real break: restart the work clock
    active = Date.now(); nudged = false;
    if (e.type === 'pointermove') { ptr = { x: e.clientX, y: e.clientY }; look(); maybeDodge(); }
    if (asleep && !life.state.recovering) { asleep = false; say(pick(LINES.back), { force: true, feel: 'excited' }); act('stretch'); }
  }
  for (const ev of ['keydown', 'pointerdown', 'pointermove']) window.addEventListener(ev, awake, { capture: true, signal });
  function edited() { if (++typed % 40 === 0) say(pick(LINES.edit), { feel: pick(['wink', 'joy', 'excited', 'smug', 'happy']) }); }

  // Choose a temporary residence, then settle before starting an activity sequence.
  function wander() {
    if (gone || drag || flight || busy || playing || life.state.recovering) return false;
    const destination = inView(life.destination(home || getHome()));
    residence = destination; residenceUntil = Date.now() + 30000 + Math.random() * 60000;
    level = pick(Object.keys(LEVELS)); holdLevel();
    movingUntil = Date.now() + 3400; life.interrupt(); mood('curious');
    trot(destination, true); walkDepth(LEVELS[level].scale, 1600);
    setTimeout(() => {
      if (residence !== destination || gone || drag || flight || busy || life.state.recovering) return;
      // Look around and wiggle into place before unpacking the next activity.
      play('lookAround');
      if (!calm) HOP.animate({transform:['rotate(-5deg) scale(1.05,.94)','rotate(5deg)','rotate(0)']},700);
    }, 3500);
    return true;
  }
  function rememberDrop() {
    residence = {...pos}; home = {...pos}; residenceUntil = Date.now() + 60000;
    life.remember(pos);
    try { localStorage.setItem(storageKey, JSON.stringify(home)); } catch {}
  }
  function recoverAppearance() {
    const injured = life.state.recovering;
    J.classList.toggle('injured', injured);
    J.classList.toggle('bedridden', injured && !flight && life.state.health < 50);
    if (!injured && recentlyRecovered) {
      recentlyRecovered = false; dizzyUntil = 0; mood(base());
      // The bandage pops off with a little hop.
      J.classList.add('healing'); setTimeout(() => J.classList.remove('healing'), 900);
      if (!calm) HOP.animate({transform:['scale(1)','scale(1.1,.88)','translateY(-12px) scale(.95,1.07)','scale(1.06,.94)','scale(1)']}, 700);
      say(line('recovered'), {force:true, stay:true}); residenceUntil = Date.now()+15000;
    }
  }
  function releaseWithInertia(velocity) {
    const speed = Math.hypot(velocity.x, velocity.y);
    flight = true; stopPlay(); hush(); depth(1); walkId++; trotId++;
    J.classList.remove('run','walk','back'); J.classList.add('drag','tumbling');
    if (speed > 650) { life.injure(speed); recentlyRecovered = true; dizzyUntil = Date.now()+6500; J.classList.add('injured'); mood('dizzy'); }
    cancelFlight = throwBleb({position:pos,velocity,
      bounds:()=>({x:Math.max(4,innerWidth-80),y:Math.max(4,innerHeight-78)}), move:moveTo,
      roll:angle=>{ HOP.style.transform=`rotate(${angle}deg)`; },
      landed:(p,angle)=>{
        flight = false; cancelFlight = null; J.classList.remove('drag','tumbling');
        HOP.style.transform=''; if (!calm) HOP.animate({transform:[`rotate(${angle%360}deg) scale(1.12,.85)`,'rotate(0) scale(1)']},350);
        rememberDrop(); movingUntil=Date.now()+1000;
        if (speed > 650) { dizzyUntil=Date.now()+6500; mood('dizzy'); say(line('hurt'), {force:true,feel:'dizzy',stay:true}); setTimeout(()=>{if(!flight && life.state.recovering) mood('sore')},6500); }
        else { mood(base()); say(line('drop'), {force:true,stay:true}); }
      }});
  }
  // Velocity comes from recent pointer samples; slow drops do not cause injury.
  JB.onpointerdown = e => {
    if (ghosted || gone) return;
    cancelFlight?.(); cancelFlight=null; flight=false; HOP.style.transform=''; J.classList.remove('tumbling','drag');
    const wantedAttention = !!attention; attentionAfter = Date.now() + 180000;
    stopPlay(); life.interrupt(); hush(); walkId++; trotId++; clearTimeout(trotTimer); clearTimeout(dodgeTimer);
    J.classList.remove('run','walk','back');
    const m = new DOMMatrixReadOnly(getComputedStyle(J).transform);
    pos=inView({x:m.m41,y:m.m42});
    e.preventDefault(); JB.setPointerCapture(e.pointerId);
    drag = {attention:wantedAttention,dx:e.clientX-pos.x,dy:e.clientY-pos.y,x:e.clientX,y:e.clientY,moved:false,samples:[{x:e.clientX,y:e.clientY,t:performance.now()}]};
  };
  JB.onpointermove = e => {
    if (!drag) return;
    const now=performance.now(); drag.samples.push({x:e.clientX,y:e.clientY,t:now}); drag.samples=drag.samples.filter(p=>now-p.t<=100);
    if (!drag.moved && Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5) return;
    if (!drag.moved) {drag.moved=true; depth(1); J.classList.add('drag'); mood('held');}
    moveTo({x:e.clientX-drag.dx,y:e.clientY-drag.dy});
  };
  JB.onpointerup = JB.onpointercancel = e => {
    if (!drag) return;
    const held=drag; drag=null; J.classList.remove('drag');
    if (!held.moved && held.attention) return say(line('attentionThanks'), {force:true,feel:'joy',stay:true});
    if (!held.moved) return poked() || say(`${doneSeen ?? 0} of ${total} reviewed.`,{force:true,feel:pick(['wink','smug','happy']),stay:true});
    const now=performance.now(), samples=held.samples.filter(p=>now-p.t<=100), first=samples[0];
    const dt=first ? (now-first.t)/1000 : 0;
    const velocity=dt>.008 && e.type!=='pointercancel' ? {x:(e.clientX-first.x)/dt,y:(e.clientY-first.y)/dt} : {x:0,y:0};
    const speed=Math.hypot(velocity.x,velocity.y), factor=Math.min(1,1800/(speed||1));velocity.x*=factor;velocity.y*=factor;
    if (!calm && speed>160) return releaseWithInertia(velocity);
    rememberDrop();
    if (held.attention) return say(line('attentionThanks'), {force:true,feel:'joy',stay:true});
    if (!poked()) say(line('drop'),{force:true,feel:'joy',stay:true});
  };
  JB.ondblclick = () => {
    if (ghosted || gone) return;
    if (flight) return;
    residence = null; residenceUntil = Date.now()+30000;
    home = null; poke = Math.max(0, poke - 2);  // the two clicks of a double-click are not pokes
    try { localStorage.removeItem(storageKey); } catch { }
    hush(); mood(base()); goHome();
  };

  setInterval(() => {
    recoverAppearance();
    if (finale || attention || following) return;
    if (completionPending && celebrateCompletion()) { completionPending = false; return; }
    if (flight || drag) return;
    const idle = Date.now() - active, was = base();
    if (poke && !drag && Date.now() >= coolAt) {
      coolAt = Date.now() + TEMPER.coolStep;
      if (poke >= 2) { poke--; temp(-1); } else poke--;
      if (gone) { if (poke < 6) comeBack(); return; }
      if (was === 'happy' || asleep) { } else if (base() === 'happy') say(pick(LINES.calm), { force: true });
      else if (!J.classList.contains('talk')) mood(base());
    }
    if (gone) return;
    if (life.state.recovering) {
      if (!playing && !busy && Date.now() >= movingUntil && Math.random() < .35) play();
      return;
    }
    if (idle > 180000 && !asleep) { asleep = true; hush(); mood('sleepy'); moveTo(homePos()); }
    else if (!asleep && Date.now() - since > 45 * 60000) { since = Date.now(); say(pick(LINES.rest), { force: true, travel: true, feel: 'curious' }); }
    else if (idle > 60000 && !nudged && !asleep) { nudged = true; say(pick(LINES.idle), { force: true, travel: true, feel: 'curious' }); }
    if (!asleep && !drag && !calm && !poke && !busy && !playing && Date.now() >= movingUntil) {
      if (ghosted && ptr && idle < 60000 && Math.random() < .8) { followCursor(); return; }
      if (idle < 60000 && Date.now() >= attentionAfter && Math.random() < .25) { seekAttention(); return; }
      if (Date.now() >= residenceUntil) {
        if (life.state.curiosity > 35 && life.state.energy > 25) wander();
        else { residenceUntil = Date.now()+15000; play(); }
      }
      else if (Date.now() >= levelUntil) setLevel(pick(Object.keys(LEVELS).filter(k => k !== level)));
      else if (Math.random() < .45) play();
    }
  }, 9000);


  settle();
  return {
    progress, edited, play, setLevel, wander, celebrateCompletion, seekAttention, followCursor,
    annoy: poked,
    disappear() { poke = 8; storm(); },
    get state() { return { ghost: ghosted, following: !!following, seekingAttention: !!attention, level, depth: zNow, activity, mood: base(), temper: poke, gone, position: { ...pos }, playing, residence: residence ? {...residence} : null, flight: !!flight, ...life.state }; },
    destroy() {
      ghostVersion++; clearTimeout(ghostTimer);
      controller.abort(); cancelFlight?.(); stopPlay(); walkId++; trotId++;
      timers.forEach(id => window.clearTimeout(id)); intervals.forEach(id => window.clearInterval(id));
      particles.forEach(el => el.remove()); J.remove();
    },
  };
}
