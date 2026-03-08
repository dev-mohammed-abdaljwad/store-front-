import axios from './axios';

export const getSettings = () => axios.get('/store/settings');

export const updateSettings = (data) => axios.put('/store/settings', data);

export const uploadLogo = (file) => {
  const form = new FormData();
  form.append('logo', file);

  return axios.post('/store/settings/logo', form, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const deleteLogo = () => axios.delete('/store/settings/logo');

export const changePassword = (data) => axios.put('/store/settings/password', data);
