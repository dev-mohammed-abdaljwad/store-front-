import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  cancelManufacturingOrder,
  deleteManufacturingOrder,
  getManufacturingOrders,
} from '../../../api/manufacturing';

export default function ManufacturingPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelModal, setCancelModal] = useState(null); // {id, reason}
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (statusFilter) filters.status = statusFilter;
      const res = await getManufacturingOrders(page, filters);
      setOrders(res.data.data || []);
      setMeta(res.data.meta || res.data);
    } catch {
      toast.error('فشل تحميل أوامر التصنيع');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelManufacturingOrder(cancelModal, cancelReason);
      toast.success('تم إلغاء أمر التصنيع');
      setCancelModal(null);
      setCancelReason('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'فشل الإلغاء');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('سيتم حذف أمر التصنيع نهائياً. هل أنت متأكد؟')) return;
    try {
      await deleteManufacturingOrder(id);
      toast.success('تم حذف أمر التصنيع');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'فشل الحذف');
    }
  };

  return (
    <div style={{ direction: 'rtl' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FlaskConical size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>التصنيع</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>أوامر تصنيع وإنتاج المنتجات</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/store/manufacturing/create')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >
          <Plus size={16} /> أمر تصنيع جديد
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20,
        background: 'var(--bg-card)', padding: 14, borderRadius: 12,
        border: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="بحث بالمنتج أو رقم الأمر..."
            style={{
              width: '100%', padding: '8px 32px 8px 10px', borderRadius: 8,
              border: '1.5px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
          }}
        >
          <option value="">كل الأوامر</option>
          <option value="confirmed">مُنفَّذة</option>
          <option value="cancelled">ملغاة</option>
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)', fontSize: 14 }}>جاري التحميل...</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <FlaskConical size={48} style={{ color: 'var(--border)', marginBottom: 12 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>لا توجد أوامر تصنيع بعد</p>
            <button
              onClick={() => navigate('/store/manufacturing/create')}
              style={{
                marginTop: 8, padding: '8px 20px', borderRadius: 8, border: 'none',
                background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 13,
              }}
            >
              إنشاء أول أمر تصنيع
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  {['رقم الأمر', 'التاريخ', 'المنتج النهائي', 'الكمية', 'تكلفة الوحدة', 'تكلفة الإجمالية', 'سعر البيع', 'الحالة', ''].map((h) => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                      {o.order_number || `#${o.id}`}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      {o.order_date ? new Date(o.order_date).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600 }}>{o.produced_product_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.produced_variant_name}</div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {o.produced_quantity}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#6366f1', fontWeight: 600 }}>
                      {parseFloat(o.unit_cost).toFixed(2)} ج
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600 }}>
                      {parseFloat(o.production_cost).toFixed(2)} ج
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#22c55e', fontWeight: 600 }}>
                      {o.sale_price ? `${parseFloat(o.sale_price).toFixed(2)} ج` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <StatusBadge status={o.status} />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {o.status === 'confirmed' && (
                          <>
                            <button
                              onClick={() => navigate(`/store/manufacturing/${o.id}/edit`)}
                              title="تعديل"
                              style={{
                                padding: '5px 10px', borderRadius: 6,
                                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                                color: '#6366f1', cursor: 'pointer', fontSize: 12,
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => { setCancelModal(o.id); setCancelReason(''); }}
                              title="إلغاء"
                              style={{
                                padding: '5px 10px', borderRadius: 6,
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                color: '#ef4444', cursor: 'pointer', fontSize: 12,
                              }}
                            >
                              <XCircle size={14} />
                            </button>
                          </>
                        )}
                        {o.status === 'cancelled' && (
                          <button
                            onClick={() => handleDelete(o.id)}
                            title="حذف"
                            style={{
                              padding: '5px 10px', borderRadius: 6,
                              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                              color: '#ef4444', cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────── */}
      {meta && (meta.last_page || meta.total) > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
            السابق
          </button>
          <span style={{ padding: '6px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
            صفحة {page}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={!meta?.next_page_url && page >= (meta?.last_page || 1)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', cursor: 'pointer' }}>
            التالي
          </button>
        </div>
      )}

      {/* ── Cancel Modal ───────────────────────────────────── */}
      {cancelModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}
          onClick={() => setCancelModal(null)}
        >
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: 28,
            width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text)' }}>إلغاء أمر التصنيع</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              سيتم عكس جميع حركات المخزون. هل أنت متأكد؟
            </p>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>سبب الإلغاء (اختياري)</label>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="سبب الإلغاء..."
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
                marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCancel} disabled={actionLoading}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {actionLoading ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
              <button
                onClick={() => setCancelModal(null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'none',
                  color: 'var(--text)', cursor: 'pointer',
                }}
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    confirmed: { label: 'مُنفَّذ', icon: CheckCircle2, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
    cancelled: { label: 'ملغي',  icon: XCircle,      color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  };
  const c = config[status] || { label: status, icon: AlertCircle, color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: c.color, background: c.bg,
    }}>
      <c.icon size={12} /> {c.label}
    </span>
  );
}
