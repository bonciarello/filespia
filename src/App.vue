<script setup>
import { ref, computed } from 'vue'
import { analyzeFile } from './utils/fileAnalyzer.js'

// ─── Stato ──────────────────────────────────────────────────────────
const file = ref(null)
const analysis = ref(null)
const activeTab = ref('general')
const isDragging = ref(false)
const isLoading = ref(false)
const error = ref(null)

// ─── Tab disponibili ────────────────────────────────────────────────
const tabs = computed(() => {
  if (!analysis.value) return []
  const a = analysis.value
  const list = [{ id: 'general', label: 'Generale', icon: 'doc' }]
  if (a.image) list.push({ id: 'image', label: 'Immagine', icon: 'img' })
  if (a.audio) list.push({ id: 'audio', label: 'Audio', icon: 'audio' })
  if (a.video) list.push({ id: 'video', label: 'Video', icon: 'video' })
  return list
})

// ─── Categoria del file ─────────────────────────────────────────────
const fileCategory = computed(() => {
  if (!analysis.value) return null
  if (analysis.value.image) return 'Immagine'
  if (analysis.value.audio) return 'Audio'
  if (analysis.value.video) return 'Video'
  const ext = analysis.value.general.extension.toLowerCase()
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'Documento'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'Archivio'
  return 'File'
})

// ─── Gestione file ──────────────────────────────────────────────────
async function handleFile(inputFile) {
  error.value = null
  isLoading.value = true
  file.value = inputFile
  try {
    analysis.value = await analyzeFile(inputFile)
    // Attiva la tab più pertinente
    if (analysis.value.image) activeTab.value = 'image'
    else if (analysis.value.audio) activeTab.value = 'audio'
    else if (analysis.value.video) activeTab.value = 'video'
    else activeTab.value = 'general'
  } catch (e) {
    error.value = e.message || 'Errore durante l\'analisi del file.'
    analysis.value = null
  } finally {
    isLoading.value = false
  }
}

function onDragEnter(e) {
  e.preventDefault()
  isDragging.value = true
}

function onDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e) {
  e.preventDefault()
  isDragging.value = false
}

function onDrop(e) {
  e.preventDefault()
  isDragging.value = false
  const droppedFile = e.dataTransfer?.files?.[0]
  if (droppedFile) handleFile(droppedFile)
}

function onInputChange(e) {
  const selected = e.target?.files?.[0]
  if (selected) handleFile(selected)
}

function resetAnalysis() {
  file.value = null
  analysis.value = null
  error.value = null
  activeTab.value = 'general'
}

// ─── Formattazione ──────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleDateString('it-IT', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 100)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

function formatBitrate(bps) {
  if (!bps) return '—'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} kbps`
  return `${bps} bps`
}

function formatSampleRate(hz) {
  if (!hz) return '—'
  return `${(hz / 1000).toFixed(1)} kHz`
}

function formatChannels(n) {
  if (n == null) return '—'
  if (n === 1) return 'Mono (1 canale)'
  if (n === 2) return 'Stereo (2 canali)'
  return `${n} canali`
}
</script>

<template>
  <div class="app" :class="{ 'has-results': analysis }">
    <!-- ─── Header ──────────────────────────────────────────────── -->
    <header class="header">
      <div class="header-inner">
        <div class="logo" @click="resetAnalysis" role="button" tabindex="0" aria-label="FileSpia — torna alla schermata iniziale">
          <svg class="logo-icon" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <circle cx="13" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.5" />
            <line x1="19" y1="19" x2="27" y2="27" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="13" cy="13" r="3" fill="currentColor" opacity="0.2" />
          </svg>
          <span class="logo-text">FileSpia</span>
        </div>
        <p class="tagline">Scopri cosa c'è dentro ogni file. Gratis, senza inviare dati.</p>
      </div>
    </header>

    <!-- ─── Main ────────────────────────────────────────────────── -->
    <main class="main">
      <!-- Drop Zone -->
      <section
        v-if="!analysis && !isLoading"
        class="dropzone"
        :class="{ 'dropzone--active': isDragging }"
        @dragenter="onDragEnter"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        aria-label="Zona di caricamento file"
      >
        <input
          id="file-input"
          type="file"
          class="dropzone__input"
          @change="onInputChange"
          aria-hidden="true"
        />
        <label for="file-input" class="dropzone__label">
          <div class="dropzone__icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="48" height="48">
              <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="2.5" />
              <line x1="30" y1="30" x2="42" y2="42" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              <circle cx="20" cy="20" r="5" fill="currentColor" opacity="0.15" />
              <line x1="20" y1="7" x2="20" y2="33" stroke="currentColor" stroke-width="1.5" opacity="0.3"
                class="dropzone__scan-line" />
            </svg>
          </div>
          <p class="dropzone__title">Trascina qui il tuo file</p>
          <p class="dropzone__subtitle">oppure <span class="dropzone__link">clicca per selezionarlo</span></p>
          <p class="dropzone__hint">Immagini, audio, video, documenti — qualsiasi formato</p>
        </label>
      </section>

      <!-- Loading -->
      <section v-if="isLoading" class="loading" aria-live="polite" aria-label="Analisi in corso">
        <div class="loading__spinner" aria-hidden="true"></div>
        <p class="loading__text">Analisi forense in corso…</p>
        <p class="loading__file">{{ file?.name }}</p>
      </section>

      <!-- Errore -->
      <section v-if="error" class="error" role="alert">
        <div class="error__card">
          <svg class="error__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
            <line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <p class="error__text">{{ error }}</p>
          <button class="error__retry" @click="error = null; file = null">Riprova</button>
        </div>
      </section>

      <!-- Results -->
      <section v-if="analysis && !isLoading" class="results" aria-label="Risultati dell'analisi">
        <!-- File info bar -->
        <div class="results__header">
          <div class="results__file-info">
            <span class="results__category">{{ fileCategory }}</span>
            <h2 class="results__filename">{{ analysis.general.name }}</h2>
          </div>
          <button class="results__new" @click="resetAnalysis" aria-label="Analizza un nuovo file">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Nuovo file
          </button>
        </div>

        <!-- Tabs -->
        <div class="tabs" role="tablist" :aria-label="'Categorie di analisi per ' + analysis.general.name">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="'panel-' + tab.id"
            :id="'tab-' + tab.id"
            :class="['tabs__btn', { 'tabs__btn--active': activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            <!-- icon -->
            <svg v-if="tab.icon === 'doc'" class="tabs__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="2" />
              <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="2" />
              <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" />
              <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" />
            </svg>
            <svg v-else-if="tab.icon === 'img'" class="tabs__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <polyline points="21 15 16 10 5 21" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
            <svg v-else-if="tab.icon === 'audio'" class="tabs__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="2" />
              <circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2" />
              <circle cx="18" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
            <svg v-else-if="tab.icon === 'video'" class="tabs__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <polygon points="23 7 16 12 23 17 23 7" fill="none" stroke="currentColor" stroke-width="2" />
              <rect x="1" y="5" width="15" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab panels -->
        <!-- Generale -->
        <div
          v-if="activeTab === 'general'"
          id="panel-general"
          role="tabpanel"
          aria-labelledby="tab-general"
          class="panel"
        >
          <dl class="props">
            <div class="prop">
              <dt class="prop__label">Nome file</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.general.name }}</dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Estensione</dt>
              <dd class="prop__value">{{ analysis.general.extension ? '.' + analysis.general.extension : '—' }}</dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Tipo MIME</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.general.mimeType }}</dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Dimensione</dt>
              <dd class="prop__value prop__value--mono">{{ formatBytes(analysis.general.size) }} <span class="prop__secondary">{{ analysis.general.size.toLocaleString('it-IT') }} byte</span></dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Data ultima modifica</dt>
              <dd class="prop__value">{{ formatDate(analysis.general.lastModified) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Immagine -->
        <div
          v-if="activeTab === 'image' && analysis.image"
          id="panel-image"
          role="tabpanel"
          aria-labelledby="tab-image"
          class="panel"
        >
          <dl class="props">
            <div class="prop">
              <dt class="prop__label">Dimensioni</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.image.width }} × {{ analysis.image.height }} px</dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Proporzioni</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.image.aspectRatio }}</dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Megapixel</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.image.megapixels }} MP</dd>
            </div>
            <template v-if="analysis.image.exif">
              <div class="prop prop--separator" role="separator"><span>Metadati EXIF</span></div>
              <div v-if="analysis.image.exif.cameraMake || analysis.image.exif.cameraModel" class="prop">
                <dt class="prop__label">Fotocamera</dt>
                <dd class="prop__value">{{ [analysis.image.exif.cameraMake, analysis.image.exif.cameraModel].filter(Boolean).join(' ') }}</dd>
              </div>
              <div v-if="analysis.image.exif.dateTaken" class="prop">
                <dt class="prop__label">Data scatto</dt>
                <dd class="prop__value">{{ analysis.image.exif.dateTaken }}</dd>
              </div>
              <div v-if="analysis.image.exif.orientationLabel" class="prop">
                <dt class="prop__label">Orientamento</dt>
                <dd class="prop__value">{{ analysis.image.exif.orientationLabel }}</dd>
              </div>
              <div v-if="analysis.image.exif.exposureTime" class="prop">
                <dt class="prop__label">Tempo esposizione</dt>
                <dd class="prop__value prop__value--mono">{{ analysis.image.exif.exposureTime }}</dd>
              </div>
              <div v-if="analysis.image.exif.fNumber" class="prop">
                <dt class="prop__label">Apertura</dt>
                <dd class="prop__value prop__value--mono">{{ analysis.image.exif.fNumber }}</dd>
              </div>
              <div v-if="analysis.image.exif.iso" class="prop">
                <dt class="prop__label">ISO</dt>
                <dd class="prop__value prop__value--mono">{{ analysis.image.exif.iso }}</dd>
              </div>
              <div v-if="analysis.image.exif.focalLength" class="prop">
                <dt class="prop__label">Lunghezza focale</dt>
                <dd class="prop__value">{{ analysis.image.exif.focalLength }}</dd>
              </div>
              <div v-if="analysis.image.exif.exposureBias" class="prop">
                <dt class="prop__label">Compensazione</dt>
                <dd class="prop__value">{{ analysis.image.exif.exposureBias }}</dd>
              </div>
              <div v-if="analysis.image.exif.meteringMode" class="prop">
                <dt class="prop__label">Misurazione luce</dt>
                <dd class="prop__value">{{ analysis.image.exif.meteringMode }}</dd>
              </div>
              <div v-if="analysis.image.exif.flash" class="prop">
                <dt class="prop__label">Flash</dt>
                <dd class="prop__value">{{ analysis.image.exif.flash }}</dd>
              </div>
              <div v-if="analysis.image.exif.software" class="prop">
                <dt class="prop__label">Software</dt>
                <dd class="prop__value">{{ analysis.image.exif.software }}</dd>
              </div>
              <div v-if="analysis.image.exif.copyright" class="prop">
                <dt class="prop__label">Copyright</dt>
                <dd class="prop__value">{{ analysis.image.exif.copyright }}</dd>
              </div>
              <div v-if="analysis.image.exif.gps && analysis.image.exif.gps.latitude" class="prop">
                <dt class="prop__label">Coordinate GPS</dt>
                <dd class="prop__value prop__value--mono">
                  {{ analysis.image.exif.gps.latitude[0]?.toFixed(0) }}°{{ analysis.image.exif.gps.latitude[1]?.toFixed(0) }}'{{ analysis.image.exif.gps.latitude[2]?.toFixed(1) }}" {{ analysis.image.exif.gps.latitudeRef || '' }},
                  {{ analysis.image.exif.gps.longitude[0]?.toFixed(0) }}°{{ analysis.image.exif.gps.longitude[1]?.toFixed(0) }}'{{ analysis.image.exif.gps.longitude[2]?.toFixed(1) }}" {{ analysis.image.exif.gps.longitudeRef || '' }}
                </dd>
              </div>
            </template>
            <template v-if="!analysis.image.exif || Object.keys(analysis.image.exif).length === 0">
              <div class="prop prop--separator" role="separator"><span>Metadati EXIF</span></div>
              <div class="prop">
                <dt class="prop__label">&nbsp;</dt>
                <dd class="prop__value prop__value--muted">Nessun metadato EXIF trovato in questo file.</dd>
              </div>
            </template>
          </dl>
        </div>

        <!-- Audio -->
        <div
          v-if="activeTab === 'audio' && analysis.audio"
          id="panel-audio"
          role="tabpanel"
          aria-labelledby="tab-audio"
          class="panel"
        >
          <dl class="props">
            <div class="prop">
              <dt class="prop__label">Durata</dt>
              <dd class="prop__value prop__value--mono">{{ formatDuration(analysis.audio.duration) }}</dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Bitrate stimato</dt>
              <dd class="prop__value prop__value--mono">{{ formatBitrate(analysis.audio.estimatedBitrate) }}</dd>
            </div>
            <div v-if="analysis.audio.sampleRate" class="prop">
              <dt class="prop__label">Frequenza campionamento</dt>
              <dd class="prop__value prop__value--mono">{{ formatSampleRate(analysis.audio.sampleRate) }}</dd>
            </div>
            <div v-if="analysis.audio.channels != null" class="prop">
              <dt class="prop__label">Canali audio</dt>
              <dd class="prop__value">{{ formatChannels(analysis.audio.channels) }}</dd>
            </div>
            <div v-if="analysis.audio.length != null" class="prop">
              <dt class="prop__label">Campioni totali</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.audio.length.toLocaleString('it-IT') }}</dd>
            </div>
          </dl>
        </div>

        <!-- Video -->
        <div
          v-if="activeTab === 'video' && analysis.video"
          id="panel-video"
          role="tabpanel"
          aria-labelledby="tab-video"
          class="panel"
        >
          <dl class="props">
            <div class="prop">
              <dt class="prop__label">Durata</dt>
              <dd class="prop__value prop__value--mono">{{ formatDuration(analysis.video.duration) }}</dd>
            </div>
            <div v-if="analysis.video.width && analysis.video.height" class="prop">
              <dt class="prop__label">Risoluzione</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.video.width }} × {{ analysis.video.height }} px</dd>
            </div>
            <div v-if="analysis.video.aspectRatio" class="prop">
              <dt class="prop__label">Proporzioni</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.video.aspectRatio }}</dd>
            </div>
            <div class="prop">
              <dt class="prop__label">Bitrate stimato</dt>
              <dd class="prop__value prop__value--mono">{{ formatBitrate(analysis.video.estimatedBitrate) }}</dd>
            </div>
            <div v-if="analysis.video.videoCodec" class="prop">
              <dt class="prop__label">Codec video</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.video.videoCodec }}</dd>
            </div>
            <div v-if="analysis.video.audioCodec" class="prop">
              <dt class="prop__label">Codec audio</dt>
              <dd class="prop__value prop__value--mono">{{ analysis.video.audioCodec }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>

    <!-- ─── Footer ────────────────────────────────────────────────── -->
    <footer class="footer">
      <p class="footer__text">
        <strong>FileSpia</strong> — Analisi forense dei file direttamente nel tuo browser.
        Nessun dato viene inviato a server esterni. Tutto resta sul tuo dispositivo.
      </p>
    </footer>
  </div>
</template>

<style>
/* ─── Reset & Design Tokens ──────────────────────────────────────── */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --color-bg: #F4F6F9;
  --color-surface: #FFFFFF;
  --color-primary: #1A3A6B;
  --color-primary-light: #2D5FAA;
  --color-accent: #E85D3A;
  --color-accent-glow: rgba(232, 93, 58, 0.12);
  --color-success: #059669;
  --color-warning: #D4950C;
  --color-text: #1B2432;
  --color-text-secondary: #5F6B7A;
  --color-text-muted: #8F9AAD;
  --color-border: #DDE2E8;
  --color-border-light: #EDF0F4;
  --color-focus: #3B82F6;
  --color-stripe: #F8FAFC;

  --font-display: 'Outfit', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --shadow-sm: 0 1px 2px rgba(27, 36, 50, 0.06);
  --shadow-md: 0 4px 16px rgba(27, 36, 50, 0.08);
  --shadow-lg: 0 8px 32px rgba(27, 36, 50, 0.10);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: var(--font-body);
  background: var(--color-bg);
  color: var(--color-text);
  line-height: 1.6;
}

/* Focus visible */
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* ─── App Layout ─────────────────────────────────────────────────── */
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: var(--space-6) var(--space-4) var(--space-4);
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

/* ─── Header ─────────────────────────────────────────────────────── */
.header {
  text-align: center;
  padding-bottom: var(--space-5);
}

.header-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  border: none;
  background: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  transition: background 150ms ease;
  color: var(--color-primary);
}

.logo:hover {
  background: rgba(26, 58, 107, 0.06);
}

.logo-icon {
  flex-shrink: 0;
  color: var(--color-accent);
  transition: transform 300ms ease;
}

.logo:hover .logo-icon {
  transform: rotate(-10deg) scale(1.08);
}

.logo-text {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-primary);
}

.tagline {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  max-width: 400px;
}

/* ─── Main ───────────────────────────────────────────────────────── */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* ─── Drop Zone ──────────────────────────────────────────────────── */
.dropzone {
  background: var(--color-surface);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-8) var(--space-6);
  text-align: center;
  transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease;
  cursor: pointer;
  position: relative;
}

.dropzone:hover {
  border-color: var(--color-primary-light);
  box-shadow: var(--shadow-sm);
}

.dropzone--active {
  border-color: var(--color-accent);
  background: var(--color-accent-glow);
  box-shadow: var(--shadow-md);
}

.dropzone__input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.dropzone__label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  width: 100%;
}

.dropzone__icon {
  color: var(--color-primary-light);
  transition: transform 200ms ease, color 200ms ease;
  margin-bottom: var(--space-1);
  position: relative;
}

.dropzone--active .dropzone__icon {
  color: var(--color-accent);
  transform: scale(1.08);
}

.dropzone__scan-line {
  animation: scan 2s ease-in-out infinite;
}

@keyframes scan {
  0%, 100% { transform: translateY(-8px); opacity: 0.15; }
  50% { transform: translateY(8px); opacity: 0.5; }
}

.dropzone__title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-text);
}

.dropzone__subtitle {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.dropzone__link {
  color: var(--color-primary-light);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.dropzone__hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

/* ─── Loading ────────────────────────────────────────────────────── */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) var(--space-6);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.loading__spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading__text {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
}

.loading__file {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

/* ─── Error ──────────────────────────────────────────────────────── */
.error__card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: var(--radius-md);
  padding: var(--space-4);
  color: #991B1B;
}

.error__icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.error__text {
  flex: 1;
  font-size: 0.9rem;
  line-height: 1.5;
}

.error__retry {
  flex-shrink: 0;
  background: var(--color-surface);
  border: 1px solid #FECACA;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: 0.85rem;
  font-family: var(--font-body);
  font-weight: 600;
  color: #991B1B;
  cursor: pointer;
  transition: background 150ms;
}

.error__retry:hover {
  background: #FEE2E2;
}

/* ─── Results ────────────────────────────────────────────────────── */
.results {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.results__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border-light);
}

.results__file-info {
  min-width: 0;
  flex: 1;
}

.results__category {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-accent);
  background: var(--color-accent-glow);
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: var(--space-1);
}

.results__filename {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  word-break: break-word;
  line-height: 1.3;
}

.results__new {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: 0.8rem;
  font-family: var(--font-body);
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 150ms;
  white-space: nowrap;
  min-height: 36px;
}

.results__new:hover {
  background: var(--color-surface);
  border-color: var(--color-primary-light);
  color: var(--color-primary);
}

/* ─── Tabs ───────────────────────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border-light);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: 0.85rem;
  font-family: var(--font-body);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 150ms;
  white-space: nowrap;
  min-height: 44px;
  min-width: 44px;
}

.tabs__btn:hover {
  color: var(--color-text);
  background: var(--color-stripe);
}

.tabs__btn--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

.tabs__btn--active:hover {
  background: transparent;
}

.tabs__icon {
  flex-shrink: 0;
}

/* ─── Panel & Props ──────────────────────────────────────────────── */
.panel {
  padding: var(--space-5);
  animation: fadeIn 250ms ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.props {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
}

.prop {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border-light);
  align-items: baseline;
}

.prop:last-child {
  border-bottom: none;
}

.prop--separator {
  grid-column: 1 / -1;
  display: block;
  padding: var(--space-4) 0 var(--space-2);
  border-bottom: none;
}

.prop--separator span {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.prop__label {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.prop__value {
  font-size: 0.9rem;
  color: var(--color-text);
  font-weight: 500;
  word-break: break-word;
}

.prop__value--mono {
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

.prop__value--muted {
  color: var(--color-text-muted);
  font-style: italic;
}

.prop__secondary {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-weight: 400;
  margin-left: var(--space-2);
}

/* ─── Footer ─────────────────────────────────────────────────────── */
.footer {
  text-align: center;
  padding-top: var(--space-8);
  margin-top: auto;
}

.footer__text {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  line-height: 1.6;
  max-width: 440px;
  margin: 0 auto;
}

.footer__text strong {
  color: var(--color-text-secondary);
  font-weight: 600;
}

/* ─── Responsive ─────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .app {
    padding: var(--space-4) var(--space-3) var(--space-3);
  }

  .header {
    padding-bottom: var(--space-4);
  }

  .logo-text {
    font-size: 1.3rem;
  }

  .tagline {
    font-size: 0.8rem;
  }

  .dropzone {
    padding: var(--space-6) var(--space-4);
  }

  .dropzone__title {
    font-size: 1rem;
  }

  .dropzone__subtitle {
    font-size: 0.825rem;
  }

  .results__header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  .results__new {
    align-self: flex-start;
  }

  .tabs__btn {
    padding: var(--space-2) var(--space-3);
    font-size: 0.8rem;
    min-height: 40px;
  }

  .prop {
    grid-template-columns: 1fr;
    gap: var(--space-1);
    padding: var(--space-2) 0;
  }

  .panel {
    padding: var(--space-4) var(--space-3);
  }

  .loading {
    padding: var(--space-8) var(--space-4);
  }
}

/* ─── Reduced motion ─────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .dropzone__scan-line {
    animation: none;
  }

  .loading__spinner {
    animation: none;
    border-top-color: var(--color-border);
  }

  .panel {
    animation: none;
  }

  .logo:hover .logo-icon {
    transform: none;
  }
}
</style>
