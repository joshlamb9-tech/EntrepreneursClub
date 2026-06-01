/* ===================================================
   Entrepreneurs Club — Business Idea Simulator
   Front-end: form handling, fetch, valuation maths,
   report rendering, sound, confetti, count-up, share.
   =================================================== */

(function () {
  'use strict';

  /* ─── CONFIG ──────────────────────────────────── */
  var SUPABASE_URL = 'https://jkbfvfoepmhwyzhleifh.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_q9qOX43dA9SoxZ3Bq2p2Pw_c-GUaYw_';
  var FUNCTION_URL = SUPABASE_URL + '/functions/v1/simulate-business';

  /* ─── SEGMENT WEIGHTS ─────────────────────────── */
  var SEGMENT_WEIGHTS = { S1:15, S2:20, S3:12, S4:8, S5:10, S6:10, S7:10, S8:7, S9:8 };

  /* ─── FREQUENCY MAP ───────────────────────────── */
  var FREQ_MAP = { once:1, quarterly:4, monthly:12, weekly:52, daily:365 };

  /* ─── LOADING MESSAGES ────────────────────────── */
  var LOADING_MSGS = [
    'Assembling your customer panel...',
    'Running the simulation...',
    'Crunching the numbers...',
    'Writing your investor report...',
  ];

  /* ─── VERDICT CONFIG ──────────────────────────── */
  var VERDICTS = [
    {
      tier: 5,
      min: 50000,
      tierName: 'Investors are calling',
      headline: 'This could be a real business.',
      explanation: 'The numbers suggest strong demand and healthy margins. Now the question is: can you deliver at scale?',
      steps: [
        'Think about how you\'d hire help as you grow.',
        'Could you protect your idea — is there a unique element competitors can\'t copy?',
      ],
    },
    {
      tier: 4,
      min: 15000,
      tierName: 'Strong business',
      headline: 'Solid idea with real commercial potential.',
      explanation: 'Enough customers would pay enough to make this profitable. The main job now is getting in front of them.',
      steps: [
        'How would your first 10 customers find out about you?',
        'Is there a version of this that costs less to deliver?',
      ],
    },
    {
      tier: 3,
      min: 5000,
      tierName: 'Worth building',
      headline: 'This works — the margins just need attention.',
      explanation: 'The idea has appeal, but profit is tight. Small changes to price or costs could move this into stronger territory.',
      steps: [
        'Could you charge slightly more — and if so, what would justify it?',
        'What\'s your single biggest cost, and is there a way to reduce it?',
      ],
    },
    {
      tier: 2,
      min: 1000,
      tierName: 'Early stage',
      headline: 'There\'s something here — it needs sharpening.',
      explanation: 'The customer interest is real, but at this price and cost level, the profit is thin. That\'s fixable.',
      steps: [
        'Try doubling your price and re-running the numbers.',
        'Who is your most likely customer — and are you targeting them clearly?',
      ],
    },
    {
      tier: 1,
      min: 0,
      tierName: 'Back to the drawing board',
      headline: 'The numbers aren\'t there yet — but the thinking is.',
      explanation: 'At the moment, the profit is too small to build a real business. That doesn\'t mean the idea is bad — it means something needs to change.',
      steps: [
        'Is the price too low? Most first-time entrepreneurs undercharge.',
        'Is the market too small — or are you describing your customer too broadly?',
      ],
    },
  ];

  /* ─── STAR SVG ────────────────────────────────── */
  function starSVG() {
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.9 6.3L22 9.3l-5 4.9 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.3l7.1-1z"/></svg>';
  }

  /* ─── FORMAT CURRENCY ─────────────────────────── */
  function formatCurrency(n) {
    if (n >= 1000000) {
      var rounded = Math.round(n / 10000) * 10000;
      return '£' + rounded.toLocaleString('en-GB');
    }
    var rounded = Math.round(n / 1000) * 1000;
    if (rounded === 0 && n > 0) rounded = Math.max(1000, Math.round(n / 100) * 100);
    return '£' + rounded.toLocaleString('en-GB');
  }

  function formatCurrencyExact(n) {
    return '£' + Math.round(n).toLocaleString('en-GB');
  }

  /* ─── VALUATION MATHS ─────────────────────────── */
  function calcValuation(segments, price, costPerUnit, freqKey) {
    var totalWeighted = 0;
    var totalWeightedFreq = 0;

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var w = (SEGMENT_WEIGHTS[seg.segment_id] || 0) / 100;

      var pricedBuyRate = seg.buy_probability;
      if (seg.willingness_to_pay < price) {
        pricedBuyRate = seg.buy_probability * (seg.willingness_to_pay / price);
      }
      totalWeighted += pricedBuyRate * w;
      totalWeightedFreq += seg.purchase_frequency_multiplier * w;
    }

    var panelBuyRate = totalWeighted;
    var addressableBuyers = Math.round(panelBuyRate * 1000);
    var baseFreq = FREQ_MAP[freqKey] || 1;
    var annualPurchasesPerBuyer = baseFreq * totalWeightedFreq;
    var annualRevenue = addressableBuyers * price * annualPurchasesPerBuyer;
    var unitMargin = price - costPerUnit;
    var marginPct = price > 0 ? unitMargin / price : 0;
    var annualProfit = annualRevenue * marginPct;
    var valuation = Math.min(annualRevenue * 3, 10000000);

    return {
      addressableBuyers: addressableBuyers,
      annualRevenue: annualRevenue,
      annualProfit: annualProfit,
      valuation: valuation,
      marginPct: marginPct,
    };
  }

  /* ─── GET VERDICT ─────────────────────────────── */
  function getVerdict(annualProfit) {
    for (var i = 0; i < VERDICTS.length; i++) {
      if (annualProfit >= VERDICTS[i].min) return VERDICTS[i];
    }
    return VERDICTS[VERDICTS.length - 1];
  }

  /* ─── LOADING STATE CYCLING ───────────────────── */
  var loadingInterval = null;

  function startLoading(loadingEl) {
    var msgEl = loadingEl.querySelector('.loading-text');
    var idx = 0;
    msgEl.textContent = LOADING_MSGS[0];

    loadingInterval = setInterval(function () {
      msgEl.style.opacity = '0';
      setTimeout(function () {
        idx = (idx + 1) % LOADING_MSGS.length;
        msgEl.textContent = LOADING_MSGS[idx];
        msgEl.style.opacity = '1';
      }, 300);
    }, 2000);
  }

  function stopLoading() {
    if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
  }

  /* ═══════════════════════════════════════════════
     DELIGHT FEATURE 1 — SOUND (Web Audio API)
  ══════════════════════════════════════════════ */

  var audioCtx = null;
  var isMuted = false;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function loadMuteState() {
    try {
      isMuted = localStorage.getItem('ec_muted') === '1';
    } catch(e) { isMuted = false; }
    var btn = document.getElementById('mute-btn');
    if (btn) btn.textContent = isMuted ? '🔇' : '🔊';
  }

  function saveMuteState() {
    try { localStorage.setItem('ec_muted', isMuted ? '1' : '0'); } catch(e) {}
    var btn = document.getElementById('mute-btn');
    if (btn) btn.textContent = isMuted ? '🔇' : '🔊';
  }

  /* Drumroll: repeated noise bursts during loading */
  var drumrollNodes = [];

  function startDrumroll() {
    if (isMuted) return;
    var ctx;
    try { ctx = getAudioCtx(); } catch(e) { return; }

    stopDrumroll();

    function oneHit(when) {
      var bufSize = ctx.sampleRate * 0.04;
      var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.4));
      }
      var src = ctx.createBufferSource();
      src.buffer = buf;

      var filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 180;
      filter.Q.value = 1.2;

      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.32, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(when);
      drumrollNodes.push(src);
    }

    /* Schedule hits for up to 12 seconds, accelerating slightly */
    var now = ctx.currentTime;
    var t = now;
    var interval = 0.22;
    for (var i = 0; i < 60; i++) {
      oneHit(t);
      interval = Math.max(0.08, interval - 0.002);
      t += interval;
    }
  }

  function stopDrumroll() {
    drumrollNodes.forEach(function(n) { try { n.stop(); } catch(e){} });
    drumrollNodes = [];
  }

  function playFanfare(tier) {
    if (isMuted) return;
    var ctx;
    try { ctx = getAudioCtx(); } catch(e) { return; }

    stopDrumroll();

    /* Notes for each tier — higher tier = richer chord resolution */
    var sequences = {
      1: [{ f: 220, d: 0.35, t: 0 }, { f: 196, d: 0.5, t: 0.38 }],
      2: [{ f: 262, d: 0.25, t: 0 }, { f: 294, d: 0.35, t: 0.28 }, { f: 330, d: 0.5, t: 0.58 }],
      3: [
        { f: 330, d: 0.2, t: 0 }, { f: 392, d: 0.2, t: 0.22 },
        { f: 440, d: 0.3, t: 0.44 }, { f: 494, d: 0.6, t: 0.72 },
      ],
      4: [
        { f: 392, d: 0.18, t: 0 }, { f: 440, d: 0.18, t: 0.2 },
        { f: 523, d: 0.18, t: 0.4 }, { f: 587, d: 0.18, t: 0.6 },
        { f: 659, d: 0.5, t: 0.82 }, { f: 523, d: 0.5, t: 0.84 },
      ],
      5: [
        { f: 523, d: 0.15, t: 0 }, { f: 659, d: 0.15, t: 0.17 },
        { f: 784, d: 0.15, t: 0.34 }, { f: 1047, d: 0.4, t: 0.52 },
        { f: 784, d: 0.25, t: 0.55 }, { f: 1047, d: 0.65, t: 0.82 },
        /* final chord: root + fifth */
        { f: 523, d: 0.7, t: 0.82 }, { f: 659, d: 0.7, t: 0.83 },
      ],
    };

    var notes = sequences[tier] || sequences[3];
    var now = ctx.currentTime + 0.05;

    notes.forEach(function(note) {
      var osc = ctx.createOscillator();
      osc.type = (tier >= 4) ? 'triangle' : 'sine';
      osc.frequency.value = note.f;

      var gain = ctx.createGain();
      var start = now + note.t;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + note.d);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + note.d + 0.01);
    });
  }

  /* ═══════════════════════════════════════════════
     DELIGHT FEATURE 2 — COUNT-UP ANIMATION
  ══════════════════════════════════════════════ */

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function countUp(el, targetValue, formatFn, duration) {
    /* Respect prefers-reduced-motion */
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      el.textContent = formatFn(targetValue);
      return;
    }

    var start = null;
    var startValue = 0;

    function step(timestamp) {
      if (!start) start = timestamp;
      var elapsed = timestamp - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased = easeOut(progress);
      var current = startValue + (targetValue - startValue) * eased;
      el.textContent = formatFn(current);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = formatFn(targetValue);
      }
    }

    requestAnimationFrame(step);
  }

  function formatCount(n) {
    return Math.round(n).toLocaleString('en-GB');
  }

  function formatCurrencyCount(n) {
    return '£' + Math.round(n).toLocaleString('en-GB');
  }

  function formatCurrencyRoundedCount(n) {
    /* Mirrors formatCurrency but works on partial values during count-up */
    if (n >= 1000000) {
      return '£' + Math.round(n).toLocaleString('en-GB');
    }
    return '£' + Math.round(n).toLocaleString('en-GB');
  }

  /* ═══════════════════════════════════════════════
     DELIGHT FEATURE 3 — CONFETTI
  ══════════════════════════════════════════════ */

  function fireConfetti() {
    if (typeof confetti !== 'function') return;

    var colors = ['#a855f7', '#ec4899', '#6B21A8', '#fde68a', '#ffffff', '#7C3AED'];

    /* Centre burst */
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.55 },
      colors: colors,
      scalar: 1.1,
    });

    /* Left */
    setTimeout(function() {
      confetti({
        particleCount: 60,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: colors,
        scalar: 0.9,
      });
    }, 150);

    /* Right */
    setTimeout(function() {
      confetti({
        particleCount: 60,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: colors,
        scalar: 0.9,
      });
    }, 300);
  }

  /* ═══════════════════════════════════════════════
     DELIGHT FEATURE 4 — SHARE CARD DOWNLOAD
  ══════════════════════════════════════════════ */

  /* Populated when report renders */
  var _shareData = null;

  function populateShareCard(bizName, summary, verdict, calc) {
    var nameEl = document.getElementById('sc-biz-name');
    var tagEl  = document.getElementById('sc-tagline');
    var starsEl = document.getElementById('sc-stars');
    var tierEl  = document.getElementById('sc-tier-name');
    var buyersEl   = document.getElementById('sc-buyers');
    var revenueEl  = document.getElementById('sc-revenue');
    var profitEl   = document.getElementById('sc-profit');
    var valuationEl = document.getElementById('sc-valuation');

    if (!nameEl) return;

    nameEl.textContent = bizName;
    tagEl.textContent  = summary || '';
    tierEl.textContent = verdict.tierName;

    starsEl.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var s = document.createElement('span');
      s.className = 'share-star' + (i < verdict.tier ? ' lit' : '');
      s.textContent = '★';
      starsEl.appendChild(s);
    }

    buyersEl.textContent   = calc.addressableBuyers.toLocaleString('en-GB');
    revenueEl.textContent  = formatCurrencyExact(calc.annualRevenue);
    profitEl.textContent   = formatCurrencyExact(calc.annualProfit);
    valuationEl.textContent = formatCurrency(calc.valuation);

    _shareData = { bizName: bizName };
  }

  function downloadShareCard() {
    var card = document.getElementById('share-card');
    if (!card || typeof html2canvas !== 'function') return;

    /* Temporarily position card visibly off-screen but renderable */
    card.style.left = '-9999px';
    card.style.top = '0px';

    html2canvas(card, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    }).then(function(canvas) {
      var link = document.createElement('a');
      var slug = (_shareData && _shareData.bizName)
        ? _shareData.bizName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : 'investor-report';
      link.download = slug + '-investor-report.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(function(err) {
      console.warn('Share card download failed:', err);
    });
  }

  /* ─── RENDER REPORT ───────────────────────────── */
  function renderReport(simulation, formData, calc, verdict) {
    var report = document.getElementById('report');
    var today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    /* -- Header -- */
    report.querySelector('.biz-name').textContent = formData.business_name;
    report.querySelector('.report-meta').textContent = 'Investor Report — ' + today;
    report.querySelector('.idea-summary').textContent = simulation.idea_summary;

    /* -- Verdict band -- */
    var bandEl = report.querySelector('.verdict-band');
    bandEl.className = 'verdict-band tier-' + verdict.tier;
    bandEl.textContent = verdict.tierName;

    /* -- Stars row (build empty first, fill one-by-one in animateReportIn) -- */
    var starsRow = report.querySelector('.stars-row');
    starsRow.className = 'stars-row tier-' + verdict.tier;
    starsRow.innerHTML = '';
    for (var s = 0; s < 5; s++) {
      var starEl = document.createElement('span');
      starEl.className = 'star' + (s < verdict.tier ? '' : ' dim');
      starEl.innerHTML = starSVG();
      starsRow.appendChild(starEl);
    }

    /* -- Verdict text -- */
    report.querySelector('.verdict-headline').textContent = verdict.headline;
    report.querySelector('.verdict-explanation').textContent = verdict.explanation;
    var stepsList = report.querySelector('.verdict-nextsteps');
    stepsList.innerHTML = verdict.steps.map(function (s) {
      return '<li>' + escHtml(s) + '</li>';
    }).join('');

    /* -- Stats: set placeholders (count-up fills them in animateReportIn) -- */
    report.querySelector('.stat-buyers .stat-value').textContent   = '0';
    report.querySelector('.stat-revenue .stat-value').textContent  = '£0';
    report.querySelector('.stat-profit .stat-value').textContent   = '£0';
    report.querySelector('.stat-valuation .stat-value').textContent = '£0';
    report.querySelector('.stat-margin-pct').textContent = Math.round(calc.marginPct * 100) + '%';

    /* -- Bar chart -- */
    var barChart = report.querySelector('.bar-chart');
    barChart.innerHTML = '';
    simulation.segments.forEach(function (seg) {
      var pct = Math.round(seg.buy_probability * 100);
      var row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<span class="bar-label">' + escHtml(seg.segment_label) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" data-pct="' + pct + '"></div></div>' +
        '<span class="bar-pct">' + pct + '%</span>';
      barChart.appendChild(row);
    });

    /* standout + weakest */
    var standout = simulation.segments.find(function (s) { return s.segment_id === simulation.standout_segment; });
    var weakest  = simulation.segments.find(function (s) { return s.segment_id === simulation.weakest_segment; });
    var chartNotes = report.querySelector('.chart-notes');
    chartNotes.innerHTML =
      '<strong>Best response:</strong> ' + escHtml((standout && standout.segment_label) || simulation.standout_segment) +
      '. <strong>Least interested:</strong> ' + escHtml((weakest && weakest.segment_label) || simulation.weakest_segment) + '.';

    /* -- Quotes (top 3 by buy_probability) -- */
    var sorted = simulation.segments.slice().sort(function (a, b) { return b.buy_probability - a.buy_probability; });
    var top3 = sorted.slice(0, 3);
    var quotesGrid = report.querySelector('.quotes-grid');
    quotesGrid.innerHTML = top3.map(function (seg) {
      return '<div class="quote-box">' +
        '<div class="quote-text">' + escHtml(seg.quote) + '</div>' +
        '<div class="quote-seg">' + escHtml(seg.segment_label) + '</div>' +
        '</div>';
    }).join('');

    /* -- Panel thinks -- */
    report.querySelector('.text-strength').textContent  = simulation.top_strength;
    report.querySelector('.text-challenge').textContent = simulation.main_challenge;
    report.querySelector('.text-encouragement').textContent = simulation.encouragement;

    /* -- Share card -- */
    populateShareCard(formData.business_name, simulation.idea_summary, verdict, calc);
  }

  /* ─── ANIMATE REPORT IN ───────────────────────── */
  function animateReportIn(calc, verdict) {
    var sections = document.querySelectorAll('#report .fade-up');
    sections.forEach(function (el, i) {
      setTimeout(function () {
        el.classList.add('visible');
      }, 300 + i * 300);
    });

    /* Fill stars one-by-one */
    setTimeout(function () {
      var stars = document.querySelectorAll('#report .stars-row .star:not(.dim)');
      stars.forEach(function (star, i) {
        setTimeout(function () {
          star.classList.add('filled');
        }, i * 180);
      });

      /* After last star fills, fire fanfare and (if tier 4/5) confetti */
      var totalStarDelay = (verdict.tier - 1) * 180;
      var fanfareDelay = totalStarDelay + 200;

      setTimeout(function() {
        playFanfare(verdict.tier);
      }, fanfareDelay);

      if (verdict.tier >= 4) {
        setTimeout(function() {
          fireConfetti();
        }, fanfareDelay + 300);
      }
    }, 300);

    /* Count-up stats */
    setTimeout(function () {
      var DURATION = 1200;
      countUp(
        document.querySelector('#report .stat-buyers .stat-value'),
        calc.addressableBuyers,
        formatCount,
        DURATION
      );
      countUp(
        document.querySelector('#report .stat-revenue .stat-value'),
        calc.annualRevenue,
        formatCurrencyCount,
        DURATION
      );
      countUp(
        document.querySelector('#report .stat-profit .stat-value'),
        calc.annualProfit,
        formatCurrencyCount,
        DURATION
      );
      countUp(
        document.querySelector('#report .stat-valuation .stat-value'),
        calc.valuation,
        formatCurrencyRoundedCount,
        DURATION
      );
    }, 600);

    /* Fill bars */
    setTimeout(function () {
      var fills = document.querySelectorAll('#report .bar-fill');
      fills.forEach(function (fill) {
        var pct = fill.getAttribute('data-pct');
        fill.style.width = pct + '%';
      });
    }, 900);
  }

  /* ─── ESCAPE HTML ─────────────────────────────── */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ─── MAIN SUBMIT HANDLER ─────────────────────── */
  function init() {
    var form         = document.getElementById('idea-form');
    var formSection  = document.getElementById('form-section');
    var loadingEl    = document.getElementById('loading');
    var errorBox     = document.getElementById('error-box');
    var reportEl     = document.getElementById('report');
    var resetBtn     = document.getElementById('reset-btn');
    var downloadBtn  = document.getElementById('download-btn');
    var muteBtn      = document.getElementById('mute-btn');

    if (!form) return;

    /* Load mute state */
    loadMuteState();

    /* Mute toggle */
    if (muteBtn) {
      muteBtn.addEventListener('click', function() {
        isMuted = !isMuted;
        saveMuteState();
        /* Resume AudioContext if needed (browser autoplay policy) */
        if (!isMuted && audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      });
    }

    /* Download button */
    if (downloadBtn) {
      downloadBtn.addEventListener('click', downloadShareCard);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      /* Hide error */
      errorBox.textContent = '';
      errorBox.classList.remove('active');

      /* Collect form values */
      var formData = {
        business_name:   form.elements['business_name'].value.trim(),
        what_it_does:    form.elements['what_it_does'].value.trim(),
        who_its_for:     form.elements['who_its_for'].value.trim(),
        problem_it_solves: form.elements['problem_it_solves'].value.trim(),
        price:           parseFloat(form.elements['price'].value),
        cost_per_unit:   parseFloat(form.elements['cost_per_unit'].value),
        purchase_frequency: form.elements['purchase_frequency'].value,
        why_different:   form.elements['why_different'].value.trim(),
      };

      /* Show loading, hide form */
      formSection.style.display = 'none';
      loadingEl.classList.add('active');
      startLoading(loadingEl);

      /* Resume AudioContext (browser autoplay policy requires user gesture first) */
      if (!isMuted) {
        var ctx;
        try { ctx = getAudioCtx(); if (ctx.state === 'suspended') ctx.resume(); } catch(e) {}
        setTimeout(function() { startDrumroll(); }, 100);
      }

      /* Call edge function */
      fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(formData),
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.error || 'Something went wrong — try again.');
          }).catch(function () {
            throw new Error('Something went wrong — try again.');
          });
        }
        return res.json();
      })
      .then(function (data) {
        stopLoading();
        stopDrumroll();
        loadingEl.classList.remove('active');

        var simulation = data.simulation;
        if (!simulation || !simulation.segments) {
          throw new Error('We couldn\'t read the simulation data — try again.');
        }

        /* Valuation maths */
        var calc = calcValuation(
          simulation.segments,
          formData.price,
          formData.cost_per_unit,
          formData.purchase_frequency
        );
        var verdict = getVerdict(calc.annualProfit);

        /* Render + show */
        renderReport(simulation, formData, calc, verdict);
        reportEl.classList.add('active');
        animateReportIn(calc, verdict);

        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (err) {
        stopLoading();
        stopDrumroll();
        loadingEl.classList.remove('active');
        formSection.style.display = '';
        errorBox.textContent = err.message || 'Something went wrong — try again.';
        errorBox.classList.add('active');
      });
    });

    /* Reset */
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        reportEl.classList.remove('active');
        document.querySelectorAll('#report .fade-up').forEach(function (el) {
          el.classList.remove('visible');
        });
        formSection.style.display = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ─── BOOT ────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
