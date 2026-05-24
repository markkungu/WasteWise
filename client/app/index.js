import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { getToken } from '../src/services/api';

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    getToken().then(token => {
      router.replace(token ? '/home' : '/login');
    });
  }, []);
  return null;
}
