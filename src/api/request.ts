import axios from "axios";
import { useStore } from '@/store/index'

declare module "axios" {
  interface AxiosResponse<T = any> {
    code: number;
  }
  export function create(config?: AxiosRequestConfig): AxiosInstance;
}

const instance = axios.create({
  headers: {
    "Content-Type": "application/json;charset=UTF-8",
    // "Content-Type":"multipart/form-data",
    "Access-Control-Allow-Origin-Type": "*",
  },
  timeout: 1000 * 30,
  baseURL: import.meta.env.VITE_BASE_URL,
  withCredentials: false,
});

interface PendingType {
  url?: string;
  method?: string;
  params: any;
  data: any;
  cancel: any;
}

const pending: Array<PendingType> = [];
const CancelToken = axios.CancelToken;

// 请求拦截
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.cancelToken = new CancelToken((c) => {
      pending.push({
        url: config.url,
        method: config.method,
        params: config.params,
        data: config.data,
        cancel: c,
      });
    });
    if (config.data instanceof FormData) {
      config.headers["Content-Type"] = "multipart/form-data;charset=UTF-8";
    } else {
      config.headers["Content-Type"] = "application/json";
      config.data = JSON.stringify(config.data);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error.data.error.message);
  }
);

// 响应拦截
instance.interceptors.response.use(
  (config) => {
    console.log('进入了这里')
    if (
      config.status === 200 ||
      config.status === 201 ||
      config.status === 204
    ) {
      console.log('进入了这里')
      return Promise.resolve(config.data);
    } else {
      return Promise.reject(config);
    }
  },
  (error) => {
    if (error.response.status === 401) {
      localStorage.removeItem('token');
      const store = useStore()
      store.token = "";
    }
    return Promise.reject(error.response);
  }
);

export default instance;
