import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Cache-friendly chunk split: three.js + R3F is a chunky stable bundle;
    // recharts is only used on the Insights/Progress screens.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
    // three.js + R3F + drei weigh ~1MB by themselves — known floor for any
    // app using r3f. Setting the threshold above that so the warning is
    // meaningful rather than always-on.
    chunkSizeWarningLimit: 1100,
  },
});
