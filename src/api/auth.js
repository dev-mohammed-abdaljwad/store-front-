import axios from './axios';

export const loginApi = (data) => axios.post('/auth/login', data);

export const logoutApi = () => axios.post('/store/logout');

export const sendResetLinkApi = (data) => axios.post('/auth/forgot-password', data);

export const confirmResetPasswordApi = (data) => axios.post('/auth/reset-password', data);