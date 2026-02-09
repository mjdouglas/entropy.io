import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CubeAnimationController } from './animation/CubeAnimationController.js';
import { audioPlayer } from './audioPlayer.js';
import {
  getPaletteInfo,
  getPaletteNameBySlug,
  paletteNames,
  titleToSlug,
} from './colorPalettes.js';
import { applySolvedPoseFromAnimation } from './scene/applySolvedPose.js';
import { generateScramble } from './solver/generateScramble.js';
import { KociembaSolver } from './solver/KociembaSolver.js';

const FACES = ['R', 'L', 'U', 'D', 'F', 'B'];
const MANUAL_MOVE_DURATION = 240;
const MANUAL_FAST_DURATION = 130;

// Track current palette for navigation
const hadInitialHash = window.location.hash.length > 1;
function getInitialPaletteIndex() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const paletteName = getPaletteNameBySlug(hash);
    if (paletteName) {
      return paletteNames.indexOf(paletteName);
    }
  }
  return Math.floor(Math.random() * paletteNames.length);
}
let currentPaletteIndex = getInitialPaletteIndex();
let currentModel = null;
let cubeController = null;

let mode = 'auto';
let moveHistory = [];
let manualUndoStack = [];
let manualRedoStack = [];
let selectedModifier = '';
let actionQueue = Promise.resolve();
let actionEpoch = 0;
let modeSwitchToken = 0;

const modeAutoBtn = document.getElementById('mode-auto');
const modeManualBtn = document.getElementById('mode-manual');
const mobileModeToggleBtn = document.getElementById('mobile-mode-toggle');
const manualControls = document.getElementById('manual-controls');
const manualStatus = document.getElementById('manual-status');
const notationInput = document.getElementById('notation-input');
const audioPlayerElement = document.getElementById('audio-player');
const prevPaletteBtn = document.getElementById('prev-palette');
const nextPaletteBtn = document.getElementById('next-palette');
const primeModifierBtn = document.querySelector(
  '.modifier-btn[data-modifier="\'"]',
);
const doubleModifierBtn = document.querySelector(
  '.modifier-btn[data-modifier="2"]',
);
const pressTimers = new WeakMap();

function updateMobileModeToggleOffset() {
  if (!document.body || !manualControls || !mobileModeToggleBtn) {
    return;
  }

  if (window.innerWidth <= 768) {
    if (audioPlayerElement) {
      const playerRect = audioPlayerElement.getBoundingClientRect();
      const toggleHeight = mobileModeToggleBtn.offsetHeight || 38;
      const viewportBottomGap = Math.max(0, window.innerHeight - playerRect.bottom);
      const centeredBottom = Math.round(
        viewportBottomGap + (playerRect.height - toggleHeight) / 2,
      );
      document.body.style.setProperty(
        '--mobile-mode-anchor',
        `${Math.max(12, centeredBottom)}px`,
      );
    }
    document.body.style.setProperty(
      '--mobile-controls-offset',
      `${manualControls.offsetHeight + 12}px`,
    );
    return;
  }

  document.body.style.removeProperty('--mobile-mode-anchor');
  document.body.style.removeProperty('--mobile-controls-offset');
}

function updateUrlHash(paletteInfo) {
  const slug = titleToSlug(paletteInfo.title);
  history.replaceState(null, '', `#${slug}`);
}

function setStatus(text) {
  if (manualStatus) {
    manualStatus.textContent = text;
  }
}

function flashButtonPress(button) {
  if (!button) {
    return;
  }

  const priorTimer = pressTimers.get(button);
  if (priorTimer) {
    clearTimeout(priorTimer);
  }

  button.classList.add('is-pressed');
  const timeoutId = setTimeout(() => {
    button.classList.remove('is-pressed');
    pressTimers.delete(button);
  }, 120);
  pressTimers.set(button, timeoutId);
}

function invertMove(move) {
  if (move.endsWith('2')) {
    return move;
  }
  if (move.endsWith("'")) {
    return move[0];
  }
  return `${move[0]}'`;
}

function setModeUi(nextMode) {
  mode = nextMode;
  modeAutoBtn?.classList.toggle('active', nextMode === 'auto');
  modeManualBtn?.classList.toggle('active', nextMode === 'manual');
  manualControls?.classList.toggle('visible', nextMode === 'manual');
  document.body?.classList.toggle('manual-mode', nextMode === 'manual');
  try {
    updateMobileModeToggleOffset();
  } catch (error) {
    console.warn('Failed to update mobile mode toggle offset:', error);
  }
  if (mobileModeToggleBtn) {
    const isAuto = nextMode === 'auto';
    mobileModeToggleBtn.textContent = isAuto ? 'A' : 'M';
    mobileModeToggleBtn.classList.toggle('active', !isAuto);
    mobileModeToggleBtn.setAttribute(
      'aria-label',
      isAuto ? 'Switch to manual mode' : 'Switch to auto mode',
    );
  }
}

async function executeMoveRaw(move, duration) {
  if (!cubeController) {
    return false;
  }
  return cubeController.executor.executeMove(move, duration);
}

async function executeMoveTracked(move, duration) {
  const success = await executeMoveRaw(move, duration);
  if (success) {
    moveHistory.push(move);
  }
  return success;
}

function clearManualStacks() {
  manualUndoStack = [];
  manualRedoStack = [];
}

async function switchToManualMode() {
  if (!cubeController || mode === 'manual') {
    setModeUi('manual');
    return;
  }
  cubeController.stopImmediately();
  await cubeController.waitForStop();
  setModeUi('manual');
  setStatus('Manual mode');
}

function invalidateQueuedActions() {
  actionEpoch += 1;
  actionQueue = Promise.resolve();
}

function isCurrentModeSwitch(token) {
  return token === modeSwitchToken;
}

async function transitionToAutoMode(token = modeSwitchToken) {
  if (!cubeController || mode === 'auto') {
    setModeUi('auto');
    return;
  }

  // Hide manual UI immediately on mode switch.
  setModeUi('auto');
  setStatus('Returning to auto mode');

  // Solve back to a known solved state before resuming automatic loop.
  if (moveHistory.length > 0) {
    const solution = await globalSolver.solve(moveHistory);
    if (!isCurrentModeSwitch(token) || mode !== 'auto') {
      return;
    }
    for (const move of solution) {
      if (!isCurrentModeSwitch(token) || mode !== 'auto') {
        return;
      }
      await executeMoveRaw(move, MANUAL_MOVE_DURATION);
    }
  }

  if (!isCurrentModeSwitch(token) || mode !== 'auto') {
    return;
  }
  moveHistory = [];
  clearManualStacks();
  cubeController.firstCycle = false;
  cubeController.startContinuousLoop();
}

function queueAction(label, action) {
  const queuedEpoch = actionEpoch;
  actionQueue = actionQueue
    .then(async () => {
      if (queuedEpoch !== actionEpoch) {
        return;
      }
      setStatus(label);
      await action();
    })
    .catch((error) => {
      if (queuedEpoch !== actionEpoch) {
        return;
      }
      console.error('Manual action failed:', error);
      setStatus('Action failed');
    });

  return actionQueue;
}

function parseAlgorithm(input) {
  const compact = input.toUpperCase().replace(/\s+/g, '');
  if (!compact) {
    return [];
  }

  const tokens = compact.match(/[RLUDFB](?:2|')?/g) || [];
  if (tokens.join('') !== compact) {
    return null;
  }

  return tokens;
}

function renderModifierState() {
  document.querySelectorAll('.modifier-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  if (selectedModifier) {
    const target = document.querySelector(
      `.modifier-btn[data-modifier="${selectedModifier}"]`,
    );
    if (target) {
      target.classList.add('active');
    }
  }
}

function consumeSelectedModifier() {
  const modifier = selectedModifier;
  selectedModifier = '';
  renderModifierState();
  return modifier;
}

function queueUserMove(move) {
  queueAction(`Move ${move}`, async () => {
    if (mode === 'auto') {
      await switchToManualMode();
    }

    const success = await executeMoveTracked(move, MANUAL_MOVE_DURATION);
    if (!success) {
      return;
    }

    manualUndoStack.push(move);
    manualRedoStack = [];
    setStatus(`Move ${move}`);
  });
}

function bindManualControls() {
  modeAutoBtn?.addEventListener('click', () => {
    invalidateQueuedActions();
    const token = ++modeSwitchToken;
    void transitionToAutoMode(token);
  });

  modeManualBtn?.addEventListener('click', () => {
    invalidateQueuedActions();
    ++modeSwitchToken;
    void switchToManualMode();
  });

  if (mobileModeToggleBtn) {
    mobileModeToggleBtn.addEventListener('click', () => {
      invalidateQueuedActions();
      if (mode === 'auto') {
        ++modeSwitchToken;
        void switchToManualMode();
        return;
      }
      const token = ++modeSwitchToken;
      void transitionToAutoMode(token);
    });
  }

  document.querySelectorAll('.face-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const face = btn.dataset.face;
      const modifier = consumeSelectedModifier();
      queueUserMove(`${face}${modifier}`);
    });
  });

  document.querySelectorAll('.modifier-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modifier = btn.dataset.modifier;
      selectedModifier = selectedModifier === modifier ? '' : modifier;
      renderModifierState();
      if (!selectedModifier) {
        setStatus('Modifier cleared');
      } else if (selectedModifier === "'") {
        setStatus('Prime modifier armed');
      } else if (selectedModifier === '2') {
        setStatus('Double-turn modifier armed');
      }
    });
  });

  document.getElementById('apply-notation').addEventListener('click', () => {
    queueAction('Applying algorithm', async () => {
      if (mode === 'auto') {
        await switchToManualMode();
      }

      const moves = parseAlgorithm(notationInput.value);
      if (moves === null) {
        setStatus('Invalid notation');
        return;
      }

      for (const move of moves) {
        const success = await executeMoveTracked(move, MANUAL_MOVE_DURATION);
        if (!success) {
          break;
        }
        manualUndoStack.push(move);
      }

      if (moves.length > 0) {
        manualRedoStack = [];
      }
      setStatus(
        moves.length > 0 ? `Applied ${moves.length} moves` : 'No moves',
      );
    });
  });

  notationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('apply-notation').click();
    }
  });

  document.getElementById('manual-undo').addEventListener('click', () => {
    queueAction('Undo', async () => {
      if (mode === 'auto') {
        await switchToManualMode();
      }
      if (manualUndoStack.length === 0) {
        setStatus('Nothing to undo');
        return;
      }

      const move = manualUndoStack.pop();
      const inverse = invertMove(move);
      await executeMoveRaw(inverse, MANUAL_MOVE_DURATION);
      moveHistory.pop();
      manualRedoStack.push(move);
      setStatus(`Undo ${move}`);
    });
  });

  document.getElementById('manual-redo').addEventListener('click', () => {
    queueAction('Redo', async () => {
      if (mode === 'auto') {
        await switchToManualMode();
      }
      if (manualRedoStack.length === 0) {
        setStatus('Nothing to redo');
        return;
      }

      const move = manualRedoStack.pop();
      const success = await executeMoveTracked(move, MANUAL_MOVE_DURATION);
      if (!success) {
        return;
      }
      manualUndoStack.push(move);
      setStatus(`Redo ${move}`);
    });
  });

  document.getElementById('manual-scramble').addEventListener('click', () => {
    queueAction('Scrambling', async () => {
      if (mode === 'auto') {
        await switchToManualMode();
      }

      const scramble = generateScramble(25);
      for (const move of scramble) {
        await executeMoveTracked(move, MANUAL_FAST_DURATION);
      }
      clearManualStacks();
      setStatus('Scrambled');
    });
  });

  document.getElementById('manual-solve').addEventListener('click', () => {
    queueAction('Solving', async () => {
      if (mode === 'auto') {
        await switchToManualMode();
      }

      if (moveHistory.length === 0) {
        setStatus('Already solved');
        return;
      }

      const solution = await globalSolver.solve(moveHistory);
      for (const move of solution) {
        await executeMoveRaw(move, MANUAL_MOVE_DURATION);
      }
      moveHistory = [];
      clearManualStacks();
      setStatus(
        solution.length > 0 ? `Solved in ${solution.length} moves` : 'Solved',
      );
    });
  });

  document.getElementById('manual-reset').addEventListener('click', () => {
    queueAction('Resetting', async () => {
      if (mode === 'auto') {
        await switchToManualMode();
      }

      if (moveHistory.length === 0) {
        setStatus('Already solved');
        return;
      }

      const rewind = [...moveHistory].reverse().map(invertMove);
      for (const move of rewind) {
        await executeMoveRaw(move, MANUAL_FAST_DURATION);
      }
      moveHistory = [];
      clearManualStacks();
      setStatus('Reset to solved');
    });
  });

  renderModifierState();
  setModeUi('auto');
  setStatus('Auto mode');
}

bindManualControls();
window.addEventListener('resize', updateMobileModeToggleOffset);
updateMobileModeToggleOffset();

// Create solver instance (initialization deferred until after cube renders)
const globalSolver = new KociembaSolver();

// ==================== THREE.JS SETUP ====================

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Camera setup
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
const baseCameraPosition = new THREE.Vector3(5, 5, 5);
const isMobileViewport = window.innerWidth <= 768;
const mobileZoomFactor = 1.6; // move camera 60% farther back on mobile
const desktopZoomFactor = 1.18; // move camera back to make cube 15% smaller
camera.position.copy(
  baseCameraPosition
    .clone()
    .multiplyScalar(isMobileViewport ? mobileZoomFactor : desktopZoomFactor),
);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);

// Post-processing setup for bloom glow effect
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.3,
  0.4,
  0.0,
);
const baseBloomStrength = 0.3;
const solvedBloomStrength = 0.45;
let targetBloomStrength = baseBloomStrength;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.target.set(0, -0.4, 0);
controls.update();

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
directionalLight1.position.set(4, 9, 3);
scene.add(directionalLight1);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight2.position.set(-4, 4, -6);
scene.add(directionalLight2);

const detailLight = new THREE.DirectionalLight(0xffffff, 1.3);
detailLight.position.set(-2, 2.5, 8);
scene.add(detailLight);

const pointLight = new THREE.PointLight(0xffffff, 0.65);
pointLight.position.set(0, 6, 0);
scene.add(pointLight);

// Load GLTF model
const loader = new GLTFLoader();
loader.load(
  'scene.gltf',
  (gltf) => {
    const model = gltf.scene;

    applySolvedPoseFromAnimation(model, gltf.animations);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    model.scale.multiplyScalar(3 / maxDim);

    currentModel = model;

    const textureLoader = new THREE.TextureLoader();
    const paletteInfo = getPaletteInfo(paletteNames[currentPaletteIndex]);
    textureLoader.load(paletteInfo.texturePath, (paletteTexture) => {
      paletteTexture.colorSpace = THREE.SRGBColorSpace;
      paletteTexture.flipY = false;

      model.traverse((child) => {
        if (child.isMesh && child.material) {
          const mat = child.material;
          if (mat.map) {
            mat.map = paletteTexture;
            mat.emissiveMap = paletteTexture;
            mat.emissive = new THREE.Color(1, 1, 1);
            mat.emissiveIntensity = 0.25;
            mat.needsUpdate = true;
          }
        }
      });

      scene.add(model);

      audioPlayer.init();
      audioPlayer.loadTrack(paletteInfo);
      document.getElementById('palette-info').classList.add('visible');
      if (hadInitialHash) {
        updateUrlHash(paletteInfo);
      }

      const toast = document.getElementById('theme-toast');
      toast.textContent = paletteInfo.title;
      toast.classList.add('visible');

      scene.updateMatrixWorld(true);

      cubeController = new CubeAnimationController(model, globalSolver, {
        onSolved: () => {
          targetBloomStrength = solvedBloomStrength;
          moveHistory = [];
        },
        onScrambling: () => {
          targetBloomStrength = baseBloomStrength;
        },
        onMove: (move) => {
          moveHistory.push(move);
        },
      });

      const scramble = generateScramble(25);
      console.log('Initial scramble:', scramble.join(' '));
      (async () => {
        for (const move of scramble) {
          await executeMoveTracked(move, 0);
        }
        console.log("Rubik's Cube loaded successfully!");

        setTimeout(() => {
          const solverStartTime = performance.now();
          globalSolver
            .ensureReady()
            .then(() => {
              const solverElapsed = performance.now() - solverStartTime;
              console.log(
                `Kociemba solver initialized (${solverElapsed.toFixed(0)}ms total)`,
              );

              cubeController.startContinuousLoop(scramble);
              console.log('Animation controller started');
            })
            .catch((err) => {
              console.error('Solver initialization failed:', err);
            });
        }, 100);
      })();
    });
  },
  undefined,
  (error) => {
    console.error('Error loading model:', error);
  },
);

// Handle window resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.resolution.set(width, height);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  bloomPass.strength += (targetBloomStrength - bloomPass.strength) * 0.05;
  composer.render();
}
animate();

function switchPalette(direction) {
  if (!currentModel) return;

  currentPaletteIndex =
    (currentPaletteIndex + direction + paletteNames.length) %
    paletteNames.length;
  const paletteInfo = getPaletteInfo(paletteNames[currentPaletteIndex]);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(paletteInfo.texturePath, (paletteTexture) => {
    paletteTexture.colorSpace = THREE.SRGBColorSpace;
    paletteTexture.flipY = false;

    currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        const mat = child.material;
        mat.map = paletteTexture;
        mat.emissiveMap = paletteTexture;
        mat.needsUpdate = true;
      }
    });

    const toast = document.getElementById('theme-toast');
    toast.textContent = paletteInfo.title;
    toast.classList.remove('visible');
    void toast.offsetHeight;
    toast.classList.add('visible');

    updateUrlHash(paletteInfo);
    audioPlayer.loadTrack(paletteInfo);
  });
}

document
  .getElementById('prev-palette')
  .addEventListener('click', () => switchPalette(-1));
document
  .getElementById('next-palette')
  .addEventListener('click', () => switchPalette(1));

window.addEventListener('keydown', (event) => {
  const activeTag = document.activeElement?.tagName;
  if (
    activeTag === 'INPUT' ||
    activeTag === 'TEXTAREA' ||
    document.activeElement?.isContentEditable
  ) {
    return;
  }

  if (event.key === 'ArrowLeft') {
    flashButtonPress(prevPaletteBtn);
    switchPalette(-1);
    return;
  }
  if (event.key === 'ArrowRight') {
    flashButtonPress(nextPaletteBtn);
    switchPalette(1);
    return;
  }

  if (!cubeController) {
    return;
  }

  if (event.key === '2') {
    flashButtonPress(doubleModifierBtn);
    selectedModifier = selectedModifier === '2' ? '' : '2';
    renderModifierState();
    setStatus(
      selectedModifier === '2'
        ? 'Double-turn modifier armed'
        : 'Modifier cleared',
    );
    event.preventDefault();
    return;
  }

  if (event.key === "'") {
    flashButtonPress(primeModifierBtn);
    selectedModifier = selectedModifier === "'" ? '' : "'";
    renderModifierState();
    setStatus(
      selectedModifier === "'" ? 'Prime modifier armed' : 'Modifier cleared',
    );
    event.preventDefault();
    return;
  }

  const face = event.key.toUpperCase();
  if (!FACES.includes(face)) {
    return;
  }

  const modifier = selectedModifier || (event.shiftKey ? "'" : '');
  if (modifier === "'") {
    flashButtonPress(primeModifierBtn);
  }
  if (modifier === '2') {
    flashButtonPress(doubleModifierBtn);
  }
  flashButtonPress(document.querySelector(`.face-btn[data-face="${face}"]`));
  if (selectedModifier) consumeSelectedModifier();
  event.preventDefault();
  queueUserMove(`${face}${modifier}`);
});

renderer.domElement.addEventListener('mousemove', () => {
  document.body.focus();
});
