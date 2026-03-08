import axios from './axios';

export const getInventory = () => axios.get('/store/inventory');
