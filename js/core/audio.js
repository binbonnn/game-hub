/* =========================================================
   Game Hub v2 · Audio (WebAudio synthesis, no assets)
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var A = GH.audio = {};
  var ctx = null;
  var master = null;
  var enabled = true;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  A.setEnabled = function (value) {
    enabled = !!value;
    document.documentElement.setAttribute('data-sound', enabled ? 'on' : 'off');
    if (master) master.gain.value = enabled ? 0.16 : 0;
    if (enabled) ensure();
  };

  A.isEnabled = function () { return enabled; };

  A.tone = function (freq, duration, opts) {
    if (!enabled) return;
    opts = opts || {};
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t0 + duration);
    }
    var vol = (opts.gain == null ? 0.5 : opts.gain);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  };

  A.chord = function (freqs, duration, opts) {
    freqs.forEach(function (f, i) {
      setTimeout(function () { A.tone(f, duration, opts); }, i * 28);
    });
  };

  A.click = function () { A.tone(520, 0.05, { type: 'triangle', gain: 0.22 }); };
  A.hover = function () { A.tone(760, 0.035, { type: 'sine', gain: 0.10 }); };
  A.correct = function () {
    A.tone(660, 0.10, { type: 'triangle', gain: 0.34 });
    setTimeout(function () { A.tone(990, 0.16, { type: 'triangle', gain: 0.3 }); }, 90);
  };
  A.wrong = function () {
    A.tone(190, 0.18, { type: 'sawtooth', gain: 0.22, endFreq: 120 });
    setTimeout(function () { A.tone(140, 0.2, { type: 'sawtooth', gain: 0.16, endFreq: 90 }); }, 100);
  };
  A.hint = function () {
    A.tone(880, 0.08, { type: 'sine', gain: 0.22 });
    setTimeout(function () { A.tone(1180, 0.12, { type: 'sine', gain: 0.18 }); }, 80);
  };
  A.win = function () {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      setTimeout(function () { A.tone(f, 0.3, { type: 'triangle', gain: 0.28 }); }, i * 120);
    });
  };
  A.lose = function () {
    [392, 329.63, 261.63].forEach(function (f, i) {
      setTimeout(function () { A.tone(f, 0.34, { type: 'sine', gain: 0.26 }); }, i * 170);
    });
  };
  A.merge = function () {
    A.tone(400, 0.12, { type: 'square', gain: 0.2, endFreq: 900 });
    setTimeout(function () { A.tone(1200, 0.16, { type: 'triangle', gain: 0.2 }); }, 90);
  };
  A.buy = function () {
    A.tone(740, 0.08, { type: 'triangle', gain: 0.24 });
    setTimeout(function () { A.tone(1100, 0.1, { type: 'triangle', gain: 0.18 }); }, 60);
  };
  A.sell = function () {
    A.tone(620, 0.08, { type: 'triangle', gain: 0.2 });
    setTimeout(function () { A.tone(420, 0.12, { type: 'triangle', gain: 0.18 }); }, 60);
  };
  A.error = function () { A.tone(150, 0.16, { type: 'square', gain: 0.18 }); };
  A.tick = function () { A.tone(1000, 0.03, { type: 'sine', gain: 0.10 }); };
  A.countdown = function (isLast) {
    A.tone(isLast ? 880 : 520, isLast ? 0.18 : 0.09, { type: 'triangle', gain: 0.26 });
  };
  A.flip = function () { A.tone(480, 0.06, { type: 'triangle', gain: 0.18, endFreq: 640 }); };
  A.recallTone = function (index, kind) {
    var scale = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25];
    A.tone(scale[index % scale.length], 0.34, { type: kind === 'soft' ? 'sine' : 'triangle', gain: 0.25 });
  };
  A.boss = function () {
    A.tone(110, 0.5, { type: 'sawtooth', gain: 0.22, endFreq: 70 });
    setTimeout(function () { A.tone(165, 0.35, { type: 'square', gain: 0.14 }); }, 220);
  };
  A.purchaseFail = function () { A.tone(220, 0.12, { type: 'square', gain: 0.16, endFreq: 160 }); };

  A.unlock = function () { ensure(); };
})();
