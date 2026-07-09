/**
 * FileSpia — Parser EXIF binario per file JPEG.
 * Estrae i metadati EXIF di base direttamente dai byte del file,
 * senza API esterne. Supporta entrambi gli ordinamenti (little/big endian).
 */

// Tag TIFF principali (IFD0)
const IFD0_TAGS = {
  0x010F: { name: 'make', type: 'string' },
  0x0110: { name: 'model', type: 'string' },
  0x0112: { name: 'orientation', type: 'short' },
  0x0131: { name: 'software', type: 'string' },
  0x0132: { name: 'dateTime', type: 'string' },
  0x013B: { name: 'artist', type: 'string' },
  0x0213: { name: 'ycbrPositioning', type: 'short' },
  0x8298: { name: 'copyright', type: 'string' },
  0x8769: { name: 'exifIFDPointer', type: 'long' },
  0x8825: { name: 'gpsIFDPointer', type: 'long' },
}

// Tag EXIF SubIFD
const EXIF_SUBIFD_TAGS = {
  0x829A: { name: 'exposureTime', type: 'rational' },
  0x829D: { name: 'fNumber', type: 'rational' },
  0x8822: { name: 'exposureProgram', type: 'short' },
  0x8827: { name: 'iso', type: 'short' },
  0x9003: { name: 'dateTimeOriginal', type: 'string' },
  0x9004: { name: 'dateTimeDigitized', type: 'string' },
  0x9201: { name: 'shutterSpeedValue', type: 'srational' },
  0x9202: { name: 'apertureValue', type: 'rational' },
  0x9204: { name: 'exposureBiasValue', type: 'srational' },
  0x9207: { name: 'meteringMode', type: 'short' },
  0x9209: { name: 'flash', type: 'short' },
  0x920A: { name: 'focalLength', type: 'rational' },
  0xA002: { name: 'pixelXDimension', type: 'long' },
  0xA003: { name: 'pixelYDimension', type: 'long' },
  0xA420: { name: 'imageUniqueID', type: 'string' },
}

// Orientamento EXIF → descrizione leggibile
const ORIENTATION_LABELS = {
  1: 'Normale (0°)',
  2: 'Ribaltato orizzontalmente',
  3: 'Ruotato di 180°',
  4: 'Ribaltato verticalmente',
  5: 'Ruotato di 90° in senso orario e ribaltato',
  6: 'Ruotato di 90° in senso orario',
  7: 'Ruotato di 90° in senso antiorario e ribaltato',
  8: 'Ruotato di 90° in senso antiorario',
}

/**
 * entry point: riceve l'ArrayBuffer del file JPEG e restituisce
 * un oggetto con i metadati EXIF trovati, oppure null.
 */
export function parseEXIF(buffer) {
  if (!buffer || buffer.byteLength < 4) return null
  const view = new DataView(buffer)

  // SOI marker (FF D8)
  if (view.getUint16(0, false) !== 0xFFD8) return null

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false)

    // SOS marker — fine delle sezioni di metadati
    if (marker === 0xFFDA) break

    // Lunghezza del segmento (include i 2 byte della lunghezza stessa)
    const segLength = view.getUint16(offset + 2, false)

    // APP1 (EXIF)
    if (marker === 0xFFE1) {
      const exifOffset = offset + 4
      if (exifOffset + 6 > view.byteLength) break
      // Verifica identificatore "Exif\0\0" direttamente sui byte
      const exifId = new Uint8Array(buffer, exifOffset, 6)
      if (exifId[0] === 0x45 && exifId[1] === 0x78 && exifId[2] === 0x69 &&
          exifId[3] === 0x66 && exifId[4] === 0x00 && exifId[5] === 0x00) {
        return parseTIFF(buffer, exifOffset + 6)
      }
    }

    offset += 2 + segLength
  }

  return null
}

// ─── Funzioni helper condivise ────────────────────────────────────

function readString(buffer, offset, maxLen) {
  const arr = new Uint8Array(buffer, offset, Math.min(maxLen, buffer.byteLength - offset))
  let end = arr.indexOf(0)
  if (end === -1) end = arr.length
  return new TextDecoder('utf-8').decode(arr.slice(0, end)).trim()
}

function readGPSRationals(buffer, offset, le, count) {
  const view = new DataView(buffer)
  const r32 = (o) => view.getUint32(o, le)
  const parts = []
  for (let i = 0; i < Math.min(count, 3); i++) {
    const o = offset + i * 8
    if (o + 8 <= view.byteLength) {
      const num = r32(o)
      const den = r32(o + 4)
      parts.push(den !== 0 ? num / den : 0)
    }
  }
  return parts
}

function parseTIFF(buffer, tiffStart) {
  const view = new DataView(buffer)

  if (tiffStart + 8 > view.byteLength) return null

  // Byte order
  const bom = view.getUint16(tiffStart, false)
  let le
  if (bom === 0x4949) le = true       // "II" Intel
  else if (bom === 0x4D4D) le = false // "MM" Motorola
  else return null

  const r16 = (o) => view.getUint16(o, le)
  const r32 = (o) => view.getUint32(o, le)

  // Magic 42
  if (r16(tiffStart + 2) !== 0x002A) return null

  // Offset primo IFD
  let ifdOffset = tiffStart + r32(tiffStart + 4)
  if (ifdOffset < 8) ifdOffset = tiffStart + ifdOffset

  const result = {}

  // IFD0
  const ifd0Result = parseIFD(buffer, ifdOffset, le, IFD0_TAGS, tiffStart)
  Object.assign(result, ifd0Result)

  // SubIFD EXIF
  if (result.exifIFDPointer !== undefined) {
    let subOffset = tiffStart + result.exifIFDPointer
    if (subOffset < tiffStart) subOffset = result.exifIFDPointer
    const subResult = parseIFD(buffer, subOffset, le, EXIF_SUBIFD_TAGS, tiffStart)
    Object.assign(result, subResult)
    delete result.exifIFDPointer
  }

  // GPS IFD
  if (result.gpsIFDPointer !== undefined) {
    let gpsOffset = tiffStart + result.gpsIFDPointer
    if (gpsOffset < tiffStart) gpsOffset = result.gpsIFDPointer
    const gpsResult = parseGPSIFD(buffer, gpsOffset, le, tiffStart)
    if (gpsResult) result.gps = gpsResult
    delete result.gpsIFDPointer
  }

  return formatEXIFResult(result)
}

function parseIFD(buffer, offset, le, tagMap, tiffStart) {
  const view = new DataView(buffer)
  const r16 = (o) => view.getUint16(o, le)
  const r32 = (o) => view.getUint32(o, le)

  if (offset + 2 > view.byteLength) return {}
  const entryCount = r16(offset)
  offset += 2

  const result = {}

  for (let i = 0; i < entryCount; i++) {
    if (offset + 12 > view.byteLength) break
    const tag = r16(offset)
    const type = r16(offset + 2)
    const count = r32(offset + 4)
    const valueOffset = offset + 8

    const tagDef = tagMap[tag]
    if (!tagDef) {
      offset += 12
      continue
    }

    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }
    const typeSize = typeSizes[type] || 1
    const totalSize = count * typeSize

    let rawValue
    if (totalSize <= 4) {
      rawValue = valueOffset
    } else {
      rawValue = tiffStart + r32(valueOffset)
      if (rawValue < tiffStart) rawValue = r32(valueOffset)
    }

    try {
      switch (tagDef.type) {
        case 'string': {
          const maxLen = Math.min(totalSize, 256)
          result[tagDef.name] = readString(buffer, rawValue, maxLen)
          break
        }
        case 'short': {
          result[tagDef.name] = r16(rawValue)
          break
        }
        case 'long': {
          result[tagDef.name] = r32(rawValue)
          break
        }
        case 'rational': {
          if (rawValue + 8 <= view.byteLength) {
            const num = r32(rawValue)
            const den = r32(rawValue + 4)
            result[tagDef.name] = den !== 0 ? num / den : null
          }
          break
        }
        case 'srational': {
          if (rawValue + 8 <= view.byteLength) {
            const num = view.getInt32(rawValue, le)
            const den = view.getInt32(rawValue + 4, le)
            result[tagDef.name] = den !== 0 ? num / den : null
          }
          break
        }
      }
    } catch (_) {
      // tag illeggibile, salta
    }

    offset += 12
  }

  return result
}

function parseGPSIFD(buffer, offset, le, tiffStart) {
  const view = new DataView(buffer)
  const r16 = (o) => view.getUint16(o, le)
  const r32 = (o) => view.getUint32(o, le)

  if (offset + 2 > view.byteLength) return null
  const entryCount = r16(offset)
  offset += 2

  const gps = {}

  for (let i = 0; i < entryCount; i++) {
    if (offset + 12 > view.byteLength) break
    const tag = r16(offset)
    const type = r16(offset + 2)
    const count = r32(offset + 4)
    const valueOffset = offset + 8

    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 }
    const typeSize = typeSizes[type] || 1
    const totalSize = count * typeSize
    let rawValue = totalSize <= 4 ? valueOffset : tiffStart + r32(valueOffset)
    if (rawValue < tiffStart) rawValue = r32(valueOffset)

    try {
      if (tag === 1) {
        gps.latitudeRef = readString(buffer, rawValue, 2)
      } else if (tag === 2) {
        gps.latitude = readGPSRationals(buffer, rawValue, le, count)
      } else if (tag === 3) {
        gps.longitudeRef = readString(buffer, rawValue, 2)
      } else if (tag === 4) {
        gps.longitude = readGPSRationals(buffer, rawValue, le, count)
      } else if (tag === 5) {
        gps.altitudeRef = r16(rawValue) === 0 ? 'Sopra il livello del mare' : 'Sotto il livello del mare'
      } else if (tag === 6) {
        if (rawValue + 8 <= view.byteLength) {
          const num = r32(rawValue)
          const den = r32(rawValue + 4)
          gps.altitude = den !== 0 ? num / den : null
        }
      }
    } catch (_) {}

    offset += 12
  }

  return gps
}

function formatEXIFResult(raw) {
  const result = {}

  // Camera
  if (raw.make) result.cameraMake = raw.make
  if (raw.model) result.cameraModel = raw.model

  // Orientation
  if (raw.orientation !== undefined) {
    result.orientation = raw.orientation
    result.orientationLabel = ORIENTATION_LABELS[raw.orientation] || `Sconosciuto (${raw.orientation})`
  }

  // Date
  if (raw.dateTimeOriginal) result.dateTaken = raw.dateTimeOriginal
  else if (raw.dateTimeDigitized) result.dateTaken = raw.dateTimeDigitized
  else if (raw.dateTime) result.dateTaken = raw.dateTime

  // Software
  if (raw.software) result.software = raw.software

  // Copyright / Artist
  if (raw.artist) result.artist = raw.artist
  if (raw.copyright) result.copyright = raw.copyright

  // Exposure
  if (raw.exposureTime !== undefined && raw.exposureTime !== null) {
    if (raw.exposureTime >= 1) {
      result.exposureTime = `${raw.exposureTime.toFixed(1)}s`
    } else {
      const denom = Math.round(1 / raw.exposureTime)
      result.exposureTime = `1/${denom}s`
    }
  }
  if (raw.fNumber !== undefined && raw.fNumber !== null) {
    result.fNumber = `f/${raw.fNumber.toFixed(1)}`
  }
  if (raw.iso !== undefined) result.iso = raw.iso
  if (raw.focalLength !== undefined && raw.focalLength !== null) {
    result.focalLength = `${raw.focalLength.toFixed(0)}mm`
  }
  if (raw.exposureBiasValue !== undefined && raw.exposureBiasValue !== null) {
    result.exposureBias = `${raw.exposureBiasValue > 0 ? '+' : ''}${raw.exposureBiasValue.toFixed(1)} EV`
  }
  if (raw.flash !== undefined) {
    const flashMap = {
      0x00: 'Flash non attivato',
      0x01: 'Flash attivato',
      0x05: 'Flash non attivato (ritorno rilevato)',
      0x07: 'Flash attivato (ritorno rilevato)',
      0x09: 'Flash attivato (obbligatorio)',
      0x0D: 'Flash attivato (obbligatorio, ritorno rilevato)',
      0x0F: 'Flash attivato (obbligatorio, ritorno rilevato)',
      0x10: 'Flash non attivato (obbligatorio)',
      0x18: 'Flash non attivato (auto)',
      0x19: 'Flash attivato (auto)',
      0x1D: 'Flash attivato (auto, ritorno rilevato)',
      0x1F: 'Flash attivato (auto, ritorno rilevato)',
      0x20: 'Nessuna funzione flash',
      0x41: 'Flash attivato (riduzione occhi rossi)',
      0x45: 'Flash attivato (riduzione occhi rossi, ritorno rilevato)',
      0x49: 'Flash attivato (obbligatorio, riduzione occhi rossi)',
      0x4D: 'Flash attivato (obbligatorio, riduzione occhi rossi, ritorno rilevato)',
      0x59: 'Flash attivato (auto, riduzione occhi rossi)',
      0x5D: 'Flash attivato (auto, riduzione occhi rossi, ritorno rilevato)',
    }
    result.flash = flashMap[raw.flash] || `Modalità ${raw.flash}`
  }

  // Metering mode
  if (raw.meteringMode !== undefined) {
    const meteringMap = {
      0: 'Sconosciuto', 1: 'Media', 2: 'Media pesata al centro',
      3: 'Spot', 4: 'Multi-spot', 5: 'Multi-segmento',
      6: 'Parziale', 255: 'Altro',
    }
    result.meteringMode = meteringMap[raw.meteringMode] || `Modalità ${raw.meteringMode}`
  }

  // Exposure program
  if (raw.exposureProgram !== undefined) {
    const progMap = {
      0: 'Non definito', 1: 'Manuale', 2: 'Programma normale',
      3: 'Priorità di apertura', 4: 'Priorità di otturatore',
      5: 'Programma creativo', 6: 'Programma azione',
      7: 'Ritratto', 8: 'Paesaggio',
    }
    result.exposureProgram = progMap[raw.exposureProgram] || `Programma ${raw.exposureProgram}`
  }

  // Pixel dimensions from EXIF
  if (raw.pixelXDimension) result.exifWidth = raw.pixelXDimension
  if (raw.pixelYDimension) result.exifHeight = raw.pixelYDimension

  // Image unique ID
  if (raw.imageUniqueID) result.imageUniqueID = raw.imageUniqueID

  // GPS
  if (raw.gps) result.gps = raw.gps

  return result
}
