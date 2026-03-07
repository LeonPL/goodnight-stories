/* ============================================================
   Good Stories in Full Length — main script
   Plain JS, no bundler. All CDN deps loaded before this file.
   ============================================================ */

/* Note 1: This file uses the IIFE pattern (Immediately Invoked Function Expression)
   throughout. An IIFE looks like (function() { ... })() and creates a private
   scope so variables inside do not leak into the global window object. This
   prevents naming collisions between unrelated sections of the page. */

/* ----------------------------------------------------------
   1. THREE.JS STARFIELD
   ---------------------------------------------------------- */
/* Note 2: Three.js is a WebGL abstraction library. Raw WebGL requires hundreds
   of lines of boilerplate; Three.js wraps it into Scene, Camera, Renderer and
   Geometry objects so you can focus on the visual result instead. The library
   is loaded via CDN before this script, which is why we guard with the
   typeof check on the next line. */
(function initStarfield() {
  /* Note 3: Defensive guard — if the CDN script failed to load (network error,
     ad blocker, etc.) THREE will be undefined. Returning early instead of
     throwing keeps the rest of the page functional. */
  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('starfield');
  if (!canvas) return;

  /* Note 4: WebGLRenderer draws into the <canvas> element. antialias: false
     saves GPU memory because multi-sample anti-aliasing is expensive at full
     viewport size. alpha: true makes the canvas background transparent so
     the CSS gradient behind it shows through. */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
  /* Note 5: devicePixelRatio is 2 on Retina / HiDPI screens and 1 on standard
     displays. Capping at 2 prevents 3x+ Retina phones from rendering 9x the
     pixels unnecessarily, keeping frame rates high. */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  /* Note 6: The Three.js rendering pipeline always needs three things:
     - Scene: the container that holds all 3D objects
     - Camera: defines the viewpoint and projection
     - Renderer: converts the scene+camera into pixels on the canvas */
  var scene = new THREE.Scene();
  /* Note 7: PerspectiveCamera(fov, aspect, near, far). fov=60 is a natural
     field of view. near/far define the frustum — objects outside this range
     are clipped. A wide near/far range (0.1 to 2000) avoids clipping stars
     at any distance. */
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 800;

  /* Build star geometry */
  /* Note 8: Float32Array is a typed array — it stores raw 32-bit floats
     instead of JS objects. GPU buffers require typed arrays; they cannot
     accept regular JS arrays. Each star needs 3 floats for XYZ, hence
     STAR_COUNT * 3. */
  var STAR_COUNT = 1800;
  var positions = new Float32Array(STAR_COUNT * 3);
  var sizes     = new Float32Array(STAR_COUNT);
  var randoms   = new Float32Array(STAR_COUNT);

  for (var i = 0; i < STAR_COUNT; i++) {
    /* Note 9: (Math.random() - 0.5) produces values in [-0.5, +0.5].
       Multiplying by 2200 spreads stars across a 2200-unit cube centered
       at the origin. The Z range is narrower (1600) to keep most stars
       in front of the camera. */
    positions[i * 3]     = (Math.random() - 0.5) * 2200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1600;
    sizes[i]   = Math.random() * 2.8 + 0.4;
    /* Note 10: aRandom stores a random phase offset per star (0 to 2*PI).
       This desynchronizes the twinkle animation so all stars do not pulse
       in unison, which would look unnatural. */
    randoms[i] = Math.random() * Math.PI * 2;
  }

  /* Note 11: BufferGeometry stores geometry data directly in GPU-friendly
     typed buffers. setAttribute uploads each typed array as a named vertex
     attribute accessible inside the GLSL shaders below. */
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aRandom',  new THREE.BufferAttribute(randoms, 1));

  /* Note 12: ShaderMaterial lets you write custom GLSL shaders instead of
     using Three.js built-in materials. Uniforms are values sent from
     JavaScript to the GPU every frame; they are the same for every vertex.
     Attributes (like aSize, aRandom) differ per vertex and come from the
     BufferGeometry attributes set above. */
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
      /* Note 13: modelViewMatrix transforms the vertex from object space into
         camera space (view space). projectionMatrix then maps it to clip space
         (the 2D screen). Multiplying position by both in sequence is the standard
         MVP (Model-View-Projection) transform used in all 3D rendering. */
      '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
      /* Note 14: sin() oscillates between -1 and +1. Scaling by 0.38 and
         offsetting by 0.62 maps it to [0.24, 1.0] — a range that makes stars
         dimmer but never invisible. aRandom shifts the phase per star (see Note 10). */
      '  float twinkle = sin(uTime * 1.4 + aRandom * 6.2831) * 0.38 + 0.62;',
      /* Note 15: gl_PointSize controls how many pixels wide a point sprite is.
         Dividing by -mvPos.z creates perspective: distant stars (large negative Z)
         get smaller point sizes, mimicking how real objects appear smaller far away. */
      '  gl_PointSize = aSize * uPixelRatio * twinkle * (550.0 / -mvPos.z);',
      '  gl_Position = projectionMatrix * mvPos;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'void main() {',
      /* Note 16: gl_PointCoord is a vec2 in [0,1] representing the position
         within the point sprite quad. vec2(0.5) is the center. Computing the
         distance from center lets us draw a circle by discarding fragments
         outside radius 0.5. */
      '  float d = distance(gl_PointCoord, vec2(0.5));',
      '  if (d > 0.5) discard;',
      /* Note 17: smoothstep(edge0, edge1, x) returns 0 when x <= edge0 and
         1 when x >= edge1, with a smooth S-curve between. Here it fades
         alpha from 1 at the center to 0 at the edge, creating a soft glow. */
      '  float alpha = smoothstep(0.5, 0.05, d);',
      '  gl_FragColor = vec4(0.96, 0.91, 0.76, alpha);',
      '}',
    ].join('\n'),
    transparent: true,
    /* Note 18: depthWrite: false prevents stars from writing to the depth
       buffer. Without this, foreground stars would occlude background stars
       despite both being transparent point sprites. AdditiveBlending adds
       color values together so overlapping stars look brighter, not opaque. */
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  var stars = new THREE.Points(geometry, material);
  scene.add(stars);

  /* Animation loop */
  var animId = null;
  /* Note 19: window.matchMedia reads CSS media query values from JS.
     prefers-reduced-motion is set by the OS accessibility setting. Respecting
     it is important for users with vestibular disorders who can experience
     nausea from animated backgrounds. */
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Note 20: requestAnimationFrame (rAF) calls the callback before the next
     browser repaint, typically 60 times per second. The parameter t is a
     DOMHighResTimeStamp in milliseconds since page load. Storing the returned
     ID in animId allows cancellation later. */
  function animate(t) {
    animId = requestAnimationFrame(animate);
    /* Note 21: Multiplying t by 0.001 converts milliseconds to seconds, giving
       a slowly increasing float that drives the twinkle sine wave (Note 14). */
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

  /* Note 22: IntersectionObserver fires a callback whenever a watched element
     enters or leaves the viewport. Pausing the rAF loop when the hero section
     is off-screen saves CPU and GPU while the user reads other sections. */
  /* Pause RAF when hero scrolls off-screen (battery saving) */
  var heroEl = document.getElementById('hero');
  if (heroEl && typeof IntersectionObserver !== 'undefined') {
    var heroObs = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        if (!animId && !reducedMotion) animate(performance.now());
      } else {
        /* Note 23: cancelAnimationFrame stops the loop. Setting animId to null
           lets the isIntersecting branch above safely restart it later. */
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
/* Note 24: The scroll event fires many times per second. Doing DOM work
   (classList.toggle) directly inside a scroll handler causes layout thrashing.
   The "ticking" flag and rAF pattern batches updates to once per animation
   frame, which is the recommended performance pattern for scroll-driven UI. */
(function initNav() {
  var nav = document.getElementById('nav');
  if (!nav) return;

  var ticking = false;

  /* Note 25: { passive: true } tells the browser this listener will never
     call event.preventDefault(). The browser can then scroll immediately
     without waiting for the JS callback to finish, resulting in smoother
     scrolling on mobile. */
  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(function() {
        /* Note 26: classList.toggle(name, force) adds the class when force is
           true and removes it when false. This is more concise than separate
           add/remove calls and avoids flickering from redundant operations. */
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


/* ----------------------------------------------------------
   5. AUTH STATE — check /api/auth/me on page load
   ---------------------------------------------------------- */
/* Note 27: This section implements a "stateless" auth check. The server does
   not store sessions in a database; instead it issues a signed JWT stored in
   an httpOnly cookie. On every page load, we ask the server to validate that
   cookie and return the user's profile. This is the modern alternative to
   server-side session stores. */
(function initAuth() {
  var authPanel   = document.getElementById('auth-panel');
  var uploadPanel = document.getElementById('upload-panel');
  var navUser     = document.getElementById('nav-user');
  var navSignin   = document.getElementById('nav-signin');
  var navAvatar   = document.getElementById('nav-avatar');
  var navName     = document.getElementById('nav-name');
  var navLogout   = document.getElementById('nav-logout');
  var uploadWelcome = document.getElementById('upload-welcome');

  function showLoggedIn(user) {
    if (authPanel)   authPanel.style.display   = 'none';
    if (uploadPanel) uploadPanel.style.display  = '';
    if (navUser)     navUser.style.display      = 'flex';
    if (navSignin)   navSignin.style.display    = 'none';
    if (navAvatar && user.avatar) {
      navAvatar.src = user.avatar;
      navAvatar.alt = user.name || '';
    }
    if (navName)     navName.textContent = user.name || user.email || '';
    if (uploadWelcome) uploadWelcome.textContent = 'Welcome back, ' + (user.name || user.email) + '!';
  }

  function showLoggedOut() {
    if (authPanel)   authPanel.style.display   = '';
    if (uploadPanel) uploadPanel.style.display  = 'none';
    if (navUser)     navUser.style.display      = 'none';
    if (navSignin)   navSignin.style.display    = '';
  }

  /* Note 28: credentials: 'same-origin' instructs fetch to include cookies
     when the request goes to the same domain. Without this option, browsers
     omit cookies from fetch requests for security reasons. The backend reads
     the auth_token cookie to verify the JWT and return the user object. */
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(user) { user ? showLoggedIn(user) : showLoggedOut(); })
    /* Note 29: The .catch ensures the page does not break if the network is
       down or the API is unreachable. Failing gracefully to showLoggedOut()
       is safer than showing a broken half-logged-in state. */
    .catch(function() { showLoggedOut(); });

  if (navLogout) {
    navLogout.addEventListener('click', function() {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        .then(function() { showLoggedOut(); })
        .catch(function() { showLoggedOut(); });
    });
  }

  /* Check for auth_error query param (set by callback on failure) */
  var params = new URLSearchParams(window.location.search);
  var authError = params.get('auth_error');
  if (authError) {
    var errEl = document.getElementById('upload-error');
    if (errEl) {
      errEl.textContent = 'Sign-in failed: ' + authError.replace(/_/g, ' ');
      errEl.style.display = '';
    }
    /* Clean up URL without reload */
    history.replaceState(null, '', window.location.pathname);
  }
})();


/* ----------------------------------------------------------
   6. VIDEO UPLOAD — chunked streaming to TikTok via backend
   ---------------------------------------------------------- */
/* Note 30: Large file uploads are split into chunks so that:
   1. No single HTTP request exceeds server body size limits (64 MB here).
   2. Progress can be tracked and shown to the user per chunk.
   3. If a single chunk fails, only that chunk needs to be retried.
   The backend receives each chunk and immediately pipes it to TikTok,
   so no video data is ever stored on disk. */
(function initUpload() {
  var form        = document.getElementById('upload-form');
  var fileInput   = document.getElementById('video-file');
  var dropZone    = document.getElementById('drop-zone');
  var fileLabel   = document.getElementById('file-selected');
  var progressWrap = document.getElementById('upload-progress-wrap');
  var progressFill = document.getElementById('upload-progress-fill');
  var progressLabel = document.getElementById('upload-progress-label');
  var errorEl     = document.getElementById('upload-error');
  var successEl   = document.getElementById('upload-success');
  var submitBtn   = document.getElementById('upload-btn');

  if (!form) return;

  var CHUNK_SIZE = 10 * 1024 * 1024; /* 10 MB per chunk */
  var selectedFile = null;

  function showError(msg) {
    if (errorEl)   { errorEl.textContent = msg; errorEl.style.display = ''; }
    if (successEl) { successEl.style.display = 'none'; }
  }

  function showSuccess(msg) {
    if (successEl) { successEl.textContent = msg; successEl.style.display = ''; }
    if (errorEl)   { errorEl.style.display = 'none'; }
  }

  function setProgress(pct, label) {
    if (progressWrap) progressWrap.style.display = '';
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressLabel) progressLabel.textContent = label;
  }

  function resetProgress() {
    if (progressWrap) progressWrap.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
  }

  /* Show filename when file is chosen */
  function onFileChosen(file) {
    if (!file) return;
    selectedFile = file;
    if (fileLabel) {
      fileLabel.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)';
      fileLabel.style.display = '';
    }
  }

  if (fileInput) {
    fileInput.addEventListener('change', function() {
      onFileChosen(fileInput.files[0] || null);
    });
  }

  /* Drag-and-drop support */
  if (dropZone) {
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.classList.add('drop-zone--over');
    });
    dropZone.addEventListener('dragleave', function() {
      dropZone.classList.remove('drop-zone--over');
    });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drop-zone--over');
      var file = e.dataTransfer.files[0];
      if (file) {
        if (fileInput) fileInput.files = e.dataTransfer.files;
        onFileChosen(file);
      }
    });
  }

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (errorEl)   errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';

    var title = (document.getElementById('story-title') || {}).value || '';
    var desc  = (document.getElementById('story-desc')  || {}).value || '';

    if (!title.trim()) { showError('Please add a story title.'); return; }
    if (!selectedFile)  { showError('Please select a video file.'); return; }

    if (submitBtn) submitBtn.disabled = true;
    resetProgress();

    try {
      /* Note 31: The upload is a two-phase protocol:
         Phase 1 (init) — tell TikTok how large the video is and get back a
         session URL and recommended chunk size.
         Phase 2 (chunks) — send binary chunks to that session URL. */
      /* Step 1: Init upload session */
      setProgress(2, 'Preparing upload…');
      var initRes = await fetch('/api/tiktok/init', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: desc.trim(), fileSizeBytes: selectedFile.size }),
      });
      var initData = await initRes.json();
      if (!initRes.ok || initData.error) {
        throw new Error(initData.error || 'Failed to start upload session.');
      }

      var uploadUrl   = initData.uploadUrl;
      var chunkSize   = initData.chunkSize  || CHUNK_SIZE;
      var totalChunks = initData.totalChunks;

      /* Step 2: Read and send each chunk */
      for (var i = 0; i < totalChunks; i++) {
        var start  = i * chunkSize;
        var end    = Math.min(start + chunkSize, selectedFile.size);
        /* Note 32: File.slice(start, end) returns a Blob — a reference to
           a portion of the file without loading the entire file into memory.
           blob.arrayBuffer() then loads only those bytes into RAM, keeping
           memory usage proportional to chunk size (10 MB), not file size. */
        var blob   = selectedFile.slice(start, end);
        var buffer = await blob.arrayBuffer();

        /* Note 33: JSON cannot carry binary data directly. Converting to base64
           (btoa) encodes binary as ASCII-safe text at the cost of ~33% size
           overhead. An alternative is FormData with a Blob, but base64 in JSON
           works reliably across all Vercel function configurations. */
        /* Convert ArrayBuffer to base64 for JSON transport */
        var bytes  = new Uint8Array(buffer);
        var binary = '';
        bytes.forEach(function(b) { binary += String.fromCharCode(b); });
        var b64 = btoa(binary);

        var pct = Math.round(((i + 1) / totalChunks) * 95);
        setProgress(pct, 'Uploading chunk ' + (i + 1) + ' of ' + totalChunks + '…');

        var chunkRes = await fetch('/api/tiktok/chunk', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadUrl:   uploadUrl,
            chunkIndex:  i,
            totalChunks: totalChunks,
            fileSizeBytes: selectedFile.size,
            chunkData:   b64,
          }),
        });
        var chunkData = await chunkRes.json();
        if (!chunkRes.ok || chunkData.error) {
          throw new Error(chunkData.error || 'Chunk ' + (i + 1) + ' upload failed.');
        }
      }

      setProgress(100, 'Published!');
      showSuccess('Your story was published to TikTok successfully!');
      form.reset();
      selectedFile = null;
      if (fileLabel) fileLabel.style.display = 'none';

    } catch (err) {
      resetProgress();
      showError(err.message || 'Upload failed. Please try again.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();
