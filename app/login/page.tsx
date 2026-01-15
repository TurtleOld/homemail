'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Ошибка входа');
        return;
      }

      toast.success('Вход выполнен');
      const redirectTo = searchParams.get('redirect') || '/mail';
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      toast.error('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-blue-200 bg-white p-6 shadow-xl sm:p-8 md:p-10">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Вход в почту</h1>
          <p className="mt-2 text-sm text-gray-600 sm:text-base">Введите логин и пароль для входа</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 sm:text-base">
              Логин
            </label>
            <Input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 border-blue-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-blue-500 sm:h-12"
              placeholder="например: username"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 sm:text-base">
              Пароль
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 border-blue-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-blue-500 sm:h-12"
              placeholder="••••••••"
            />
          </div>
          <Button
            type="submit"
            className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 disabled:opacity-50 sm:h-12 sm:text-base"
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </form>
        <p className="text-center text-xs text-gray-500 sm:text-left sm:text-sm">
          Для демо используйте любой email и пароль. Данные генерируются автоматически.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-blue-50 text-gray-600">Загрузка...</div>}>
      <LoginForm />
    </Suspense>
  );
}
