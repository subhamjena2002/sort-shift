// The few Node APIs the asset checks use. tsconfig keeps Node's global types out
// of the project, so browser code can't accidentally depend on them.
declare module 'node:fs' {
  interface FileBytes {
    toString(encoding: 'ascii', start: number, end: number): string;
    readUIntLE(offset: number, length: number): number;
    readUInt32LE(offset: number): number;
    readUInt16LE(offset: number): number;
  }
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string): FileBytes;
  export function statSync(path: string): { size: number };
}

declare module 'node:path' {
  export function resolve(...parts: string[]): string;
}

declare const __dirname: string;
