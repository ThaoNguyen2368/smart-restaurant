import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setSessionId = (sessionId: string) => {
  api.defaults.headers.common['X-Session-ID'] = sessionId;
};

export const clearSessionId = () => {
  delete api.defaults.headers.common['X-Session-ID'];
};
