import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { qrcode } from 'vite-plugin-qrcode'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: '/agm/',
  plugins: [
    basicSsl(),
    qrcode(),
    viteSingleFile()
  ]
})
