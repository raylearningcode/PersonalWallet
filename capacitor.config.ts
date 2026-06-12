import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.finpath.personalwallet',
  appName: 'FinPath',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#0f1117',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0f1117',
    },
  },
}

export default config
