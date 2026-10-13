import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Garante uma unica instancia do React em dev (evita "Invalid hook call"
    // quando libs como lucide-react resolvem react por outro caminho).
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // Quando o servidor de notificações (npm run dev:api, porta 4000) não
        // está a correr, o proxy emite ECONNREFUSED a cada pedido /api/* e o
        // Vite faz log de "http proxy error" no terminal. O front trata essa
        // falha silenciosamente (a marcação fica registada na mesma), por isso
        // intercetamos o 'error' para responder 502 ao browser sem propagar o
        // evento ao listener interno do Vite — assim o terminal de dev deixa de
        // ser inundado com esse ruído. (Issue #19)
        configure: (proxy) => {
          const originalEmit = proxy.emit.bind(proxy);
          proxy.emit = ((event: string, ...args: unknown[]): boolean => {
            if (event === 'error') {
              const res = args[2] as
                | {
                    headersSent?: boolean;
                    writeHead: (
                      statusCode: number,
                      headers: Record<string, string>,
                    ) => void;
                    end: (chunk?: string) => void;
                  }
                | undefined;
              if (res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    message:
                      'Servidor de notificações (porta 4000) não está a correr.',
                  }),
                );
                return true;
              }
            }
            return originalEmit(event, ...args);
          }) as typeof proxy.emit;
        },
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separa as dependencias vendor em chunks proprios. Melhora a cache
        // do browser (cada lib muda menos que o codigo da app) e evita o
        // aviso de chunk > 500 kB — jspdf/supabase sao pesados e nao precisam
        // de estar no bundle principal.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          jspdf: ['jspdf', 'jspdf-autotable'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
