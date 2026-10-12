import * as monaco from 'monaco-editor'

let isInitialized = false

/**
 * Configure Monaco Editor with extended language support:
 * - Full JSX & TSX support for JavaScript & TypeScript
 * - Dedicated Vue Single File Component (SFC) grammar & directives (:prop, @event, v-*, {{ ... }})
 * - Compiler and diagnostics options for web & backend stacks
 */
export function setupMonacoLanguages(): void {
  if (isInitialized) return
  isInitialized = true

  // 1. Enable JSX & modern ECMAScript/TypeScript compilation options
  try {
    const tsDefaults = monaco.languages.typescript.typescriptDefaults
    const jsDefaults = monaco.languages.typescript.javascriptDefaults

    const compilerOptions: monaco.languages.typescript.CompilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      allowJs: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      jsxFactory: 'React.createElement',
      reactNamespace: 'React',
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      experimentalDecorators: true,
      emitDecoratorMetadata: true
    }

    tsDefaults.setCompilerOptions(compilerOptions)
    jsDefaults.setCompilerOptions(compilerOptions)

    // Relax semantic validation to prevent noisy errors in unbundled files
    tsDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false
    })
    jsDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false
    })
  } catch (err) {
    console.warn('[Monaco] Gagal mengatur opsi compiler JSX/TS:', err)
  }

  // 2. Register Vue Single File Component (SFC) language
  registerVueLanguage()
}

function registerVueLanguage(): void {
  const existing = monaco.languages.getLanguages().some((l) => l.id === 'vue')
  if (existing) return

  monaco.languages.register({
    id: 'vue',
    extensions: ['.vue'],
    aliases: ['Vue', 'vue', 'Vue.js'],
    mimetypes: ['text/x-vue', 'application/x-vue']
  })

  // Language configuration (brackets, comments, auto-closing pairs)
  monaco.languages.setLanguageConfiguration('vue', {
    comments: {
      blockComment: ['<!--', '-->']
    },
    brackets: [
      ['<!--', '-->'],
      ['<', '>'],
      ['{', '}'],
      ['(', ')'],
      ['[', ']']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
      { open: '<!--', close: '-->', notIn: ['comment', 'string'] },
      { open: '<', close: '>', notIn: ['string'] }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
      { open: '<', close: '>' }
    ],
    folding: {
      markers: {
        start: new RegExp('^\\s*<!--\\s*#region\\b.*-->'),
        end: new RegExp('^\\s*<!--\\s*#endregion\\b.*-->')
      }
    }
  })

  // Monarch tokenizer for Vue template, directives, and embedded scripts/styles
  monaco.languages.setMonarchTokensProvider('vue', {
    defaultToken: '',
    tokenPostfix: '.vue',
    ignoreCase: false,

    keywords: [
      'v-if', 'v-else-if', 'v-else', 'v-for', 'v-show', 'v-model',
      'v-bind', 'v-on', 'v-slot', 'v-pre', 'v-cloak', 'v-once', 'v-memo', 'v-html', 'v-text',
      'ref', 'computed', 'reactive', 'watch', 'watchEffect', 'onMounted', 'onUnmounted',
      'defineProps', 'defineEmits', 'defineExpose', 'defineSlots', 'defineModel',
      'setup', 'scoped', 'lang'
    ],

    tokenizer: {
      root: [
        // Vue template mustaches: {{ message }}
        [/\{\{/, { token: 'delimiter.bracket', next: '@mustache' }],

        // Comments: <!-- ... -->
        [/<!--/, 'comment', '@comment'],

        // Template tag
        [/<template\b/, { token: 'tag', next: '@tag' }],

        // Script tag with embedded javascript
        [
          /<script\b(?![^>]*\/>)/,
          { token: 'tag', next: '@script', nextEmbedded: 'text/javascript' }
        ],

        // Style tag with embedded css
        [
          /<style\b(?![^>]*\/>)/,
          { token: 'tag', next: '@style', nextEmbedded: 'text/css' }
        ],

        // Any HTML or Vue custom component: <div, <MyButton, <v-card
        [/<[a-zA-Z0-9_\-\.]+/, { token: 'tag', next: '@tag' }],

        // Closing tag </tag>
        [/<\/[a-zA-Z0-9_\-\.]+\s*>/, 'tag'],

        // HTML entities: &nbsp; &amp;
        [/&[a-zA-Z0-9#]+;/, 'string.escape']
      ],

      mustache: [
        [/\}\}/, { token: 'delimiter.bracket', next: '@pop' }],
        [
          /[a-zA-Z_$][\w$]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@default': 'variable'
            }
          }
        ],
        [/["'].*?["']/, 'string'],
        [/[0-9]+/, 'number'],
        [/[\+\-\*\/\?\:\!\=\<\>\&\|\.]/, 'delimiter'],
        [/[ \t\r\n]+/, 'white']
      ],

      tag: [
        [/[ \t\r\n]+/, 'white'],
        // Vue Directives (v-if, v-for, v-model, etc.)
        [/\bv-[a-zA-Z0-9\-\:]+/, 'keyword'],
        // Event shorthands (@click, @change, @submit.prevent)
        [/@[a-zA-Z0-9\-\:\.]+/, 'attribute.name.event'],
        // Binding shorthands (:class, :style, :key)
        [/:[a-zA-Z0-9\-\:\.]+/, 'attribute.name.bind'],
        // Slot shorthands (#header, #default)
        [/#[a-zA-Z0-9\-\:\.]+/, 'attribute.name.slot'],
        // Standard attributes
        [/[a-zA-Z0-9\-\.]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value'],
        [/>/, { token: 'tag', next: '@pop' }],
        [/\/>/, { token: 'tag', next: '@pop' }]
      ],

      comment: [
        [/-->/, 'comment', '@pop'],
        [/[^-]+/, 'comment'],
        [/./, 'comment']
      ],

      script: [
        [/<\/script\s*>/, { token: 'tag', next: '@pop', nextEmbedded: '@pop' }]
      ],

      style: [
        [/<\/style\s*>/, { token: 'tag', next: '@pop', nextEmbedded: '@pop' }]
      ]
    }
  })
}
