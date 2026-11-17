/** T005: освещение сцены — солнце с тенями, заполняющий свет, небо, туман и звёзды. */

import * as THREE from 'three';
import type { SceneContext } from './scene.js';
import type { LightMode } from './state.js';

/** Цвета строго из палитры AGENTS.md; новых оттенков здесь не появляется. */
const DAY_SKY = 0xcfe3f2;
const NIGHT_SKY = 0x1b2a3a;
const DAY_FILL_GROUND = 0x4f9e57; // трава — нижняя половина hemisphere-света

const SUN_DISTANCE = 120;
/** Азимут фиксирован: движение солнца по азимуту — вне объёма T005. */
const SUN_AZIMUTH = 0.6;
const SUN_MAX_ELEV = 1.15; // радианы (~66°)
const SUN_INTENSITY = 1.4;
const FILL_INTENSITY_DAY = 0.85;
/** Остаточный ночной свет: без него ночь была бы абсолютно чёрной. */
const FILL_INTENSITY_NIGHT = 0.25;
/** Время сглаживания ручного перехода Day ⇄ Night, секунды. */
const TRANSITION_TAU = 1.2;
const CYCLE_SECONDS = 60;
const CYCLE_MIN = 10;
const CYCLE_MAX = 600;

const FOG_NEAR = 150;
const FOG_FAR = 400;

const STAR_COUNT = 180;
/** Дальность камеры — 500, поэтому купол звёзд следует за камерой: иначе они оказались бы за far-плоскостью. */
const STAR_RADIUS = 300;
const STAR_SIZE = 2;
/** Ниже этого daylight звёзды начинают проявляться. */
const STAR_ON_DAYLIGHT = 0.55;
/** Пороги теней: пока солнце низко, теневая карта пересчитывается впустую. */
const SHADOW_ON = 0.05;
const SHADOW_OFF = 0.02;

export interface LightingOptions {
  /** Длительность полного цикла авто-режима, секунды. */
  cycleSeconds?: number;
}

export interface LightingHandle {
  /** Назначить режим; переход плавный, фаза auto не сбрасывается. */
  setMode(mode: LightMode): void;
  /** Вызывается один раз за кадр из цикла ctx.start — иначе auto не движется. */
  update(dt: number): void;
  /** Снять свет, звёзды и туман из сцены; освободить геометрии и теневые карты. */
  dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
  // NaN проходит сквозь Math.min/max — без проверки он «заразит» позиции и интенсивности.
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Детерминированный PRNG: позиции звёзд одинаковы при каждой перезагрузке, скриншоты воспроизводимы. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 30), 2246822507);
    t ^= t + Math.imul(t ^ (t >>> 30), 3266489917);
    return ((t ^ (t >>> 31)) >>> 0) / 4294967296;
  };
}

/**
 * Очистка следов предыдущего освещения. Нужна для HMR: main.ts исполняется повторно,
 * и иначе в сцене окажется два солнца и две сетки звёзд.
 */
function removeExistingLighting(scene: THREE.Scene): void {
  for (const child of [...scene.children]) {
    if (child.userData.lighting !== true) continue;
    scene.remove(child);

    if (child instanceof THREE.DirectionalLight) child.shadow.map?.dispose();
    if (child instanceof THREE.Points) {
      child.geometry.dispose();
      child.material.dispose();
    }
  }
  scene.fog = null;
}

/**
 * Купол звёзд — сфера вокруг камеры. Камера здесь всегда смотрит вниз
 * (OrbitControls: maxPolarAngle < 90°), поэтому купол только с верхней полусферой
 * ни разу не попал бы в кадр; нижняя часть видна в «небе» за краем площадки.
 */
function createStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const positions = new Float32Array(STAR_COUNT * 3);
  const rand = mulberry32(0x9e3779b9);

  for (let i = 0; i < STAR_COUNT; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    let length = 0;
    do {
      x = rand() * 2 - 1;
      y = rand() * 2 - 1;
      z = rand() * 2 - 1;
      length = Math.hypot(x, y, z);
    } while (length < 1e-6);

    positions[i * 3] = (x / length) * STAR_RADIUS;
    positions[i * 3 + 1] = (y / length) * STAR_RADIUS;
    positions[i * 3 + 2] = (z / length) * STAR_RADIUS;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // fog = false — звёзды держатся вокруг камеры и не должны тонуть в тумане.
  const material = new THREE.PointsMaterial({
    color: DAY_SKY,
    size: STAR_SIZE,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
  });

  return new THREE.Points(geometry, material);
}

/** Собрать освещение сцены; состояние замкнуто, глобальных переменных нет. */
export function createLighting(ctx: SceneContext, options?: LightingOptions): LightingHandle {
  removeExistingLighting(ctx.scene);

  ctx.renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap удалён в three 0.187 (warn'ит и сам падает в PCF) — берём PCF напрямую.
  ctx.renderer.shadowMap.type = THREE.PCFShadowMap;

  let mode: LightMode = 'day';
  let daylight = 1;
  let phase = 0;
  const cycleSeconds = clamp(options?.cycleSeconds ?? CYCLE_SECONDS, CYCLE_MIN, CYCLE_MAX);

  const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
  sun.userData.lighting = true;
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);

  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -70;
  shadowCamera.right = 70;
  shadowCamera.top = 70;
  shadowCamera.bottom = -70;
  shadowCamera.near = 1;
  shadowCamera.far = SUN_DISTANCE + 300;
  shadowCamera.updateProjectionMatrix();

  // Площадка сама себя затеняет без bias — появляется «самопятно» на ровной плоскости.
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;

  const fill = new THREE.HemisphereLight(DAY_SKY, DAY_FILL_GROUND, FILL_INTENSITY_DAY);
  fill.userData.lighting = true;

  const stars = createStars();
  stars.userData.lighting = true;

  // Небо и туман используют один Color-объект: иначе на границе горизонта видна «полоса».
  const dayColor = new THREE.Color(DAY_SKY);
  const nightColor = new THREE.Color(NIGHT_SKY);
  const skyColor = new THREE.Color(DAY_SKY);
  ctx.scene.background = skyColor;

  const fog = new THREE.Fog(DAY_SKY, FOG_NEAR, FOG_FAR);
  fog.color = skyColor;
  ctx.scene.fog = fog;

  ctx.scene.add(sun, fill, stars);

  const direction = new THREE.Vector3();

  /** Всё выводим из одного параметра — daylight (0 = полночь, 1 = полдень). */
  function apply(day: number): void {
    const elevation = SUN_MAX_ELEV * day;
    const cosElev = Math.cos(elevation);

    direction.set(Math.cos(SUN_AZIMUTH) * cosElev, Math.sin(elevation), Math.sin(SUN_AZIMUTH) * cosElev);
    if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0); // защита от вырожденного направления
    direction.normalize();
    sun.position.copy(direction).multiplyScalar(SUN_DISTANCE);
    sun.intensity = SUN_INTENSITY * day;

    // Гистерезис: на низком солнце тени нет, и включать её каждый кадр невыгодно.
    sun.castShadow = sun.castShadow ? day > SHADOW_OFF : day > SHADOW_ON;

    skyColor.copy(nightColor).lerp(dayColor, day);
    sun.color.copy(skyColor);
    // fog.color — тот же объект, что и фон, поэтому отдельная копия не нужна.

    fill.intensity = FILL_INTENSITY_NIGHT + (FILL_INTENSITY_DAY - FILL_INTENSITY_NIGHT) * day;
    fill.color.copy(skyColor);
    fill.groundColor.copy(nightColor).lerp(dayColor, day);

    stars.material.opacity = clamp((STAR_ON_DAYLIGHT - day) / STAR_ON_DAYLIGHT, 0, 1);
  }

  // Первичное состояние применяем сразу: в статичном 'day' update() до первого переключения
  // режима уходит в early return, и без этого вызова солнце осталось бы в (0,1,0) и белом цвете.
  apply(daylight);

  return {
    setMode(next: LightMode): void {
      // Вход в auto из статичного режима подбирает фазу по текущей яркости:
      // без этого цикл стартовал бы с полдня и яркость прыгнула бы скачком.
      if (next === 'auto' && mode !== 'auto') {
        phase = Math.acos(clamp(2 * daylight - 1, -1, 1)) / (2 * Math.PI);
      }
      mode = next;
    },

    update(dt: number): void {
      if (!Number.isFinite(dt) || dt <= 0) return;

      // Купол звёзд следует за камерой: иначе при отдалении они оказываются за far-плоскостью (500).
      stars.position.copy(ctx.camera.position);

      let target: number;
      if (mode === 'auto') {
        // phase: 0 = полдень, 0.5 = полночь; косинусная форма уже мягкая, доп. сглаживание не нужно.
        phase = (phase + dt / cycleSeconds) % 1;
        target = 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);
        daylight = target;
      } else {
        target = mode === 'day' ? 1 : 0;
        // Экспоненциальное сглаживание: переход бесшовен из любой точки, в том числе из auto.
        daylight += (target - daylight) * (1 - Math.exp(-dt / TRANSITION_TAU));
        if (Math.abs(target - daylight) < 1e-4) {
          daylight = target;
          return; // статичный режим достиг цели — дешёвый early return
        }
      }

      apply(clamp(daylight, 0, 1));
    },

    dispose(): void {
      removeExistingLighting(ctx.scene);
      ctx.renderer.shadowMap.enabled = false;
    },
  };
}
