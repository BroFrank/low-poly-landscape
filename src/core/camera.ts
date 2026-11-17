/** T002: камера — OrbitControls + свободное движение (WASD / Q-E / R). */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Размер игровой площади (совпадает с AREA из T007). */
const AREA = 100;
const HALF = AREA / 2;

const DEFAULT_POS = new THREE.Vector3(70, 55, 70);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

const MIN_DIST = 5;
const MAX_DIST = 300;
const MOVE_SPEED = 14;
const LIFT_SPEED = 12;

const KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e']);

export interface CameraContext {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Секундомер цикла кадра (создаётся в createCamera, гасится в dispose). */
  timer: THREE.Timer;
  /** Набор зажатых клавиш движения; заполняется setupCameraKeys. */
  pressedKeys: Set<string>;
  resetView(): void;
}

/** Создать камеру и OrbitControls. `listen()` не вызывается — управление сценой берёт main.ts. */
export function createCamera(canvas: HTMLCanvasElement): CameraContext {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.copy(DEFAULT_POS);
  camera.lookAt(DEFAULT_TARGET);

  // THREE.Clock deprecated в three 0.187; Timer учитывает скрытые вкладки (Page Visibility API).
  const timer = new THREE.Timer();
  timer.connect(document);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 1.0;
  controls.panSpeed = 0.8;
  controls.minDistance = MIN_DIST;
  controls.maxDistance = MAX_DIST;
  // Не даём уйти за горизонт: вид строго сверху или снизу не допускается.
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.enablePan = true;
  controls.target.copy(DEFAULT_TARGET);
  controls.update();

  const pressedKeys = new Set<string>();

  return {
    camera,
    controls,
    timer,
    pressedKeys,
    resetView(): void {
      // Сброс вида не должен оставлять зажатыми WASD: иначе камера сразу улетит.
      pressedKeys.clear();
      camera.position.copy(DEFAULT_POS);
      controls.target.copy(DEFAULT_TARGET);
      controls.update();
    },
  };
}

/**
 * Слушатели клавиш движения. Возвращают функцию удаления слушателей (для dispose).
 * WASD не конфликтует с OrbitControls: OrbitControls двигает target мышью, а клавиши
 * смещают и target, и камеру одновременно.
 */
export function setupCameraKeys(ctx: CameraContext): () => void {
  const pressed = ctx.pressedKeys;

  /** Введённая в текстовое поле UI клавиша не должна управлять камерой (задел под T003/T019). */
  const isTextField = (event: KeyboardEvent): boolean => {
    const target = event.target;
    return target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTextField(event)) return;
    // Горячие клавиши с модификаторами (например Ctrl+S) — не про наше движение.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (KEYS.has(key)) {
      pressed.add(key);
      event.preventDefault();
    } else if (key === 'r') {
      ctx.resetView();
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    // Если клавиша была введена в текстовое поле, её не добавляли — удалять нечего.
    if (isTextField(event)) return;
    pressed.delete(event.key.toLowerCase());
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    pressed.clear();
  };
}

/** Свободное движение камеры вдоль поверхности ландшафта по зажатым клавишам. */
export function updateCameraMovement(ctx: CameraContext, dt: number): void {
  const pressed = ctx.pressedKeys;
  if (pressed.size === 0) return;

  const camera = ctx.camera;
  const target = ctx.controls.target;

  // Направление «вперёд» — от камеры к цели, спроецированное на плоскость XZ.
  const forward = new THREE.Vector3(target.x - camera.position.x, 0, target.z - camera.position.z);
  if (forward.lengthSq() < 1e-6) {
    // Вид строго сверху: проекция на XZ вырождена — берём направление взгляда камеры.
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return;
  }
  forward.normalize();

  // Правый вектор: forward × Y. Для forward = (0,0,-1) даёт (1,0,0).
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

  // На близких дистанциях двигаемся медленнее, чтобы не «проваливаться» через сцену.
  const dist = camera.position.distanceTo(target);
  const speed = MOVE_SPEED * Math.min(2.5, Math.max(0.6, dist / 60));

  const delta = new THREE.Vector3();
  // W — вперёд, S — назад, D — вправо, A — влево.
  delta.addScaledVector(forward, (pressed.has('w') ? 1 : 0) - (pressed.has('s') ? 1 : 0));
  delta.addScaledVector(right, (pressed.has('d') ? 1 : 0) - (pressed.has('a') ? 1 : 0));
  delta.multiplyScalar(speed * dt);
  delta.y += ((pressed.has('e') ? 1 : 0) - (pressed.has('q') ? 1 : 0)) * LIFT_SPEED * dt;

  const nextTarget = new THREE.Vector3(
    Math.max(-HALF, Math.min(HALF, target.x + delta.x)),
    Math.max(0, Math.min(60, target.y + delta.y)),
    Math.max(-HALF, Math.min(HALF, target.z + delta.z)),
  );

  // applied — горизонтальное смещение с учётом клампa: и target, и camera двигаются одинаково,
  // иначе rig «расходится» на границе площади.
  const applied = new THREE.Vector3(nextTarget.x - target.x, 0, nextTarget.z - target.z);
  target.copy(nextTarget);
  camera.position.add(applied);

  // Вертикально двигается только камера (полный delta.y): target обязан оставаться
  // на поверхности ландшафта (кламп в [0, 60]), поэтому через target опускание (Q)
  // блокировалось бы, когда цель уже на земле (y = 0).
  // Нижняя граница считается от предельного полярного угла OrbitControls: если камера
  // опустится ниже него, controls.update() каждый кадр «отворачивает» rig обратно,
  // и появляется дрейф камеры к цели по горизонтали.
  const offsetX = camera.position.x - target.x;
  const offsetZ = camera.position.z - target.z;
  const horiz = Math.max(1e-3, Math.hypot(offsetX, offsetZ));
  const minY = target.y + horiz / Math.tan(ctx.controls.maxPolarAngle);
  camera.position.y = Math.max(2, minY, camera.position.y + delta.y);
}
