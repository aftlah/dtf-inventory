// Menyiapkan foto absen di browser: dikecilkan lalu diubah jadi JPEG (foto penuh + pratinjau kecil) sebelum diunggah,
// supaya unggahannya kecil walau fotonya besar (foto kamera HP, screenshot PNG, dan sebagainya).

export type PreparedPhoto = {
  /** JPEG foto penuh, base64 tanpa awalan. */
  photo: string
  /** JPEG pratinjau kecil, base64 tanpa awalan. */
  thumb: string
  /** Data URL untuk pratinjau di dialog. */
  preview: string
}

const MAX_INPUT = 20 * 1024 * 1024
const THUMB_SIDE = 240
const FULL_TARGET = 450 * 1024 // server menerima sampai 600 KB
const FULL_HARD_LIMIT = 580 * 1024

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void }

async function decode(file: Blob): Promise<Decoded> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file)
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      // coba cara lain di bawah
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toJpeg(src: Decoded, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
  const w = Math.max(1, Math.round(src.width * scale))
  const h = Math.max(1, Math.round(src.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser ini tidak mendukung pengolahan foto.')
  ctx.fillStyle = '#ffffff' // PNG transparan jadi berlatar putih
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src.source, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal mengolah foto.'))), 'image/jpeg', quality),
  )
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('Gagal membaca foto.'))
    r.readAsDataURL(blob)
  })

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih berkas gambar (JPG atau PNG).')
  if (file.size > MAX_INPUT) throw new Error('Foto terlalu besar (maksimal 20 MB).')
  let img: Decoded
  try {
    img = await decode(file)
  } catch {
    throw new Error('Foto tidak bisa dibaca. Coba foto JPG atau PNG.')
  }
  try {
    let full = await toJpeg(img, 1280, 0.82)
    // Kecilkan bertahap bila masih besar (mis. foto sangat detail).
    for (const [side, quality] of [[1280, 0.7], [1024, 0.7], [900, 0.6], [720, 0.6]] as const) {
      if (full.size <= FULL_TARGET) break
      full = await toJpeg(img, side, quality)
    }
    if (full.size > FULL_HARD_LIMIT) throw new Error('Foto terlalu besar. Coba foto lain.')
    const thumb = await toJpeg(img, THUMB_SIDE, 0.7)
    const [photo, thumbB64] = await Promise.all([toBase64(full), toBase64(thumb)])
    return { photo, thumb: thumbB64, preview: `data:image/jpeg;base64,${photo}` }
  } finally {
    img.close()
  }
}
