export const RPC_CODE = {
  SUCCESS: 0,
  BUSINESS_ERROR: 1,
  SYSTEM_ERROR: 2,
} as const;

export type RpcCode = (typeof RPC_CODE)[keyof typeof RPC_CODE];

export type RpcOk<T = void> = {
  success: true;
  code?: 0;
} & (T extends void ? Record<string, never> : T);

export type RpcFail = {
  success: false;
  code?: number;
  error: string;
};

export type RpcResult<T = void> = RpcOk<T> | RpcFail;

export type RpcData<T> = T extends void
  ? { success?: boolean; code?: number; error?: string }
  : T & { success?: boolean; code?: number; error?: string };
