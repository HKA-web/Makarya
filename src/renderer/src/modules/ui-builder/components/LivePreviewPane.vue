<template>
  <div class="h-full w-full flex flex-col bg-[#070b12] overflow-hidden relative">
    <!-- Toolbar Atas Iframe Membulat -->
    <div class="h-11 border-b border-white/10 px-4 bg-[#0c111a]/90 backdrop-blur flex items-center justify-between flex-shrink-0 z-10">
      <div class="flex items-center gap-2.5">
        <span class="text-xs font-semibold text-slate-200 flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full shadow-sm"
            :class="store.isGenerating ? 'bg-amber-400 shadow-amber-400/50 animate-ping' : 'bg-emerald-400 shadow-emerald-400/50 animate-pulse'"
          ></span>
          Live Sandbox
        </span>
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-slate-300 border border-white/10">
          {{ currentDimensionText }}
        </span>
        <span
          v-if="store.isGenerating"
          class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse"
        >
          <UIcon name="i-lucide-sparkles" class="w-3 h-3" />
          <span>Live Rendering...</span>
        </span>
      </div>

      <!-- Kontrol Viewport & Reload Membulat -->
      <div class="flex items-center gap-2">
        <div class="flex items-center bg-[#090d14] p-0.5 rounded-full border border-white/10">
          <button
            class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
            :class="store.viewportMode === 'desktop' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'"
            title="Desktop View (Full Canvas)"
            @click="store.setViewportMode('desktop')"
          >
            <UIcon name="i-lucide-monitor" class="w-3.5 h-3.5" />
          </button>
          <button
            class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
            :class="store.viewportMode === 'tablet' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'"
            title="Tablet View (768px)"
            @click="store.setViewportMode('tablet')"
          >
            <UIcon name="i-lucide-tablet" class="w-3.5 h-3.5" />
          </button>
          <button
            class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
            :class="store.viewportMode === 'mobile' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'"
            title="Mobile View (375px)"
            @click="store.setViewportMode('mobile')"
          >
            <UIcon name="i-lucide-smartphone" class="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
          title="Muat Ulang Preview (Hard Reload)"
          @click="hardRefreshIframe"
        >
          <UIcon name="i-lucide-rotate-cw" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Area Iframe -->
    <div
      class="flex-1 overflow-auto flex items-center justify-center bg-[#070b12] relative"
      :class="store.viewportMode === 'desktop' ? 'p-0' : 'p-4 bg-dot-grid'"
    >
      <!-- Iframe Container: Always mounted in DOM for instant live morphing without iframe boot delays -->
      <div
        class="bg-[#0b0f19] overflow-hidden transition-all duration-300 flex flex-col relative"
        :class="[
          store.viewportMode === 'desktop'
            ? 'w-full h-full border-0 rounded-none shadow-none'
            : 'h-full rounded-2xl shadow-2xl border border-white/15 ring-1 ring-black/20'
        ]"
        :style="containerStyle"
      >
        <iframe
          ref="iframeRef"
          :key="iframeKey"
          :srcdoc="initialShellHtml"
          class="w-full h-full border-0 bg-transparent"
          sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
          @load="onIframeLoaded"
        ></iframe>

        <!-- Loading / Empty Overlay (Only when no code has ever been generated) -->
        <div
          v-if="!hasCode && !store.isGenerating"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-8 bg-[#070b12]/95 backdrop-blur-md"
        >
          <div class="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
            <UIcon name="i-lucide-layout" class="w-7 h-7" />
          </div>
          <div class="text-sm font-semibold text-slate-200 mb-1">Pratinjau Belum Tersedia</div>
          <div class="text-xs text-slate-400 leading-relaxed max-w-sm">
            Unggah screenshot atau ketik prompt di samping untuk merender antarmuka secara langsung di sini.
          </div>
        </div>

        <!-- Subtle Live Shimmer Indicator during Agent Generation -->
        <div
          v-if="store.isGenerating"
          class="absolute bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0b101b]/90 backdrop-blur-xl border border-emerald-500/40 text-emerald-300 text-[11px] font-sans shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-200"
        >
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>AI merancang antarmuka...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'

const store = useUiBuilderStore()
const iframeKey = ref(0)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const isIframeReady = ref(false)

// Throttle timer for streaming updates
let throttleTimer: any = null
let pendingUpdate = false

const hasCode = computed(() => {
  return !!store.activeVariant.code && store.activeVariant.code.trim().length > 0
})

const currentDimensionText = computed(() => {
  if (store.viewportMode === 'mobile') return '375 × 667 px'
  if (store.viewportMode === 'tablet') return '768 × 1024 px'
  return 'Desktop (100% Full)'
})

const containerStyle = computed(() => {
  if (store.viewportMode === 'mobile') {
    return { width: '375px', maxHeight: '100%' }
  }
  if (store.viewportMode === 'tablet') {
    return { width: '768px', maxHeight: '100%' }
  }
  return { width: '100%', height: '100%' }
})

/**
 * Universal Shell HTML:
 * Tailwind & Lucide are loaded once. Pure rendered HTML documents are
 * morphed into the DOM synchronously with zero iframe reloads.
 */
const initialShellHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
  <script src="https://unpkg.com/lucide@latest"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
  </style>
  <style id="dynamic-style"></style>
</head>
<body class="bg-[#0b0f19] text-slate-100 min-h-screen">
  <div id="app"></div>

  <script>
    function fixLucideIcons(root) {
      if (!root) return;
      const iconNodes = root.querySelectorAll('[class*="lucide"], [class*="i-lucide-"]');
      iconNodes.forEach(el => {
        const match = el.className.match(/(?:i-lucide-|lucide-)([a-zA-Z0-9-]+)/);
        if (match && !el.getAttribute('data-lucide')) {
          el.setAttribute('data-lucide', match[1]);
        }
      });
      if (window.lucide && typeof lucide.createIcons === 'function') {
        try {
          lucide.createIcons();
        } catch (e) {}
      }
    }

    function fixImageFallbacks(root) {
      if (!root) return;
      const fallbackImages = [
        'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80'
      ];
      const imgs = root.querySelectorAll('img');
      imgs.forEach((img, idx) => {
        const src = img.getAttribute('src');
        if (!src || src === '#' || src === '' || src.startsWith('{{') || src.startsWith(':')) {
          img.src = fallbackImages[idx % fallbackImages.length];
        }
        img.onerror = function() {
          this.onerror = null;
          this.src = fallbackImages[idx % fallbackImages.length];
        };
      });
    }

    function renderContent(payload) {
      if (!payload) return;
      if (payload.bodyClass) {
        document.body.className = payload.bodyClass;
      }
      const styleEl = document.getElementById('dynamic-style');
      if (styleEl && payload.style !== undefined) {
        styleEl.textContent = payload.style;
      }

      const appEl = document.getElementById('app');
      if (appEl && payload.html !== undefined) {
        appEl.innerHTML = payload.html;
        fixLucideIcons(appEl);
        fixImageFallbacks(appEl);
      }
    }

    window.addEventListener('message', function(event) {
      if (!event.data) return;
      if (event.data.type === 'UPDATE_CONTENT') {
        renderContent(event.data);
      }
    });

    window.renderContent = renderContent;
    window.parent.postMessage({ type: 'PREVIEW_SHELL_READY' }, '*');
  <\/script>
</body>
</html>`

const DEFAULT_POSTERS = [
  'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80'
]

function extractScriptData(scriptContent: string): Record<string, any> {
  const scope: Record<string, any> = {}
  if (!scriptContent) return scope

  try {
    const cleaned = scriptContent
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
      .replace(/export\s+default\s+/g, '')
      .replace(/export\s+/g, '')
      .replace(/interface\s+[a-zA-Z0-9_$]+\s*\{[\s\S]*?\}/g, '')
      .replace(/type\s+[a-zA-Z0-9_$]+\s*=[\s\S]*?;/g, '')
      .replace(/<[a-zA-Z0-9_$]+(?:\s*,\s*[a-zA-Z0-9_$]+)*>/g, '')
      .replace(/:\s*[a-zA-Z0-9_$]+(?:\[\])?(?=\s*[=,;)])/g, '')

    const varNames: string[] = []
    const varRegex = /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/g
    let match: RegExpExecArray | null
    while ((match = varRegex.exec(cleaned)) !== null) {
      if (!varNames.includes(match[1])) {
        varNames.push(match[1])
      }
    }

    if (varNames.length > 0) {
      const returnObj = `{ ${varNames.join(', ')} }`
      const runner = new Function(`
        const ref = (v) => v;
        const reactive = (v) => v;
        const computed = (fn) => (typeof fn === 'function' ? fn() : fn);
        const onMounted = () => {};
        const onUnmounted = () => {};
        const watch = () => {};
        try {
          ${cleaned}
          return ${returnObj};
        } catch (e) {
          return {};
        }
      `)
      const result = runner()
      if (result && typeof result === 'object') {
        Object.assign(scope, result)
      }
    }
  } catch {
    // Ignore evaluation errors on partial code
  }

  return scope
}

function resolveScopeValue(scope: Record<string, any>, path: string): any {
  if (!path) return undefined
  const parts = path.trim().split('.')
  let curr: any = scope
  for (const p of parts) {
    if (curr === null || curr === undefined) return undefined
    curr = curr[p]
  }
  return curr
}

function getContextualFallback(path: string): string {
  const lower = path.toLowerCase()
  if (lower.includes('title') || lower.includes('hero.title') || lower.includes('name')) return 'Aniwave: Solo Leveling'
  if (lower.includes('synopsis') || lower.includes('desc')) return 'Streaming anime kualitas HD terbaru dengan subtitle Indonesia dan pilihan audio lengkap.'
  if (lower.includes('tab') || lower.includes('period') || lower.includes('filter')) return 'All'
  if (lower.includes('rating') || lower.includes('score')) return '8.9'
  if (lower.includes('episode') || lower.includes('ep')) return 'Ep 12'
  if (lower.includes('year') || lower.includes('date')) return '2024'
  if (lower.includes('duration') || lower.includes('time')) return '24m'
  if (lower.includes('poster') || lower.includes('image') || lower.includes('banner') || lower.includes('cover')) {
    return DEFAULT_POSTERS[0]
  }
  return ''
}

/**
 * Transforms Vue SFC Template into rich, rendered HTML:
 * - Expands v-for loops using extracted mock data (or default 4-item lists)
 * - Interpolates {{ ... }} expressions with real script variables or contextual text
 * - Cleans Vue directives (:src, :class, @click, etc.) into standard HTML
 */
function transformVueTemplateToHtml(template: string, script: string): string {
  if (!template) return ''
  let html = template

  const scope = extractScriptData(script)

  // 1. Resolve & Expand v-for loops:
  // e.g. <div v-for="item in animeList" ...> ... </div>
  const vForRegex = /<([a-zA-Z0-9_-]+)([^>]*?)\s+v-for=["']\s*(?:\(?\s*([a-zA-Z0-9_$]+)(?:\s*,\s*([a-zA-Z0-9_$]+))?\s*\)?)\s+in\s+([a-zA-Z0-9_$.]+)\s*["']([^>]*)>([\s\S]*?)<\/\1>/gi

  html = html.replace(vForRegex, (_full, tagName, preAttrs, itemVar, _idxVar, listExpr, postAttrs, innerContent) => {
    const listData = resolveScopeValue(scope, listExpr)
    const items: any[] = Array.isArray(listData) && listData.length > 0
      ? listData
      : [
          { id: 1, title: 'Attack on Titan', poster: DEFAULT_POSTERS[0], rating: '9.0', episodes: '24', category: 'TV' },
          { id: 2, title: 'Jujutsu Kaisen', poster: DEFAULT_POSTERS[1], rating: '8.8', episodes: '24', category: 'TV' },
          { id: 3, title: 'Demon Slayer', poster: DEFAULT_POSTERS[2], rating: '8.9', episodes: '12', category: 'TV' },
          { id: 4, title: 'Solo Leveling', poster: DEFAULT_POSTERS[3], rating: '8.7', episodes: '12', category: 'TV' },
          { id: 5, title: 'One Piece', poster: DEFAULT_POSTERS[4], rating: '8.9', episodes: '1000+', category: 'TV' },
          { id: 6, title: 'Frieren: Beyond', poster: DEFAULT_POSTERS[5], rating: '9.1', episodes: '28', category: 'TV' }
        ]

    const cleanPre = preAttrs.replace(/:key=["'][^"']*["']/g, '').trim()
    const cleanPost = postAttrs.replace(/:key=["'][^"']*["']/g, '').trim()
    const attrPrefix = [cleanPre, cleanPost].filter(Boolean).join(' ')

    return items
      .map((item, idx) => {
        let cardHtml = innerContent
        // Replace {{ itemVar.prop }}
        cardHtml = cardHtml.replace(new RegExp(`\\{\\{\\s*${itemVar}\\.([a-zA-Z0-9_$]+)\\s*\\}\\}`, 'g'), (_, prop) => {
          if (typeof item === 'object' && item !== null && item[prop] !== undefined) {
            return String(item[prop])
          }
          return getContextualFallback(prop)
        })
        // Replace {{ itemVar }} (if primitive string)
        cardHtml = cardHtml.replace(new RegExp(`\\{\\{\\s*${itemVar}\\s*\\}\\}`, 'g'), () => {
          if (typeof item === 'string' || typeof item === 'number') return String(item)
          return item?.title || item?.name || 'Item ' + (idx + 1)
        })
        // Replace :src="itemVar.poster" or similar
        cardHtml = cardHtml.replace(new RegExp(`:src=["']\\s*${itemVar}\\.([a-zA-Z0-9_$]+)\\s*["']`, 'g'), (_, prop) => {
          const imgUrl = item?.[prop] || DEFAULT_POSTERS[idx % DEFAULT_POSTERS.length]
          return `src="${imgUrl}"`
        })
        return `<${tagName} ${attrPrefix}>${cardHtml}</${tagName}>`
      })
      .join('\n')
  })

  // 2. Resolve object property expressions: {{ obj.prop }}
  html = html.replace(/\{\{\s*([a-zA-Z0-9_$]+)\.([a-zA-Z0-9_$.]+)\s*\}\}/g, (match, rootVar, propPath) => {
    const fullPath = `${rootVar}.${propPath}`
    const val = resolveScopeValue(scope, fullPath)
    if (val !== undefined && val !== null) return String(val)
    return getContextualFallback(fullPath) || match
  })

  // 3. Resolve single variable expressions: {{ varName }}
  html = html.replace(/\{\{\s*([a-zA-Z0-9_$]+)\s*\}\}/g, (_match, varName) => {
    const val = resolveScopeValue(scope, varName)
    if (val !== undefined && val !== null) return String(val)
    return getContextualFallback(varName)
  })

  // 4. Resolve dynamic :src attributes
  html = html.replace(/:src=["']\s*([a-zA-Z0-9_$.]+)\s*["']/g, (_m, expr) => {
    const val = resolveScopeValue(scope, expr)
    if (typeof val === 'string' && val) return `src="${val}"`
    return `src="${DEFAULT_POSTERS[0]}"`
  })

  // 5. Clean up Vue-specific attributes
  html = html
    .replace(/\s*:key=["'][^"']*["']/g, '')
    .replace(/\s*@(?:click|submit|input|change|keydown)(?:\.[a-z]+)*=["'][^"']*["']/g, '')
    .replace(/\s*v-model(?:(?:\.[a-z]+)*)?=["'][^"']*["']/g, '')
    .replace(/\s*v-if=["'][^"']*["']/g, '')
    .replace(/\s*v-else-if=["'][^"']*["']/g, '')
    .replace(/\s*v-else/g, '')
    .replace(/\s*v-show=["'][^"']*["']/g, '')
    .replace(/\s*:class=["']\{([^"']*)\}["']/g, ' class="$1"')

  // 6. Clean any remaining leftover {{ ... }}
  html = html.replace(/\{\{\s*([a-zA-Z0-9_$.?]+)\s*\}\}/g, (_m, varName) => {
    return getContextualFallback(varName)
  })

  return html
}

/**
 * Universal Code Parser for both Vue SFC and Full HTML:
 * 1. Strips markdown fences (```vue, ```html, ```)
 * 2. Extracts <template> & <script> if Vue SFC
 * 3. Transforms template into fully populated, beautiful HTML
 * 4. Extracts <style> stylesheets & body classes
 */
function parseCode(rawCode: string): {
  html: string
  style: string
  bodyClass: string
} {
  if (!rawCode) return { html: '', style: '', bodyClass: '' }

  let clean = rawCode.trim()

  // 1. Strip markdown code fences (```html, ```vue, ```xml, ```)
  clean = clean.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '')
  clean = clean.replace(/\n?```\s*$/, '')

  // 2. Extract Body Classes if Full HTML
  let bodyClass = ''
  const bodyTagMatch = clean.match(/<body[^>]*class=["']([^"']*)["'][^>]*>/i)
  if (bodyTagMatch) {
    bodyClass = bodyTagMatch[1]
  }

  // 3. Extract Styles from all <style> blocks
  let styleContent = ''
  const styleMatches = clean.matchAll(/<style[^>]*>([\s\S]*?)(?:<\/style>|$)/gi)
  for (const sm of styleMatches) {
    styleContent += '\n' + (sm[1] || '')
  }

  // 4. Extract Vue SFC Parts or HTML Body
  let rawTemplate = ''
  let rawScript = ''
  let html = ''

  // Case A: Vue SFC with <template>
  const templateMatch = clean.match(/<template[^>]*>([\s\S]*?)(?:<\/template>|$)/i)
  if (templateMatch) {
    rawTemplate = templateMatch[1].trim()
    const scriptMatch = clean.match(/<script[^>]*>([\s\S]*?)(?:<\/script>|$)/i)
    if (scriptMatch) {
      rawScript = scriptMatch[1].trim()
    }
    html = transformVueTemplateToHtml(rawTemplate, rawScript)
  }
  // Case B: Full HTML with <body>
  else if (clean.match(/<body[^>]*>/i)) {
    const bodyMatch = clean.match(/<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i)
    if (bodyMatch) {
      html = bodyMatch[1]
    }
  }
  // Case C: HTML with </head>
  else if (clean.match(/<\/head>/i)) {
    const afterHead = clean.split(/<\/head>/i)[1] || ''
    html = afterHead
  }
  // Case D: Still streaming <head> or doctype (has not reached body or template yet)
  else if (clean.startsWith('<!DOCTYPE') || clean.startsWith('<html') || clean.startsWith('<head')) {
    html = ''
  }
  // Case E: Plain HTML snippet
  else {
    html = clean
  }

  // Strip <script> and <style> and wrapper tags from rendered HTML
  html = html
    .replace(/<script[\s\S]*?(?:<\/script>|$)/gi, '')
    .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, '')
    .replace(/<\/body>[\s\S]*/gi, '')
    .replace(/<\/html>[\s\S]*/gi, '')
    .trim()

  // During active streaming, strip trailing dangling unclosed tag (e.g. `<div class="p-`)
  if (store.isGenerating && html) {
    html = html.replace(/<[a-zA-Z0-9_-]+(?:\s+[^>]*)?$/, '')
  }

  // Fallback dark theme body detection
  if (!bodyClass) {
    if (
      clean.includes('bg-[#') ||
      clean.includes('bg-slate-950') ||
      clean.includes('bg-slate-900') ||
      clean.includes('bg-black') ||
      clean.includes('bg-zinc-950') ||
      clean.includes('bg-neutral-950') ||
      clean.includes('bg-gray-950') ||
      clean.includes('text-white')
    ) {
      bodyClass = 'bg-[#0b0f19] text-slate-100 min-h-screen'
    } else {
      bodyClass = 'bg-slate-50 text-slate-900 min-h-screen'
    }
  }

  return {
    html,
    style: styleContent.trim(),
    bodyClass
  }
}

function dispatchLiveDomUpdate(): void {
  const iframe = iframeRef.value
  if (!iframe?.contentWindow) return

  const parsed = parseCode(store.activeVariant.code || '')

  // 1. Direct synchronous execution if window.renderContent is exposed
  try {
    const win = iframe.contentWindow as any
    if (win && typeof win.renderContent === 'function') {
      win.renderContent(parsed)
      return
    }
  } catch {
    // Fallback to postMessage
  }

  // 2. Direct DOM injection fallback
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document
    if (doc && doc.getElementById('app')) {
      const appEl = doc.getElementById('app')
      if (appEl) {
        appEl.innerHTML = parsed.html
        if (parsed.bodyClass) {
          doc.body.className = parsed.bodyClass
        }
        const styleEl = doc.getElementById('dynamic-style')
        if (styleEl) {
          styleEl.textContent = parsed.style
        }
        // @ts-ignore
        if (iframe.contentWindow.lucide && typeof iframe.contentWindow.lucide.createIcons === 'function') {
          // @ts-ignore
          iframe.contentWindow.lucide.createIcons()
        }
        return
      }
    }
  } catch {
    // Fallback to postMessage
  }

  // 3. postMessage fallback
  try {
    iframe.contentWindow.postMessage(
      {
        type: 'UPDATE_CONTENT',
        ...parsed
      },
      '*'
    )
  } catch (err) {
    console.warn('[LivePreview] Error dispatching live DOM update:', err)
  }
}

/**
 * Throttled live updater:
 * Batches rapid streaming chunks to ~80ms intervals for responsive 60fps rendering.
 */
function triggerLiveUpdate(forceImmediate = false): void {
  if (forceImmediate || !store.isGenerating) {
    if (throttleTimer) {
      clearTimeout(throttleTimer)
      throttleTimer = null
    }
    dispatchLiveDomUpdate()
    return
  }

  if (!throttleTimer) {
    dispatchLiveDomUpdate()
    throttleTimer = setTimeout(() => {
      throttleTimer = null
      if (pendingUpdate) {
        pendingUpdate = false
        dispatchLiveDomUpdate()
      }
    }, 80)
  } else {
    pendingUpdate = true
  }
}

function onIframeLoaded(): void {
  isIframeReady.value = true
  nextTick(() => {
    dispatchLiveDomUpdate()
  })
}

function hardRefreshIframe(): void {
  isIframeReady.value = false
  iframeKey.value++
}

function handleWindowMessage(event: MessageEvent): void {
  if (event.data?.type === 'PREVIEW_SHELL_READY') {
    isIframeReady.value = true
    dispatchLiveDomUpdate()
  }
}

// Watch active variant code updates
watch(
  () => store.activeVariant.code,
  () => {
    triggerLiveUpdate()
  }
)

// When generation stops, push immediate final render
watch(
  () => store.isGenerating,
  (generating) => {
    if (!generating) {
      triggerLiveUpdate(true)
    }
  }
)

// When variant index changes
watch(
  () => store.activeVariantIndex,
  () => {
    triggerLiveUpdate(true)
  }
)

onMounted(() => {
  window.addEventListener('message', handleWindowMessage)
  nextTick(() => {
    dispatchLiveDomUpdate()
  })
})

onUnmounted(() => {
  window.removeEventListener('message', handleWindowMessage)
  if (throttleTimer) {
    clearTimeout(throttleTimer)
    throttleTimer = null
  }
})
</script>

<style scoped>
.bg-dot-grid {
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 16px 16px;
}
</style>
