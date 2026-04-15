import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget =
    (env.VITE_API_PROXY_TARGET && env.VITE_API_PROXY_TARGET.trim()) ||
    (env.VITE_API_URL_LOCAL && env.VITE_API_URL_LOCAL.trim()) ||
    'http://localhost:5000'

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('error', (err) => {
              if (err?.code === 'ECONNREFUSED') {
                console.error(
                  `\n\x1b[33m[vite]\x1b[0m API proxy: nothing is accepting connections at \x1b[1m${apiProxyTarget}\x1b[0m (ECONNREFUSED).` +
                    `\n    → Start the ValleyCroft backend on that host/port, or set \x1b[1mVITE_API_PROXY_TARGET\x1b[0m in \x1b[1m.env\x1b[0m to match your API.` +
                    `\n    → Or use the hosted API: \x1b[1mVITE_API_URL=https://valleycroft-backend.onrender.com\x1b[0m (no proxy in dev).\n`
                )
              } else if (err?.code === 'ECONNRESET' || err?.code === 'EPIPE') {
                console.error(
                  `\n\x1b[33m[vite]\x1b[0m API proxy: upstream at \x1b[1m${apiProxyTarget}\x1b[0m closed the connection (${err.code}).` +
                    `\n    → Browser sees 502 Bad Gateway. Usually the API process crashed, was restarted, or hit an unhandled error on that route.` +
                    `\n    → Check the backend terminal/logs for stack traces when you repeat the request.\n`
                )
              }
            })
          },
        },
      },
    },
  }
})
