import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Required for BrowserRouter — serves index.html for all unknown paths
    // so direct URL access and page refresh work correctly on nested routes.
    historyApiFallback: true,
  },
})

