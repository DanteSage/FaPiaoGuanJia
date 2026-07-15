import type { InvoiceApi } from "./ipc";

export {};

declare global {
  interface Window {
    invoiceApi: InvoiceApi;
  }
}
