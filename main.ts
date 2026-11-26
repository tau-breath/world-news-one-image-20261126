import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1_048_576;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(message: string): never {
  throw new Error(`entry.png: ${message}`);
}

function validatePng(bytes: Buffer): void {
  if (bytes.length < 33) fail('file is too short to be a complete PNG');
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) fail('missing PNG signature');
  if (bytes.length > MAX_BYTES) fail(`file is ${bytes.length} bytes, above the 1 MiB limit`);
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') fail('missing IHDR chunk');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 1024 || height !== 1024) fail(`expected 1024×1024, found ${width}×${height}`);
  if (bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') {
    fail('missing final IEND chunk');
  }
}

try {
  const source = fileURLToPath(new URL('./entry.png', import.meta.url));
  const bytes = readFileSync(source);
  validatePng(bytes);
  const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const destination = join(outputDirectory, 'entry.png');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  console.log(`Wrote ${bytes.length} identical bytes to ${destination}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
