// ── NAV ACTIVE STATE ──
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .bottom-nav-item').forEach(a => {
    const h = (a.getAttribute('href') || '').split('#')[0].split('/').pop() || 'index.html';
    if (h === page || (page === '' && h === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

// ── FADE IN ON SCROLL ──
(function () {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        e.target.style.transitionDelay = (i * 0.06) + 's';
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  document.querySelectorAll('.fade-in').forEach(el => io.observe(el));
})();

// ── DEMO ENGINE ──
(function () {
  const inputEl  = document.getElementById('input');
  const outputEl = document.getElementById('output');
  const btn      = document.getElementById('processBtn');
  const statusEl = document.getElementById('demoStatus');

  if (!inputEl || !outputEl || !btn) return;

  const EXAMPLES = [
    `Salsa Night at Sabor Latino\nFriday, May 9th 2025 — Doors open at 20:00\nVenue: Sabor Latino, Gothersgade 39, Copenhagen\nPrice: 80 DKK at the door, free before 21:00\nFeaturing live band + DJ set until 02:00`,
    `Bachata Sensual Workshop\nDate: Saturday 17 May 2025\nTime: 14:00–17:00\nLocation: Dance Studio Frederiksberg, Falkoner Allé 12\nInstructors: Marcos & Elena\nCost: 350 kr`,
    `KIZOMBA SOCIAL @ Club Rhythm\nEvery last Sunday of the month\nNext: May 25, 2025 — 19:00 to 23:30\nEntry: 60 DKK members / 90 DKK guests\nAddress: Vesterbrogade 88, 1620 Copenhagen`
  ];

  document.querySelectorAll('.demo-chip').forEach((chip, i) => {
    chip.addEventListener('click', () => {
      if (EXAMPLES[i]) { inputEl.value = EXAMPLES[i]; inputEl.focus(); }
    });
  });

  function setStatus(txt, done) {
    if (statusEl) {
      statusEl.className = 'demo-status-txt' + (done ? ' done' : '');
      statusEl.textContent = txt;
    }
  }

  function highlight(json) {
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|null)/g,
      m => {
        let c = 'json-number';
        if (/^"/.test(m))              c = /:$/.test(m) ? 'json-key' : 'json-string';
        else if (/true|false/.test(m)) c = 'json-bool';
        else if (/null/.test(m))       c = 'json-null';
        return `<span class="${c}">${m}</span>`;
      }
    );
  }

  function parseEvent(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const combo = lines.join(' ');
    const title = lines[0] || null;

    const datePatterns = [
      /(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/i,
      /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/i,
    ];
    let date = null;
    for (const p of datePatterns) { const m = combo.match(p); if (m) { date = m[0]; break; } }

    const dayM  = combo.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
    const timeM = combo.match(/(\d{1,2}[:.]\d{2})\s*(?:–|-|to|until)\s*(\d{1,2}[:.]\d{2})/i) || combo.match(/(\d{1,2}[:.]\d{2})/i);
    const venM  = combo.match(/(?:venue|location|address|at|@)[:\s]+([^,\n]+(?:,\s*[^,\n]+)?)/i);
    const prM   = combo.match(/(\d+(?:\.\d+)?\s?(?:DKK|kr|EUR|€|\$)[^,\n]*)/i) || combo.match(/(free(?:\s+before\s+\d{2}:\d{2})?|gratis)/i);

    const styles = ['salsa','bachata','kizomba','tango','zouk','merengue'];
    const dance_style = styles.find(s => combo.toLowerCase().includes(s)) || null;

    const typeK = { workshop:/workshop|class|lesson/i, social:/social|party|night/i, festival:/festival/i };
    let event_type = 'event';
    for (const [k,p] of Object.entries(typeK)) { if (p.test(combo)) { event_type = k; break; } }

    const recM = combo.match(/every\s+(last\s+)?\w+/i) || combo.match(/weekly|monthly/i);
    const tags = [];
    if (dance_style) tags.push(dance_style);
    tags.push(event_type);
    if (prM && /free/i.test(prM[0])) tags.push('free-entry');
    if (/live band/i.test(combo)) tags.push('live-music');
    if (/\bDJ\b/i.test(combo)) tags.push('dj-set');

    let score = 0;
    if (title) score += 20; if (date) score += 25; if (timeM) score += 15;
    if (venM)  score += 20; if (prM)  score += 10; if (dance_style) score += 10;

    return {
      title,
      event_type,
      dance_style,
      date,
      day_of_week: dayM ? dayM[1] : null,
      time: {
        start: timeM ? timeM[1].replace('.', ':') : null,
        end:   timeM && timeM[2] ? timeM[2].replace('.', ':') : null
      },
      location:   venM ? venM[1].trim() : null,
      price:      prM  ? prM[0].trim()  : null,
      recurrence: recM ? recM[0]        : null,
      tags,
      confidence: score + '%'
    };
  }

  btn.addEventListener('click', async () => {
    const text = inputEl.value.trim();
    if (!text) {
      outputEl.innerHTML = '<span style="color:var(--text3);font-style:italic">// No input — paste some event text first</span>';
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Processing';
    setStatus('Parsing...');
    outputEl.innerHTML = '<span style="color:var(--text3);font-style:italic">// Extracting fields...</span>';
    await new Promise(r => setTimeout(r, 400));
    setStatus('Resolving entities...');
    await new Promise(r => setTimeout(r, 350));
    const result = parseEvent(text);
    outputEl.innerHTML = highlight(JSON.stringify(result, null, 2));
    btn.disabled = false;
    btn.textContent = 'Process';
    setStatus('Done — ' + result.confidence + ' confidence', true);
  });

  setStatus('Ready');
})();

// State-of-art motion: subtle, progressive and dependency-free
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const lines = document.querySelectorAll('.kinetic-line');
  window.addEventListener('scroll', () => {
    const y = Math.min(window.scrollY, 700);
    lines.forEach((el,i)=>{ el.style.transform = 'translate3d(' + (y*(i-1)*.035) + 'px,' + (y*.018*(i+1)) + 'px,0)'; });
  }, {passive:true});
  document.querySelectorAll('.build-card').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r=card.getBoundingClientRect(), x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
      card.style.transform='perspective(900px) rotateX('+(-y*2.2)+'deg) rotateY('+(x*2.2)+'deg) translateY(-5px)';
    });
    card.addEventListener('pointerleave',()=>card.style.transform='');
  });
})();

// WOW V3: living background, glass lens, reactive project light
(() => {
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, coarse=matchMedia('(pointer: coarse)').matches;
 const lens=document.querySelector('.cursor-lens');
 if(lens&&!coarse&&!reduce){let tx=-200,ty=-200,x=tx,y=ty;addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY},{passive:true});const tick=()=>{x+=(tx-x)*.16;y+=(ty-y)*.16;lens.style.left=x+'px';lens.style.top=y+'px';requestAnimationFrame(tick)};tick()}
 document.querySelectorAll('.build-card').forEach(card=>card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();card.style.setProperty('--mx',(e.clientX-r.left)+'px');card.style.setProperty('--my',(e.clientY-r.top)+'px')},{passive:true}));
 const canvas=document.getElementById('liquidCanvas');if(!canvas||reduce)return;const ctx=canvas.getContext('2d');let w,h,dpr,pts=[];
 const resize=()=>{dpr=Math.min(devicePixelRatio||1,1.5);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);pts=Array.from({length:Math.min(55,Math.floor(w/24))},(_,i)=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.2+.25,s:Math.random()*.09+.025,p:Math.random()*6.28}))};resize();addEventListener('resize',resize);
 let t=0;function draw(){t+=.01;ctx.clearRect(0,0,w,h);const g=ctx.createRadialGradient(w*.76,h*.18,0,w*.76,h*.18,Math.max(w,h)*.55);g.addColorStop(0,'rgba(224,85,32,.075)');g.addColorStop(.45,'rgba(80,45,120,.025)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle='rgba(255,255,255,.24)';pts.forEach(p=>{const yy=(p.y+t*100*p.s)%h;ctx.globalAlpha=.12+.12*Math.sin(t+p.p);ctx.beginPath();ctx.arc(p.x,yy,p.r,0,6.28);ctx.fill()});ctx.globalAlpha=1;requestAnimationFrame(draw)}draw();
})();
