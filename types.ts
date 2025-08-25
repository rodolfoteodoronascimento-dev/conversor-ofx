
export interface Transaction {
  date: string; // YYYYMMDD
  description: string;
  amount: number;
}

export enum ConversionStatus {
  Idle = 'idle',
  Processing = 'processing',
  Success = 'success',
  Error = 'error',
}
