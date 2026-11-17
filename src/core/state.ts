/** T003: единое состояние UI. Здесь нет данных рельефа и объектов — их добавят T007/T012/T018. */

/** Режимы редактирования ландшафта: активен ровно один (конфликт режимов исключён enum'ом). */
export type ToolId = 'raise' | 'lower' | 'stone' | 'earth' | 'objects';

/** Режим освещения: 'auto' подключается в T005. */
export type LightMode = 'day' | 'night' | 'auto';

/** Действия без выбора режима (сброс, скриншот). */
export type ActionId = 'reset' | 'screenshot';

export interface UiState {
  /** Активный инструмент редактирования. */
  tool: ToolId;
  /** Радиус кисти, 2..20 (слайдер — в T008). */
  brushRadius: number;
  /** Сила кисти, 1..5 (T008). */
  brushStrength: number;
  /** Число объектов на сцене (0 до T012). */
  objectsCount: number;
  /** Текущий режим освещения. */
  lightMode: LightMode;
  /** Подпись последнего нажатия действия — для строки статуса. */
  lastAction: string;
}

export interface UiHandle {
  /** Копия состояния: наружу не отдаётся внутренняя ссылка, иначе HUD читала бы «грязные» данные. */
  get(): UiState;
  /** Применить часть состояния с клампами и уведомить подписчиков. */
  set(patch: Partial<UiState>): void;
  /** Подписаться на изменения; возвращает функцию отписки (используется в dispose()). */
  subscribe(listener: (state: UiState) => void): () => void;
}

const BRUSH_RADIUS_MIN = 2;
const BRUSH_RADIUS_MAX = 20;
const BRUSH_STRENGTH_MIN = 1;
const BRUSH_STRENGTH_MAX = 5;
/** Полный список режимов — нужен для валидации: `set({ tool: undefined })` не должен портить статус. */
const TOOL_IDS: readonly ToolId[] = ['raise', 'lower', 'stone', 'earth', 'objects'];

function clamp(value: number, min: number, max: number): number {
  // NaN проходит сквозь Math.min/max — заменяем его нижней границей, чтобы HUD не показала NaN.
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Собрать состояние с безопасными значениями по умолчанию. */
export function createUiState(initial?: Partial<UiState>): UiHandle {
  const state: UiState = {
    tool: 'raise',
    brushRadius: 6,
    brushStrength: 3,
    objectsCount: 0,
    lightMode: 'day',
    lastAction: '',
    ...initial,
  };

  const listeners = new Set<(state: UiState) => void>();

  /** Нормализация при записи: кламп нужен и для initial, чтобы set() не принимал мусор. */
  function normalize(): void {
    state.brushRadius = clamp(state.brushRadius, BRUSH_RADIUS_MIN, BRUSH_RADIUS_MAX);
    state.brushStrength = clamp(state.brushStrength, BRUSH_STRENGTH_MIN, BRUSH_STRENGTH_MAX);
    state.objectsCount = Number.isFinite(state.objectsCount) ? Math.max(0, Math.round(state.objectsCount)) : 0;
    state.lightMode = state.lightMode === 'night' || state.lightMode === 'auto' ? state.lightMode : 'day';
    // Неизвестный или отсутствующий инструмент возвращаем к дефолту, иначе HUD/подсветка «разъезжаются».
    if (!TOOL_IDS.includes(state.tool)) state.tool = 'raise';
    state.lastAction = state.lastAction ?? '';
  }

  normalize();

  return {
    get(): UiState {
      return { ...state };
    },

    set(patch: Partial<UiState>): void {
      // Пустой патч не должен шуметь подписчикам.
      if (Object.keys(patch).length === 0) return;
      Object.assign(state, patch);
      normalize();

      const snapshot = { ...state };
      for (const listener of listeners) listener(snapshot);
    },

    subscribe(listener: (state: UiState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
