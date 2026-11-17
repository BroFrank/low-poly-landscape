/** T002: ядро рендеринга — сцена, renderer, обработка размера окна. */

import * as THREE from 'three';
import { createCamera, setupCameraKeys, type CameraContext } from './camera.js';

/** Предельная плотность пикселей: на экранах с DPR 3+ рендер слишком дорог. */
const MAX_DPR = 2;
/** Цвет неба по палитре (день). Освещение — в T005. */
const SKY_COLOR = 0xcfe3f2;

export interface SceneContext extends CameraContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  /** Запустить цикл кадра: frame(dt) вызывается каждый кадр, dt — секунды (clamped). */
  start(frame: (dt: number) => void): void;
  /** Остановить цикл кадра (cancelAnimationFrame) — вызывается из dispose(). */
  stop(): void;
  resize(): void;
  dispose(): void;
}

/** Собрать сцену, renderer и камеру; повесить единственный resize-обработчик. */
export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Порядок важен: DPR ставится до setSize, иначе буфер считается по старой плотности.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);

  const cameraCtx = createCamera(canvas);
  const removeKeys = setupCameraKeys(cameraCtx);
  /** Единственный источник пересчёта размера (в main.ts больше нет resize-слушателя). */
  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // Окно может быть 0×0 (свёрнутый браузер) — не ломаем проекцию.
    if (width < 1 || height < 1) return;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(width, height, false);
    cameraCtx.camera.aspect = width / height;
    cameraCtx.camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);

  let rafId = 0;
  let running = false;

  /** Цикл кадра живёт здесь, чтобы dispose() гарантированно его останавливал. */
  function start(frame: (dt: number) => void): void {
    if (running) return;
    running = true;

    const tick = (): void => {
      if (!running) return;
      cameraCtx.timer.update();
      // Clamp защищает от рывка после долгой паузы (переключение вкладки).
      const dt = Math.min(cameraCtx.timer.getDelta(), 0.1);
      frame(dt);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  }

  /** Прекратить цикл: без этого dispose() оставил бы render на уничтоженном renderer. */
  function stop(): void {
    running = false;
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  return {
    ...cameraCtx,
    scene,
    renderer,
    start,
    stop,
    resize,
    dispose(): void {
      stop();
      window.removeEventListener('resize', resize);
      removeKeys();
      cameraCtx.timer.dispose(); // снять слушатель visibilitychange
      cameraCtx.controls.dispose();
      renderer.dispose();
    },
  };
}
