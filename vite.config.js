import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    commonjsOptions: {
      include: [/node_modules/, /vendor\/cubejs-lite/],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three'],
        },
      },
    },
  },
});
