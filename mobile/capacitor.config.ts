import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'studio.screenplay.writer.mobile',
  appName: '剧本工坊',
  webDir: 'dist',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  plugins: { SystemBars: { insetsHandling: 'disable', style: 'LIGHT' } },
  server: { androidScheme: 'https', hostname: 'localhost' },
}

export default config
