/* Page d'accueil : mouvements (GSAP + ScrollTrigger + Lenis) et transitions d'images (Three.js).
   Tout le contenu est visible sans ce fichier ; il n'ajoute que le mouvement. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hdr = $(".hdr");
  const hero = $(".h-hero");

  /* ---- En-tête transparent tant qu'on est sur la photo du haut ---- */
  function hdrState() {
    const over = hero && window.scrollY < hero.offsetHeight - 90;
    hdr.classList.toggle("hdr-over", !!over);
  }
  hdrState();
  addEventListener("scroll", hdrState, { passive: true });
  addEventListener("resize", hdrState);

  /* ---- Diaporama lent du haut de page ---- */
  const slides = $$(".h-hero-media img");
  const dots = $$(".h-cap-dots i");
  const cap = $(".h-cap-text");
  let cur = 0, heroVisible = true;
  function go(n) {
    slides[cur].classList.remove("is-on");
    if (dots[cur]) dots[cur].classList.remove("on");
    cur = n % slides.length;
    const im = slides[cur];
    im.classList.add("is-on");
    if (dots[cur]) dots[cur].classList.add("on");
    if (slides[(cur + 1) % slides.length].loading === "lazy") slides[(cur + 1) % slides.length].loading = "eager";
    if (cap) { cap.style.opacity = 0; setTimeout(() => { cap.textContent = im.dataset.cap || ""; cap.style.opacity = 1; }, 320); }
  }
  if (hero && slides.length > 1 && !reduce) {
    new IntersectionObserver(e => { heroVisible = e[0].isIntersecting; }).observe(hero);
    addEventListener("load", () => { slides[1].loading = "eager"; });
    setInterval(() => { if (heroVisible && !document.hidden) go(cur + 1); }, 6500);
  }

  const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger || reduce) return;
  gsap.registerPlugin(ScrollTrigger);

  /* ---- Défilement fluide avec inertie ---- */
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute("href").length < 2) return;
      const target = document.getElementById(a.getAttribute("href").slice(1));
      if (!target) return;
      e.preventDefault();
      hdr.classList.remove("menu-open");
      lenis.scrollTo(target, { offset: -(hdr.offsetHeight + 16), duration: 1.3 });
      history.replaceState(null, "", a.getAttribute("href"));
    });
  }

  /* ---- Haut de page : entrée puis léger parallaxe ---- */
  gsap.from(".h-hero-copy > *, .h-hero-price", { y: 30, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.07, delay: 0.15 });
  const heroST = { trigger: ".h-hero", start: "top top", end: "bottom top", scrub: true };
  gsap.to(".h-hero-in", { yPercent: -10, opacity: 0.25, ease: "none", scrollTrigger: heroST });
  gsap.to(".h-hero-media", { yPercent: 12, ease: "none", scrollTrigger: heroST });

  /* ---- Phrase manifeste : les mots s'allument au défilement ---- */
  const say = $(".h-say-text");
  if (say) {
    const walk = node => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement("span"); s.className = "w"; s.textContent = part; frag.appendChild(s); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(say);
    gsap.fromTo($$(".w", say), { opacity: 0.16 }, {
      opacity: 1, ease: "none", stagger: 0.06,
      scrollTrigger: { trigger: say, start: "top 82%", end: "bottom 48%", scrub: true }
    });
  }

  /* ---- Climatiseurs : les cartes arrivent en série ---- */
  const cards = $$(".h-products .pd-pane:not([hidden]) .pd");
  if (cards.length) {
    gsap.set(cards, { y: 48, opacity: 0 });
    ScrollTrigger.batch(cards, { start: "top 92%", once: true, onEnter: b => gsap.to(b, { y: 0, opacity: 1, duration: 0.9, ease: "expo.out", stagger: 0.08 }) });
  }

  /* ---- Services et artisan : photos révélées, parallaxe interne ---- */
  $$(".h-row-media, .h-about-media").forEach(fig => {
    gsap.fromTo(fig, { clipPath: "inset(12% 9% 12% 9% round 26px)" }, {
      clipPath: "inset(0% 0% 0% 0% round 26px)", ease: "none",
      scrollTrigger: { trigger: fig, start: "top 92%", end: "top 38%", scrub: true }
    });
    const img = $("img", fig);
    if (img) gsap.fromTo(img, { yPercent: -4 }, { yPercent: 4, ease: "none", scrollTrigger: { trigger: fig, start: "top bottom", end: "bottom top", scrub: true } });
  });
  $$(".h-row-copy").forEach(c => {
    gsap.from(c.children, { y: 26, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.06, scrollTrigger: { trigger: c, start: "top 82%", once: true } });
  });

  /* ---- Étapes : la ligne froid/chaud se trace ---- */
  const line = $(".h-steps-line i");
  if (line) gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: ".h-steps .steps", start: "top 88%", end: "bottom 62%", scrub: true } });

  /* ---- Appel final ---- */
  gsap.fromTo(".h-final-media img", { yPercent: -12 }, { yPercent: 0, ease: "none", scrollTrigger: { trigger: ".h-final", start: "top bottom", end: "bottom bottom", scrub: true } });

  /* ---- Three.js, chargé seulement quand on en a besoin ---- */
  let threeP = null;
  const loadThree = () => threeP || (threeP = import("./vendor/three.module.min.js").catch(() => null));

  const VERT = "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
  const NOISE = `
    float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*vn(p);p*=2.03;a*=.5;}return v;}
    vec2 cover(vec2 uv,float img,float box){vec2 s=box>img?vec2(1.,img/box):vec2(box/img,1.);return (uv-.5)*s+.5;}`;

  /* ---- Puissances : section épinglée, la pièce change avec le prix ---- */
  const scale = $(".h-scale");
  const items = scale ? $$(".h-scale-list li", scale) : [];
  const mm = gsap.matchMedia();
  if (scale && items.length) mm.add("(min-width: 1000px) and (min-height: 620px)", () => {
    const stage = $(".h-scale-stage", scale);
    const bars = $(".h-scale-progress", scale);
    scale.classList.add("is-pinned");
    stage.innerHTML = "";
    const imgs = items.map((li, i) => {
      const src = $("img", li).getAttribute("src");
      const im = document.createElement("img");
      im.src = src; im.alt = ""; im.decoding = "async";
      if (i === 0) im.classList.add("is-on");
      stage.appendChild(im);
      return im;
    });
    bars.innerHTML = items.map(() => "<i><b></b></i>").join("");
    const fills = $$("b", bars);
    let idx = -1, gl = null;

    function setIdx(i) {
      if (i === idx) return;
      const prev = idx;
      idx = i;
      items.forEach((li, k) => li.classList.toggle("is-on", k === i));
      imgs.forEach((im, k) => im.classList.toggle("is-on", k === i));
      if (gl) gl.show(prev, i);
    }
    setIdx(0);

    const st = ScrollTrigger.create({
      trigger: scale, start: "top top", end: () => "+=" + window.innerHeight * (items.length * 0.85),
      pin: ".h-scale-pin", scrub: true, anticipatePin: 1,
      onUpdate: self => {
        const p = self.progress * items.length;
        setIdx(Math.min(items.length - 1, Math.floor(p)));
        fills.forEach((f, k) => { f.style.transform = "scaleX(" + Math.max(0, Math.min(1, p - k)) + ")"; });
      }
    });

    let alive = true;
    ScrollTrigger.create({
      trigger: scale, start: "top bottom+=60%", once: true,
      onEnter: () => loadThree().then(THREE => { if (THREE && alive) gl = makeStage(THREE, stage, imgs, () => idx); })
    });

    return () => {
      alive = false;
      st.kill();
      if (gl) gl.destroy();
      scale.classList.remove("is-pinned");
      items.forEach(li => li.classList.remove("is-on"));
      stage.innerHTML = ""; bars.innerHTML = "";
    };
  });

  function makeStage(THREE, stage, imgs, getIdx) {
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" }); }
    catch (e) { return null; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    const canvas = renderer.domElement;
    const scene = new THREE.Scene(), cam = new THREE.Camera();
    const loader = new THREE.TextureLoader();
    const blank = new THREE.DataTexture(new Uint8Array([19, 33, 46, 255]), 1, 1); blank.needsUpdate = true;
    const tex = imgs.map(() => null), asp = imgs.map(() => 1);
    const U = {
      tA: { value: blank }, tB: { value: blank }, rA: { value: 1 }, rB: { value: 1 },
      box: { value: 1 }, p: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: VERT,
      fragmentShader: `precision highp float;varying vec2 vUv;uniform sampler2D tA,tB;uniform float rA,rB,box,p;${NOISE}
        void main(){
          float n=fbm(vUv*2.6+vec2(0.,p*.6));
          float t=smoothstep(n-.22,n+.22,p*1.45-.22);
          vec2 d=vec2(n-.5,(n-.5)*.6);
          vec4 a=texture2D(tA,cover(vUv+d*.16*t,rA,box));
          vec4 b=texture2D(tB,cover(vUv-d*.16*(1.-t),rB,box));
          gl_FragColor=mix(a,b,t);
        }`
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    stage.appendChild(canvas);

    const render = () => renderer.render(scene, cam);
    function size() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      U.box.value = w / h;
      render();
    }
    const ro = new ResizeObserver(size); ro.observe(stage);

    function load(i) {
      return new Promise(res => {
        if (tex[i]) return res(tex[i]);
        loader.load(imgs[i].currentSrc || imgs[i].src, t => {
          t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
          tex[i] = t; asp[i] = t.image.width / t.image.height; res(t);
        }, undefined, () => res(null));
      });
    }
    let tween = null;
    function show(from, to) {
      Promise.all([load(from < 0 ? to : from), load(to)]).then(([a, b]) => {
        if (!b || getIdx() !== to) return;
        if (tween) tween.kill();
        U.tA.value = a || b; U.rA.value = asp[from < 0 ? to : from];
        U.tB.value = b; U.rB.value = asp[to];
        U.p.value = 0;
        tween = gsap.to(U.p, { value: 1, duration: 1.15, ease: "power2.inOut", onUpdate: render });
      });
    }
    load(getIdx()).then(t => {
      if (!t) return;
      U.tA.value = U.tB.value = t; U.rA.value = U.rB.value = asp[getIdx()]; U.p.value = 1;
      size();
    });
    return {
      show,
      destroy() { ro.disconnect(); if (tween) tween.kill(); renderer.dispose(); tex.forEach(t => t && t.dispose()); canvas.remove(); }
    };
  }

  /* ---- Chantiers : légère ondulation de la photo au survol ---- */
  const figs = $$(".h-gallery figure");
  if (finePointer && figs.length) {
    const gal = $(".h-gallery");
    ScrollTrigger.create({ trigger: gal, start: "top bottom+=40%", once: true, onEnter: () => loadThree().then(THREE => THREE && makeRipple(THREE, figs)) });
  }

  function makeRipple(THREE, figs) {
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); } catch (e) { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const canvas = renderer.domElement;
    const scene = new THREE.Scene(), cam = new THREE.Camera();
    const loader = new THREE.TextureLoader();
    const cache = new Map();
    const U = { t: { value: null }, r: { value: 1 }, box: { value: 1 }, m: { value: new THREE.Vector2(.5, .5) }, h: { value: 0 }, time: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: VERT, transparent: true,
      fragmentShader: `precision highp float;varying vec2 vUv;uniform sampler2D t;uniform float r,box,h,time;uniform vec2 m;${NOISE}
        void main(){
          vec2 uv=vUv;
          vec2 q=(uv-m)*vec2(box,1.);
          float d=length(q);
          float w=exp(-d*5.5)*h;
          float n=fbm(uv*3.+time*.15)-.5;
          uv+=normalize(q+1e-4)*sin(d*26.-time*3.)*.012*w+n*.018*h;
          uv=(uv-.5)*(1.-.035*h)+.5;
          vec2 c=cover(uv,r,box);
          vec2 s=vec2(.0035*h*w,0.);
          gl_FragColor=vec4(texture2D(t,c+s).r,texture2D(t,c).g,texture2D(t,c-s).b,1.);
        }`
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    let active = null, raf = 0, last = 0, hTween = null;
    const loop = now => {
      U.time.value += Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    function texFor(img) {
      const src = img.currentSrc || img.src;
      if (cache.has(src)) return Promise.resolve(cache.get(src));
      return new Promise(res => loader.load(src, t => { t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; cache.set(src, t); res(t); }, undefined, () => res(null)));
    }
    figs.forEach(fig => {
      const img = $("img", fig);
      fig.addEventListener("pointerenter", () => {
        active = fig;
        texFor(img).then(t => {
          if (!t || active !== fig) return;
          const w = fig.clientWidth, hh = fig.clientHeight;
          renderer.setSize(w, hh, false);
          U.t.value = t; U.r.value = t.image.width / t.image.height; U.box.value = w / hh;
          fig.insertBefore(canvas, img.nextSibling);
          fig.classList.add("gl-on");
          if (hTween) hTween.kill();
          hTween = gsap.to(U.h, { value: 1, duration: 0.6, ease: "expo.out" });
          if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
        });
      });
      fig.addEventListener("pointermove", e => {
        if (active !== fig) return;
        const b = fig.getBoundingClientRect();
        gsap.to(U.m.value, { x: (e.clientX - b.left) / b.width, y: 1 - (e.clientY - b.top) / b.height, duration: 0.5, ease: "power3.out" });
      });
      fig.addEventListener("pointerleave", () => {
        if (active !== fig) return;
        if (hTween) hTween.kill();
        hTween = gsap.to(U.h, { value: 0, duration: 0.45, ease: "power2.out", onComplete: () => {
          if (active !== fig) return;
          fig.classList.remove("gl-on"); active = null;
          cancelAnimationFrame(raf); raf = 0;
        } });
      });
    });
  }

  /* ---- Recalculer les positions quand la page change de hauteur (avis, devis) ---- */
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 200); }).observe(document.body);
  addEventListener("load", () => ScrollTrigger.refresh());
})();
