import axios from './axios';

export const getSalesInvoices = (page = 1, filters = {}) =>
	axios.get('/store/sales-invoices', {
		params: {
			page,
			per_page: 10,
			...filters,
		},
	});
export const createSalesInvoice = (data) => axios.post('/store/sales-invoices', data);
export const updateSalesInvoice = (id, data) => axios.put(`/store/sales-invoices/${id}`, data);
export const getSalesInvoice = (id) => axios.get(`/store/sales-invoices/${id}`);
export const cancelSalesInvoice = (id, data) => axios.post(`/store/sales-invoices/${id}/cancel`, data);
export const searchSalesInvoices = (search = '', filters = {}) =>
	axios.get('/store/sales-invoices', {
		params: {
			search,
			per_page: 20,
			...filters,
		},
	});

export const getSalesReturns = (params = {}) =>
	axios.get('/store/sales-returns', {
		params: {
			per_page: 50,
			...params,
		},
	});
export const createSalesReturn = (data) => axios.post('/store/sales-returns', data);
export const getSalesReturn = (id) => axios.get(`/store/sales-returns/${id}`);
export const updateSalesReturn = (id, data) => axios.put(`/store/sales-returns/${id}`, data);
export const deleteSalesReturn = (id) => axios.delete(`/store/sales-returns/${id}`);
export const getSalesRepsStats = () => axios.get('/store/sales-invoices/reps-stats');
export const deleteSalesInvoice = (id) => axios.delete(`/store/sales-invoices/${id}`);
export const getSalesCategoryStats = (params = {}) =>
	axios.get('/store/sales-invoices/category-stats', { params });

