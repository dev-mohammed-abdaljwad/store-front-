import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, KeyRound, Loader2, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { changePassword, deleteLogo, getSettings, updateSettings, uploadLogo } from '../../../api/settings';
import ConfirmDialog from '../../../components/shared/ConfirmDialog';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useAuthStore } from '../../../store/authStore';

const storeSchema = z.object({
  name: z.string().min(1, 'اسم المتجر مطلوب'),
  phone: z.string().optional(),
  address: z.string().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]*$/, 'فقط: حروف إنجليزية صغيرة، أرقام، وشرطة')
    .optional()
    .or(z.literal('')),
});

const printSchema = z.object({
  print_header: z.string().optional(),
  print_phone: z.string().optional(),
  print_address: z.string().optional(),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
    new_password: z.string().min(8, 'كلمة المرور الجديدة 8 أحرف على الأقل'),
    new_password_confirmation: z.string(),
  })
  .refine((data) => data.new_password === data.new_password_confirmation, {
    message: 'تأكيد كلمة المرور غير متطابق',
    path: ['new_password_confirmation'],
  });

const buildSlug = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const getInitial = (settings) => ({
  name: settings?.name || '',
  phone: settings?.phone || '',
  address: settings?.address || '',
  slug: settings?.slug || '',
  logo_url: settings?.logo_url || '',
  print_header: settings?.print_header || '',
  print_phone: settings?.print_phone || '',
  print_address: settings?.print_address || '',
  id: settings?.id || null,
});

const extractSettings = (response) => {
  const payload = response?.data?.data ?? response?.data ?? {};
  return payload?.settings ?? payload?.store ?? payload;
};

function LogoSection({ name, currentLogoUrl, onLogoUpdate, disabled }) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const fileInputRef = useRef(null);

  const uploadMutation = useMutation({
    mutationFn: (file) => uploadLogo(file),
    onSuccess: (response) => {
      const payload = response?.data?.data ?? response?.data ?? {};
      const logoUrl = payload?.logo_url ?? payload?.store?.logo_url ?? '';
      toast.success('تم رفع الشعار بنجاح');
      onLogoUpdate(logoUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: () => {
      toast.error('فشل رفع الشعار');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLogo(),
    onSuccess: () => {
      toast.success('تم حذف الشعار');
      onLogoUpdate('');
      setIsDeleteOpen(false);
    },
    onError: () => {
      toast.error('فشل حذف الشعار');
    },
  });

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('الصيغة غير مدعومة. المسموح: JPG, PNG, WEBP');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('حجم الصورة يتجاوز 2 ميجابايت');
      event.target.value = '';
      return;
    }

    uploadMutation.mutate(file);
  };

  const initials = useMemo(() => {
    const firstChar = String(name || '').trim().charAt(0);
    return firstChar || '🌿';
  }, [name]);

  const isBusy = disabled || uploadMutation.isPending || deleteMutation.isPending;

  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <h3 className="mb-4 text-base font-bold text-text">شعار المتجر</h3>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          {currentLogoUrl ? (
            <img src={currentLogoUrl} alt="شعار المتجر" className="h-20 w-20 rounded-xl border border-border object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary text-3xl font-bold text-white">
              {initials}
            </div>
          )}

          <div className="text-sm text-text-muted">
            <p>JPG, PNG, WEBP</p>
            <p>الحد الأقصى: 2 ميجابايت</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            aria-label="رفع شعار جديد"
          />

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="gap-2"
          >
            {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            <span>رفع شعار جديد</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setIsDeleteOpen(true)}
            disabled={isBusy || !currentLogoUrl}
            className="gap-2 text-danger hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>حذف الشعار</span>
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={isDeleteOpen}
        title="حذف شعار المتجر"
        message="هل أنت متأكد من حذف الشعار الحالي؟"
        confirmLabel="حذف"
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
      />
    </section>
  );
}

export default function StoreSettings() {
  const updateStore = useAuthStore((state) => state.updateStore);
  const currentStore = useAuthStore((state) => state.store);

  const [settingsState, setSettingsState] = useState(() => getInitial(currentStore));

  const settingsQuery = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => extractSettings(await getSettings()),
  });

  const {
    register: registerStore,
    handleSubmit: handleSubmitStore,
    reset: resetStoreForm,
    setValue: setStoreValue,
    watch: watchStore,
    formState: { errors: storeErrors, isSubmitting: isStoreSubmitting },
  } = useForm({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: settingsState.name,
      phone: settingsState.phone,
      address: settingsState.address,
      slug: settingsState.slug,
    },
  });

  const {
    register: registerPrint,
    handleSubmit: handleSubmitPrint,
    reset: resetPrintForm,
    watch: watchPrint,
    formState: { errors: printErrors, isSubmitting: isPrintSubmitting },
  } = useForm({
    resolver: zodResolver(printSchema),
    defaultValues: {
      print_header: settingsState.print_header,
      print_phone: settingsState.print_phone,
      print_address: settingsState.print_address,
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      new_password_confirmation: '',
    },
  });

  useEffect(() => {
    const incoming = settingsQuery.data;
    if (!incoming) return;

    const next = getInitial(incoming);
    setSettingsState(next);

    resetStoreForm({
      name: next.name,
      phone: next.phone,
      address: next.address,
      slug: next.slug,
    });

    resetPrintForm({
      print_header: next.print_header,
      print_phone: next.print_phone,
      print_address: next.print_address,
    });

    updateStore({
      ...(currentStore || {}),
      ...incoming,
      id: incoming?.id ?? currentStore?.id ?? null,
      name: incoming?.name || '',
      logo_url: incoming?.logo_url || '',
      slug: incoming?.slug || '',
      print_header: incoming?.print_header || '',
      print_phone: incoming?.print_phone || '',
      print_address: incoming?.print_address || '',
    });
  }, [settingsQuery.data, resetStoreForm, resetPrintForm, updateStore]);

  const persistStoreSnapshot = (nextSettings) => {
    updateStore({
      ...(currentStore || {}),
      ...nextSettings,
      id: nextSettings?.id ?? currentStore?.id ?? null,
      name: nextSettings?.name || '',
      logo_url: nextSettings?.logo_url || '',
      slug: nextSettings?.slug || '',
      print_header: nextSettings?.print_header || '',
      print_phone: nextSettings?.print_phone || '',
      print_address: nextSettings?.print_address || '',
    });
  };

  const storeMutation = useMutation({
    mutationFn: (payload) => updateSettings(payload),
    onSuccess: (response) => {
      const next = getInitial(extractSettings(response));
      setSettingsState((prev) => ({ ...prev, ...next }));
      persistStoreSnapshot(next);
      toast.success('تم حفظ بيانات المتجر');
    },
    onError: () => {
      toast.error('تعذر حفظ بيانات المتجر');
    },
  });

  const printMutation = useMutation({
    mutationFn: (payload) => updateSettings(payload),
    onSuccess: (response) => {
      const next = getInitial(extractSettings(response));
      setSettingsState((prev) => ({ ...prev, ...next }));
      persistStoreSnapshot(next);
      toast.success('تم حفظ بيانات الطباعة');
    },
    onError: () => {
      toast.error('تعذر حفظ بيانات الطباعة');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload) => changePassword(payload),
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور بنجاح');
      resetPasswordForm({
        current_password: '',
        new_password: '',
        new_password_confirmation: '',
      });
    },
    onError: () => {
      toast.error('تعذر تغيير كلمة المرور');
    },
  });

  const watchedSlug = watchStore('slug');
  const watchedName = watchStore('name');
  const watchPrintHeader = watchPrint('print_header');
  const watchPrintPhone = watchPrint('print_phone');
  const watchPrintAddress = watchPrint('print_address');

  const storeNamePreview = watchPrintHeader || watchedName || settingsState.name || 'المتجر';

  const onStoreSubmit = (values) => {
    storeMutation.mutate({
      print_header: settingsState.print_header || '',
      print_phone: settingsState.print_phone || '',
      print_address: settingsState.print_address || '',
      name: values.name,
      phone: values.phone || '',
      address: values.address || '',
      slug: values.slug || '',
    });
  };

  const onPrintSubmit = (values) => {
    printMutation.mutate({
      name: watchedName || settingsState.name || '',
      phone: watchStore('phone') || settingsState.phone || '',
      address: watchStore('address') || settingsState.address || '',
      slug: watchedSlug || settingsState.slug || '',
      print_header: values.print_header || '',
      print_phone: values.print_phone || '',
      print_address: values.print_address || '',
    });
  };

  const onPasswordSubmit = (values) => {
    passwordMutation.mutate(values);
  };

  const handleLogoUpdate = (logoUrl) => {
    setSettingsState((prev) => {
      const next = {
        ...prev,
        logo_url: logoUrl,
        name: watchedName || prev.name,
        slug: watchedSlug || prev.slug,
      };
      persistStoreSnapshot(next);
      return next;
    });
  };

  if (settingsQuery.isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="إعدادات المتجر" subtitle="إدارة بيانات المتجر، الشعار، والطباعة" />

      <LogoSection
        name={watchedName || settingsState.name}
        currentLogoUrl={settingsState.logo_url}
        onLogoUpdate={handleLogoUpdate}
        disabled={settingsQuery.isFetching}
      />

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="mb-4 text-base font-bold text-text">بيانات المتجر</h3>

        <form onSubmit={handleSubmitStore(onStoreSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text" htmlFor="store-name">
                اسم المتجر *
              </label>
              <Input
                id="store-name"
                placeholder="اسم المتجر"
                {...registerStore('name', {
                  onChange: (event) => {
                    const value = event.target.value;
                    const currentSlug = watchStore('slug');
                    if (!currentSlug) {
                      setStoreValue('slug', buildSlug(value), { shouldDirty: true });
                    }
                  },
                })}
              />
              {storeErrors.name ? <p className="text-xs text-danger">{storeErrors.name.message}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text" htmlFor="store-phone">
                رقم الهاتف
              </label>
              <Input id="store-phone" placeholder="01xxxxxxxxx" {...registerStore('phone')} />
              {storeErrors.phone ? <p className="text-xs text-danger">{storeErrors.phone.message}</p> : null}
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-text" htmlFor="store-address">
                العنوان
              </label>
              <Input id="store-address" placeholder="عنوان المتجر" {...registerStore('address')} />
              {storeErrors.address ? <p className="text-xs text-danger">{storeErrors.address.message}</p> : null}
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-text" htmlFor="store-slug">
                Slug
              </label>
              <Input id="store-slug" dir="ltr" placeholder="my-store" {...registerStore('slug')} />
              {storeErrors.slug ? <p className="text-xs text-danger">{storeErrors.slug.message}</p> : null}
              <p className="text-xs text-text-muted">
                المعرّف: <span className="font-mono text-primary">{watchedSlug || '—'}</span>
              </p>
            </div>
          </div>

          <Button type="submit" disabled={isStoreSubmitting || storeMutation.isPending} className="gap-2">
            {isStoreSubmitting || storeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>حفظ البيانات</span>
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="mb-1 text-base font-bold text-text">بيانات الطباعة</h3>
        <p className="mb-4 text-sm text-text-muted">تظهر في رأس الفواتير وكشوف الحساب</p>

        <form onSubmit={handleSubmitPrint(onPrintSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-text" htmlFor="print-header">
                رأس الفاتورة
              </label>
              <Input id="print-header" placeholder="اسم يظهر في رأس الطباعة" {...registerPrint('print_header')} />
              {printErrors.print_header ? <p className="text-xs text-danger">{printErrors.print_header.message}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text" htmlFor="print-phone">
                هاتف الطباعة
              </label>
              <Input id="print-phone" placeholder="رقم الهاتف" {...registerPrint('print_phone')} />
              {printErrors.print_phone ? <p className="text-xs text-danger">{printErrors.print_phone.message}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text" htmlFor="print-address">
                عنوان الطباعة
              </label>
              <Input id="print-address" placeholder="عنوان الطباعة" {...registerPrint('print_address')} />
              {printErrors.print_address ? <p className="text-xs text-danger">{printErrors.print_address.message}</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-slate-50 p-4 text-center text-sm">
            <p className="text-base font-bold">{storeNamePreview}</p>
            {watchPrintPhone ? <p className="text-text-muted">{watchPrintPhone}</p> : null}
            {watchPrintAddress ? <p className="text-text-muted">{watchPrintAddress}</p> : null}
            <p className="mt-2 border-t border-border pt-2 text-xs text-text-muted">معاينة رأس الفاتورة</p>
          </div>

          <Button type="submit" disabled={isPrintSubmitting || printMutation.isPending} className="gap-2">
            {isPrintSubmitting || printMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>حفظ بيانات الطباعة</span>
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="mb-4 text-base font-bold text-text">تغيير كلمة المرور</h3>

        <form onSubmit={handleSubmitPassword(onPasswordSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text" htmlFor="current-password">
                كلمة المرور الحالية
              </label>
              <Input id="current-password" type="password" dir="ltr" {...registerPassword('current_password')} />
              {passwordErrors.current_password ? (
                <p className="text-xs text-danger">{passwordErrors.current_password.message}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text" htmlFor="new-password">
                كلمة المرور الجديدة
              </label>
              <Input id="new-password" type="password" dir="ltr" {...registerPassword('new_password')} />
              {passwordErrors.new_password ? <p className="text-xs text-danger">{passwordErrors.new_password.message}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text" htmlFor="confirm-password">
                تأكيد كلمة المرور
              </label>
              <Input
                id="confirm-password"
                type="password"
                dir="ltr"
                {...registerPassword('new_password_confirmation')}
              />
              {passwordErrors.new_password_confirmation ? (
                <p className="text-xs text-danger">{passwordErrors.new_password_confirmation.message}</p>
              ) : null}
            </div>
          </div>

          <Button type="submit" disabled={isPasswordSubmitting || passwordMutation.isPending} className="gap-2">
            {isPasswordSubmitting || passwordMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            <span>تغيير كلمة المرور</span>
          </Button>
        </form>
      </section>
    </div>
  );
}
