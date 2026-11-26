import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
  if (outputDirectory.trim() === '') {
    fail('MAKEFUN_OUTPUT_DIR is set but empty');
  }
  const destination = join(outputDirectory, 'entry.png');
  if (existsSync(destination) && statSync(destination).isDirectory()) {
    fail(`the output path already exists as a directory: ${destination}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  const written = readFileSync(destination);
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  const writtenHash = createHash('sha256').update(written).digest('hex');
  console.log(`Wrote ${bytes.length} source bytes and read ${written.length} written bytes at ${destination}`);
  console.log(`sha256 source:  ${sourceHash}`);
  console.log(`sha256 written: ${writtenHash}`);
  if (!written.equals(bytes) || sourceHash !== writtenHash) {
    fail('written file does not match the repository entry.png');
  }
  console.log('sha256 match confirmed');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
