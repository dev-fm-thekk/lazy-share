import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="send" options={{ title: 'Home' }} />
      <Stack.Screen name="receive" options={{ title: 'About' }} />
    </Stack>
  );
}
