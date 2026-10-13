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
