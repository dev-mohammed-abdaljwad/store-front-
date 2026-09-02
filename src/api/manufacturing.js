import axios from './axios';

// ── أوامر التصنيع ────────────────────────────────────────────
export const getManufacturingOrders = (page = 1, filters = {}) =>
  axios.get('/store/manufacturing', { params: { page, per_page: 10, ...filters } });

export const getManufacturingOrder = (id) =>
  axios.get(`/store/manufacturing/${id}`);

export const createManufacturingOrder = (data) =>
  axios.post('/store/manufacturing', data);

export const cancelManufacturingOrder = (id, reason) =>
  axios.post(`/store/manufacturing/${id}/cancel`, { reason });

export const deleteManufacturingOrder = (id) =>
  axios.delete(`/store/manufacturing/${id}`);

export const updateManufacturingOrder = (id, data) =>
  axios.put(`/store/manufacturing/${id}`, data);

// ── BOM (وصفة الإنتاج) ───────────────────────────────────────
export const getVariantBom = (variantId) =>
  axios.get(`/store/products/variants/${variantId}/bom`);

export const saveVariantBom = (variantId, items) =>
  axios.post(`/store/products/variants/${variantId}/bom`, { items });
