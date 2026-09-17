declare module 'serialport' {
  export class SerialPort {
    constructor(options: { path: string; baudRate: number; autoOpen?: boolean });
    open(): Promise<void>;
    close(): Promise<void>;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    write(data: Buffer | string, callback?: (err?: Error | null) => void): boolean;
  }
}
