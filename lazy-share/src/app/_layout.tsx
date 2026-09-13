import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#25292e' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'LazyShare' }} />
      <Stack.Screen name="send" options={{ title: 'Send File' }} />
      <Stack.Screen name="receive" options={{ title: 'Receive File' }} />
      <Stack.Screen name="files" options={{ title: 'Shared Files' }} />
    </Stack>
  );
}