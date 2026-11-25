/**
 * ZIRO CYBERPUNK EXPLORER LOGIC
 * High-performance file browser with animated laser border and radar HUD
 */

// DOM Elements
const cyberWindowContainer = document.getElementById('cyberWindowContainer');
const laserBorderCanvas = document.getElementById('laserBorderCanvas');
const miniRadarCanvas = document.getElementById('miniRadarCanvas');
const filesGrid = document.getElementById('filesGrid');
const emptyFolderBox = document.getElementById('emptyFolderBox');
const loadingOverlay = document.getElementById('loadingOverlay');
const breadcrumbSegments = document.getElementById('breadcrumbSegments');
const inputSearchFiles = document.getElementById('inputSearchFiles');
const footerItemCount = document.getElementById('footerItemCount');
const footerSelectionInfo = document.getElementById('footerSelectionInfo');
const sidebarDrivesList = document.getElementById('sidebarDrivesList');

// Buttons
const btnWinMinimize = document.getElementById('btnWinMinimize');
const btnWinMaximize = document.getElementById('btnWinMaximize');
const btnWinClose = document.getElementById('btnWinClose');
const btnNavBack = document.getElementById('btnNavBack');
const btnNavForward = document.getElementById('btnNavForward');
const btnNavUp = document.getElementById('btnNavUp');
const btnRefreshPath = document.getElementById('btnRefreshPath');
const btnNewFolder = document.getElementById('btnNewFolder');

// State
let currentPath = 'D:\\';
let navHistory = ['D:\\'];
let navIndex = 0;
let currentItems = [];
let selectedItem = null;

// ============================================================
// 1. Animated Laser Perimeter Border (Canvas Animation)
// ============================================================
function initLaserBorder() {
  if (!laserBorderCanvas) return;
  const ctx = laserBorderCanvas.getContext('2d');
  let laserPos = 0; // 0 to 1 around perimeter

  function resizeCanvas() {
    laserBorderCanvas.width = cyberWindowContainer.clientWidth || window.innerWidth;
    laserBorderCanvas.height = cyberWindowContainer.clientHeight || window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function getPerimeterPoint(w, h, t) {
    const totalP = 2 * (w + h);
    let dist = (t % 1) * totalP;
    if (dist < 0) dist += totalP;

    // Top edge (left to right)
    if (dist <= w) {
      return { x: dist, y: 0 };
    }
    dist -= w;
    // Right edge (top to bottom)
    if (dist <= h) {
      return { x: w, y: dist };
    }
    dist -= h;
    // Bottom edge (right to left)
    if (dist <= w) {
      return { x: w - dist, y: h };
    }
    dist -= w;
    // Left edge (bottom to top)
    return { x: 0, y: h - dist };
  }

  function renderLaser() {
    requestAnimationFrame(renderLaser);
    const w = laserBorderCanvas.width;
    const h = laserBorderCanvas.height;
    ctx.clearRect(0, 0, w, h);

    laserPos = (laserPos + 0.0022) % 1;

    // Trail points
    const trailSteps = 30;
    const trailLen = 0.12;

    for (let i = 0; i < trailSteps; i++) {
      const frac = i / trailSteps;
      const t = laserPos - (1 - frac) * trailLen;
      const pt = getPerimeterPoint(w, h, t);

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2 + frac * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 68, ${frac * 0.9})`;
      ctx.shadowColor = '#00ff44';
      ctx.shadowBlur = 12 * frac;
      ctx.fill();
    }

    // Head beam
    const head = getPerimeterPoint(w, h, laserPos);
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00ff44';
    ctx.shadowBlur = 20;
    ctx.fill();

    // Opposite secondary beam for high-tech symmetry
    const head2 = getPerimeterPoint(w, h, (laserPos + 0.5) % 1);
    ctx.beginPath();
    ctx.arc(head2.x, head2.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 16;
    ctx.fill();
  }

  renderLaser();
}

// ============================================================
// 2. Mini Holographic Radar Widget in Sidebar
// ============================================================
function initMiniRadar() {
  if (!miniRadarCanvas) return;
  const ctx = miniRadarCanvas.getContext('2d');
  const w = miniRadarCanvas.width;
  const h = miniRadarCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  let angle = 0;

  function renderRadar() {
    requestAnimationFrame(renderRadar);
    ctx.clearRect(0, 0, w, h);

    // Grid circles
    ctx.strokeStyle = 'rgba(0, 255, 68, 0.25)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy);
    ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30);
    ctx.stroke();

    // Radar Sweep Line
    angle = (angle + 0.04) % (Math.PI * 2);
    const endX = cx + Math.cos(angle) * 28;
    const endY = cy + Math.sin(angle) * 28;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00ff44';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  renderRadar();
}

// ============================================================
// 3. Futuristic SVG Folder Generator
// ============================================================
function getCyberFolderSVG(badgeChar = '📁') {
  return `
    <svg class="folder-svg" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="folderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00ff44" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#00aa2a" stop-opacity="0.85" />
        </linearGradient>
        <linearGradient id="tabGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00ff44" stop-opacity="1" />
          <stop offset="100%" stop-color="#00cc38" stop-opacity="0.9" />
        </linearGradient>
      </defs>
      <!-- Back Tab -->
      <path d="M8 12 C8 7, 12 4, 18 4 L42 4 C46 4, 49 7, 52 11 L58 18 L90 18 C94 18, 98 22, 98 26 L98 70 C98 75, 94 78, 90 78 L10 78 C5 78, 2 75, 2 70 L2 18 C2 14, 5 12, 8 12 Z" fill="#041209" stroke="#00ff44" stroke-width="1.8" />
      <!-- Glowing Tab Accent -->
      <path d="M14 6 L40 6 L48 16 L10 16 Z" fill="url(#tabGrad)" opacity="0.6" />
      <!-- Front Body Flap -->
      <path d="M4 24 L96 24 C98 24, 99 26, 98 28 L92 72 C91 75, 88 77, 85 77 L15 77 C12 77, 9 75, 8 72 L2 28 C1 26, 2 24, 4 24 Z" fill="url(#folderGrad)" stroke="#ffffff" stroke-width="0.8" />
      <!-- Mecha Circuit Highlights -->
      <line x1="16" y1="36" x2="84" y2="36" stroke="#04140a" stroke-width="2" stroke-linecap="round" />
      <line x1="20" y1="44" x2="80" y2="44" stroke="#04140a" stroke-width="1.5" stroke-dasharray="6,4" />
    </svg>
    <div class="folder-badge-glyph">${badgeChar}</div>
  `;
}

function getCyberFileSVG(extension = '') {
  let glyph = '📄';
  const ext = (extension || '').toLowerCase();
  if (['uproject', 'uplugin', 'umap'].includes(ext)) glyph = '🎮';
  else if (['js', 'py', 'ts', 'cpp', 'h', 'cs'].includes(ext)) glyph = '💻';
  else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) glyph = '🖼️';
  else if (['mp3', 'wav', 'ogg'].includes(ext)) glyph = '🎵';
  else if (['mp4', 'mkv', 'avi'].includes(ext)) glyph = '🎬';
  else if (['zip', 'rar', '7z'].includes(ext)) glyph = '📦';
  else if (['exe', 'bat', 'cmd'].includes(ext)) glyph = '⚡';

  return `
    <div class="folder-icon-wrap" style="filter: drop-shadow(0 0 10px rgba(0, 240, 255, 0.5));">
      <div style="font-size: 46px; line-height: 1;">${glyph}</div>
    </div>
  `;
}

// Map custom glyphs for famous folders like in user reference image
function getSpecialFolderGlyph(name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('unreal') || n.includes('ue5') || n.includes('zirohost')) return 'U';
  if (n.includes('juego') || n.includes('game')) return '🎮';
  if (n.includes('código') || n.includes('codigo') || n.includes('code') || n.includes('src')) return '&lt;/&gt;';
  if (n.includes('android') || n.includes('apk')) return '🤖';
  if (n.includes('asset') || n.includes('mesh')) return '🧊';
  if (n.includes('blender')) return '🎨';
  if (n.includes('edición') || n.includes('edit')) return '🎬';
  if (n.includes('ia') || n.includes('model') || n.includes('ai')) return '🧠';
  if (n.includes('comfy')) return '⚡';
  if (n.includes('python')) return '🐍';
  if (n.includes('herramienta') || n.includes('tool')) return '⚙️';
  if (n.includes('dependenc') || n.includes('node_modules')) return '🗄️';
  if (n.includes('repo') || n.includes('git')) return '🐙';
  if (n.includes('ziro') || n.includes('proyect')) return 'Z';
  return '📁';
}

// ============================================================
// 4. File Browsing and Directory Navigation
// ============================================================
async function loadDirectory(targetPath) {
  showLoading(true);
  try {
    let result = null;
    if (window.electronAPI && window.electronAPI.readDirectory) {
      result = await window.electronAPI.readDirectory(targetPath);
    } else {
      // Mock / fallback if standalone
      result = {
        success: true,
        path: targetPath,
        items: [
          { name: 'Unreal Projects', isDirectory: true, size: 0, ext: '' },
          { name: 'Juegos', isDirectory: true, size: 0, ext: '' },
          { name: 'Código', isDirectory: true, size: 0, ext: '' },
          { name: 'Android (APK)', isDirectory: true, size: 0, ext: '' },
          { name: 'Assets', isDirectory: true, size: 0, ext: '' },
          { name: 'Blender', isDirectory: true, size: 0, ext: '' },
          { name: 'Edición', isDirectory: true, size: 0, ext: '' },
          { name: 'IA (Modelos)', isDirectory: true, size: 0, ext: '' },
          { name: 'ComfyUI', isDirectory: true, size: 0, ext: '' },
          { name: 'Python', isDirectory: true, size: 0, ext: '' },
          { name: 'Herramientas', isDirectory: true, size: 0, ext: '' },
          { name: 'Dependencias', isDirectory: true, size: 0, ext: '' },
          { name: 'Repos (Git)', isDirectory: true, size: 0, ext: '' },
          { name: 'Ziro Work', isDirectory: true, size: 0, ext: '' }
        ]
      };
    }

    if (result && result.success) {
      currentPath = result.path || targetPath;
      currentItems = result.items || [];
      renderBreadcrumbs(currentPath);
      renderItems(currentItems);
      updateNavButtons();
    } else {
      alert(`No se pudo acceder a la ruta: ${result?.error || 'Error desconocido'}`);
    }
  } catch (err) {
    console.error('Error cargando directorio:', err);
  } finally {
    showLoading(false);
  }
}

function renderBreadcrumbs(fullPath) {
  if (!breadcrumbSegments) return;
  breadcrumbSegments.innerHTML = '';

  const rootSeg = document.createElement('span');
  rootSeg.className = 'bc-seg';
  rootSeg.textContent = 'Este equipo';
  rootSeg.addEventListener('click', () => navigateTo('ROOT'));
  breadcrumbSegments.appendChild(rootSeg);

  if (fullPath === 'ROOT') return;

  const normalized = fullPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  let accumulated = '';
  parts.forEach((part, index) => {
    const sep = document.createElement('span');
    sep.className = 'bc-sep';
    sep.textContent = '›';
    breadcrumbSegments.appendChild(sep);

    if (index === 0 && fullPath.includes(':')) {
      accumulated = part + '\\';
    } else {
      accumulated += (accumulated.endsWith('\\') ? '' : '\\') + part;
    }

    const seg = document.createElement('span');
    seg.className = 'bc-seg';
    seg.textContent = part.includes(':') ? `SSD (${part})` : part;
    const clickTarget = accumulated;
    seg.addEventListener('click', () => navigateTo(clickTarget));
    breadcrumbSegments.appendChild(seg);
  });
}

function renderItems(items) {
  if (!filesGrid) return;
  filesGrid.innerHTML = '';
  selectedItem = null;
  updateFooter();

  if (!items || items.length === 0) {
    if (emptyFolderBox) emptyFolderBox.style.display = 'flex';
    return;
  }
  if (emptyFolderBox) emptyFolderBox.style.display = 'none';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.title = `${item.name}${item.size ? ' (' + formatSize(item.size) + ')' : ''}`;

    if (item.isDirectory) {
      const glyph = getSpecialFolderGlyph(item.name);
      el.innerHTML = `
        <div class="folder-icon-wrap">
          ${getCyberFolderSVG(glyph)}
        </div>
        <div class="file-name">${item.name}</div>
        <div class="file-subtag">Carpeta</div>
      `;
    } else {
      el.innerHTML = `
        ${getCyberFileSVG(item.ext)}
        <div class="file-name">${item.name}</div>
        <div class="file-subtag">${item.ext ? item.ext.toUpperCase() : 'ARCHIVO'}</div>
      `;
    }

    // Single click select
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.file-item').forEach(f => f.classList.remove('selected'));
      el.classList.add('selected');
      selectedItem = item;
      updateFooter();
    });

    // Double click open
    el.addEventListener('dblclick', () => {
      if (item.isDirectory) {
        const next = currentPath.endsWith('\\') ? currentPath + item.name : currentPath + '\\' + item.name;
        navigateTo(next);
      } else {
        if (window.electronAPI && window.electronAPI.openFile) {
          const fileToOpen = currentPath.endsWith('\\') ? currentPath + item.name : currentPath + '\\' + item.name;
          window.electronAPI.openFile(fileToOpen);
        }
      }
    });

    filesGrid.appendChild(el);
  });

  updateFooter();
}

function navigateTo(targetPath) {
  if (targetPath === currentPath) return;

  // Push to history
  navHistory = navHistory.slice(0, navIndex + 1);
  navHistory.push(targetPath);
  navIndex = navHistory.length - 1;

  loadDirectory(targetPath);
}

function updateNavButtons() {
  if (btnNavBack) btnNavBack.disabled = (navIndex <= 0);
  if (btnNavForward) btnNavForward.disabled = (navIndex >= navHistory.length - 1);
}

function updateFooter() {
  if (footerItemCount) {
    footerItemCount.textContent = `${currentItems.length} elementos`;
  }
  if (footerSelectionInfo) {
    if (selectedItem) {
      footerSelectionInfo.textContent = `Seleccionado: ${selectedItem.name} ${selectedItem.size ? '(' + formatSize(selectedItem.size) + ')' : ''}`;
    } else {
      footerSelectionInfo.textContent = `Ningún elemento seleccionado`;
    }
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function showLoading(show) {
  if (loadingOverlay) loadingOverlay.style.display = show ? 'flex' : 'none';
}

// ============================================================
// 5. Sidebar and Navigation Listeners
// ============================================================
function initListeners() {
  // Window controls
  if (btnWinMinimize) {
    btnWinMinimize.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.minimizeWindow) window.electronAPI.minimizeWindow();
    });
  }
  if (btnWinMaximize) {
    btnWinMaximize.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.maximizeWindow) window.electronAPI.maximizeWindow();
    });
  }
  if (btnWinClose) {
    btnWinClose.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.closeWindow) window.electronAPI.closeWindow();
    });
  }

  // Navigation History
  if (btnNavBack) {
    btnNavBack.addEventListener('click', () => {
      if (navIndex > 0) {
        navIndex--;
        loadDirectory(navHistory[navIndex]);
      }
    });
  }
  if (btnNavForward) {
    btnNavForward.addEventListener('click', () => {
      if (navIndex < navHistory.length - 1) {
        navIndex++;
        loadDirectory(navHistory[navIndex]);
      }
    });
  }
  if (btnNavUp) {
    btnNavUp.addEventListener('click', () => {
      if (currentPath === 'ROOT') return;
      const normalized = currentPath.replace(/\\/g, '/');
      const parts = normalized.split('/').filter(Boolean);
      if (parts.length <= 1) {
        navigateTo('ROOT');
      } else {
        parts.pop();
        const parentPath = parts.join('\\') + (parts.length === 1 && parts[0].includes(':') ? '\\' : '');
        navigateTo(parentPath);
      }
    });
  }
  if (btnRefreshPath) {
    btnRefreshPath.addEventListener('click', () => loadDirectory(currentPath));
  }

  // Search filter
  if (inputSearchFiles) {
    inputSearchFiles.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim().toLowerCase();
      if (!q) {
        renderItems(currentItems);
      } else {
        const filtered = currentItems.filter(item => item.name.toLowerCase().includes(q));
        renderItems(filtered);
      }
    });
  }

  // Sidebar shortcut links
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active', 'active-drive'));
      item.classList.add('active');
      const target = item.dataset.path;

      if (target === 'HOME' || target === 'DESKTOP') {
        if (window.electronAPI && window.electronAPI.getSpecialPath) {
          window.electronAPI.getSpecialPath(target.toLowerCase()).then(p => {
            if (p) navigateTo(p);
          });
        }
      } else if (target === 'DOWNLOADS' || target === 'DOCUMENTS' || target === 'PICTURES' || target === 'MUSIC' || target === 'VIDEOS') {
        if (window.electronAPI && window.electronAPI.getSpecialPath) {
          window.electronAPI.getSpecialPath(target.toLowerCase()).then(p => {
            if (p) navigateTo(p);
          });
        }
      } else if (target === 'UNREAL') {
        navigateTo('D:\\legolas-ai-v1.0\\ZiroHost');
      } else if (target === 'COMFY') {
        navigateTo('D:\\ComfyUI');
      } else if (target) {
        navigateTo(target);
      }
    });
  });

  // Click outside files deselects
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.file-item')) {
      document.querySelectorAll('.file-item').forEach(f => f.classList.remove('selected'));
      selectedItem = null;
      updateFooter();
    }
  });
}

// Initial Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  initLaserBorder();
  initMiniRadar();
  initListeners();
  loadDirectory('D:\\appnueva2');
});
