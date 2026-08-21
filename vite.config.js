import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // scan only the app's real entry: the dep scanner otherwise crawls
    // every *.html under the root — including spike/, whose own
    // node_modules would get bundled as a second three.js instance
    entries: ['index.html'],
  },
  server: {
    port: 3000,
    open: true,
    // permits access via the machine's tailnet name when run with --host
    allowedHosts: ['.ts.net']
  }
});