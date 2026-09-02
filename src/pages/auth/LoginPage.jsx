import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { loginApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';

const loginSchema = z.object({
  email: z.string().email('صيغة البريد غير صحيحة'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

const STORE_TYPES = [
  { icon: '💊', label: 'صيدلية' },
  { icon: '🛒', label: 'بقالة' },
  { icon: '🌾', label: 'مبيدات' },
  { icon: '👗', label: 'ملابس' },
  { icon: '💻', label: 'إلكترونيات' },
  { icon: '🔧', label: 'أدوات' },
  { icon: '🍕', label: 'مطعم' },
  { icon: '📱', label: 'موبايلات' },
];

const FEATURES = [
  { icon: '📊', title: 'تقارير لحظية', desc: 'تابع مبيعاتك ومخزونك في الوقت الفعلي' },
  { icon: '📄', title: 'فواتير احترافية', desc: 'أنشئ وطبع فواتير بيع وشراء بسهولة' },
  { icon: '💳', title: 'إدارة الديون', desc: 'تتبع ديون العملاء والموردين بدقة' },
  { icon: '📦', title: 'إدارة المخزن', desc: 'راقب كميات المنتجات وتنبيهات النقص' },
];

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
    <main className="min-h-screen bg-[#0a0f1e] overflow-hidden" style={{ fontFamily: 'Cairo, sans-serif' }}>
      {/* Animated background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, #2563eb, transparent 70%)',
            animation: 'float1 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, #3b82f6, transparent 70%)',
            animation: 'float2 10s ease-in-out infinite',
          }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full opacity-10"
          style={{
            background: 'radial-gradient(circle, #60a5fa, transparent 70%)',
            animation: 'float1 12s ease-in-out infinite reverse',
          }}
        />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.98); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -40px) scale(1.1); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .slide-right { animation: slideInRight 0.7s ease forwards; }
        .slide-left { animation: slideInLeft 0.7s ease forwards; }
        .fade-up { animation: fadeInUp 0.6s ease forwards; }
        .fade-up-1 { animation: fadeInUp 0.6s ease 0.1s both; }
        .fade-up-2 { animation: fadeInUp 0.6s ease 0.2s both; }
        .fade-up-3 { animation: fadeInUp 0.6s ease 0.3s both; }
        .fade-up-4 { animation: fadeInUp 0.6s ease 0.4s both; }
        .store-card {
          transition: all 0.3s ease;
          animation: fadeInUp 0.5s ease both;
        }
        .store-card:hover {
          transform: translateY(-4px) scale(1.05);
          background: rgba(37, 99, 235, 0.3) !important;
        }
        .login-input {
          background: rgba(255,255,255,0.06) !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          color: white !important;
          transition: all 0.3s ease;
        }
        .login-input:focus {
          background: rgba(255,255,255,0.1) !important;
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25) !important;
          outline: none !important;
        }
        .login-input::placeholder {
          color: rgba(255,255,255,0.35) !important;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .login-btn {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .login-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .login-btn:hover::before { opacity: 1; }
        .login-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(37, 99, 235, 0.5); }
        .login-btn:active { transform: translateY(0); }
        .feature-item {
          transition: all 0.3s ease;
        }
        .feature-item:hover {
          background: rgba(37, 99, 235, 0.15) !important;
          border-color: rgba(37, 99, 235, 0.4) !important;
        }
      `}</style>

      <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-5">

        {/* ───── Left side: Promo ───── */}
        <section className="hidden lg:flex lg:col-span-3 flex-col justify-between p-12 slide-left">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
            >
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white tracking-wide">دفتر</span>
          </div>

          {/* Main headline */}
          <div className="max-w-xl space-y-6">
            <div className="fade-up-1">
              <p className="text-blue-400 font-semibold text-sm tracking-widest uppercase mb-3">نظام إدارة المتاجر</p>
              <h1 className="text-5xl font-bold leading-tight text-white">
                محاسبة ذكية
                <br />
                <span style={{ background: 'linear-gradient(135deg, #60a5fa, #2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  لكل المتاجر
                </span>
              </h1>
            </div>

            <p className="text-lg text-white/60 leading-relaxed fade-up-2">
              من الصيدلية إلى البقالة، من محل المبيدات إلى المخبز — <strong className="text-white/80">دفتر</strong> يناسب جميع أنواع المحلات التجارية.
            </p>

            {/* Store type badges */}
            <div className="fade-up-3">
              <p className="text-white/40 text-xs mb-3">يصلح لـ:</p>
              <div className="flex flex-wrap gap-2">
                {STORE_TYPES.map((s, i) => (
                  <div
                    key={s.label}
                    className="store-card flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-white/80 cursor-default"
                    style={{
                      background: 'rgba(37, 99, 235, 0.15)',
                      border: '1px solid rgba(37, 99, 235, 0.3)',
                      animationDelay: `${0.3 + i * 0.07}s`,
                    }}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3 fade-up-4">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="feature-item rounded-2xl p-4"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <p className="font-semibold text-white text-sm mb-0.5">{f.title}</p>
                  <p className="text-white/50 text-xs leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-white/30 text-sm">
            نظام محاسبة وإدارة مخزن احترافي — متاح على الجوال والكمبيوتر
          </p>
        </section>

        {/* ───── Right side: Login form ───── */}
        <section className="col-span-1 lg:col-span-2 flex items-center justify-center px-5 py-10 lg:px-12 slide-right">
          <div className="glass-card w-full max-w-md rounded-3xl p-8 shadow-2xl">

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center justify-center gap-3 mb-6">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
              >
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">دفتر</span>
            </div>

            {/* Heading */}
            <div className="mb-7 text-center">
              <h2 className="text-2xl font-bold text-white mb-1">أهلاً بك</h2>
              <p className="text-white/50 text-sm">سجّل دخولك للوصول إلى لوحة التحكم</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-white/70">
                  البريد الإلكتروني
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  dir="ltr"
                  className="login-input h-11 rounded-xl text-sm"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-sm text-red-400">{errors.email.message}</p>
                ) : null}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-white/70">
                  كلمة المرور
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    dir="ltr"
                    className="login-input h-11 rounded-xl pl-10 text-sm"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 left-0 flex w-10 items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password ? (
                  <p className="text-sm text-red-400">{errors.password.message}</p>
                ) : null}
              </div>

              {/* Forgot password */}
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  نسيت كلمة المرور؟
                </Link>
              </div>

              {/* Error */}
              {errorMessage ? (
                <div
                  className="rounded-xl px-4 py-3 text-sm text-center"
                  style={{ background: 'rgba(220, 38, 38, 0.15)', border: '1px solid rgba(220, 38, 38, 0.3)', color: '#fca5a5' }}
                >
                  {errorMessage}
                </div>
              ) : null}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="login-btn relative z-0 w-full h-11 rounded-xl text-white font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? (
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري تسجيل الدخول...
                  </span>
                ) : (
                  <span className="relative z-10">دخول</span>
                )}
              </button>
            </form>

            {/* Footer note */}
            <p className="mt-6 text-center text-xs text-white/25">
              دفتر — نظام المحاسبة والمخزن لجميع المتاجر
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}