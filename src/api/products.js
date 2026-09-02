import axios from './axios';

export const getProducts = (page = 1, filters = {}) =>
	axios.get('/store/products', {
		params: {
			page,
			per_page: 10,
			...filters,
		},
	});

export const createProduct = (data) => axios.post('/store/products', data);
export const updateProduct = (id, data) => axios.put(`/store/products/${id}`, data);
export const deleteProduct = (id) => axios.delete(`/store/products/${id}`);

export const addVariant = (productId, data) => axios.post(`/store/products/${productId}/variants`, data);
export const updateVariant = (productId, variantId, data) =>
	axios.put(`/store/products/${productId}/variants/${variantId}`, data);
export const deleteVariant = (productId, variantId) => axios.delete(`/store/products/${productId}/variants/${variantId}`);

export const searchProducts = (search = '', filters = {}) =>
	axios.get('/store/products', {
		params: {
			search,
			per_page: 20,
			...filters,
		},
	});

export const searchVariants = (search = '', filters = {}) =>
	axios.get('/store/products/dropdown', {
		params: {
			search,
			per_page: 20,
			...filters,
		},
	});