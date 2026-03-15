/**
 * The Pitch Visualizer — Frontend JS
 * Calls /generate, then renders panels with lazy-loading images.
 */

const btnGenerate = document.getElementById('btn-generate');
const narrativeEl = document.getElementById('narrative');
const styleEl     = document.getElementById('style');
const statusArea  = document.getElementById('status-area');
const storyboardEl = document.getElementById('storyboard');

/* ── Status helpers ──────────────────────────────────────────────────────── */
function showStatus(msg, loading = true) {
  if (!msg) { statusArea.innerHTML = ''; return; }
  const spinner = loading ? '<div class="spinner"></div>' : '';
  statusArea.innerHTML = `<div class="status-bar">${spinner}${msg}</div>`;
}

function showError(msg) {
  statusArea.innerHTML = `<div class="error-bar">${msg}</div>`;
}

/* ── Panel builder ───────────────────────────────────────────────────────── */
function buildPanel(scene, index, total, style) {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.animationDelay = `${index * 0.12}s`;

  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-number">SCENE ${String(index + 1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span>
      <span class="panel-style-tag">${style.replace(/_/g,' ').toUpperCase()}</span>
    </div>
    <div class="panel-img-wrap">
      <div class="img-loading-overlay" id="overlay-${index}">
        <div class="big-spinner"></div>
        <span>RENDERING IMAGE...</span>
      </div>
      <img id="img-${index}" src="" alt="Scene ${index+1}" style="opacity:0;" />
    </div>
    <div class="panel-body">
      <p class="caption-label">Caption</p>
      <p class="caption-text">${escapeHtml(scene.caption)}</p>
      <button class="toggle-prompt" onclick="togglePrompt(${index})">▸ View engineered prompt</button>
      <div class="prompt-section" id="prompt-${index}" style="display:none;">
        <p class="prompt-label">AI-Engineered Prompt</p>
        <p class="prompt-text">${escapeHtml(scene.prompt)}</p>
      </div>
    </div>
  `;
  return panel;
}

/* ── Prompt toggle ───────────────────────────────────────────────────────── */
function togglePrompt(i) {
  const sec = document.getElementById(`prompt-${i}`);
  const btn = sec.previousElementSibling;
  const open = sec.style.display === 'none';
  sec.style.display = open ? 'block' : 'none';
  btn.textContent   = open ? '▾ Hide engineered prompt' : '▸ View engineered prompt';
}

/* ── Image loader ────────────────────────────────────────────────────────── */
function loadPanelImage(imgEl, overlayEl, url) {
  return new Promise(resolve => {
    const temp = new Image();
    temp.onload = () => {
      imgEl.src = url;
      imgEl.style.opacity = '1';
      overlayEl.style.display = 'none';
      resolve(true);
    };
    temp.onerror = () => {
      overlayEl.innerHTML = '<span style="color:#7a4040;font-family:monospace;font-size:11px;letter-spacing:0.1em;">IMAGE UNAVAILABLE</span>';
      resolve(false);
    };
    temp.src = url;
  });
}

/* ── Utility ─────────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Main generate handler ───────────────────────────────────────────────── */
btnGenerate.addEventListener('click', async () => {
  const text  = narrativeEl.value.trim();
  const style = styleEl.value;

  if (!text || text.length < 20) {
    showError('Please enter at least a sentence or two of narrative text.');
    return;
  }

  btnGenerate.disabled = true;
  storyboardEl.innerHTML = '';
  showStatus('Segmenting narrative & engineering visual prompts via Claude...');

  let data;
  try {
    const res = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, style }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
  } catch (err) {
    showError('Generation failed: ' + err.message);
    btnGenerate.disabled = false;
    return;
  }

  const scenes = data.scenes || [];
  if (!scenes.length) {
    showError('No scenes extracted. Please try a longer narrative (3–6 sentences).');
    btnGenerate.disabled = false;
    return;
  }

  showStatus(`Building ${scenes.length}-panel storyboard — images loading...`);

  /* Render panels immediately, load images in parallel */
  scenes.forEach((scene, i) => {
    const panel = buildPanel(scene, i, scenes.length, style);
    storyboardEl.appendChild(panel);
  });

  const imageLoads = scenes.map((scene, i) =>
    loadPanelImage(
      document.getElementById(`img-${i}`),
      document.getElementById(`overlay-${i}`),
      scene.image_url,
    )
  );

  await Promise.all(imageLoads);

  showStatus(`Storyboard complete — ${scenes.length} scenes rendered.`, false);
  setTimeout(() => showStatus(''), 3500);
  btnGenerate.disabled = false;
});

/* Expose toggle globally (called from inline onclick) */
window.togglePrompt = togglePrompt;
