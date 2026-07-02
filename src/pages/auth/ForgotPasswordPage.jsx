import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { sendResetLinkApi } from '../../api/auth';

const schema = z.object({
  email: z.string().email('صيغة البريد غير صحيحة'),
});

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const [serverErrors, setServerErrors] = useState({});
  const [returnedToken, setReturnedToken] = useState('');
  const showTokenAllowed = process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

  const onSubmit = async (values) => {
    setErrorMessage('');
    setServerErrors({});
    setReturnedToken('');
    try {
      const res = await sendResetLinkApi(values);
      const data = res?.data || {};
      if (data.token) setReturnedToken(data.token);
      // Always show generic success message to avoid account enumeration
      toast.success(data.message || 'تم إرسال رابط إعادة التعيين إلى بريدك');
      // If token provided (local debug) don't immediately navigate so user can copy token
      if (!data.token) navigate('/login');
    } catch (err) {
      const resp = err?.response?.data;
      if (resp?.errors) {
        setServerErrors(resp.errors);
      } else {
        setErrorMessage(resp?.message || 'حدث خطأ، حاول لاحقاً');
      }
    }
  };

  return (
    <main className="min-h-screen bg-bg">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-5">
        {/* Left promo for large screens */}
        <section className="hidden lg:flex lg:col-span-3 lg:flex-col lg:justify-between lg:overflow-hidden lg:bg-gradient-to-br lg:from-primary lg:to-primary-dark lg:p-12 lg:text-white">
          <div className="flex items-center gap-3 text-2xl font-bold">
            <span aria-hidden="true">🌿</span>
            <span>AgriStore</span>
          </div>
          <div className="max-w-lg space-y-4">
            <h1 className="text-4xl font-bold leading-tight">نظام إدارة المخازن الزراعية</h1>
            <p className="text-lg text-white/90">منصة موحدة لإدارة المنتجات، المخزون، والمبيعات بكفاءة عالية لمتاجر القطاع الزراعي.</p>
          </div>
          <div className="text-sm text-white/80">حلول ذكية لإدارة المتاجر الزراعية الحديثة</div>
        </section>

        {/* Form card */}
        <section className="col-span-1 flex items-center justify-center px-4 py-10 lg:col-span-2 lg:px-16">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center">نسيت كلمة المرور</CardTitle>
              <CardDescription className="text-center">أدخل بريدك الإلكتروني لاستلام رابط إعادة التعيين</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-text">البريد الإلكتروني</label>
                  <Input id="email" type="email" placeholder="name@example.com" dir="ltr" {...register('email')} />
                  {errors.email ? <p className="text-sm text-danger">{errors.email.message}</p> : null}
                  {serverErrors.email ? <p className="text-sm text-danger">{serverErrors.email[0]}</p> : null}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  إرسال رابط إعادة التعيين
                </Button>

                {returnedToken && showTokenAllowed ? (
                  <div className="mt-2 rounded-md border border-border p-3 bg-muted text-sm text-muted-foreground">
                    <div className="font-medium">رمز الاختبار (محلي)</div>
                    <div className="break-all mt-1">{returnedToken}</div>
                  </div>
                ) : null}

                {errorMessage ? <p className="text-center text-sm text-danger">{errorMessage}</p> : null}

                <div className="flex items-center justify-between pt-2 text-sm">
                  <button type="button" onClick={() => navigate('/login')} className="text-primary">
                    العودة لتسجيل الدخول
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
