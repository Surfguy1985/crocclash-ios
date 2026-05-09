import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brycebeck.crocclash',
  appName: 'Croc Clash',
  webDir: 'www',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'always',
    scrollEnabled: false,
    backgroundColor: '#0a0a14',
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
    allowsLinkPreview: false
  },
  server: {
    iosScheme: 'capacitor',
    cleartext: false,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a14',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a14',
      overlaysWebView: false
    },
    Haptics: {},
    ScreenOrientation: {
      orientation: 'landscape'
    }
  }
};

export default config;
