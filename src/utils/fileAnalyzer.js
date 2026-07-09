/**
 * FileSpia — Analizzatore di file.
 * Legge le proprietà tecniche usando esclusivamente API del browser:
 * File API, Canvas, AudioContext, HTMLVideoElement.
 */

import { parseEXIF } from './exifParser.js'

/**
 * Analizza un File e restituisce un oggetto con tutte le proprietà rilevate.
 * @param {File} file
 * @returns {Promise<Object>}
 */
export async function analyzeFile(file) {
  const general = {
    name: file.name,
    mimeType: file.type || inferMimeType(file.name),
    size: file.size,
    lastModified: file.lastModified,
    extension: getExtension(file.name),
  }

  const mime = general.mimeType
  const buffer = await file.arrayBuffer()

  let image = null
  let audio = null
  let video = null

  // Analisi immagine
  if (mime.startsWith('image/')) {
    image = await analyzeImage(file, buffer)
  }

  // Analisi audio
  if (mime.startsWith('audio/')) {
    audio = await analyzeAudio(file, buffer)
  }

  // Analisi video
  if (mime.startsWith('video/')) {
    video = await analyzeVideo(file, buffer)
  }

  return { general, image, audio, video }
}

// ─── Analisi Immagine ─────────────────────────────────────────────

async function analyzeImage(file, buffer) {
  const img = await loadImageFromFile(file)

  const result = {
    width: img.naturalWidth,
    height: img.naturalHeight,
    aspectRatio: calcAspectRatio(img.naturalWidth, img.naturalHeight),
    megapixels: ((img.naturalWidth * img.naturalHeight) / 1_000_000).toFixed(2),
  }

  // Tenta parsing EXIF per JPEG
  const isJPEG =
    file.type === 'image/jpeg' ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg')

  if (isJPEG) {
    try {
      const exif = parseEXIF(buffer)
      if (exif && Object.keys(exif).length > 0) {
        result.exif = exif
      }
    } catch (_) {
      // EXIF parsing fallito — non critico
    }
  }

  return result
}

// ─── Analisi Audio ────────────────────────────────────────────────

async function analyzeAudio(file, buffer) {
  const audioEl = await loadAudioFromFile(file)
  const duration = audioEl.duration

  const result = {
    duration,
    estimatedBitrate: duration > 0 ? Math.round((file.size * 8) / duration) : null,
  }

  // Prova a decodificare con AudioContext per sample rate e canali
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0))
    result.sampleRate = audioBuffer.sampleRate
    result.channels = audioBuffer.numberOfChannels
    result.length = audioBuffer.length
    await ctx.close()
  } catch (_) {
    // AudioContext non disponibile o formato non supportato
  }

  return result
}

// ─── Analisi Video ────────────────────────────────────────────────

async function analyzeVideo(file, buffer) {
  const videoEl = await loadVideoFromFile(file)
  const duration = videoEl.duration

  const result = {
    duration,
    width: videoEl.videoWidth || null,
    height: videoEl.videoHeight || null,
    aspectRatio: videoEl.videoWidth && videoEl.videoHeight
      ? calcAspectRatio(videoEl.videoWidth, videoEl.videoHeight)
      : null,
    estimatedBitrate: duration > 0 ? Math.round((file.size * 8) / duration) : null,
  }

  // Tenta di rilevare i codec dal file MP4 (box ftyp / moov)
  const codecInfo = detectCodecsFromBuffer(buffer, file.type)
  if (codecInfo) {
    result.videoCodec = codecInfo.videoCodec
    result.audioCodec = codecInfo.audioCodec
  }

  return result
}

// ─── Helper: caricamento elementi ─────────────────────────────────

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossibile caricare l\'immagine. Il file potrebbe essere corrotto.'))
    }
    img.src = url
  })
}

function loadAudioFromFile(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    const url = URL.createObjectURL(file)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(audio)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossibile leggere i metadati audio. Prova con un altro formato.'))
    }
    audio.src = url
  })
}

function loadVideoFromFile(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossibile leggere i metadati video. Prova con un altro formato.'))
    }
    video.src = url
  })
}

// ─── Helper: MIME e formato ───────────────────────────────────────

function inferMimeType(filename) {
  const ext = getExtension(filename).toLowerCase()
  const map = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'avif': 'image/avif',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'oga': 'audio/ogg',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'm4a': 'audio/mp4',
    'wma': 'audio/x-ms-wma',
    'mp4': 'video/mp4',
    'm4v': 'video/mp4',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'csv': 'text/csv',
  }
  return map[ext] || 'application/octet-stream'
}

function getExtension(filename) {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(i + 1) : ''
}

// ─── Helper: aspect ratio ────────────────────────────────────────

function calcAspectRatio(w, h) {
  if (!w || !h) return null
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
  const d = gcd(w, h)
  return `${w / d}:${h / d}`
}

// ─── Rilevamento codec da buffer binario (MP4/WebM) ──────────────

function detectCodecsFromBuffer(buffer, mimeType) {
  if (!buffer || buffer.byteLength < 32) return null

  const view = new DataView(buffer)
  const arr = new Uint8Array(buffer)

  // MP4: cerca il box 'ftyp'
  if (mimeType.startsWith('video/mp4') || mimeType.startsWith('audio/mp4')) {
    return detectMP4Codecs(arr)
  }

  // WebM: cerca il codec ID
  if (mimeType.startsWith('video/webm') || mimeType.startsWith('audio/webm')) {
    return detectWebMCodecs(arr)
  }

  return null
}

function detectMP4Codecs(arr) {
  // Cerca il box 'moov' che contiene 'trak' → 'mdia' → 'minf' → 'stbl' → 'stsd'
  // Semplificato: leggiamo il ftyp per il brand
  const ftypBrands = readFTYP(arr)
  let result = {}

  if (ftypBrands.length > 0) {
    const brand = ftypBrands[0]
    // Brand comuni
    const brandMap = {
      'avc1': 'AVC / H.264',
      'iso2': 'MP4 Base Media',
      'isom': 'MP4 Base Media',
      'mp41': 'MP4 v1',
      'mp42': 'MP4 v2',
      'av01': 'AV1',
      'hvc1': 'HEVC / H.265',
      'hev1': 'HEVC / H.265',
      '3gp4': '3GPP',
      '3gp5': '3GPP',
      'M4A ': 'MPEG-4 Audio',
      'M4V ': 'MPEG-4 Video',
      'qt  ': 'QuickTime',
    }
    const brandLabel = brandMap[brand]
    if (brandLabel) {
      if (brandLabel.includes('Audio')) result.audioCodec = brandLabel
      else result.videoCodec = brandLabel
    }
  }

  // Cerca 'avcC' per H.264 o 'hvcC' per H.265/HEVC
  const avcCIdx = findBytes(arr, [0x61, 0x76, 0x63, 0x43]) // 'avcC'
  if (avcCIdx >= 0) result.videoCodec = 'AVC / H.264'
  const hvcCIdx = findBytes(arr, [0x68, 0x76, 0x63, 0x43]) // 'hvcC'
  if (hvcCIdx >= 0) result.videoCodec = 'HEVC / H.265'

  // Cerca 'mp4a' per AAC audio
  const mp4aIdx = findBytes(arr, [0x6D, 0x70, 0x34, 0x61]) // 'mp4a'
  if (mp4aIdx >= 0) result.audioCodec = 'AAC'

  if (Object.keys(result).length === 0) return null
  return result
}

function detectWebMCodecs(arr) {
  let result = {}

  // WebM: cerca codec string nel segmento 'CodecID'
  // Cerca stringhe note
  if (findBytes(arr, [0x56, 0x5F, 0x56, 0x50, 0x38]) >= 0) { // 'V_VP8'
    result.videoCodec = 'VP8'
  }
  if (findBytes(arr, [0x56, 0x5F, 0x56, 0x50, 0x39]) >= 0) { // 'V_VP9'
    result.videoCodec = 'VP9'
  }
  if (findBytes(arr, [0x41, 0x5F, 0x56, 0x4F, 0x52, 0x42, 0x49, 0x53]) >= 0) { // 'A_VORBIS'
    result.audioCodec = 'Vorbis'
  }
  if (findBytes(arr, [0x41, 0x5F, 0x4F, 0x50, 0x55, 0x53]) >= 0) { // 'A_OPUS'
    result.audioCodec = 'Opus'
  }

  if (Object.keys(result).length === 0) return null
  return result
}

function readFTYP(arr) {
  // ftyp box: [4 byte size] [4 byte 'ftyp'] [4 byte major brand] [4 byte minor version] [n*4 byte compatible brands]
  const brands = []
  if (arr.length < 12) return brands
  if (arr[4] !== 0x66 || arr[5] !== 0x74 || arr[6] !== 0x79 || arr[7] !== 0x70) return brands // 'ftyp'
  // Major brand at offset 8
  const majorBrand = String.fromCharCode(arr[8], arr[9], arr[10], arr[11])
  brands.push(majorBrand)
  // Compatible brands
  const boxSize = (arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3]
  let pos = 16
  while (pos + 4 <= Math.min(boxSize, arr.length)) {
    brands.push(String.fromCharCode(arr[pos], arr[pos + 1], arr[pos + 2], arr[pos + 3]))
    pos += 4
  }
  return brands
}

function findBytes(haystack, needle) {
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let found = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { found = false; break }
    }
    if (found) return i
  }
  return -1
}
