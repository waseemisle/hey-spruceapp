import type { ExpoConfig } from 'expo/config';

const IS_STAGING = process.env.EXPO_PUBLIC_APP_ENV === 'staging';

const config: ExpoConfig = {
  name: IS_STAGING ? 'GroundOps (Staging)' : 'GroundOps',
  slug: 'groundops',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'groundops',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#F3EDE3',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: IS_STAGING ? 'co.groundops.app.staging' : 'co.groundops.app',
    supportsTablet: true,
    associatedDomains: [
      'applinks:groundops.co',
      'applinks:www.groundops.co',
      'applinks:groundopscos.vercel.app',
    ],
    infoPlist: {
      NSCameraUsageDescription:
        'Capture photos for work orders, completions, and maintenance requests.',
      NSPhotoLibraryUsageDescription: 'Attach photos to work orders and tickets.',
      NSFaceIDUsageDescription: 'Sign in securely with Face ID.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: IS_STAGING ? 'co.groundops.app.staging' : 'co.groundops.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F3EDE3',
    },
    permissions: [
      'CAMERA',
      'READ_MEDIA_IMAGES',
      'POST_NOTIFICATIONS',
      'USE_BIOMETRIC',
      'INTERNET',
      'ACCESS_NETWORK_STATE',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'groundops.co' },
          { scheme: 'https', host: 'www.groundops.co' },
          { scheme: 'https', host: 'groundopscos.vercel.app' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    [
      'expo-camera',
      { cameraPermission: 'Allow GroundOps to access your camera to capture work order photos.' },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow GroundOps to access your photos to attach them to work orders.',
      },
    ],
    [
      'expo-local-authentication',
      { faceIDPermission: 'Sign in securely with Face ID.' },
    ],
    [
      'expo-notifications',
      { icon: './assets/notification-icon.png', color: '#0D1520' },
    ],
    [
      '@stripe/stripe-react-native',
      { merchantIdentifier: 'merchant.co.groundops.app', enableGooglePay: true },
    ],
  ],
  experiments: { typedRoutes: true },
  // EAS project id is only needed when you run `eas build` / `eas update`.
  // For local `expo start` we leave it out — otherwise Expo CLI prompts for a login we
  // can't answer in this environment. When you run EAS commands, use:
  //   eas init --id 109fd5ba-5352-4522-b53c-41ec0873b2a3
  // which will re-add it.
};

export default config;
