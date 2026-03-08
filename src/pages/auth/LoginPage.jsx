import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Leaf, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loginApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';

const loginSchema = z.object({
  email: z.string().email('صيغة البريد غير صحيحة'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values) => {
    setErrorMessage('');

    try {
      const response = await loginApi(values);
      const payload = response?.data?.data || response?.data || {};
      
      
      const token = payload.access_token;
      const user = payload.user;
      const store = payload.store ?? user?.store ?? null;
      if (!token || !user) {
        throw new Error('Invalid login response');
      }

      login(token, user, store);

      if (user.role === 'super_admin') {
        navigate('/admin/dashboard', { replace: true });
        return;
      }

      if (user.role === 'store_owner') {
        navigate('/store/dashboard', { replace: true });
        return;
      }

      navigate('/login', { replace: true });
    } catch {
      setErrorMessage('بيانات الدخول غير صحيحة');
    }
  };

  return (
    <main className="min-h-screen bg-bg">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-5">
        <section className="relative hidden lg:col-span-3 lg:flex lg:flex-col lg:justify-between lg:overflow-hidden lg:bg-gradient-to-br lg:from-primary lg:to-primary-dark lg:p-12 lg:text-white">
          <div className="flex items-center gap-3 text-2xl font-bold">
            <Leaf className="h-8 w-8" />
            <span>AgriStore</span>
          </div>
          <div className="max-w-lg space-y-4">
            <h1 className="text-4xl font-bold leading-tight">نظام إدارة المخازن الزراعية</h1>
            <p className="text-lg text-white/90">
              منصة موحدة لإدارة المنتجات، المخزون، والمبيعات بكفاءة عالية لمتاجر القطاع الزراعي.
            </p>
          </div>
          <div className="text-sm text-white/80">حلول ذكية لإدارة المتاجر الزراعية الحديثة</div>
        </section>

        <section className="col-span-1 flex items-center justify-center px-4 py-10 lg:col-span-2 lg:px-10">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="mb-4 flex items-center justify-center gap-2 text-2xl font-bold text-primary">
                <span aria-hidden="true">🌿</span>
                <span>AgriStore</span>
              </div>
              <CardTitle className="text-center">تسجيل الدخول</CardTitle>
              <CardDescription className="text-center">أدخل بياناتك للوصول إلى لوحة التحكم</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-text">
                    البريد الإلكتروني
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    dir="ltr"
                    {...register('email')}
                  />
                  {errors.email ? <p className="text-sm text-danger">{errors.email.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-text">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      dir="ltr"
                      className="pl-10"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 left-0 flex w-10 items-center justify-center text-text-muted"
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password ? <p className="text-sm text-danger">{errors.password.message}</p> : null}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري تسجيل الدخول...
                    </span>
                  ) : (
                    'دخول'
                  )}
                </Button>

                {errorMessage ? <p className="text-center text-sm text-danger">{errorMessage}</p> : null}
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}