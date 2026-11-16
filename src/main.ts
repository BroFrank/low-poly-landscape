/** T001: каркас проекта. Сцена и камера — T002. */

const canvas = document.getElementById('scene');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Не найден элемент canvas#scene');
}

/** Пересчитывать размер холста под окно с учётом плотности пикселей. */
function resizeCanvas(element: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  element.width = Math.floor(element.clientWidth * dpr);
  element.height = Math.floor(element.clientHeight * dpr);
}

window.addEventListener('resize', () => resizeCanvas(canvas));
resizeCanvas(canvas);
