// Push notification registration. Calls /api/push/register-token (new endpoint added on web).
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';
import { auth } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = (process.env as any).EXPO_PUBLIC_EAS_PROJECT_ID;
  const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = tokenData.data;

  if (auth.currentUser) {
    try {
      await api.post('/api/push/register-token', {
        expoPushToken: token,
        uid: auth.currentUser.uid,
        platform: Platform.OS,
      });
    } catch (e) {
      console.warn('[push] register failed — endpoint may not exist yet', e);
    }
  }
  return token;
}
