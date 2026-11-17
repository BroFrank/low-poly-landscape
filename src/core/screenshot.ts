/** T004: снятие кадра сцены и сохранение его как PNG. Модуль не знает про UI и освещение. */

import type { SceneContext } from './scene.js';

/** Результат дискриминативным union: вызывающий однозначно выбирает ветку по `ok`. */
export type ScreenshotResult =
  | { ok: true; fileName: string; width: number; height: number }
  | { ok: false; message: string };

/** Имя файла без «:» — они недопустимы в именах на Windows. Время UTC (детерминированно). */
function buildFileName(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '');
  return `landscape-${stamp}.png`;
}

/**
 * Anchor должен быть в DOM: без добавления в document Firefox не запускает загрузку.
 * Data URL не требует освобождения, поэтому revokeObjectURL здесь не нужен.
 */
function downloadDataUrl(dataUrl: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Сохранить текущий вид камеры как PNG.
 * Render вызывается синхронно перед toDataURL: с preserveDrawingBuffer = false
 * (дефолт) буфер очищается при композитинге, поэтому «последний кадр из RAF»
 * не гарантирует читаемости.
 */
export function captureScreenshot(ctx: SceneContext): ScreenshotResult {
  const canvas = ctx.renderer.domElement;

  if (canvas.width < 1 || canvas.height < 1) {
    return { ok: false, message: 'окно слишком маленькое' };
  }

  let dataUrl: string;
  try {
    // render и toDataURL в одном try: render бросает «Context Lost» при потере WebGL-контекста.
    ctx.renderer.render(ctx.scene, ctx.camera);
    dataUrl = canvas.toDataURL('image/png');
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'снятие кадра не удалось' };
  }

  // Пустой canvas даёт «data:» — проверка защищает от записи пустого файла.
  if (dataUrl === 'data:,' || dataUrl.length < 30) {
    return { ok: false, message: 'пустой кадр' };
  }

  const fileName = buildFileName(new Date());
  downloadDataUrl(dataUrl, fileName);

  // canvas.width/height — реальные пиксели буфера (CSS-размер × pixelRatio),
  // renderer.getSize() возвращает CSS-единицы, которые не равны размеру PNG.
  return { ok: true, fileName, width: canvas.width, height: canvas.height };
}
