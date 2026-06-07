import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          // Wrap error listener registration to intercept Vite's default error logger
          const wrapErrorListener = (methodName) => {
            const original = proxy[methodName].bind(proxy);
            proxy[methodName] = (event, listener) => {
              if (event === 'error') {
                return original('error', (err, req, res) => {
                  if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
                    // Suppress connection refused/reset log spam in terminal
                    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                      res.writeHead(502, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: 'Backend server is starting up or temporarily unreachable.' }));
                    }
                    return;
                  }
                  listener(err, req, res);
                });
              }
              return original(event, listener);
            };
          };

          wrapErrorListener('on');
          wrapErrorListener('addListener');
        }
      }
    }
  }
})

