import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

const now = new Date()
const year = now.getFullYear()
const month = String(now.getMonth() + 1).padStart(2, '0')
const day = String(now.getDate()).padStart(2, '0')
const hours = String(now.getHours()).padStart(2, '0')
const minutes = String(now.getMinutes()).padStart(2, '0')
const buildDateVersion = `v${year}.${month}.${day}.${hours}.${minutes}`
const buildTimestamp = now.toLocaleString('id-ID', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __APP_BUILD_DATE__: JSON.stringify(buildDateVersion),
      __APP_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp)
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    define: {
      __APP_BUILD_DATE__: JSON.stringify(buildDateVersion),
      __APP_BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@makarya/sdk': resolve('packages/makarya-sdk/src')
      }
    },
    plugins: [ui(), vue()],
    server: {
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        }
      }
    }
  }
})
