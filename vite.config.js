import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        home: page('./index.html'),
        community: page('./community.html'),
        messages: page('./messages.html'),
        profile: page('./profile.html'),
      },
    },
  },
});
