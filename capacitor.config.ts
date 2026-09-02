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
      backgroundColor: '#05070D',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#05070D',
    },
  },
}

export default config
