/** T003: HUD — строка статуса и мини-справка. Полный перечень горячих клавиш — в T019. */

import type { UiHandle, UiState } from '../core/state.js';

export interface HudHotkey {
  key: string;
  description: string;
}

/** Перечисляются только клавиши, которые уже работают (движение камеры из T002). */
const HOTKEYS: HudHotkey[] = [
  { key: 'WASD', description: 'движение камеры' },
  { key: 'Q / E', description: 'опустить / поднять' },
  { key: 'R', description: 'сброс вида' },
];

const TOOL_LABEL: Record<UiState['tool'], string> = {
  raise: 'Высота ↑',
  lower: 'Высота ↓',
  stone: 'Камень',
  earth: 'Земля',
  objects: 'Объекты',
};

const LIGHT_LABEL: Record<UiState['lightMode'], string> = {
  day: 'День',
  night: 'Ночь',
  auto: 'Авто',
};

export function createHud(root: HTMLElement, ui: UiHandle): { dispose(): void } {
  // Идемпотентность при повторном исполнении main.ts (HMR).
  root.replaceChildren();

  const status = document.createElement('div');
  status.className = 'hud-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.appendChild(status);

  // Отдельная строка для последнего действия: появляется только после нажатия «Сброс»/«Скриншот».
  // Она вне hud-status, поэтому собственный live-регион нужен, чтобы изменение озвучивалось.
  const action = document.createElement('div');
  action.className = 'hud-action';
  action.hidden = true;
  action.setAttribute('role', 'status');
  action.setAttribute('aria-live', 'polite');
  root.appendChild(action);

  const list = document.createElement('ul');
  list.className = 'hud-keys';
  for (const hotkey of HOTKEYS) {
    const item = document.createElement('li');
    item.textContent = `${hotkey.key} — ${hotkey.description}`;
    list.appendChild(item);
  }
  root.appendChild(list);

  function render(): void {
    const state = ui.get();
    status.textContent =
      `Инструмент: ${TOOL_LABEL[state.tool]} · Радиус: ${state.brushRadius} · ` +
      `Сила: ${state.brushStrength} · Объектов: ${state.objectsCount} · ` +
      `Освещение: ${LIGHT_LABEL[state.lightMode]}`;

    action.hidden = state.lastAction === '';
    action.textContent = state.lastAction === '' ? '' : `Последнее действие: ${state.lastAction}`;
  }

  const unsubscribe = ui.subscribe(render);
  render();

  return {
    dispose(): void {
      unsubscribe();
      root.replaceChildren();
    },
  };
}
