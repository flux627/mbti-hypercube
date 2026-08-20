import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // permits access via the machine's tailnet name when run with --host
    allowedHosts: ['.ts.net']
  }
});