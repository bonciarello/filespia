/**
 * Test suite per le utility di FileSpia.
 * Testa il parser EXIF e le funzioni helper di analisi file.
 * I test di caricamento media (Image/Audio/Video) richiedono
 * un browser reale e sono verificati manualmente.
 */

import { describe, it, expect } from 'vitest'
import { parseEXIF } from '../src/utils/exifParser.js'

// ─── Helper ────────────────────────────────────────────────────────
function makeMockFile(name, type, size, content = null) {
  const blob = content instanceof ArrayBuffer
    ? new Blob([content], { type })
    : new Blob([new ArrayBuffer(size)], { type })
  return new File([blob], name, { type, lastModified: Date.now() })
}

// ─── EXIF Parser ──────────────────────────────────────────────────

describe('parseEXIF', () => {
  it('restituisce null per buffer vuoto', () => {
    expect(parseEXIF(null)).toBeNull()
    expect(parseEXIF(new ArrayBuffer(0))).toBeNull()
  })

  it('restituisce null per buffer senza SOI JPEG', () => {
    const buf = new ArrayBuffer(10)
    const view = new DataView(buf)
    view.setUint8(0, 0x00)
    expect(parseEXIF(buf)).toBeNull()
  })

  it('restituisce null per JPEG senza APP1', () => {
    const buf = new ArrayBuffer(20)
    const view = new DataView(buf)
    view.setUint16(0, 0xFFD8, false)
    view.setUint16(2, 0xFFDA, false)
    expect(parseEXIF(buf)).toBeNull()
  })

  it('salta APP1 senza identificatore Exif valido', () => {
    const buf = new ArrayBuffer(64)
    const view = new DataView(buf)
    view.setUint16(0, 0xFFD8, false)  // SOI
    view.setUint16(2, 0xFFE1, false)  // APP1
    view.setUint16(4, 14, false)      // length
    for (let i = 0; i < 6; i++) view.setUint8(6 + i, 0x58) // 'XXXXXX'
    expect(parseEXIF(buf)).toBeNull()
  })

  it('legge EXIF di base da un JPEG con TIFF little-endian valido', () => {
    // Costruisce un JPEG con APP1 contenente dati TIFF minimi ma validi
    const tiffData = buildMinimalTIFF({ make: 'Canon', model: 'EOS 5D' })
    const buf = buildJPEGWithEXIF(tiffData)
    const result = parseEXIF(buf)

    expect(result).not.toBeNull()
    expect(result.cameraMake).toBe('Canon')
    expect(result.cameraModel).toBe('EOS 5D')
  })

  it('legge EXIF con orientamento e data scatto', () => {
    const tiffData = buildMinimalTIFF({
      orientation: 6,
      dateTime: '2024:06:15 14:30:00',
      make: 'Apple',
      model: 'iPhone 15',
    })
    const buf = buildJPEGWithEXIF(tiffData)
    const result = parseEXIF(buf)

    expect(result).not.toBeNull()
    expect(result.orientation).toBe(6)
    expect(result.orientationLabel).toContain('90°')
    expect(result.dateTaken).toBe('2024:06:15 14:30:00')
    expect(result.cameraMake).toBe('Apple')
    expect(result.cameraModel).toBe('iPhone 15')
  })

  it('legge EXIF con dati esposizione', () => {
    const tiffData = buildMinimalTIFF({
      exposureTime: 1 / 125,
      fNumber: 5.6,
      iso: 400,
      focalLength: 50,
    })
    const buf = buildJPEGWithEXIF(tiffData)
    const result = parseEXIF(buf)

    expect(result).not.toBeNull()
    expect(result.exposureTime).toBe('1/125s')
    expect(result.fNumber).toBe('f/5.6')
    expect(result.iso).toBe(400)
    expect(result.focalLength).toBe('50mm')
  })
})

// ─── Funzioni helper (testate via import) ─────────────────────────

describe('fileAnalyzer utility functions', () => {
  it('analizza le proprietà generali di un PDF senza media', async () => {
    const { analyzeFile } = await import('../src/utils/fileAnalyzer.js')
    const file = makeMockFile('relazione.pdf', 'application/pdf', 78432)
    const result = await analyzeFile(file)

    expect(result.general.name).toBe('relazione.pdf')
    expect(result.general.mimeType).toBe('application/pdf')
    expect(result.general.size).toBe(78432)
    expect(result.general.extension).toBe('pdf')
    expect(result.general.lastModified).toBeGreaterThan(0)
    expect(result.image).toBeNull()
    expect(result.audio).toBeNull()
    expect(result.video).toBeNull()
  })

  it('inferisce il MIME type quando file.type è vuoto', async () => {
    const { analyzeFile } = await import('../src/utils/fileAnalyzer.js')
    const cases = [
      ['doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['archivio.zip', 'application/zip'],
      ['testo.txt', 'text/plain'],
      ['foglio.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['dati.csv', 'text/csv'],
      ['config.json', 'application/json'],
      ['pagina.html', 'text/html'],
      ['stile.css', 'text/css'],
    ]
    for (const [name, expected] of cases) {
      const file = makeMockFile(name, '', 100)
      const result = await analyzeFile(file)
      expect(result.general.mimeType).toBe(expected)
    }
  })

  it('gestisce file senza estensione', async () => {
    const { analyzeFile } = await import('../src/utils/fileAnalyzer.js')
    const file = makeMockFile('senzaestensione', '', 256)
    const result = await analyzeFile(file)
    expect(result.general.extension).toBe('')
    expect(result.general.mimeType).toBe('application/octet-stream')
  })

  it('distingue correttamente le categorie MIME', async () => {
    const { analyzeFile } = await import('../src/utils/fileAnalyzer.js')
    // PDF — non media
    const pdf = makeMockFile('doc.pdf', 'application/pdf', 1000)
    const pdfResult = await analyzeFile(pdf)
    expect(pdfResult.general.mimeType).toBe('application/pdf')
    expect(pdfResult.image).toBeNull()
    expect(pdfResult.audio).toBeNull()
    expect(pdfResult.video).toBeNull()
  })
})

// ─── EXIF builder helpers per i test ───────────────────────────────

// Tag che appartengono all'IFD0
const IFD0_TAG_DEFS = {
  make:           { tag: 0x010F, type: 'string' },
  model:          { tag: 0x0110, type: 'string' },
  orientation:    { tag: 0x0112, type: 'short' },
  dateTime:       { tag: 0x0132, type: 'string' },
  software:       { tag: 0x0131, type: 'string' },
}

// Tag che appartengono al SubIFD EXIF (puntato da 0x8769)
const SUBIFD_TAG_DEFS = {
  exposureTime:     { tag: 0x829A, type: 'rational' },
  fNumber:          { tag: 0x829D, type: 'rational' },
  iso:              { tag: 0x8827, type: 'short' },
  focalLength:      { tag: 0x920A, type: 'rational' },
  dateTimeOriginal: { tag: 0x9003, type: 'string' },
}

function makeEntry(tag, type, value) {
  if (type === 'string') {
    return { tag, type: 2, count: value.length + 1, isString: true, strValue: value, valueOffset: 0 }
  } else if (type === 'short') {
    return { tag, type: 3, count: 1, isInline: true, inlineValue: value }
  } else if (type === 'rational') {
    // Riceve valore numerico (es. 0.008 per 1/125)
    // Troviamo num/den approssimati
    let num, den
    if (value < 1 && value > 0) {
      den = Math.round(1 / value)
      num = 1
    } else {
      num = Math.round(value * 100)
      den = 100
    }
    return { tag, type: 5, count: 1, isRational: true, num, den, valueOffset: 0 }
  } else if (type === 'long') {
    return { tag, type: 4, count: 1, isInline: true, inlineValue: value }
  }
  return null
}

/**
 * Costruisce un buffer TIFF con IFD0 e opzionale SubIFD EXIF.
 * I tag vengono automaticamente smistati: quelli in IFD0_TAG_DEFS vanno
 * nell'IFD0, quelli in SUBIFD_TAG_DEFS generano un SubIFD con puntatore.
 */
function buildMinimalTIFF(tags) {
  const ifd0Entries = []
  const subEntries = []
  let hasSubIFD = false

  for (const [key, value] of Object.entries(tags)) {
    const def0 = IFD0_TAG_DEFS[key]
    if (def0) {
      const e = makeEntry(def0.tag, def0.type, value)
      if (e) ifd0Entries.push(e)
      continue
    }
    const defSub = SUBIFD_TAG_DEFS[key]
    if (defSub) {
      const e = makeEntry(defSub.tag, defSub.type, value)
      if (e) { subEntries.push(e); hasSubIFD = true }
    }
  }

  // Se ci sono tag SubIFD, aggiungi puntatore EXIF IFD (0x8769) all'IFD0
  if (hasSubIFD) {
    ifd0Entries.push({ tag: 0x8769, type: 4, count: 1, isInline: true, inlineValue: 0, isPointer: true })
  }

  const HEADER = 8
  const ifd0Count = ifd0Entries.length
  const ifd0Body = 2 + ifd0Count * 12 + 4
  const subIfdCount = subEntries.length
  const subIfdBody = hasSubIFD ? (2 + subIfdCount * 12 + 4) : 0

  // Data region dopo entrambi gli IFD
  let dataOffset = HEADER + ifd0Body + subIfdBody

  // Assegna offset a stringhe e rationals
  const allDataEntries = [...ifd0Entries, ...subEntries]
  for (const e of allDataEntries) {
    if (e.isString || e.isRational) {
      e.valueOffset = dataOffset
      dataOffset += e.isString ? (e.strValue.length + 1) : 8
    }
  }

  // Aggiorna il puntatore SubIFD con l'offset corretto
  if (hasSubIFD) {
    const ptr = ifd0Entries.find(e => e.isPointer)
    if (ptr) ptr.inlineValue = HEADER + ifd0Body
  }

  const totalSize = dataOffset
  const buf = new ArrayBuffer(totalSize)
  const v = new DataView(buf)

  v.setUint8(0, 0x49); v.setUint8(1, 0x49)
  v.setUint16(2, 0x002A, true)
  v.setUint32(4, 0x00000008, true)

  // Scrivi IFD ricorsivamente
  function writeIFD(entries, offset) {
    let p = offset
    v.setUint16(p, entries.length, true); p += 2
    for (const e of entries) {
      v.setUint16(p, e.tag, true)
      v.setUint16(p + 2, e.type, true)
      v.setUint32(p + 4, e.count, true)
      if (e.isString || e.isRational) {
        v.setUint32(p + 8, e.valueOffset, true)
      } else if (e.isInline) {
        if (e.type === 3) v.setUint16(p + 8, e.inlineValue, true)
        else v.setUint32(p + 8, e.inlineValue, true)
      }
      p += 12
    }
    v.setUint32(p, 0x00000000, true); p += 4
    return p
  }

  let pos = 8
  pos = writeIFD(ifd0Entries, pos)
  if (hasSubIFD) pos = writeIFD(subEntries, pos)

  // Scrivi dati (stringhe e rationals)
  for (const e of allDataEntries) {
    if (e.isString) {
      for (let i = 0; i < e.strValue.length; i++) v.setUint8(pos + i, e.strValue.charCodeAt(i))
      v.setUint8(pos + e.strValue.length, 0x00)
      pos += e.strValue.length + 1
    } else if (e.isRational) {
      v.setUint32(pos, e.num, true)
      v.setUint32(pos + 4, e.den, true)
      pos += 8
    }
  }

  return buf
}

/**
 * Costruisce un buffer JPEG con APP1 contenente i dati TIFF forniti.
 */
function buildJPEGWithEXIF(tiffBuffer) {
  const tiffArr = new Uint8Array(tiffBuffer)
  const app1Payload = 6 + tiffArr.length
  const app1Length = 2 + app1Payload
  const totalSize = 2 + 2 + app1Length
  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const arr = new Uint8Array(buf)

  view.setUint16(0, 0xFFD8, false)
  view.setUint16(2, 0xFFE1, false)
  view.setUint16(4, app1Length, false)
  arr[6] = 0x45; arr[7] = 0x78; arr[8] = 0x69; arr[9] = 0x66
  arr[10] = 0x00; arr[11] = 0x00
  arr.set(tiffArr, 12)

  return buf
}
