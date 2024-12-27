import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    viteCompression({
      verbose: true, // 是否在控制台输出压缩结果
      disable: false, // 是否禁用 gzip 压缩
      threshold: 1024, // 压缩文件的大小阈值（以字节为单位）
      algorithm: 'gzip', // 压缩算法
      ext: '.gz', // 压缩文件的后缀名
      deleteOriginFile: false, // 是否删除原文件
      // 需要压缩的文件类型
      filter: (filename) => {
        return /(\.js$|\.css$|\.html$|\.json$)/.test(filename);
      },
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
