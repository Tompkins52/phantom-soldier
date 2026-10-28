/* Phantom Soldier: motion and the site-wide player.
   Loaded at the end of every page. Everything degrades: no JavaScript, no change. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, body = doc.body;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- reveals, grain, beat layers */
  var io = null, seen = [];
  var picks = [
    '.band .wrap > h2', '.band .wide > h2', '.band .wrap > .lead', '.band .wrap > p', '.band .wrap > .bluf', '.band .wrap > .crisis',
    '.feature', '.release', '.cards li', '.steps li', '.brief li', '.lines li', '.fine details', '.form-card', '.tips',
    '.story > p', '.story > h2', '.story > h3', '.quote', '.drawing', '.map > div', '.hold', '.more', '.about', '.me p', '.me .sig',
    '.page-head h1', '.page-head .lead', '.hub .intro > *', '.stories .grid > div > *', '.quote-band .wrap > *', '.cta-band .wrap > *', '.overview .wrap > *'
  ];
  function initMotion(scope) {
    scope = scope || doc;
    if (reduce) return;
    var hero = scope.querySelector('.hero');
    if (hero && !hero.querySelector('.grain')) {
      var pulse = doc.createElement('div'); pulse.className = 'pulse'; hero.appendChild(pulse);
      var sw = doc.createElement('div'); sw.className = 'sweep'; hero.appendChild(sw);
      dust(hero);
      var g = doc.createElement('div'); g.className = 'grain'; hero.appendChild(g);
    }
    scope.querySelectorAll('.band.navy').forEach(function (b) {
      if (!b.querySelector('.grain')) {
        var p2 = doc.createElement('div'); p2.className = 'pulse'; b.appendChild(p2);
        var g2 = doc.createElement('div'); g2.className = 'grain'; b.appendChild(g2);
      }
    });
    tilt(scope);
    if (!('IntersectionObserver' in window)) return;
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    var fresh = [];
    picks.forEach(function (sel) {
      var list = scope.querySelectorAll(sel), i = 0;
      for (var n = 0; n < list.length; n++) {
        var el = list[n];
        if (el.classList.contains('rv') || el.closest('.hero') || el.closest('.radio')) continue;
        el.classList.add('rv', 'rv-' + (i % 6 + 1)); i++; fresh.push(el);
      }
    });
    fresh.forEach(function (el) { io.observe(el); pending.push(el); });
    requestAnimationFrame(sweep);
  }
  // anything the visitor has scrolled past in one jump (anchor links, fast flicks) is shown too
  var pending = [], sweeping = false;
  function sweep() {
    sweeping = false;
    var keep = [], bottom = window.innerHeight;
    for (var i = 0; i < pending.length; i++) {
      var el = pending[i];
      if (el.classList.contains('in') || !doc.contains(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.top < bottom * 0.92 && el.offsetParent !== null) { el.classList.add('in'); io && io.unobserve(el); } else keep.push(el);
    }
    pending = keep;
  }
  window.addEventListener('scroll', function () { if (!sweeping && pending.length) { sweeping = true; requestAnimationFrame(sweep); } }, { passive: true });
  window.addEventListener('resize', function () { if (!sweeping && pending.length) { sweeping = true; requestAnimationFrame(sweep); } });

  // dust drifting up through the hero light; it brightens on the beat and only runs while the hero is on screen
  var beatNow = 0;
  function dust(hero) {
    var c = doc.createElement('canvas'); c.className = 'dust'; c.setAttribute('aria-hidden', 'true');
    var g = c.getContext && c.getContext('2d'); if (!g) return;
    hero.appendChild(c);
    var ps = [], W = 0, H = 0, on = false, req = 0, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function spawn(anywhere) {
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : H + 4, r: 0.6 + Math.random() * 1.5,
        vy: 0.07 + Math.random() * 0.2, vx: (Math.random() - 0.5) * 0.1, a: 0.1 + Math.random() * 0.38,
        p: Math.random() * 6.2832, s: 0.004 + Math.random() * 0.01 };
    }
    function size() {
      W = hero.clientWidth; H = hero.clientHeight; if (!W || !H) return;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(70, Math.max(24, W * H / 22000)));
      while (ps.length < n) ps.push(spawn(true));
      ps.length = n;
    }
    function frame() {
      req = 0;
      if (!on || !doc.contains(c)) return;
      g.clearRect(0, 0, W, H); g.fillStyle = '#fff';
      var glow = beatNow;
      for (var i = 0; i < ps.length; i++) {
        var q = ps[i];
        q.p += q.s; q.y -= q.vy; q.x += q.vx + Math.sin(q.p) * 0.15;
        if (q.y < -4 || q.x < -4 || q.x > W + 4) { ps[i] = q = spawn(false); }
        g.globalAlpha = Math.min(1, q.a * (0.65 + 0.35 * Math.sin(q.p * 3)) * (1 + glow * 1.3));
        g.beginPath(); g.arc(q.x, q.y, q.r * (1 + glow * 0.4), 0, 6.2832); g.fill();
      }
      req = requestAnimationFrame(frame);
    }
    function start() { on = true; if (!req) req = requestAnimationFrame(frame); }
    function stop() { on = false; }
    size();
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(hero); else window.addEventListener('resize', size);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !doc.hidden) start(); else stop(); }); }).observe(hero);
    } else start();
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { stop(); return; }
      var r = hero.getBoundingClientRect(); if (r.bottom > 0 && r.top < window.innerHeight && doc.contains(c)) start();
    });
  }

  // cards and covers lean toward the pointer (mouse and trackpad only)
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function tilt(scope) {
    if (reduce || !fine) return;
    scope.querySelectorAll('.cards a, .cover-wrap, .cover').forEach(function (el) {
      if (el.classList.contains('tilt') || (el.classList.contains('cover') && el.closest('.cover-wrap'))) return;
      el.classList.add('tilt');
      var deg = el.classList.contains('cover') || el.classList.contains('cover-wrap') ? 9 : 7;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateX(' + (-py * deg).toFixed(2) + 'deg) rotateY(' + (px * deg).toFixed(2) + 'deg) translateY(-3px)';
        el.style.setProperty('--mx', (px * 100 + 50).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100 + 50).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  // a thin line along the top that fills as the page is read
  if (!reduce) {
    var prog = doc.createElement('div'); prog.className = 'progress'; prog.setAttribute('aria-hidden', 'true'); body.appendChild(prog);
    var progQueued = false;
    var paintProg = function () {
      progQueued = false;
      var h = root.scrollHeight - window.innerHeight;
      prog.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0).toFixed(4) + ')';
    };
    window.addEventListener('scroll', function () { if (!progQueued) { progQueued = true; requestAnimationFrame(paintProg); } }, { passive: true });
    window.addEventListener('resize', function () { if (!progQueued) { progQueued = true; requestAnimationFrame(paintProg); } });
    paintProg();
  }
  initMotion(doc);

  /* ---------------------------------------------------------------- soft navigation: the music keeps playing between pages */
  if ('fetch' in window && window.history && history.pushState && doc.getElementById('main')) {
    try { history.scrollRestoration = 'manual'; } catch (e) {}
    function eligible(a) {
      if (!a || !a.href || a.target || a.hasAttribute('download')) return false;
      var u; try { u = new URL(a.href, location.href); } catch (e) { return false; }
      if (u.origin !== location.origin) return false;
      if (u.pathname.indexOf('/print') === 0 || /\.(pdf|jpe?g|png|mp3|xml|txt|json|html)$/i.test(u.pathname)) return false;
      if (u.pathname === location.pathname && u.search === location.search) return false;
      return true;
    }
    function runScripts(fromDoc) {
      fromDoc.querySelectorAll('body script:not([src])').forEach(function (old) {
        var n = doc.createElement('script'); n.textContent = old.textContent; doc.body.appendChild(n); n.remove();
      });
    }
    function setNav(pathname) {
      var isSong = /^\/(still-here|hard-to-break|all-the-wrong-reasons|i-cant-see-the-glass)\/?$/.test(pathname);
      doc.querySelectorAll('.nav a').forEach(function (a) {
        var h = a.getAttribute('href'), on = (h === pathname) || (isSong && h === '/stories/');
        a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    }
    function go(url, push) {
      var u = new URL(url, location.href);
      fetch(u.href, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : Promise.reject(); }).then(function (html) {
        var nd = new DOMParser().parseFromString(html, 'text/html');
        var nm = nd.getElementById('main'); if (!nm) return Promise.reject();
        var want = Array.prototype.map.call(nd.querySelectorAll('link[rel="stylesheet"][href^="/"]'), function (l) { return l.getAttribute('href'); });
        var have = Array.prototype.map.call(doc.querySelectorAll('link[rel="stylesheet"][href^="/"]'), function (l) { return l.getAttribute('href'); });
        var adds = want.filter(function (h) { return have.indexOf(h) === -1; });
        return Promise.all(adds.map(function (h) { return new Promise(function (res) { var l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = h; l.onload = l.onerror = res; var m = doc.querySelector('link[href="/motion.css"]'); if (m) doc.head.insertBefore(l, m); else doc.head.appendChild(l); }); }))
          .then(function () { return { nd: nd, nm: nm, want: want }; });
      }).then(function (x) {
        var swap = function () {
          doc.querySelectorAll('link[rel="stylesheet"][href^="/"]').forEach(function (l) { var h = l.getAttribute('href'); if (x.want.indexOf(h) === -1) l.remove(); });
          doc.title = x.nd.title;
          var fresh = doc.importNode(x.nm, true);
          doc.getElementById('main').replaceWith(fresh);
          setNav(u.pathname);
          if (push) history.pushState({ soft: 1 }, '', u.href);
          runScripts(x.nd);
          initMotion(fresh);
          var target = u.hash ? doc.getElementById(u.hash.slice(1)) : null;
          if (target) target.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
          if (typeof paintProg === 'function') requestAnimationFrame(paintProg);
        };
        if (doc.startViewTransition && !reduce) doc.startViewTransition(swap); else swap();
      }).catch(function () { location.href = u.href; });
    }
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a') : null;
      if (!eligible(a)) return;
      e.preventDefault(); go(a.href, true);
    });
    window.addEventListener('popstate', function () { go(location.href, false); });
    // the story picker forms post to /stories/?song=...; keep those soft too
    doc.addEventListener('submit', function (e) {
      var f = e.target; if (!f || !f.classList || !f.classList.contains('picker')) return;
      var s = f.querySelector('select'); if (s && s.value) { e.preventDefault(); e.stopImmediatePropagation(); go(s.value, true); }
    }, true);
  }

  /* ---------------------------------------------------------------- one song at a time */
  // Every Spotify embed reports what it is doing to this page. When one starts, every other
  // embed is told to pause, and so is the site player. When the site player starts, the embeds pause.
  var SPOT = 'https://open.spotify.com';
  function spotFrames() { return doc.querySelectorAll('iframe[src*="open.spotify.com/embed"]'); }
  function tellEmbed(f, command) { try { f.contentWindow.postMessage({ command: command }, SPOT); } catch (e) {} }
  function pauseEmbeds(except) {
    spotFrames().forEach(function (f) {
      if (!f.contentWindow || f.contentWindow === except) return;
      if (f.__psPlaying === false) return;                        // known to be paused already
      tellEmbed(f, 'pause');
      // only an embed we know is playing gets the follow-up check below
      if (f.__psPlaying === true) { f.__psPauseAt = Date.now(); f.__psToggled = false; }
    });
  }
  var onEmbedStart = null;                                          // the site player hooks in below
  window.addEventListener('message', function (e) {
    if (typeof e.origin !== 'string' || !/^https:\/\/([a-z0-9-]+\.)*spotify\.com$/.test(e.origin)) return;
    var d = e.data; if (!d || typeof d !== 'object') return;
    var playing;
    if (d.type === 'playback_update' && d.payload) playing = d.payload.isPaused === false;
    else if (d.type === 'playback_started') playing = true;
    else return;
    var frame = null, list = spotFrames();
    for (var i = 0; i < list.length; i++) { if (list[i].contentWindow === e.source) { frame = list[i]; break; } }
    if (!frame) return;
    var was = frame.__psPlaying === true;
    frame.__psPlaying = playing;
    if (!playing) { frame.__psPauseAt = 0; return; }
    var since = frame.__psPauseAt ? Date.now() - frame.__psPauseAt : -1;
    if (since >= 0 && since < 3000) {
      // told to pause moments ago and still reporting play: fall back to the toggle command, once
      if (since > 400 && !frame.__psToggled) { frame.__psToggled = true; tellEmbed(frame, 'toggle'); }
      return;
    }
    frame.__psPauseAt = 0;
    if (!was) { pauseEmbeds(e.source); if (onEmbedStart) onEmbedStart(); }
  });

  /* ---------------------------------------------------------------- the player */
  var src = body.getAttribute('data-audio');
  if (!src || !('Audio' in window)) return;
  var ss = window.sessionStorage, ls = window.localStorage;
  function get(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { store.setItem(k, v); } catch (e) {} }

  var title = body.getAttribute('data-audio-title') || 'Hard to Break';
  var href = body.getAttribute('data-audio-href') || '/hard-to-break/';
  var art = body.getAttribute('data-audio-art') || '/art/hard-to-break.jpg';

  var bar = doc.createElement('div');
  bar.className = 'radio css-eq'; bar.id = 'radio'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Now playing');
  bar.innerHTML =
    '<img class="radio-art" src="' + art + '" alt="">' +
    '<div class="radio-meta"><span class="radio-k">Now playing</span><span class="radio-t"><a href="' + href + '">' + title + '</a> &middot; Phantom Soldier</span></div>' +
    '<div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
    '<button class="radio-btn play" type="button" aria-label="Play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>' +
    '<button class="radio-btn mute" type="button" aria-label="Mute" title="Mute (M)"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg></button>' +
    '<button class="radio-x" type="button" aria-label="Hide the player" title="Hide">&times;</button>' +
    '<button class="radio-pill" type="button" aria-label="Show the player" title="Hard to Break"><img src="' + art + '" alt=""><span class="pill-glyph">' + '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' + '</span></button>' +
    '<div class="radio-bar" aria-hidden="true"><div class="radio-fill"></div></div>' +
    '<p class="radio-hint" aria-live="polite"></p>';
  body.appendChild(bar); body.classList.add('has-radio');

  var playBtn = bar.querySelector('.play'), muteBtn = bar.querySelector('.mute'), closeBtn = bar.querySelector('.radio-x');
  var fill = bar.querySelector('.radio-fill'), track = bar.querySelector('.radio-bar'), hint = bar.querySelector('.radio-hint'), kicker = bar.querySelector('.radio-k');
  var eqBars = bar.querySelectorAll('.eq i');
  var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  var ICON_ON = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/></svg>';

  var audio = new Audio(src);
  audio.preload = 'auto'; audio.loop = false;
  audio.muted = get(ls, 'ps-muted') === '1';
  var wantPlay = get(ss, 'ps-paused') !== '1';        // paused by the visitor on an earlier page
  var t0 = parseFloat(get(ss, 'ps-t') || '0');
  function seek0() { if (t0 > 0 && t0 < 230 && audio.currentTime < 1) { try { audio.currentTime = t0; } catch (e) {} } }
  seek0(); audio.addEventListener('loadedmetadata', seek0);

  function paintMute() {
    muteBtn.innerHTML = audio.muted ? ICON_OFF : ICON_ON;
    muteBtn.classList.toggle('muted', audio.muted);
    muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
    muteBtn.title = (audio.muted ? 'Unmute' : 'Mute') + ' (M)';
  }
  function paintPlay(playing) {
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    bar.classList.toggle('playing', playing);
    if (playing) { bar.classList.remove('ready'); kicker.textContent = audio.muted ? 'Now playing, muted' : 'Now playing'; hint.textContent = ''; }
    else if (!bar.classList.contains('ready')) { kicker.textContent = 'Paused'; }
  }
  paintMute();

  /* beat and equalizer, through the Web Audio API when the browser allows it */
  var ctx = null, analyser = null, data = null, raf = 0;
  function wireAnalyser() {
    if (ctx || reduce) return;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC();
      var node = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.82;
      node.connect(analyser); analyser.connect(ctx.destination);
      data = new Uint8Array(analyser.frequencyBinCount);
      bar.classList.remove('css-eq');
    } catch (e) { ctx = null; analyser = null; }
  }
  var bands = [[1, 3], [3, 6], [6, 12], [12, 24], [24, 48]];
  function tick() {
    if (!analyser) return;
    analyser.getByteFrequencyData(data);
    var bass = 0; for (var i = 1; i < 6; i++) bass += data[i]; bass = bass / 5 / 255;
    beatNow = Math.max(0, bass - 0.45) / 0.55;
    root.style.setProperty('--beat', beatNow.toFixed(3));
    for (var b = 0; b < eqBars.length; b++) {
      var s = 0, c = 0; for (var k = bands[b][0]; k < bands[b][1]; k++) { s += data[k]; c++; }
      eqBars[b].style.height = Math.max(12, (s / c / 255) * 100) + '%';
    }
    raf = requestAnimationFrame(tick);
  }
  function startVis() { if (analyser) { body.classList.add('beat'); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); } }
  function stopVis() { cancelAnimationFrame(raf); body.classList.remove('beat'); beatNow = 0; root.style.setProperty('--beat', '0'); for (var b = 0; b < eqBars.length; b++) eqBars[b].style.height = ''; }

  var armed = false, armGo = null;
  function disarm() {
    if (armGo) { doc.removeEventListener('pointerup', armGo, true); doc.removeEventListener('keydown', armGo, true); armGo = null; }
    armed = false;
  }
  function arm() {
    // the browser wants a touch or a click first; the first one anywhere starts the song
    if (armed) return; armed = true;
    bar.classList.add('ready'); kicker.textContent = 'Tap anywhere to play';
    hint.textContent = 'Hard to Break starts on your first tap or click. Mute is the speaker.';
    armGo = function (e) {
      if (e && e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e && e.target && e.target.closest && e.target.closest('.radio button')) return;   // the bar's own buttons speak for themselves
      if (bar.classList.contains('collapsed')) return;
      play();
    };
    // pointerup, not pointerdown: a touch only counts as a gesture once the finger lifts, and a scroll never lifts cleanly
    doc.addEventListener('pointerup', armGo, true); doc.addEventListener('keydown', armGo, true);
  }
  function play() {
    disarm();
    wireAnalyser();
    if (ctx && ctx.state === 'suspended') { ctx.resume(); }
    var p = audio.play();
    if (p && p.then) {
      p.then(function () { paintPlay(true); startVis(); set(ss, 'ps-paused', '0'); }, function () { arm(); });
    }
  }
  function pause() { audio.pause(); paintPlay(false); stopVis(); set(ss, 'ps-paused', '1'); }
  function stopQuiet() { audio.pause(); paintPlay(false); stopVis(); }

  playBtn.addEventListener('click', function (e) { e.stopPropagation(); if (audio.paused) play(); else pause(); });
  muteBtn.addEventListener('click', function (e) { e.stopPropagation(); audio.muted = !audio.muted; set(ls, 'ps-muted', audio.muted ? '1' : '0'); paintMute(); if (!audio.paused) paintPlay(true); });
  var pill = bar.querySelector('.radio-pill');
  closeBtn.addEventListener('click', function (e) { e.stopPropagation(); stopQuiet(); bar.classList.add('collapsed'); body.classList.remove('has-radio'); });
  pill.addEventListener('click', function (e) { e.stopPropagation(); bar.classList.remove('collapsed'); body.classList.add('has-radio'); play(); });
  track.addEventListener('click', function (e) { var r = track.getBoundingClientRect(); if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration; });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') { var t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return; muteBtn.click(); }
  });
  audio.addEventListener('timeupdate', function () {
    if (audio.duration) fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    set(ss, 'ps-t', audio.currentTime.toFixed(1));
  });
  audio.addEventListener('pause', function () { if (!bar.classList.contains('ready')) paintPlay(false); stopVis(); });
  audio.addEventListener('play', function () { paintPlay(true); startVis(); pauseEmbeds(null); });
  window.addEventListener('pagehide', function () { set(ss, 'ps-t', audio.currentTime.toFixed(1)); });
  audio.addEventListener('ended', function () { paintPlay(false); stopVis(); set(ss, 'ps-t', '0'); set(ss, 'ps-paused', '1'); kicker.textContent = 'Play it again?'; fill.style.width = '0'; });

  // when a Spotify embed starts, the site player steps aside
  onEmbedStart = function () { if (!audio.paused) pause(); };

  if (wantPlay) { play(); } else { paintPlay(false); kicker.textContent = 'Paused'; }
})();
