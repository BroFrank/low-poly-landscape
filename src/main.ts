/** T002: сборка ядра сцены, тестовая площадка и цикл кадра. */

import * as THREE from 'three';
import { createScene, type SceneContext } from './core/scene.js';
import { updateCameraMovement } from './core/camera.js';

const canvas = document.getElementById('scene');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Не найден элемент canvas#scene');
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

const ctx = createScene(canvas);
createTestGround(ctx.scene);
run(ctx);
