import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE_LIMIT = 1_048_576;
const EXPECTED_SIDE = 1024;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

type PngChunk = {
  kind: string;
  payload: Buffer;
  nextOffset: number;
};

// Locate the repository image independently of the caller's working directory.
function repositoryImage(): string {
  return fileURLToPath(new URL('./entry.png', import.meta.url));
}

// Read one chunk and reject truncated data or bytes beyond the file boundary.
function chunkAt(bytes: Buffer, offset: number): PngChunk {
  if (offset + 12 > bytes.length) {
    throw new Error('truncated PNG chunk header');
  }
  const payloadLength = bytes.readUInt32BE(offset);
  const payloadStart = offset + 8;
  const payloadEnd = payloadStart + payloadLength;
  const nextOffset = payloadEnd + 4;
  if (nextOffset > bytes.length) {
    throw new Error('PNG chunk extends beyond the end of the file');
  }
  const kind = bytes.toString('ascii', offset + 4, offset + 8);
  if (!/^[A-Za-z]{4}$/.test(kind)) {
    throw new Error('invalid PNG chunk type');
  }
  return { kind, payload: bytes.subarray(payloadStart, payloadEnd), nextOffset };
}

// Check the complete chunk sequence, dimensions, and terminal IEND marker.
function verifyPng(bytes: Buffer): void {
  if (bytes.length > SIZE_LIMIT) {
    throw new Error(`file is ${bytes.length} bytes; the 1 MiB limit is ${SIZE_LIMIT}`);
  }
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error('missing PNG signature');
  }

  const header = chunkAt(bytes, PNG_MAGIC.length);
  if (header.kind !== 'IHDR' || header.payload.length !== 13) {
    throw new Error('the first PNG chunk must be a 13-byte IHDR');
  }
  const width = header.payload.readUInt32BE(0);
  const height = header.payload.readUInt32BE(4);
  if (width !== EXPECTED_SIDE || height !== EXPECTED_SIDE) {
    throw new Error(`expected ${EXPECTED_SIDE}×${EXPECTED_SIDE}, found ${width}×${height}`);
  }

  let offset = header.nextOffset;
  let hasImageData = false;
  while (offset < bytes.length) {
    const chunk = chunkAt(bytes, offset);
    if (chunk.kind === 'IDAT') hasImageData = true;
    if (chunk.kind === 'IEND') {
      if (chunk.payload.length !== 0 || chunk.nextOffset !== bytes.length) {
        throw new Error('IEND must be an empty final PNG chunk');
      }
      if (!hasImageData) throw new Error('PNG contains no IDAT image data');
      return;
    }
    offset = chunk.nextOffset;
  }
  throw new Error('missing final IEND chunk');
}

// Choose the requested output directory, using /output only when unset.
function outputDirectory(): string {
  const configured = process.env.MAKEFUN_OUTPUT_DIR;
  if (configured === undefined) return '/output';
  if (configured.trim().length === 0) {
    throw new Error('MAKEFUN_OUTPUT_DIR is set but empty');
  }
  return configured;
}

// Return a stable SHA-256 fingerprint for the source and copied bytes.
function fingerprint(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Create the destination, copy the bytes, and read them back for verification.
function publishVerifiedCopy(bytes: Buffer, destination: string): Buffer {
  mkdirSync(dirname(destination), { recursive: true });
  try {
    if (statSync(destination).isDirectory()) {
      throw new Error(`output path is an existing directory: ${destination}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  writeFileSync(destination, bytes);
  return readFileSync(destination);
}

// Run validation and publication, reporting one concise error on failure.
function main(): void {
  try {
    const source = repositoryImage();
    const bytes = readFileSync(source);
    verifyPng(bytes);
    const destination = join(outputDirectory(), 'entry.png');
    const written = publishVerifiedCopy(bytes, destination);
    const sourceHash = fingerprint(bytes);
    const writtenHash = fingerprint(written);
    if (!written.equals(bytes) || sourceHash !== writtenHash) {
      throw new Error('the written file does not match entry.png byte for byte');
    }
    console.log(
      `entry.png: ${bytes.length} bytes; source sha256 ${sourceHash}; written sha256 ${writtenHash}; output ${destination}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
