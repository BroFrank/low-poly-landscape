/** T002/T004: сборка ядра сцены, тестовая площадка, цикл кадра и действия UI. */

import * as THREE from 'three';
import { createScene, type SceneContext } from './core/scene.js';
import { updateCameraMovement } from './core/camera.js';
import { createUiState } from './core/state.js';
import { captureScreenshot } from './core/screenshot.js';
import type { ActionId } from './core/state.js';
import { createToolbar } from './ui/toolbar.js';
import { createHud } from './ui/hud.js';

const canvas = document.getElementById('scene');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Не найден элемент canvas#scene');
}

const toolbarRoot = document.getElementById('toolbar');
const hudRoot = document.getElementById('hud');
if (!(toolbarRoot instanceof HTMLElement) || !(hudRoot instanceof HTMLElement)) {
  throw new Error('Не найдены контейнеры UI (#toolbar, #hud)');
}

/** Временная тестовая площадка (T002): будет заменена моделью рельефа в T007. */
function createTestGround(scene: THREE.Scene): void {
  // Освещения ещё нет (T005), поэтому BasicMaterial — плоский цвет без теней.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshBasicMaterial({ color: 0x4f9e57 }),
  );
  ground.rotation.x = -Math.PI / 2;

  // Сетка-подложка: 64 деления на стороне совпадает с GRID_SIZE из T007.
  const grid = new THREE.GridHelper(100, 64, 0x63b56b, 0x63b56b);
  grid.position.y = 0.02; // подъём, чтобы сетка не мерцала с плоскостью (z-fighting)

  scene.add(ground, grid);
}

function run(ctx: SceneContext): void {
  ctx.resize(); // первый пересчёт размера и aspect до первого render

  // Цикл кадра и таймер принадлежат scene.ts — dispose() их гарантированно останавливает.
  ctx.start((dt: number): void => {
    updateCameraMovement(ctx, dt);
    ctx.controls.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
  });
}

/**
 * Сцена собирается раньше UI: обработчики действий должны иметь доступ к ctx.
 * Панели — DOM-оверлей, на порядок создания рендерера они не влияют.
 * Заглушки handlers подключаются в T005/T008–T011; возвращаемые handles
 * (dispose) будут задействованы, когда появится точка teardown приложения.
 */
const ctx = createScene(canvas);
createTestGround(ctx.scene);

const ui = createUiState();
createHud(hudRoot, ui);
createToolbar(toolbarRoot, ui, {
  onTool: (): void => {},
  onAction: (action: ActionId): void => {
    if (action !== 'screenshot') return; // 'reset' — задача T011
    const result = captureScreenshot(ctx);
    ui.set({
      lastAction: result.ok
        ? `Скриншот: ${result.fileName} (${result.width}×${result.height})`
        : `Скриншот не создан: ${result.message}`,
    });
  },
  onLight: (): void => {},
});

run(ctx);
