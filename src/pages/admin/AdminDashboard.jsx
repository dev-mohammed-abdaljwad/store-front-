import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Plus, Power, PowerOff, Search, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  activateAdminStore,
  createAdminStore,
  deactivateAdminStore,
  getAdminStores,
} from '../../api/adminStores';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { formatDate } from '../../utils/formatters';

const createStoreSchema = z.object({
  name: z.string().min(1, 'اسم المتجر مطلوب'),
  owner_name: z.string().min(1, 'اسم صاحب المتجر مطلوب'),
  email: z.string().email('صيغة البريد غير صحيحة'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const normalizeStores = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  const mapStore = (store) => {
    const normalizedPhone =
      store?.phone ??
      store?.phone_number ??
      store?.owner_phone ??
      store?.mobile ??
      store?.owner?.phone ??
      store?.user?.phone ??
      undefined;

    return {
      ...store,
      phone: toSafeString(normalizedPhone) || undefined,
    };
  };

  if (Array.isArray(payload)) return payload.map(mapStore);
  if (Array.isArray(payload?.data)) return payload.data.map(mapStore);
  if (Array.isArray(payload?.items)) return payload.items.map(mapStore);
  return [];
};

const toSafeString = (value) => String(value || '').trim();

const normalizeSingleStore = (store) => {
  const normalizedPhone =
    store?.phone ??
    store?.phone_number ??
    store?.owner_phone ??
    store?.mobile ??
    store?.owner?.phone ??
    store?.user?.phone ??
    undefined;

  return {
    ...store,
    phone: toSafeString(normalizedPhone) || undefined,
  };
};

function StatsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-white p-5 animate-pulse">
          <div className="mb-3 h-4 w-20 rounded bg-slate-200" />
          <div className="h-10 w-16 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <tbody>
          {Array.from({ length: 5 }).map((_, index) => (
            <tr key={index} className="animate-pulse border-b border-border last:border-0">
              <td colSpan={8} className="py-4">
                <div className="h-4 w-full rounded bg-slate-200" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-text-muted">{title}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </span>
      </div>
      <p className="text-3xl font-bold text-text">{value}</p>
    </div>
  );
}

function StatusBadge({ active }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        مفعّل
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      موقوف
    </span>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmStore, setConfirmStore] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const dateStr = useMemo(
    () =>
      new Date().toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createStoreSchema),
    defaultValues: {
      name: '',
      owner_name: '',
      email: '',
      password: '',
      phone: '',
      address: '',
    },
  });

  const storesQuery = useQuery({
    queryKey: ['admin-stores'],
    queryFn: async () => normalizeStores(await getAdminStores()),
  });

  const stores = useMemo(() => storesQuery.data || [], [storesQuery.data]);

  const toggleMutation = useMutation({
    mutationFn: ({ id, action }) => (action === 'activate' ? activateAdminStore(id) : deactivateAdminStore(id)),
    onSuccess: (_, { action }) => {
      toast.success(action === 'activate' ? 'تم تفعيل المتجر بنجاح' : 'تم إيقاف المتجر بنجاح');
      queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      setConfirmStore(null);
    },
    onError: () => toast.error('حدث خطأ، يرجى المحاولة مرة أخرى'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => createAdminStore(data),
    onSuccess: (response) => {
      const createdStoreRaw =
        response?.data?.store ??
        response?.store ??
        response?.data?.data?.store ??
        response?.data?.data ??
        null;

      if (createdStoreRaw && typeof createdStoreRaw === 'object') {
        const createdStore = normalizeSingleStore(createdStoreRaw);
        queryClient.setQueryData(['admin-stores'], (current) => {
          const currentList = Array.isArray(current) ? current : [];
          return [createdStore, ...currentList.filter((item) => item?.id !== createdStore?.id)];
        });
      }

      toast.success('تم إنشاء المتجر بنجاح');
      queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      setShowCreateModal(false);
      reset();
    },
    onError: (error) => {
      const message = error?.response?.data?.message || 'فشل إنشاء المتجر';
      toast.error(message);
    },
  });

  const totalStores = stores.length;
  const activeStores = stores.filter((store) => Boolean(store?.is_active)).length;
  const inactiveStores = stores.filter((store) => !store?.is_active).length;

  const filteredStores = useMemo(() => {
    const normalizedSearch = toSafeString(search).toLowerCase();

    if (!normalizedSearch) return stores;

    return stores.filter((store) => {
      const name = toSafeString(store?.name).toLowerCase();
      const ownerName = toSafeString(store?.owner_name).toLowerCase();
      const email = toSafeString(store?.email).toLowerCase();

      return name.includes(normalizedSearch) || ownerName.includes(normalizedSearch) || email.includes(normalizedSearch);
    });
  }, [search, stores]);

  const onCreateStore = (values) => {
    const payload = {
      name: values.name,
      owner_name: values.owner_name,
      email: values.email,
      password: values.password,
      phone: toSafeString(values.phone) || undefined,
      address: toSafeString(values.address) || undefined,
    };

    createMutation.mutate(payload);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">لوحة تحكم المدير</h1>
          <p className="mt-1 text-sm text-text-muted">{dateStr}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
        >
          <Plus size={18} />
          متجر جديد
        </button>
      </div>

      {storesQuery.isLoading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <StatCard title="إجمالي المتاجر" value={totalStores} icon={Store} color="bg-blue-500" />
          <StatCard title="مفعّلة" value={activeStores} icon={Power} color="bg-green-500" />
          <StatCard title="موقوفة" value={inactiveStores} icon={PowerOff} color="bg-red-500" />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-white p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-text">كل المتاجر</h2>

          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث باسم المتجر أو صاحبه أو البريد..."
              className="pr-10"
            />
          </div>
        </div>

        {storesQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right text-text-muted">
                  <th className="px-3 py-3 font-medium">#</th>
                  <th className="px-3 py-3 font-medium">المتجر</th>
                  <th className="px-3 py-3 font-medium">صاحب المتجر</th>
                  <th className="px-3 py-3 font-medium">البريد الإلكتروني</th>
                  <th className="px-3 py-3 font-medium">الهاتف</th>
                  <th className="px-3 py-3 font-medium">تاريخ الإنشاء</th>
                  <th className="px-3 py-3 font-medium">الحالة</th>
                  <th className="px-3 py-3 font-medium">إجراءات</th>
                </tr>
              </thead>

              <tbody>
                {filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-text-muted">
                      لا توجد متاجر مطابقة لنتيجة البحث
                    </td>
                  </tr>
                ) : (
                  filteredStores.map((store, index) => {
                    const isActive = Boolean(store?.is_active);
                    const action = isActive ? 'deactivate' : 'activate';

                    return (
                      <tr key={store?.id || index} className="border-b border-border last:border-0">
                        <td className="px-3 py-3">{index + 1}</td>
                        <td className="px-3 py-3 font-medium text-text">{store?.name || '—'}</td>
                        <td className="px-3 py-3">{store?.owner_name || '—'}</td>
                        <td className="px-3 py-3">{store?.email || '—'}</td>
                        <td className="px-3 py-3">{store?.phone || '—'}</td>
                        <td className="px-3 py-3">{store?.created_at ? formatDate(store.created_at) : '—'}</td>
                        <td className="px-3 py-3">
                          <StatusBadge active={isActive} />
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setConfirmStore({ id: store.id, name: store.name, action })}
                            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${
                              isActive
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-green-200 text-green-600 hover:bg-green-50'
                            }`}
                          >
                            {isActive ? <PowerOff size={14} /> : <Power size={14} />}
                            {isActive ? 'إيقاف' : 'تفعيل'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            reset();
            setShowPassword(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة متجر جديد</DialogTitle>
            <DialogDescription>أدخل بيانات المتجر ثم اضغط حفظ.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onCreateStore)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">اسم المتجر *</label>
              <Input {...register('name')} placeholder="اسم المتجر" />
              {errors.name ? <p className="text-sm text-danger">{errors.name.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">اسم صاحب المتجر *</label>
              <Input {...register('owner_name')} placeholder="اسم صاحب المتجر" />
              {errors.owner_name ? <p className="text-sm text-danger">{errors.owner_name.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">البريد الإلكتروني *</label>
              <Input type="email" {...register('email')} placeholder="name@email.com" />
              {errors.email ? <p className="text-sm text-danger">{errors.email.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">كلمة المرور *</label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} {...register('password')} className="pl-10" placeholder="********" />
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? <p className="text-sm text-danger">{errors.password.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">رقم الهاتف</label>
              <Input {...register('phone')} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">العنوان</label>
              <Input {...register('address')}  />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                disabled={createMutation.isPending}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" className="text-white" />
                    جاري الحفظ...
                  </span>
                ) : (
                  'حفظ'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmStore)}
        title={
          confirmStore?.action === 'activate'
            ? `تفعيل متجر ${confirmStore?.name || ''}`
            : `إيقاف متجر ${confirmStore?.name || ''}`
        }
        message={
          confirmStore?.action === 'activate'
            ? 'سيتم تفعيل المتجر والسماح لمستخدميه بالدخول مجدداً.'
            : 'سيتم إيقاف المتجر فوراً وإنهاء جلسات جميع المستخدمين. هل أنت متأكد؟'
        }
        confirmLabel={confirmStore?.action === 'activate' ? 'تأكيد التفعيل' : 'تأكيد الإيقاف'}
        confirmColor={confirmStore?.action === 'activate' ? 'green' : 'red'}
        onCancel={() => setConfirmStore(null)}
        onConfirm={() => {
          if (!confirmStore?.id || !confirmStore?.action) return;
          toggleMutation.mutate({ id: confirmStore.id, action: confirmStore.action });
        }}
        loading={toggleMutation.isPending}
      />
    </div>
  );
}
