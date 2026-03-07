/* ============================================================
   Good Stories in Full Length — main script
   Plain JS, no bundler. All CDN deps loaded before this file.
   ============================================================ */

/* ----------------------------------------------------------
   1. THREE.JS STARFIELD
   ---------------------------------------------------------- */
(function initStarfield() {
  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('starfield');
  if (!canvas) return;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 800;

  /* Build star geometry */
  var STAR_COUNT = 1800;
  var positions = new Float32Array(STAR_COUNT * 3);
  var sizes     = new Float32Array(STAR_COUNT);
  var randoms   = new Float32Array(STAR_COUNT);

  for (var i = 0; i < STAR_COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 2200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1600;
    sizes[i]   = Math.random() * 2.8 + 0.4;
    randoms[i] = Math.random() * Math.PI * 2;
  }

  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aRandom',  new THREE.BufferAttribute(randoms, 1));

  /* Shader: soft circular glowing points with per-star twinkle */
  var material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: [
      'attribute float aSize;',
      'attribute float aRandom;',
      'uniform float uTime;',
      'uniform float uPixelRatio;',
      'void main() {',
      '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
      '  float twinkle = sin(uTime * 1.4 + aRandom * 6.2831) * 0.38 + 0.62;',
      '  gl_PointSize = aSize * uPixelRatio * twinkle * (550.0 / -mvPos.z);',
      '  gl_Position = projectionMatrix * mvPos;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'void main() {',
      '  float d = distance(gl_PointCoord, vec2(0.5));',
      '  if (d > 0.5) discard;',
      '  float alpha = smoothstep(0.5, 0.05, d);',
      '  gl_FragColor = vec4(0.96, 0.91, 0.76, alpha);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  var stars = new THREE.Points(geometry, material);
  scene.add(stars);

  /* Animation loop */
  var animId = null;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(t) {
    animId = requestAnimationFrame(animate);
    material.uniforms.uTime.value = t * 0.001;
    stars.rotation.y = t * 0.000045;
    stars.rotation.x = t * 0.000018;
    renderer.render(scene, camera);
  }

  if (reducedMotion) {
    /* Single static frame for users who prefer no motion */
    renderer.render(scene, camera);
  } else {
    animate(0);
  }

  /* Pause RAF when hero scrolls off-screen (battery saving) */
  var heroEl = document.getElementById('hero');
  if (heroEl && typeof IntersectionObserver !== 'undefined') {
    var heroObs = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        if (!animId && !reducedMotion) animate(performance.now());
      } else {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
      }
    }, { threshold: 0 });
    heroObs.observe(heroEl);
  }

  /* Resize */
  window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  });
})();


/* ----------------------------------------------------------
   2. NAV SCROLL STATE
   ---------------------------------------------------------- */
(function initNav() {
  var nav = document.getElementById('nav');
  if (!nav) return;

  var ticking = false;

  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(function() {
        nav.classList.toggle('nav--scrolled', window.scrollY > 40);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();


/* ----------------------------------------------------------
   3. SCROLL REVEAL
   ---------------------------------------------------------- */
(function initReveal() {
  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length || typeof IntersectionObserver === 'undefined') {
    /* Fallback: show everything immediately */
    els.forEach(function(el) { el.classList.add('is-visible'); });
    return;
  }

  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      var delay = parseInt(entry.target.dataset.delay || '0', 10);
      setTimeout(function() {
        entry.target.classList.add('is-visible');
      }, delay);
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  els.forEach(function(el) { obs.observe(el); });
})();


/* ----------------------------------------------------------
   4. SMOOTH SCROLL FOR ANCHOR LINKS
   ---------------------------------------------------------- */
document.querySelectorAll('a[href^="#"]').forEach(function(link) {
  link.addEventListener('click', function(e) {
    var href = link.getAttribute('href');
    if (href === '#') return;
    var target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
