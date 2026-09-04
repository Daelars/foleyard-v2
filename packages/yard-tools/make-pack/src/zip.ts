import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

type ZipEntry = { sourcePath: string; archiveName: string };
type CentralDirectoryRecord = {
  archiveName: string;
  crc: number;
  size: number;
  offset: number;
  modifiedAt: Date;
};

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

function updateCrc32(crc: number, buffer: Buffer) {
  let next = crc;
  for (const byte of buffer) next = crcTable[(next ^ byte) & 0xff] ^ (next >>> 8);
  return next;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function encodedName(archiveName: string) {
  const name = Buffer.from(archiveName, "utf8");
  if (name.length > 0xffff) throw new Error(`ZIP entry name is too long: ${archiveName}`);
  return name;
}

function makeLocalHeader(archiveName: string, modifiedAt: Date) {
  const name = encodedName(archiveName);
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

function makeDataDescriptor(crc: number, size: number) {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(size, 8);
  descriptor.writeUInt32LE(size, 12);
  return descriptor;
}

function makeCentralDirectoryHeader(record: CentralDirectoryRecord) {
  const name = encodedName(record.archiveName);
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

function makeEndOfCentralDirectory(recordCount: number, centralSize: number, centralOffset: number) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(recordCount, 8);
  end.writeUInt16LE(recordCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return end;
}

function assertZip32(value: number, description: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ZIP32_VALUE) {
    throw new Error(`${description} exceeds the ZIP32 4 GiB limit; split the pack into smaller archives`);
  }
}

export async function writeStoredZip(zipPath: string, entries: ZipEntry[]) {
  if (entries.length > MAX_ZIP32_ENTRIES) {
    throw new Error(`ZIP packs support at most ${MAX_ZIP32_ENTRIES} files`);
  }

  const planned = await Promise.all(entries.map(async (entry) => {
    const stats = await fs.promises.stat(entry.sourcePath);
    if (!stats.isFile()) throw new Error(`ZIP source is not a file: ${entry.sourcePath}`);
    assertZip32(stats.size, `ZIP entry ${entry.archiveName}`);
    encodedName(entry.archiveName);
    return { ...entry, size: stats.size, modifiedAt: stats.mtime };
  }));

  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
  const handle = await fs.promises.open(zipPath, "w");
  const records: CentralDirectoryRecord[] = [];
  let offset = 0;

  try {
    for (const entry of planned) {
      assertZip32(offset, "ZIP entry offset");
      const header = makeLocalHeader(entry.archiveName, entry.modifiedAt);
      await handle.write(header);
      let crc = 0xffffffff;
      let written = 0;
      for await (const chunk of fs.createReadStream(entry.sourcePath)) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        crc = updateCrc32(crc, buffer);
        written += buffer.length;
        await handle.write(buffer);
      }
      if (written !== entry.size) throw new Error(`ZIP source changed while reading: ${entry.sourcePath}`);
      crc = (crc ^ 0xffffffff) >>> 0;
      const descriptor = makeDataDescriptor(crc, written);
      await handle.write(descriptor);
      records.push({
        archiveName: entry.archiveName,
        crc,
        size: written,
        offset,
        modifiedAt: entry.modifiedAt,
      });
      offset += header.length + written + descriptor.length;
    }

    const centralOffset = offset;
    assertZip32(centralOffset, "ZIP central-directory offset");
    let centralSize = 0;
    for (const record of records) {
      const header = makeCentralDirectoryHeader(record);
      await handle.write(header);
      centralSize += header.length;
    }
    assertZip32(centralSize, "ZIP central-directory size");
    await handle.write(makeEndOfCentralDirectory(records.length, centralSize, centralOffset));
  } catch (error) {
    await handle.close();
    await fs.promises.rm(zipPath, { force: true });
    throw error;
  }

  await handle.close();
}
