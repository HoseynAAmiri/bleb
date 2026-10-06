from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch();pg=b.new_page(viewport={'width':1500,'height':950});errors=[]
 pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.clock.install();pg.goto('http://127.0.0.1:8765/bleb/demo.html');pg.wait_for_function('window.bleb')
 pg.evaluate('Math.random=()=>.99')
 assert pg.evaluate("bleb.setLevel('far')")
 pg.clock.run_for(2200)
 for name in ['fishing','soccer','tennis','swimming','sunbathing','newspaper','hum','lookAround','roll','flip','twirl','stroll','bubble','hop','think','nap','peek','backOff','inAndOut','faraway']:
  pg.keyboard.press('Shift');pg.evaluate('(name)=>bleb.play(name)',name);pg.clock.run_for(11000)
  assert abs(pg.evaluate('bleb.state.depth')-.55)<.001,(name,pg.evaluate('bleb.state'))
  # Hold this level through a whole routine for this check.
  pg.evaluate("bleb.setLevel('far')");pg.clock.run_for(2200)
 pg.evaluate("bleb.setLevel('middle')");pg.clock.run_for(2200);pg.evaluate("bleb.play('tennis')");pg.clock.run_for(800)
 pg.screenshot(path='/tmp/bleb-modular.png')
 pg.evaluate('bleb.disappear()');origin=pg.evaluate('bleb.state.position');pg.clock.run_for(4000)
 assert pg.evaluate('bleb.state.gone')
 for _ in range(4):
  pg.keyboard.press('Shift');pg.clock.run_for(24000)
 assert not pg.evaluate('bleb.state.gone')
 assert pg.evaluate('bleb.state.position')==origin
 # Reading consumes host text in sliding chunks, returns, and cleans up when interrupted.
 pg.keyboard.press('Shift');pg.clock.run_for(10000)
 origin=pg.evaluate('bleb.state.position');assert pg.evaluate("bleb.play('read')")
 pg.clock.run_for(1700);assert pg.locator('#jelly.reading .monocle').is_visible()
 first=pg.locator('#say').inner_text();pg.clock.run_for(950)
 assert first!=pg.locator('#say').inner_text()
 pg.clock.run_for(8500);assert pg.evaluate('bleb.state.position')==origin
 assert not pg.locator('#jelly.reading').count()
 pg.evaluate('bleb.destroy()');pg.clock.run_for(60000)
 assert pg.locator('#jelly').count()==0
 print('component checks',errors)
 pg.goto('http://127.0.0.1:8765/');pg.wait_for_function("document.getElementById('preview').textContent.length>0")
 assert pg.locator('#jelly').count()==1
 pg.locator('#preview').click();pg.keyboard.type('XY');pg.keyboard.press('Control+z');pg.locator('#jump').focus()
 print('review integration',errors);assert not errors
 # Real pointer input exercises inertia and recovery, using the browser clock for long waits.
 pg.goto('http://127.0.0.1:8765/bleb/demo.html');pg.wait_for_function('window.bleb')
 pg.add_style_tag(content='#jelly {transition:none !important} #jelly .body {animation:none !important}')
 pg.evaluate('Math.random=()=>.99');pg.clock.run_for(1200)
 box=pg.locator('#jelly .body').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
 pg.mouse.move(x,y);pg.mouse.down();pg.clock.run_for(20)
 pg.mouse.move(x+70,y+30);pg.clock.run_for(20);pg.mouse.move(x+160,y+50);pg.clock.run_for(15);pg.mouse.up()
 released=pg.evaluate('bleb.state');assert released['flight'] and released['recovering']
 pg.clock.run_for(600);assert pg.evaluate('bleb.state.position')!=released['position']
 assert pg.locator('#jelly.injured.dizzy').count()==1
 pg.clock.run_for(2200);assert not pg.evaluate('bleb.state.flight')
 assert not pg.evaluate("bleb.play('soccer')")
 pg.clock.run_for(6000);assert pg.evaluate("bleb.play('nap')")
 pg.clock.run_for(10000)
 assert len(pg.evaluate('bleb.state.favorites'))>0
 for _ in range(6):pg.keyboard.press('Shift');pg.clock.run_for(24000)
 assert pg.evaluate('bleb.state.health')==100 and not pg.evaluate('bleb.state.recovering')
 assert pg.locator('#jelly.injured').count()==0
 pg.clock.run_for(10000);assert pg.evaluate('bleb.wander()')
 target=pg.evaluate('bleb.state.residence');pg.clock.run_for(22000)
 assert pg.evaluate('bleb.state.position')==target
 # Pausing before release drains the throw velocity: a gentle placement stays healthy.
 box=pg.locator('#jelly .body').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
 pg.mouse.move(x,y);pg.mouse.down();pg.clock.run_for(20);pg.mouse.move(x-70,y-50);pg.clock.run_for(160);pg.mouse.up()
 assert not pg.evaluate('bleb.state.flight') and pg.evaluate('bleb.state.health')==100
 pg.evaluate('bleb.destroy()');pg.clock.run_for(60000);assert pg.locator('#jelly').count()==0
 assert not errors;print('wandering, inertia, quiet recovery, and gentle drop passed')
 b.close()
