import { SPORT, LINES } from './content.js';
export const MOVES = {
  squish: [['scale(1)', 'scale(1.22,.74)', 'scale(.9,1.12)', 'scale(1.04,.97)', 'scale(1)'], 520],
  nod: [['scale(1)', 'scale(1.1,.86)', 'scale(1)', 'scale(1.1,.86)', 'scale(1)'], 650],
  jump: [['translateY(0) scale(1.18,.8)', 'translateY(-30px) scale(.9,1.12)', 'translateY(0) scale(1.18,.8)', 'translateY(0) scale(1)'], 480, 3],
  spin: [['translateY(0) rotate(0) scale(1.15,.82)', 'translateY(-38px) rotate(180deg) scale(.95,1.05)', 'translateY(0) rotate(360deg) scale(1.2,.78)', 'translateY(0) rotate(360deg) scale(1)'], 800],
  roll: [['translateY(0) rotateZ(0) scale(1.2,.78)', 'translateY(-30px) rotateZ(90deg) scale(.92,1.08)', 'translateY(-62px) rotateZ(210deg)', 'translateY(-27px) rotateZ(330deg)', 'translateY(0) rotateZ(360deg) scale(1.2,.8)', 'translateY(-5px) rotateZ(360deg) scale(.96,1.04)', 'translateY(0) rotateZ(360deg) scale(1)'], 1100],
  flip: [['scaleX(1) scaleY(.96)', 'scaleX(.06) scaleY(1.05)', 'scaleX(1) scaleY(1)', 'scaleX(.06) scaleY(1.05)', 'scaleX(1) scaleY(.96)'], 720, 3],
  rock: [['rotate(0)', 'rotate(-16deg)', 'rotate(14deg)', 'rotate(-10deg)', 'rotate(8deg)', 'rotate(0)'], 1300],
  stretch: [['scale(1)', 'scale(1.3,.66)', 'scale(.78,1.34)', 'scale(1.08,.94)', 'scale(1)'], 800],
  leap: [['translateY(0) scale(1.2,.78)', 'translateY(-52px) scale(.88,1.14) rotate(8deg)', 'translateY(0) scale(1.22,.76)', 'translateY(0) scale(1)'], 760],
};
export function createActivities({ J, HOP, mood, mine, floaty, act, trot, homePos, depth, walkDepth, pick, say, setDaydream, restingDepth, setTimeout, getReadingTarget, moveTo, position, addWorldEffect, teleport }) {
const GAZE = { eating: [3, 3], rainy: [0, -3], snowy: [2, -3], autumn: [3, -2], detective: [0, 0], newspaper: [0, 4], phone: [4, 4], bubble: [4, 0], tv: [4, 0], stargazing: [1, -4], kite: [3, -4], cooking: [4, 1], popcorn: [3, 2] };
function sport(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 180 125'); svg.setAttribute('class', 'sport-scene'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = SPORT[name]; (['detective', 'ghost'].includes(name) ? HOP : J).append(svg); J.classList.add('sport-' + name);
  const weather = ['rainy', 'snowy', 'autumn', 'summer', 'retro', 'newton'].includes(name);
  if (weather) {
    const back = document.createElementNS('http://www.w3.org/2000/svg','svg');
    back.setAttribute('viewBox','0 0 180 125'); back.setAttribute('class','sport-scene weather-underlay'); back.setAttribute('aria-hidden','true');
    back.append(svg.querySelector('.weather-back')); J.prepend(back);
  }
  if (name === 'snowy') {
    const clothes = document.createElementNS('http://www.w3.org/2000/svg','svg');
    clothes.setAttribute('viewBox','0 0 180 125'); clothes.setAttribute('class','sport-scene winter-outfit'); clothes.setAttribute('aria-hidden','true');
    clothes.append(svg.querySelector('.winter-clothes')); HOP.append(clothes);
  }
  if (name === 'sunbathing' || name === 'swimming') {
    const underlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
    underlay.setAttribute('viewBox','0 0 180 125'); underlay.setAttribute('class','sport-scene towel-underlay'); underlay.setAttribute('aria-hidden','true');
    underlay.append(svg.querySelector(name === 'swimming' ? '.swim-water' : '.towel')); J.prepend(underlay);
  }
  mood({ hide: 'cheeky', ghost: 'curious', summer: 'happy', rainy: 'curious', snowy: 'happy', autumn: 'curious', detective: 'curious', sunbathing: 'smug', fishing: 'curious', phone: 'happy', newspaper: 'happy', bubble: 'curious', tv: 'curious', stargazing: 'curious', popcorn: 'happy', cooking: 'happy', kite: 'excited' }[name] || 'joy');
  if (GAZE[name]) {  // eyes on the thing it is doing instead of the pointer
    setDaydream(true);
    for (const eye of J.querySelectorAll('.eye')) { eye.style.setProperty('--px', GAZE[name][0] + 'px'); eye.style.setProperty('--py', GAZE[name][1] + 'px'); }
  }
  return ['hide', 'retro', 'digitized', 'pacman', 'newton', 'blackHole'].includes(name) ? 12000 : name === 'ghost' ? 11000 : weather ? 10000 : name === 'sunbathing' ? 9000 : 7800;
}
return {
  newton() {
    sport('newton');
    setTimeout(mine(() => { mood('dizzy'); act('squish'); }),2000);
    setTimeout(mine(() => { mood('think'); J.querySelector('#say').textContent='Wait… why does it always fall down?'; J.classList.add('talk'); }),3800);
    return 12000;
  },
  blackHole: () => sport('blackHole'),
  portal() {
    sport('portal'); depth(1);
    const start=position(), horizontal=Math.random()<.5;
    const clamp=(v,a,b)=>Math.max(a,Math.min(v,Math.max(a,b)));
    const end={x:clamp(start.x<innerWidth/2 ? innerWidth*.73 : innerWidth*.2,30,innerWidth-160), y:clamp(start.y<innerHeight/2 ? innerHeight*.68 : innerHeight*.22,95,innerHeight-140)};
    const direction=start.x>innerWidth-200 ? -1 : 1;
    const entry={x:start.x+38+(horizontal?0:direction*85),y:start.y+33+(horizontal?65:0)};
    const exit={x:end.x+38,y:end.y+33};
    const world=document.createElement('div'); world.className='bleb-portal-world'; world.setAttribute('aria-hidden','true');
    const portal=(p,label)=>`<svg class="portal-window ${horizontal?'horizontal':'vertical'} ${label}" style="left:${p.x-45}px;top:${p.y-65}px" viewBox="0 0 90 130"><defs><radialGradient id="portal-${label}"><stop stop-color="#e3ff8c"/><stop offset=".35" stop-color="#99ef28"/><stop offset=".7" stop-color="#5ac91e"/><stop offset="1" stop-color="#b1ff43"/></radialGradient></defs><g class="portal-open"><ellipse cx="45" cy="65" rx="32" ry="56" fill="url(#portal-${label})" stroke="#c7ff63" stroke-width="3"/><g class="portal-swirl" fill="none" stroke="#d6ff81" stroke-width="3" opacity=".85"><path d="M44 19C8 35 17 100 46 108S78 59 51 46 27 82 47 84 59 63 46 63M28 30Q67 12 73 54M23 80Q25 112 57 112"/><path d="M40 40q-18 17-4 30m23 24q19-18 9-38" stroke="#f0ffbf" stroke-width="2"/></g><ellipse cx="45" cy="65" rx="34" ry="58" fill="none" stroke="#7dff32" stroke-width="2"/></g></svg>`;
    const gun=J.querySelector('.portal-gun');
    gun.style.transformBox='view-box'; gun.style.transformOrigin='105px 44px';
    gun.style.transform=horizontal?'rotate(55deg)':direction<0?'scaleX(-1)':'';
    world.innerHTML=`<svg class="portal-shot" width="100%" height="100%"><path d="M${start.x+75} ${start.y+43}L${entry.x} ${entry.y}" stroke="#b6ff58" stroke-width="3" stroke-linecap="round"/></svg>`+portal(entry,'entry')+portal(exit,'exit');addWorldEffect(world);
    setTimeout(mine(() => { J.classList.remove('talk'); J.querySelector('.portal-gun').classList.add('fired'); act('squish'); world.classList.add('open'); }),650);
    setTimeout(mine(() => {
      const dx=entry.x-(start.x+38),dy=entry.y-(start.y+33);
      HOP.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx*.55}px,${dy*.55-10}px) scale(.9,1.1)`,opacity:1,offset:.55},{transform:`translate(${dx}px,${dy}px) scale(.05,1.15)`,opacity:0}],{duration:1500,easing:'ease-in',fill:'forwards'});
    }),1700);
    setTimeout(mine(() => {
      teleport(end); world.classList.add('entered');
      HOP.getAnimations().forEach(a=>a.cancel());
      HOP.animate([{transform:'scale(.05,1.15)',opacity:0},{transform:'translateY(-10px) scale(1.08,.92)',opacity:1,offset:.7},{transform:'scale(1)',opacity:1}],{duration:1100,easing:'ease-out',fill:'forwards'});
    }),3300);
    setTimeout(mine(() => { world.classList.add('closing'); mood('smug'); J.querySelector('#say').textContent='Shortcut worked. Obviously.';J.classList.add('talk'); }),4900);
    return 7000;
  },
  retro: () => sport('retro'),
  digitized: () => sport('digitized'),
  pacman: () => sport('pacman'),
  hide: () => sport('hide'),
  ghost: () => sport('ghost'),
  eating: () => sport('eating'),
  summer: () => sport('summer'),
  rainy: () => sport('rainy'),
  snowy: () => sport('snowy'),
  autumn: () => sport('autumn'),
  read() {
    const target = getReadingTarget();
    const words = target?.text?.trim().split(/\s+/).filter(Boolean) || [];
    if (!words.length || !target.rect) return 0;
    const origin = position(), rect = target.rect, S = J.querySelector('#say');
    const chunks = [];
    for (let i = 0; i < Math.min(words.length, 18); i += 3) chunks.push(words.slice(i, i+3).join(' '));
    const approach = {x:Math.max(8,Math.min(innerWidth-150,rect.left+Math.min(100,rect.width*.2))),y:Math.max(50,Math.min(innerHeight-110,rect.bottom-12))};
    J.classList.add('tiptoe'); depth(1.15); moveTo(approach); mood('curious');
    setTimeout(mine(() => {
      J.classList.remove('tiptoe'); J.classList.add('reading'); mood('think'); setDaydream(true);
      for (const eye of J.querySelectorAll('.eye')) { eye.style.setProperty('--px','3px'); eye.style.setProperty('--py','-2px'); }
      S.className = approach.y < 95 ? 'right' : approach.x > innerWidth-300 ? 'left' : '';
      J.classList.add('talk');
      chunks.forEach((text,k) => setTimeout(mine(() => {
        const old = S.firstElementChild;
        const next = document.createElement('span'); next.className='read-chunk'; next.textContent=text;
        S.append(next);
        if (old) { old.classList.add('out'); setTimeout(mine(() => old.remove()),220); }
      }),k*850));
    }),1600);
    const depart = 1800 + chunks.length * 850;
    setTimeout(mine(() => {
      J.classList.remove('reading','talk'); S.replaceChildren(); setDaydream(false);
      J.classList.add('tiptoe'); trot(origin,true); depth(restingDepth());
    }),depart);
    setTimeout(mine(() => J.classList.remove('tiptoe')),depart+1950);
    return depart+2100;
  },
  fishing() {  // a fish circles, bites, comes up the line on the hook, and Bleb is thrilled
    const ms = sport('fishing');
    setTimeout(mine(() => {
      J.querySelector('.sport-scene')?.classList.add('caught');
      setTimeout(mine(() => {
        mood('joy'); act('jump');
        J.querySelector('#say').textContent = pick(LINES.caught); J.classList.add('talk');
      }), 1100);
    }), 4300);
    return ms;
  },
  soccer: () => sport('soccer'),
  tennis: () => sport('tennis'),
  baseball: () => sport('baseball'),
  basketball: () => sport('basketball'),
  swimming: () => sport('swimming'),
  sunbathing: () => sport('sunbathing'),
  newspaper: () => sport('newspaper'),  // peeking over an open broadsheet
  phone: () => sport('phone'),  // scrolling, and ignoring you
  dancing: () => sport('dancing'),
  cooking: () => sport('cooking'),
  tv: () => sport('tv'),
  popcorn: () => sport('popcorn'),
  biking: () => sport('biking'),
  detective: () => sport('detective'),
  stargazing: () => sport('stargazing'),
  kite: () => sport('kite'),
  hum() {
    mood('joy'); HOP.animate({ transform: MOVES.rock[0] }, { duration: 1300, iterations: 3 });
    for (let k = 0; k < 5; k++) setTimeout(mine(() => floaty(pick(['♪', '♫']), `margin-left:${-24 + k % 3 * 20}px`,
      { transform: ['translate(0, 0) rotate(-12deg)', `translate(${(k % 3 - 1) * 14}px, -48px) rotate(12deg)`], opacity: [0, 1, 0] }, 1600)), k * 700);
    return 4000;
  },
  lookAround() {
    mood('curious'); setDaydream(true);
    [[-4, 0], [4, 0], [3, -3], [-3, -3], [0, 0]].forEach(([x, y], k) => setTimeout(mine(() => {
      for (const eye of J.querySelectorAll('.eye')) { eye.style.setProperty('--px', x + 'px'); eye.style.setProperty('--py', y + 'px'); }
    }), k * 650));
    return 3400;
  },
  roll() { mood('joy'); act('roll'); return 3700; },
  flip() {
    mood('joy'); act('flip');
    return 4760;
  },
  twirl() { mood('joy'); HOP.animate({ transform: MOVES.spin[0] }, { duration: 800, iterations: 2 }); return 1700; },
  stroll() {
    const h = homePos(), dx = (Math.random() < .5 ? -1 : 1) * (50 + Math.random() * 40);
    mood('smug'); trot({ x: h.x + dx, y: h.y });
    setTimeout(mine(() => trot(homePos(), true)), 1900);
    return 3900;
  },
  bubble: () => sport('bubble'),  // blows through a wand
  hop() { act('jump'); return 1500; },
  stretch() { act('stretch'); return 1200; },
  think() { say(pick(LINES.think), { force: true, feel: 'think' }); return 100; },  // a passing thought, in the cloud
  nap() {  // a short nap, then a stretch
    mood('sleepy');
    setTimeout(mine(() => act('stretch')), 8800);
    return 9000;
  },
  peek() {  // walks right up to the glass for a look at you, then backs off
    mood('excited'); walkDepth(1.9, 900);
    setTimeout(mine(() => walkDepth(restingDepth(), 900)), 2100);
    return 3100;
  },
  backOff() {  // turns round, walks straight back into the page, looks at you, and walks out again
    mood('curious'); walkDepth(.4);
    setTimeout(mine(() => walkDepth(restingDepth())), 3700);
    return 5500;
  },
  inAndOut() {  // bobs toward you and away a couple of times, like testing the glass
    mood('joy');
    [1.5, .6, 1.4, 1].forEach((z, k) => setTimeout(mine(() => depth(k === 3 ? restingDepth() : z)), k * 800));
    return 3300;
  },
  faraway() {  // turns and wanders off sideways into the page, then walks back
    const h = homePos(), dx = (Math.random() < .5 ? -1 : 1) * (60 + Math.random() * 50);
    mood('happy'); walkDepth(.4, 1500);
    setTimeout(mine(() => trot({ x: h.x + dx, y: h.y + 20 })), 340);
    setTimeout(mine(() => { walkDepth(restingDepth(), 1500); trot(homePos()); }), 3200);
    return 4900;
  },
};
}
