'use client';

import { useEffect } from 'react';
import { Spinner } from '@/components/ui';

export default function Home() {
  useEffect(() => {
    window.location.replace('/painel/');
  }, []);
  return <Spinner />;
}
