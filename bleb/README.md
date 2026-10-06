# Bleb

A small browser companion, currently embedded in the manuscript review tool.
No framework, build step, service, or remote assets are required by Bleb itself.
This is a local prototype; it has not been published as a package.

See Bleb at work in the [online review demo](https://hoseynaamiri.github.io/bleb/), or try every activity
and depth in the [online playground](https://hoseynaamiri.github.io/bleb/bleb/demo.html).

Locally, open `/bleb/demo.html` on the review server.
Alternatively, serve this directory with any static HTTP server.

## Files

- `bleb.js`: lifecycle, temper, input, movement, depth scheduling, and host API.
- `activities.js`: animation sequences and activity routines.
- `content.js`: existing messages, activity messages, SVG props, character markup, and depth settings.
- `bleb.css`: appearance, facial expressions, and looping animations.
- `demo.html`: standalone playground.
- `life.js`: health, energy, curiosity, activity sequences, and remembered favorites.
- `inertia.js`: time-based throwing, rolling, friction, and viewport bounces.

## Embed

Load `bleb.css`, then create one instance after the host DOM is ready:

```js
import { createBleb } from './bleb/bleb.js';
const bleb = createBleb({
  getHome: () => ({ x: 60, y: 120 }), // viewport coordinates
  storageKey: 'my-app.bleb',
});
bleb.progress(3, 20);
bleb.edited(); // call for each editing event
bleb.play('tennis');
bleb.setLevel('far');
// When removing the host:
bleb.destroy();
```

`play` and `setLevel` return false when Bleb is busy. Unknown names throw.
`state` returns a snapshot for inspection. `annoy()` and `disappear()` support
playground controls. One instance per page is supported. Dragged home positions
are stored locally; there is no telemetry. Reduced-motion preferences disable
random play and use immediate depth transitions.

## Behavior layers

Position and depth are independent of temper and expression. Near, middle, and
far depths have scales 1.25, 1, and 0.55. Each has a random dwell time, configured
in `LEVELS`. A routine runs at the current depth; temporary depth excursions return
to that level. Important progress messages may visit the foreground, then return.

Temper rises on pokes. It waits at least 10 seconds after the last poke before
cooling, then falls one step about every 24–33 seconds. Each new poke restarts
the quiet period. Timing lives in `TEMPER` in `content.js`. A held expression can remain red.
Disappearance remembers the departure position and depth. Reappearance restores
both without changing the saved home.

Only one play routine owns props at a time. A message, drag, or escape interrupts
it. Each routine's delayed steps belong to that routine; stale callbacks cannot
resume after another activity starts. Destruction clears listeners, timers, props,
and particles.

Activity messages are curated arrays in `LINES`. They appear occasionally,
without interrupting the routine, and avoid repeating the previous line from
that activity. Existing work/progress/temper messages are preserved.

## Before publishing

Keep the playground as the integration example. Review naming, license and asset
provenance before creating a public release. The current singleton IDs and the
fixed-size desktop layout are intentional prototype limits.

## Check

With the review server running on port 8765, run
`uv run --with playwright python bleb/check.py`.
The browser check exercises all activities at the far depth, disappearing and
returning in place, destroying the component, and editing the review paragraph.
It requires an installed Playwright Chromium browser. Temporary screenshots go
to `/tmp`, not the repository.

## Wandering and injury

`wander()` chooses a temporary residence and a depth, walks there, looks around,
and stays for 30–90 seconds. Subsequent routines return to that residence. Drops
teach Bleb up to five favorite places, stored as viewport proportions. New spots
may overlap text and controls intentionally. Energy costs and curiosity influence
whether it explores or rests; activity sequences include soccer → stretch →
sunbathing → nap.

Dragging samples the last 100 ms of pointer motion. A release above 160 px/s
continues with friction, rolling, and edge bounces. Speeds above 650 px/s reduce
health and start 60–120 seconds of recovery. During recovery Bleb wears a bandage,
shows crossed eyes initially, and allows only quiet activities. New throws restart
recovery. Slow releases and pointer cancellation cause no throwing injury.
Reduced motion disables inertia, tumbling, and automatic play.

The playground exposes health and energy; `state` also includes curiosity,
recovery time, favorites, the remaining activity sequence, residence, and flight.

## Reading

Pass `getReadingTarget: () => ({text, rect})`, where `rect` is a viewport
`getBoundingClientRect()` result. The host chooses the text: the review page
supplies its current paragraph, and the playground supplies its introductory
paragraph. `play('read')` tiptoes over, shows up to six three-word chunks with
sliding transitions, puts on a monocle, and returns to its departure position.
The text is displayed with `textContent`; it never becomes HTML or changes the
source. Reading participates in quiet activity sequences and is interrupted by
normal interactions. With no reading target, the routine immediately finishes.
