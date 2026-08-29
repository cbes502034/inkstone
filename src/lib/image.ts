/**
 * 頭像上傳前的前處理 —— 在瀏覽器就壓好再送出。
 *
 * 這樣做的理由：使用者手機拍的照片動輒 4~8MB，直接上傳會拖慢流程、
 * 也吃掉免費方案的儲存空間；而且不同尺寸的頭像會讓版面忽大忽小。
 * 統一裁成正方形 512px、轉 WebP，通常能壓到 40KB 以內。
 */

const MAX_SIZE = 512
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export class ImageError extends Error {}

export async function prepareAvatar(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImageError('只接受 JPG、PNG、WebP 或 GIF 圖片')
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new ImageError('圖片太大了，請選 12MB 以內的')
  }

  const bitmap = await createImageBitmap(file)

  // 置中裁成正方形
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const out = Math.min(side, MAX_SIZE)

  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError('這個瀏覽器不支援圖片處理')

  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
  bitmap.close()

  return canvas.toDataURL('image/webp', 0.86)
}
