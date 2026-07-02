import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { confirmResetPasswordApi } from '../../api/auth';

const schema = z
  .object({
    password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 محارف على الأقل'),
    password_confirmation: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['password_confirmation'],
  });

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');
  const [serverErrors, setServerErrors] = useState({});

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', password_confirmation: '' },
  });

  useEffect(() => {
    if (!token || !email) {
      setErrorMessage('رابط إعادة التعيين غير صالح');
    }
  }, [token, email]);

  const onSubmit = async (values) => {
    setErrorMessage('');
    setServerErrors({});
    try {
      await confirmResetPasswordApi({ token, email, password: values.password, password_confirmation: values.password_confirmation });
      toast.success('تم تغيير كلمة المرور بنجاح');
      navigate('/login');
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
        <section className="col-span-1 flex items-center justify-center px-4 py-10 lg:col-span-2 lg:px-10">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center">إعادة تعيين كلمة المرور</CardTitle>
              <CardDescription className="text-center">أدخل كلمة مرور جديدة</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-text">كلمة المرور الجديدة</label>
                  <Input id="password" type="password" dir="ltr" {...register('password')} />
                  {errors.password ? <p className="text-sm text-danger">{errors.password.message}</p> : null}
                  {serverErrors.password ? <p className="text-sm text-danger">{serverErrors.password[0]}</p> : null}
                </div>

                <div className="space-y-2">
                  <label htmlFor="password_confirmation" className="block text-sm font-medium text-text">تأكيد كلمة المرور</label>
                  <Input id="password_confirmation" type="password" dir="ltr" {...register('password_confirmation')} />
                  {errors.password_confirmation ? <p className="text-sm text-danger">{errors.password_confirmation.message}</p> : null}
                  {serverErrors.password_confirmation ? <p className="text-sm text-danger">{serverErrors.password_confirmation[0]}</p> : null}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting || !token || !email}>
                  تغيير كلمة المرور
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
