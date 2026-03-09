import axios from './axios';

export const getInventory = () => axios.get('/store/inventory');
export const getInventoryDeficits = () => axios.get('/store/inventory/deficits');
