// Living background for the portfolio: a perspective particle terrain with a glowing horizon,
// stars + shooting stars (dark themes), data packets, cursor gravity, click ripples, an intro
// roll-in and a scroll-driven camera. PortfolioField.create(canvas, { motion, density, flow, hold })
(function () {
  var TAU = Math.PI * 2, probe = null;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function mixC(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : clamp(a, 0, 1).toFixed(3)) + ')'; }
  function toRGB(css, fb) {
    if (!probe) { var c = document.createElement('canvas'); c.width = c.height = 1; probe = c.getContext('2d', { willReadFrequently: true }); }
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = fb || '#888888'; if (css) probe.fillStyle = css; probe.fillRect(0, 0, 1, 1);
    var d = probe.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  }
  function grain() {
    var n = 160, c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data;
    for (var i = 0; i < d.length; i += 4) { var v = Math.random(); d[i] = d[i + 1] = d[i + 2] = v > .5 ? 255 : 0; d[i + 3] = Math.abs(v - .5) * 52; }
    x.putImageData(img, 0, 0); return c.toDataURL('image/png');
  }

  function create(canvas, o) {
    o = o || {};
    var ctx = canvas.getContext('2d');
    var motion = o.motion !== false, density = o.density || 1, flow = o.flow == null ? 1 : o.flow;
    var Z0 = 1.1, Z1 = 13, INTRO = 2.4, HL = 6, AL = 10, NB = HL * AL, CAP = 40000;
    var W = 2, H = 2, dpr = 1, res = 1, f = 1, S = .105, I0 = 0, NC = 0, c1, c3, s2, k2;
    var t = 6, D = 0, last = 0, raf = 0, dead = false, offs = [], active = true;
    var introT = motion ? (o.hold ? -1 : 0) : 99;
    var pc = null, pt = null, dark = true, cols = [], palDirty = true;
    var cam = { hy: .56, hc: 1, fa: 1, amp: 1 }, camX = 0, camXT = 0;
    var px = -1, py = -1, cur = { x: 0, z: 3, s: 0 }, tgt = { x: 0, z: 3, s: 0 };
    var ripples = [], stars = [], comets = [], shoot = null, nextShoot = 2.5 + Math.random() * 3;
    var lastY = scrollY, boost = 0, frames = 0, accT = 0, age = 0;
    var A = .075, R = .55, RB = 1.3, IR2 = 3.3, LIFT = .2, HEAT = 0;
    var bx = new Float32Array(CAP), by = new Float32Array(CAP), br = new Float32Array(CAP), bb = new Uint8Array(CAP), ord = new Int32Array(CAP);
    var cnt = new Int32Array(NB), off = new Int32Array(NB);

    function on(tg, ev, fn, op) { tg.addEventListener(ev, fn, op); offs.push(function () { tg.removeEventListener(ev, fn, op); }); }

    function spawn(c, anywhere) {
      var z = anywhere ? mix(Z0 + 1.5, Z1 - 2, Math.random()) : Z1 - .4 - Math.random() * .8;
      var half = (W / 2) * z / f * .85;
      c.x = Math.round((camX + (Math.random() * 2 - 1) * half) / S) * S; c.z = z; c.v = .8 + Math.random() * 1.8;
      return c;
    }

    function camTarget() {
      if (o.camera) { var oc = o.camera(); if (oc) return oc; }
      var y = scrollY, vh = innerHeight, max = Math.max(1, document.documentElement.scrollHeight - vh);
      var q = ease(clamp(y / (vh * .9), 0, 1)), fin = max > vh * 2 ? sstep(max - vh * .9, max, y) : 0;
      return { hy: mix(mix(.56, .1, q), .44, fin), hc: mix(mix(1, 1.9, q), 1.2, fin), fa: mix(mix(1, .5, q), .95, fin), amp: mix(mix(1, .8, q), 1, fin) };
    }
    function camNow() { var c = camTarget(); cam.hy = c.hy; cam.hc = c.hc; cam.fa = c.fa; cam.amp = c.amp; }

    function layout() {
      dpr = Math.min(1, window.devicePixelRatio || 1) * res;
      var w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      W = Math.max(2, Math.round(w * dpr)); H = Math.max(2, Math.round(h * dpr));
      canvas.width = W; canvas.height = H;
      f = Math.max(.9 * H, .55 * W); S = .105 / Math.sqrt(density);
      var maxX = (W / 2 + 60 * dpr) * Z1 / f + 1.5;
      I0 = Math.ceil(maxX / S); NC = I0 * 2 + 1;
      c1 = new Float32Array(NC); c3 = new Float32Array(NC); s2 = new Float32Array(NC); k2 = new Float32Array(NC);
      for (var i = 0; i < NC; i++) { var x = (i - I0) * S; s2[i] = Math.sin(x * .55) * .55; k2[i] = Math.cos(x * .55) * .55; }
      stars = [];
      for (var j = 0, n = Math.min(260, Math.round(w * h / 6500)); j < n; j++) stars.push({ x: Math.random() * W, y: Math.random() * H * .8, r: (.35 + Math.random() * Math.random() * 1.1) * dpr, a: .12 + Math.random() * .6, p: Math.random() * TAU, s: .5 + Math.random() * 2 });
      comets = [];
      for (var k = 0, m = Math.round(8 * Math.sqrt(density)); k < m; k++) comets.push(spawn({}, true));
      if (!motion) { camNow(); draw(); }
    }

    function wave(x, zw) {
      return A * (Math.sin(x * .9 + t * .55) * Math.cos(zw * .7 - t * .35) + .55 * Math.sin(x * .55 + zw * 1.25 + t * .8) + .28 * Math.sin(x * 2.2 - t * 1.1) * Math.sin(zw * 1.9 + t * .6));
    }
    function dyn(x, z) {
      var lift = 0, h = 0, dx, dz, g;
      if (cur.s > .01) {
        dx = x - cur.x; dz = z - cur.z;
        if (dx < RB && dx > -RB && dz < RB && dz > -RB) { g = Math.exp(-(dx * dx + dz * dz) * IR2) * cur.s; lift = LIFT * g; h = g; }
      }
      for (var i = 0; i < ripples.length; i++) {
        var rp = ripples[i]; dx = x - rp.x; dz = z - rp.z;
        var d = Math.sqrt(dx * dx + dz * dz) - rp.r;
        if (d < .8 && d > -.8) { g = Math.exp(-d * d * 12) * rp.a; lift += .15 * cam.hc * g; if (g > h) h = g; }
      }
      HEAT = h; return lift;
    }
    function aim() {
      var hy = cam.hy * H;
      if (px < 0 || py < hy + 8 * dpr) { tgt.s = 0; return; }
      var z = cam.hc * f / (py - hy);
      if (z > Z1 * .85) { tgt.s = 0; return; }
      tgt.z = Math.max(Z0, z); tgt.x = (px - W / 2) * z / f + camX; tgt.s = 1;
      if (cur.s < .03) { cur.x = tgt.x; cur.z = tgt.z; }
    }

    function step(dt) {
      t += dt; age += dt;
      if (introT >= 0 && introT < INTRO + 1) introT += dt;
      var c = camTarget(), k = Math.min(1, dt * 4);
      cam.hy += (c.hy - cam.hy) * k; cam.hc += (c.hc - cam.hc) * k; cam.fa += (c.fa - cam.fa) * k; cam.amp += (c.amp - cam.amp) * k;
      var y = scrollY, v = Math.abs(y - lastY) / Math.max(dt, .001); lastY = y;
      boost += (Math.min(1.6, v / 2400) - boost) * Math.min(1, dt * 3);
      var spd = .2 * flow * (1 + boost * 3.2);
      D += spd * dt;
      camX += (camXT - camX) * Math.min(1, dt * 2.2);
      aim();
      var kc = Math.min(1, dt * 7);
      cur.x += (tgt.x - cur.x) * kc; cur.z += (tgt.z - cur.z) * kc; cur.s += (tgt.s - cur.s) * Math.min(1, dt * 4);
      for (var i = ripples.length - 1; i >= 0; i--) {
        var r = ripples[i]; r.age += dt; r.r = r.age * 2.1; r.a = Math.pow(Math.max(0, 1 - r.age / 2.6), 2); r.z -= spd * dt;
        if (r.age > 2.6) ripples.splice(i, 1);
      }
      for (var j = 0; j < comets.length; j++) { var cm = comets[j]; cm.z -= (cm.v + spd) * dt; if (cm.z < Z0 + .2) spawn(cm, false); }
      if (shoot) { shoot.age += dt; if (shoot.age > shoot.life) { shoot = null; nextShoot = 4 + Math.random() * 7; } }
      else if ((nextShoot -= dt) <= 0 && dark && cam.hy > .35 && introT > INTRO) {
        var ang = Math.PI * (.8 + Math.random() * .1), sp = (900 + Math.random() * 500) * dpr;
        shoot = { x: W * (.3 + Math.random() * .65), y: cam.hy * H * (.08 + Math.random() * .45), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, len: (110 + Math.random() * 90) * dpr, age: 0, life: .7 + Math.random() * .4 };
      }
      if (pt && pc) {
        var ch = 0;
        for (var key in pt) for (var q = 0; q < 3; q++) { var dd = pt[key][q] - pc[key][q]; if (dd > .3 || dd < -.3) { pc[key][q] += dd * Math.min(1, dt * 5); ch = 1; } }
        if (ch) palDirty = true;
      }
      // Adaptive quality: if frames run slower than ~50fps, first render the field at lower
      // resolution, then thin the particles, so slower machines stay smooth.
      if (age > 2) {
        frames++; accT += dt;
        if (frames >= 60) {
          if (accT / frames > .02) {
            if (res > .75) { res = .75; layout(); }
            else if (density > .5) { density = Math.max(.5, density * .8); layout(); }
          }
          frames = 0; accT = 0;
        }
      }
    }

    function buildCols() {
      palDirty = false; var base = mixC(pc.t, pc.a, .16);
      for (var h = 0; h < HL; h++) cols[h] = rgba(h < HL - 1 ? mixC(base, pc.a, h / (HL - 2)) : mixC(pc.a, pc.h, .6), 1);
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      if (!pc || introT < 0) return;
      if (palDirty) buildCols();
      var hy = cam.hy * H, hc = cam.hc, fa = cam.fa, cx = W / 2, acc = pc.a, txt = pc.t, add = dark ? 'lighter' : 'source-over';
      A = .075 * cam.amp * (.85 + .15 * Math.sin(t * .25));
      R = .55 * hc; RB = 2.4 * R; IR2 = 1 / (R * R); LIFT = .2 * hc;
      var P = introT >= INTRO ? 1 : ease(introT / INTRO), zf = mix(Z1 + .6, Z0 - .8, P), doIntro = P < 1;
      var sky = sstep(.12, .34, cam.hy) * fa, glowIn = sstep(0, .35, P), M = 8 * dpr, i, g;

      if (dark && sky > .01) {
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(txt, 1);
        var sh = -camX * 36;
        for (i = 0; i < stars.length; i++) {
          var st = stars[i]; if (st.y > hy - 4 * dpr) continue;
          var sx = ((st.x + sh * st.r) % W + W) % W;
          ctx.globalAlpha = clamp(st.a * (.55 + .45 * Math.sin(t * st.s + st.p)) * sstep(0, 70 * dpr, hy - st.y) * sky * glowIn, 0, 1);
          ctx.fillRect(sx - st.r, st.y - st.r, st.r * 2, st.r * 2);
        }
        if (shoot) {
          var s = shoot, hx = s.x + s.vx * s.age, hy2 = s.y + s.vy * s.age;
          if (hy2 < hy - 12 * dpr) {
            var spd = Math.hypot(s.vx, s.vy), tx = hx - s.vx / spd * s.len, ty = hy2 - s.vy / spd * s.len, al = Math.sin(Math.PI * s.age / s.life) * sky;
            var lg = ctx.createLinearGradient(tx, ty, hx, hy2); lg.addColorStop(0, rgba(txt, 0)); lg.addColorStop(1, rgba(txt, .9 * al));
            ctx.globalAlpha = 1; ctx.strokeStyle = lg; ctx.lineWidth = 1.3 * dpr; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy2); ctx.stroke();
          }
        }
      }

      if (sky > .01) {
        var ga = sky * glowIn * (dark ? 1 : .75);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = add;
        ctx.save(); ctx.translate(cx - camX * .06 * f, hy); ctx.scale(1, .26);
        var rr = W * .62; g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
        g.addColorStop(0, rgba(acc, .3 * ga)); g.addColorStop(.45, rgba(acc, .09 * ga)); g.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = g; ctx.fillRect(-rr, -rr, rr * 2, rr * 2); ctx.restore();
        var lg2 = ctx.createLinearGradient(0, 0, W, 0);
        lg2.addColorStop(0, rgba(acc, 0)); lg2.addColorStop(.22, rgba(acc, .32 * ga)); lg2.addColorStop(.5, rgba(pc.h, .75 * ga)); lg2.addColorStop(.78, rgba(acc, .32 * ga)); lg2.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = lg2; ctx.fillRect(0, hy - .6 * dpr, W, 1.2 * dpr);
      }

      if (cur.s > .02) {
        var gk = f / cur.z, gx = cx + (cur.x - camX) * gk, gy = hy + hc * gk, rx = R * gk * 2.4, ry = rx * clamp(hc / cur.z * 1.25, .16, .8);
        ctx.save(); ctx.globalCompositeOperation = add; ctx.globalAlpha = 1; ctx.translate(gx, gy); ctx.scale(1, ry / rx);
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, rgba(acc, (dark ? .24 : .14) * cur.s * fa)); g.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
      }

      for (i = 0; i < NC; i++) { var xc = (i - I0) * S; c1[i] = Math.sin(xc * .9 + t * .55); c3[i] = Math.sin(xc * 2.2 - t * 1.1); }
      var N = 0, rb = .0075 * f, baseA = dark ? .42 : .36, maxL = A * 2 + LIFT + .35 * hc, amax = A * 1.83;
      var jl = Math.ceil((D + Z0) / S), jh = Math.floor((D + Z1) / S);
      for (var j = jh; j >= jl; j--) {
        var zw = j * S, z = zw - D;
        if (z < Z0) continue;
        var kz = f / z, sy0 = hy + hc * kz;
        if (sy0 - maxL * kz > H + M) continue;
        var fadeOdd = 1 - sstep(4.5, 6.5, z), oddRow = j & 1;
        if (oddRow && fadeOdd <= 0) continue;
        var fog = (1 - sstep(Z1 * .35, Z1, z)) * mix(.4, 1, sstep(Z0, Z0 + 1.1, z)), vis = 1, ih = 0, il = 0;
        if (doIntro) { vis = sstep(zf - .12, zf + .55, z); var e = (z - zf) / .32; ih = Math.exp(-e * e); il = .2 * hc * ih; }
        var rowA = fa * fog * Math.max(vis, ih); if (rowA < .015) continue;
        var r1 = Math.cos(zw * .7 - t * .35), a2 = zw * 1.25 + t * .8, r2c = Math.cos(a2), r2s = Math.sin(a2), r3 = Math.sin(zw * 1.9 + t * .6) * .28;
        var xl = camX - (cx + M) / kz, xr = camX + (W - cx + M) / kz;
        var i0 = Math.max(0, Math.ceil(xl / S) + I0), i1 = Math.min(NC - 1, Math.floor(xr / S) + I0), stp = fadeOdd <= 0 ? 2 : 1;
        if (stp === 2 && ((i0 - I0) & 1)) i0++;
        for (var ii = i0; ii <= i1; ii += stp) {
          var x = (ii - I0) * S, lodA = (oddRow || ((ii - I0) & 1)) ? fadeOdd : 1;
          var yv = A * (c1[ii] * r1 + s2[ii] * r2c + k2[ii] * r2s + c3[ii] * r3);
          var heat = clamp((yv / amax - .42) * 2.4, 0, 1) * .7, lift = dyn(x, z);
          if (HEAT > heat) heat = HEAT; if (ih > heat) heat = ih;
          var sy = sy0 - (yv + lift + il) * kz; if (sy < -M || sy > H + M) continue;
          var a = rowA * lodA * (baseA + (1 - baseA) * heat); if (a < .02) continue;
          if (N >= CAP) break;
          bx[N] = cx + (x - camX) * kz; by[N] = sy; br[N] = Math.max(.55 * dpr, rb / z * (1 + heat * .6));
          bb[N++] = Math.min(HL - 1, (heat * (HL - 1) + .5) | 0) * AL + Math.min(AL - 1, (a * AL) | 0);
        }
      }

      cnt.fill(0); var n;
      for (n = 0; n < N; n++) cnt[bb[n]]++;
      var sum = 0, b; for (b = 0; b < NB; b++) { off[b] = sum; sum += cnt[b]; }
      for (n = 0; n < N; n++) ord[off[bb[n]]++] = n;
      var p = 0;
      for (b = 0; b < NB; b++) {
        var cN = cnt[b]; if (!cN) continue;
        var hb = (b / AL) | 0;
        ctx.globalCompositeOperation = dark && hb >= HL - 2 ? 'lighter' : 'source-over';
        ctx.fillStyle = cols[hb]; ctx.globalAlpha = ((b % AL) + .5) / AL;
        ctx.beginPath();
        for (var qq = p, qe = p + cN; qq < qe; qq++) {
          var di = ord[qq], rd = br[di], X = bx[di], Y = by[di];
          if (rd < 1.6) ctx.rect(X - rd, Y - rd, rd * 2, rd * 2); else { ctx.moveTo(X + rd, Y); ctx.arc(X, Y, rd, 0, TAU); }
        }
        ctx.fill(); p += cN;
      }

      if (P > .7 && comets.length) {
        ctx.globalCompositeOperation = add; ctx.fillStyle = cols[HL - 1];
        var cf = sstep(.7, 1, P);
        for (var mI = 0; mI < comets.length; mI++) {
          var cm = comets[mI];
          for (var sI = 0; sI < 8; sI++) {
            var z2 = cm.z + sI * .07; if (z2 > Z1 || z2 < Z0) continue;
            var k2z = f / z2, y2 = wave(cm.x, z2 + D) + dyn(cm.x, z2);
            var X2 = cx + (cm.x - camX) * k2z, Y2 = hy + (hc - y2) * k2z;
            if (X2 < -M || X2 > W + M || Y2 < -M || Y2 > H + M) continue;
            var fo = (1 - sstep(Z1 * .35, Z1, z2)) * fa * cf, rr2 = Math.max(.6 * dpr, rb / z2 * (sI ? 1.1 - sI * .08 : 1.7));
            ctx.globalAlpha = clamp(fo * (sI ? .55 * Math.pow(1 - sI / 8, 2) : 1), 0, 1);
            ctx.beginPath(); ctx.arc(X2, Y2, rr2, 0, TAU); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    function loop(now) {
      if (dead) return; raf = requestAnimationFrame(loop);
      var dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
      if (!active) return;
      step(dt); draw();
    }

    on(window, 'resize', layout);
    if (motion) {
      on(window, 'pointermove', function (e) { px = e.clientX * dpr; py = e.clientY * dpr; camXT = (e.clientX / innerWidth - .5) * .5; }, { passive: true });
      on(window, 'mouseout', function (e) { if (!e.relatedTarget) px = -1; });
      on(window, 'pointerdown', function (e) {
        var hy = cam.hy * H, X = e.clientX * dpr, Y = e.clientY * dpr;
        var z = Y > hy + 8 * dpr ? Math.min(Z1 * .7, cam.hc * f / (Y - hy)) : Z1 * .6;
        ripples.push({ x: (X - W / 2) * z / f + camX, z: Math.max(Z0, z), age: 0, r: 0, a: 1 });
        if (ripples.length > 4) ripples.shift();
      }, { passive: true });
    } else on(window, 'scroll', function () { camNow(); draw(); }, { passive: true });
    layout();
    if (motion) raf = requestAnimationFrame(loop);

    return {
      setPalette: function (p) {
        var nx = { t: toRGB(p.text, '#e9e9ed'), a: toRGB(p.accent, '#9184d9'), h: toRGB(p.hi || p.accent, '#b9b0ea'), b: toRGB(p.bg, '#161826') };
        dark = (.2126 * nx.b[0] + .7152 * nx.b[1] + .0722 * nx.b[2]) / 255 < .5;
        pt = nx; if (!pc || !motion) pc = { t: nx.t.slice(), a: nx.a.slice(), h: nx.h.slice(), b: nx.b.slice() };
        palDirty = true; if (!motion) draw();
      },
      set: function (p) {
        if (p.flow != null) flow = p.flow;
        if (p.density && Math.abs(p.density - density) > .001) { density = p.density; layout(); }
      },
      intro: function () { if (introT < 0) introT = 0; },
      setActive: function (b) { b = !!b; if (b === active) return; active = b; if (!b) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); } },
      destroy: function () { dead = true; cancelAnimationFrame(raf); offs.forEach(function (fn) { fn(); }); }
    };
  }
  window.PortfolioField = { create: create, grain: grain };
})();
