import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { qrcode } from 'vite-plugin-qrcode'

export default defineConfig({
  base: '/agm/',
  plugins: [
    basicSsl(),
    qrcode()
  ]
})
