import * as THREE from './libs/three.module.js';

function createParticleTexture(effectType = 'estrellas') {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const t = (effectType || 'estrellas').toLowerCase();

  if (t.includes('estrella') || t.includes('star')) {
    // 5-point glowing star
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    const cx = 32, cy = 32, spikes = 5, outerR = 26, innerR = 12;
    let rot = Math.PI / 2 * 3;
    let x = cx, y = cy;
    const step = Math.PI / spikes;
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerR;
      y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
  } else if (t.includes('corazon') || t.includes('heart')) {
    // Cute heart shape
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(32, 22);
    ctx.bezierCurveTo(32, 16, 26, 10, 18, 10);
    ctx.bezierCurveTo(8, 10, 8, 24, 8, 24);
    ctx.bezierCurveTo(8, 36, 20, 48, 32, 56);
    ctx.bezierCurveTo(44, 48, 56, 36, 56, 24);
    ctx.bezierCurveTo(56, 24, 56, 10, 46, 10);
    ctx.bezierCurveTo(38, 10, 32, 16, 32, 22);
    ctx.closePath();
    ctx.fill();
  } else if (t.includes('chispa') || t.includes('spark') || t.includes('rayo')) {
    // 4-point diamond sparkle flare
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.quadraticCurveTo(32, 26, 4, 32);
    ctx.quadraticCurveTo(32, 38, 32, 60);
    ctx.quadraticCurveTo(32, 38, 60, 32);
    ctx.quadraticCurveTo(32, 26, 32, 4);
    ctx.closePath();
    ctx.fill();
  } else if (t.includes('burbuja') || t.includes('bubble')) {
    // Translucent bubble with rim highlight
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(24, 22, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Soft glowing radial dust particle
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

class Pet3DController {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.petGroup = null;
    this.characterMesh = null;
    this.backMesh = null;
    this.ring1 = null;
    this.ring2 = null;
    this.particles = null;
    this.lightPoint = null;

    this.state = 'idle'; // 'idle' | 'listening' | 'speaking' | 'happy'
    this.baseScale = 1.0;
    this.targetMouse = { x: 0, y: 0 };
    this.currentMouse = { x: 0, y: 0 };

    this.jumpProgress = -1; // -1 means no jump
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.textureLoader = new THREE.TextureLoader();
    this.currentTexture = null;
    this.isInitialized = false;
    this.animReqId = null;
  }

  init(canvas) {
    if (this.isInitialized) return;
    this.canvas = canvas;

    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 300;

    // 1. WebGL Renderer with full transparency
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);

    // 2. Scene & Camera (Positioned with generous breathing room so orbital rings never hit frustum limits)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    this.baseCameraZ = 9.8;
    this.camera.position.set(0, 0, this.baseCameraZ);

    // 3. Studio Anime Lighting (Pure white key lighting for vibrant true anime colors + Neon Green rim)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.85);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight.position.set(3, 5, 6);
    this.scene.add(dirLight);

    this.lightPoint = new THREE.PointLight(0x00ff44, 1.5, 15);
    this.lightPoint.position.set(-3, -2, 3);
    this.scene.add(this.lightPoint);

    // 4. Main Group
    this.petGroup = new THREE.Group();
    this.scene.add(this.petGroup);

    // 5. Holographic Orbiting Cyber Rings
    const ringGeo1 = new THREE.TorusGeometry(2.3, 0.025, 12, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      wireframe: true,
      transparent: true,
      opacity: 0.65
    });
    this.ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    this.ring1.rotation.x = Math.PI / 3;
    this.petGroup.add(this.ring1);

    const ringGeo2 = new THREE.TorusGeometry(1.9, 0.02, 12, 48);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    this.ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    this.ring2.rotation.y = Math.PI / 4;
    this.petGroup.add(this.ring2);

    // 6. Floating 3D Sparkle Dust Particles
    const pCount = 55;
    const pGeo = new THREE.BufferGeometry();
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 6;
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const starTex = createParticleTexture('estrellas');
    const pMat = new THREE.PointsMaterial({
      color: 0x00ff44,
      size: 0.16,
      map: starTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.particles = new THREE.Points(pGeo, pMat);
    this.petGroup.add(this.particles);

    // 7. Mouse tracking
    window.addEventListener('mousemove', (e) => {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      this.targetMouse.x = ((e.clientX - halfW) / halfW);
      this.targetMouse.y = ((e.clientY - halfH) / halfH);
    });

    // 8. Auto-resize observer to dynamically expand WebGL viewport without clipping
    if (window.ResizeObserver && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr.width > 0 && cr.height > 0) {
            this.resize(cr.width, cr.height);
          }
        }
      });
      this.resizeObserver.observe(this.canvas.parentElement);
    }
    window.addEventListener('resize', () => {
      if (this.canvas) {
        this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
      }
    });

    this.isInitialized = true;
    this.animate();
  }

  resize(width, height) {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const w = Math.max(100, Math.round(width || this.canvas.clientWidth || 320));
    const h = Math.max(100, Math.round(height || this.canvas.clientHeight || 300));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loadPetTexture(url) {
    if (!this.isInitialized || !url) return;

    const img = new Image();
    img.onload = () => {
      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      if (this.renderer && this.renderer.capabilities) {
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      }
      this.currentTexture = texture;

      // Aspect ratio
      const w = img.naturalWidth || img.width || 100;
      const h = img.naturalHeight || img.height || 100;
      const aspect = Math.max(0.55, Math.min(1.65, w / h));
      const geoHeight = 3.35;
      const geoWidth = geoHeight * aspect;

      // Remove existing meshes if any
      if (this.characterMesh) {
        this.petGroup.remove(this.characterMesh);
        if (this.characterMesh.geometry) this.characterMesh.geometry.dispose();
        if (this.characterMesh.material) this.characterMesh.material.dispose();
      }
      if (this.backMesh) {
        this.petGroup.remove(this.backMesh);
        if (this.backMesh.geometry) this.backMesh.geometry.dispose();
        if (this.backMesh.material) this.backMesh.material.dispose();
      }

      // Front Cutout Plane (preserves 100% vibrant anime colors without green washout)
      const geom = new THREE.PlaneGeometry(geoWidth, geoHeight, 20, 20);
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.04,
        side: THREE.DoubleSide,
        roughness: 0.22,
        metalness: 0.04,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.15
      });
      this.characterMesh = new THREE.Mesh(geom, mat);
      this.characterMesh.position.z = 0.08;
      this.petGroup.add(this.characterMesh);

      // Back Glowing Neon Rim Plane for 3D anime silhouette depth
      const backGeom = new THREE.PlaneGeometry(geoWidth * 1.035, geoHeight * 1.035);
      const backMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.04,
        color: 0x00ff44,
        opacity: 0.42,
        side: THREE.DoubleSide
      });
      this.backMesh = new THREE.Mesh(backGeom, backMat);
      this.backMesh.position.z = -0.06;
      this.petGroup.add(this.backMesh);

      // Adjust rings to character scale with safety clearance
      const ringRadius = Math.max(geoWidth, geoHeight) * 0.62;
      if (this.ring1) {
        this.ring1.geometry.dispose();
        this.ring1.geometry = new THREE.TorusGeometry(ringRadius, 0.022, 12, 64);
      }
      if (this.ring2) {
        this.ring2.geometry.dispose();
        this.ring2.geometry = new THREE.TorusGeometry(ringRadius * 0.85, 0.018, 12, 48);
      }
    };
    img.onerror = (e) => {
      console.error('Error cargando textura para la mascota 3D:', url, e);
    };
    img.src = url;
  }

  setState(newState) {
    this.state = newState;
  }

  setScale(scale) {
    this.baseScale = Math.max(0.4, Math.min(4.0, parseFloat(scale) || 1.0));
    if (this.petGroup) {
      this.petGroup.scale.set(this.baseScale, this.baseScale, this.baseScale);
    }
    if (this.camera) {
      const targetZ = 9.8 * Math.max(0.85, this.baseScale);
      this.camera.position.z = targetZ;
    }
  }

  setRingsColor(color1 = '#00ff44', color2 = '#00ffff') {
    if (this.ring1 && this.ring1.material) {
      this.ring1.material.color.set(color1);
    }
    if (this.ring2 && this.ring2.material) {
      this.ring2.material.color.set(color2);
    }
    if (this.lightPoint) {
      this.lightPoint.color.set(color1);
    }
    if (this.backMesh && this.backMesh.material) {
      this.backMesh.material.color.set(color1);
    }
  }

  setParticleEffect(effectType = 'estrellas', color = '#00ff44') {
    if (!this.particles || !this.particles.material) return;
    if (effectType === 'ninguno' || effectType === 'none' || effectType === 'off') {
      this.particles.visible = false;
      return;
    }
    this.particles.visible = true;
    const tex = createParticleTexture(effectType);
    this.particles.material.map = tex;
    this.particles.material.color.set(color || '#00ff44');
    const isSpecial = effectType.includes('estrella') || effectType.includes('corazon') || effectType.includes('chispa') || effectType.includes('burbuja');
    this.particles.material.size = isSpecial ? 0.16 : 0.08;
    this.particles.material.needsUpdate = true;
  }

  triggerJump() {
    this.jumpProgress = 0;
  }

  animate() {
    this.animReqId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const time = (now - this.startTime) / 1000;

    // Smooth mouse parallax lerp
    this.currentMouse.x += (this.targetMouse.x - this.currentMouse.x) * 0.08;
    this.currentMouse.y += (this.targetMouse.y - this.currentMouse.y) * 0.08;

    if (this.petGroup) {
      // 1. Procedural Rotational Parallax (Looks toward mouse)
      const lookRotY = this.currentMouse.x * 0.42;
      const lookRotX = -this.currentMouse.y * 0.32;

      // 2. Automatic Animations Generated by Program
      let targetPosX = 0;
      let targetPosY = 0;
      let targetPosZ = 0;
      let targetRotZ = 0;
      let scaleModX = 1.0;
      let scaleModY = 1.0;

      if (this.state === 'idle') {
        // Idle Sinusoidal Floating & Breathing
        targetPosY = Math.sin(time * 2.4) * 0.22;
        scaleModY = 1.0 + Math.sin(time * 2.8) * 0.035;
        scaleModX = 1.0 - Math.sin(time * 2.8) * 0.02;
        targetRotZ = Math.sin(time * 1.6) * 0.04;

        this.ring1.rotation.x += 0.015;
        this.ring1.rotation.y += 0.02;
        this.ring2.rotation.y -= 0.025;
        this.ring2.rotation.z += 0.018;

      } else if (this.state === 'speaking') {
        // Speaking Voice Bounce & Pulse
        targetPosY = Math.sin(time * 6) * 0.18;
        const talkBounce = Math.abs(Math.sin(time * 14)) * 0.14;
        scaleModY = 1.0 + talkBounce;
        scaleModX = 1.0 - talkBounce * 0.5;
        targetRotZ = Math.sin(time * 8) * 0.06;

        this.ring1.rotation.x += 0.06;
        this.ring1.rotation.y += 0.08;
        this.ring2.rotation.y -= 0.07;

      } else if (this.state === 'listening') {
        // Listening Inquisitive Tilt & Fast Orbit Rings
        targetPosY = Math.sin(time * 3) * 0.1;
        targetRotZ = 0.2;
        scaleModY = 1.05;

        this.ring1.rotation.x += 0.08;
        this.ring1.rotation.y += 0.1;
        this.ring2.rotation.z += 0.09;
      }

      // Jump & 360 Spin Action
      if (this.jumpProgress >= 0) {
        this.jumpProgress += delta * 2.2;
        if (this.jumpProgress <= 1.0) {
          const jumpArc = Math.sin(this.jumpProgress * Math.PI) * 1.6;
          targetPosY += jumpArc;
          this.petGroup.rotation.y = lookRotY + (this.jumpProgress * Math.PI * 2);
        } else {
          this.jumpProgress = -1;
        }
      } else {
        this.petGroup.rotation.y += (lookRotY - this.petGroup.rotation.y) * 0.1;
      }

      this.petGroup.position.y += (targetPosY - this.petGroup.position.y) * 0.1;
      this.petGroup.position.x += (targetPosX - this.petGroup.position.x) * 0.1;
      this.petGroup.rotation.x += (lookRotX - this.petGroup.rotation.x) * 0.1;
      this.petGroup.rotation.z += (targetRotZ - this.petGroup.rotation.z) * 0.1;

      const finalScaleX = this.baseScale * scaleModX;
      const finalScaleY = this.baseScale * scaleModY;
      this.petGroup.scale.set(finalScaleX, finalScaleY, this.baseScale);

      // Smooth camera depth tracking to avoid any clipping regardless of scale
      if (this.camera) {
        const targetZ = 9.8 * Math.max(0.85, this.baseScale);
        this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;
      }

      // Rotate particle dust
      if (this.particles) {
        this.particles.rotation.y += 0.005;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animReqId) cancelAnimationFrame(this.animReqId);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.renderer) this.renderer.dispose();
  }
}

export const pet3D = new Pet3DController();
