import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

import type { V2ArchiveEntry, V2ArchivePorts } from "@yard-core";

/**
 * Application archive-output service (Application context, R3/R8).
 *
 * Stored (uncompressed) ZIP writer behind the authorized
 * `operations.archive.createZip` contract: core authorizes sources,
 * names, grants, collisions, and job ownership, then calls this port
 * for the bytes. The reference extension never imports a ZIP codec
 * itself (and never the v1 service).
 *
 * Streaming with bounded memory: file entries stream from disk in
 * 64 KiB chunks with sequential writes, so archive size is not
 * bounded by heap. In-memory text entries (the manifest) encode
 * once; the core 1 MiB text cap keeps them small.
 *
 * Limits (ZIP32, no ZIP64): at most 65,535 entries, 4 GiB per entry,
 * 4 GiB central-directory offset/size. Violations reject before any
 * misleading success, and a failed write removes the partial output
 * so cancellation/interruption never leaves a corrupt archive behind.
 */

const MAX_ZIP32_VALUE = 0xffffffff;
const MAX_ZIP32_ENTRIES = 0xffff;
const DATA_DESCRIPTOR_FLAG = 0x0808;

const crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function updateCrc32(crc: number, buffer: Buffer): number {
  let next = crc;
  for (const byte of buffer) next = crcTable[(next ^ byte) & 0xff] ^ (next >>> 8);
  return next;
}

function dosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function encodedName(name: string): Buffer {
  const encoded = Buffer.from(name, "utf8");
  if (encoded.length > 0xffff) {
    throw new Error(`ZIP entry name is too long: ${name}`);
  }
  return encoded;
}

function localHeader(name: Buffer, modifiedAt: Date): Buffer {
  const { dosDate, dosTime } = dosDateTime(modifiedAt);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(DATA_DESCRIPTOR_FLAG, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name]);
}

function dataDescriptor(crc: number, size: number): Buffer {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(size, 8);
  descriptor.writeUInt32LE(size, 12);
  return descriptor;
}

function centralHeader(
  name: Buffer,
  record: { crc: number; size: number; offset: number; modifiedAt: Date },
): Buffer {
  const { dosDate, dosTime } = dosDateTime(record.modifiedAt);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(DATA_DESCRIPTOR_FLAG, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(dosTime, 12);
  header.writeUInt16LE(dosDate, 14);
  header.writeUInt32LE(record.crc, 16);
  header.writeUInt32LE(record.size, 20);
  header.writeUInt32LE(record.size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(record.offset, 42);
  return Buffer.concat([header, name]);
}

function endOfCentralDirectory(recordCount: number, centralSize: number, centralOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(recordCount, 8);
  end.writeUInt16LE(recordCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return end;
}

function assertZip32(value: number, description: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ZIP32_VALUE) {
    throw new Error(`${description} exceeds the ZIP32 4 GiB limit; split the pack into smaller archives`);
  }
}

type PlannedEntry =
  | { kind: "file"; name: Buffer; label: string; sourcePath: string; size: number; modifiedAt: Date }
  | { kind: "text"; name: Buffer; label: string; bytes: Buffer };

export function createV2ArchivePorts(): V2ArchivePorts {
  return {
    createZipArchive: async (entries: readonly V2ArchiveEntry[], destPath: string) => {
      if (entries.length > MAX_ZIP32_ENTRIES) {
        throw new Error(`ZIP packs support at most ${MAX_ZIP32_ENTRIES} files`);
      }
      const planned: PlannedEntry[] = await Promise.all(
        entries.map(async (entry) => {
          const name = encodedName(entry.name);
          if ("text" in entry) {
            const bytes = Buffer.from(entry.text, "utf8");
            assertZip32(bytes.length, `ZIP entry ${entry.name}`);
            return {
              kind: "text" as const,
              name,
              label: entry.name,
              bytes,
            };
          }
          const stats = await fs.promises.stat(entry.sourcePath);
          if (!stats.isFile()) {
            throw new Error(`ZIP source is not a file: ${entry.sourcePath}`);
          }
          assertZip32(stats.size, `ZIP entry ${entry.name}`);
          return {
            kind: "file" as const,
            name,
            label: entry.name,
            sourcePath: entry.sourcePath,
            size: stats.size,
            modifiedAt: stats.mtime,
          };
        }),
      );

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      const handle = await fs.promises.open(destPath, "w");
      const central: Array<{ name: Buffer; crc: number; size: number; offset: number; modifiedAt: Date }> = [];
      let offset = 0;
      let bytesWritten = 0;
      try {
        for (const entry of planned) {
          assertZip32(offset, "ZIP entry offset");
          const modifiedAt = entry.kind === "file" ? entry.modifiedAt : new Date();
          const header = localHeader(entry.name, modifiedAt);
          await handle.write(header);
          bytesWritten += header.length;
          let crc = 0xffffffff;
          let written = 0;
          if (entry.kind === "text") {
            crc = updateCrc32(crc, entry.bytes);
            written = entry.bytes.length;
            await handle.write(entry.bytes);
            bytesWritten += written;
          } else {
            for await (const chunk of fs.createReadStream(entry.sourcePath, {
              highWaterMark: 64 * 1024,
            })) {
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
              crc = updateCrc32(crc, buffer);
              written += buffer.length;
              await handle.write(buffer);
              bytesWritten += buffer.length;
            }
            if (written !== entry.size) {
              throw new Error(`ZIP source changed while reading: ${entry.sourcePath}`);
            }
          }
          crc = (crc ^ 0xffffffff) >>> 0;
          const descriptor = dataDescriptor(crc, written);
          await handle.write(descriptor);
          bytesWritten += descriptor.length;
          central.push({ name: entry.name, crc, size: written, offset, modifiedAt });
          offset += header.length + written + descriptor.length;
        }

        const centralOffset = offset;
        assertZip32(centralOffset, "ZIP central-directory offset");
        let centralSize = 0;
        for (const record of central) {
          const header = centralHeader(record.name, record);
          await handle.write(header);
          bytesWritten += header.length;
          centralSize += header.length;
        }
        assertZip32(centralSize, "ZIP central-directory size");
        const end = endOfCentralDirectory(central.length, centralSize, centralOffset);
        await handle.write(end);
        bytesWritten += end.length;
      } catch (error) {
        await handle.close();
        await fs.promises.rm(destPath, { force: true });
        throw error;
      }
      await handle.close();
      return { bytesWritten };
    },
  };
}
