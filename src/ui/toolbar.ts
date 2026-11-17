/** T003: панель инструментов. Реальных кистей здесь нет — это каркас, обработатели-заглушки. */

import type { ActionId, LightMode, ToolId, UiHandle } from '../core/state.js';

export interface ToolbarHandlers {
  /** Переключение режима редактирования (T008–T010 подключат кисти). */
  onTool(tool: ToolId): void;
  /** Действия без режима: сброс (T011), скриншот (T004). */
  onAction(action: ActionId): void;
  /** Смена освещения (T005). */
  onLight(next: LightMode): void;
}

const TOOL_BUTTONS: Array<{ id: ToolId; label: string }> = [
  { id: 'raise', label: 'Высота ↑' },
  { id: 'lower', label: 'Высота ↓' },
  { id: 'stone', label: 'Камень' },
  { id: 'earth', label: 'Земля' },
  { id: 'objects', label: 'Объекты' },
];

/** Подсветка активного инструмента берётся из палитры покрытий — новых цветов не появляется. */
const TOOL_COLOR: Record<ToolId, string> = {
  raise: '#63b56b',
  lower: '#4f9e57',
  stone: '#8f9aa3',
  earth: '#7a5c3a',
  objects: '#e8e3d8',
};

const ACTION_BUTTONS: Array<{ id: ActionId; label: string }> = [
  { id: 'reset', label: 'Сброс' },
  { id: 'screenshot', label: 'Скриншот' },
];

const LIGHT_LABEL: Record<LightMode, string> = {
  day: 'День',
  night: 'Ночь',
  auto: 'Авто',
};

/** Кнопка освещения циклична: день → ночь → авто → день. */
const LIGHT_CYCLE: Record<LightMode, LightMode> = { day: 'night', night: 'auto', auto: 'day' };

/** Построить панель кнопок. Единственная точка обновления — ui.subscribe(render). */
export function createToolbar(
  root: HTMLElement,
  ui: UiHandle,
  handlers: ToolbarHandlers,
): { dispose(): void } {
  // Идемпотентность: при HMR main.ts исполняется повторно, иначе здесь вырастет два тулбара.
  root.replaceChildren();
  // Панель — группа управляющих элементов: без role скринридер не покажет их как инструменты.
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', 'Инструменты');

  const toolButtons = TOOL_BUTTONS.map(({ id, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tool = id;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.style.setProperty('--tool-color', TOOL_COLOR[id]);
    root.appendChild(button);
    return button;
  });

  const separator = document.createElement('span');
  separator.className = 'toolbar-sep';
  separator.setAttribute('aria-hidden', 'true');
  root.appendChild(separator);

  const actionButtons = ACTION_BUTTONS.map(({ id, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = id;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    // aria-pressed не ставится: действия не являются переключателем режима.
    root.appendChild(button);
    return button;
  });

  const lightButton = document.createElement('button');
  lightButton.type = 'button';
  lightButton.dataset.action = 'light';
  root.appendChild(lightButton);

  /** Синхронизация подсветки и текста кнопки освещения с состоянием: расхождений быть не может. */
  function render(): void {
    const state = ui.get();

    for (const button of toolButtons) {
      const active = state.tool === button.dataset.tool;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    // Кнопка освещения — переключатель режима, поэтому aria-pressed у неё уместен.
    lightButton.textContent = LIGHT_LABEL[state.lightMode];
    lightButton.setAttribute('aria-label', `Освещение: ${LIGHT_LABEL[state.lightMode]}`);
    lightButton.setAttribute('aria-pressed', String(state.lightMode !== 'day'));
    lightButton.classList.toggle('is-active', state.lightMode !== 'day');
  }

  toolButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tool = button.dataset.tool as ToolId | undefined;
      if (tool === undefined) return;
      // Повторный клик по активному инструменту — no-op.
      if (ui.get().tool === tool) return;
      ui.set({ tool });
      handlers.onTool(tool);
    });
  });

  actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action as ActionId | undefined;
      if (action === undefined) return;
      ui.set({ lastAction: button.textContent ?? '' });
      handlers.onAction(action);
    });
  });

  lightButton.addEventListener('click', () => {
    const next = LIGHT_CYCLE[ui.get().lightMode];
    ui.set({ lightMode: next, lastAction: `Освещение: ${LIGHT_LABEL[next]}` });
    handlers.onLight(next);
  });

  const unsubscribe = ui.subscribe(render);
  render();

  return {
    dispose(): void {
      unsubscribe();
      root.replaceChildren();
    },
  };
}
