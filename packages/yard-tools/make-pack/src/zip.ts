import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

type ZipEntry = {
  sourcePath: string;
  archiveName: string;
};

type CentralDirectoryRecord = {
  archiveName: string;
  crc: number;
  size: number;
  offset: number;
};

const crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function makeLocalHeader(
  archiveName: string,
  crc: number,
  size: number,
  modifiedAt: Date,
) {
  const name = Buffer.from(archiveName, "utf8");
  const { dosDate, dosTime } = dosDateTime(modifiedAt);
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);

  return Buffer.concat([header, name]);
}

function makeCentralDirectoryHeader(record: CentralDirectoryRecord) {
  const name = Buffer.from(record.archiveName, "utf8");
  const now = dosDateTime(new Date());
  const header = Buffer.alloc(46);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(now.dosTime, 12);
  header.writeUInt16LE(now.dosDate, 14);
  header.writeUInt32LE(record.crc, 16);
  header.writeUInt32LE(record.size, 20);
  header.writeUInt32LE(record.size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(record.offset, 42);

  return Buffer.concat([header, name]);
}

function makeEndOfCentralDirectory(
  recordCount: number,
  centralSize: number,
  centralOffset: number,
) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(recordCount, 8);
  end.writeUInt16LE(recordCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

export async function writeStoredZip(zipPath: string, entries: ZipEntry[]) {
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });

  const handle = await fs.promises.open(zipPath, "w");
  const records: CentralDirectoryRecord[] = [];
  let offset = 0;

  try {
    for (const entry of entries) {
      const data = await fs.promises.readFile(entry.sourcePath);
      const stats = await fs.promises.stat(entry.sourcePath);
      const crc = crc32(data);
      const header = makeLocalHeader(
        entry.archiveName,
        crc,
        data.length,
        stats.mtime,
      );

      await handle.write(header);
      await handle.write(data);
      records.push({
        archiveName: entry.archiveName,
        crc,
        size: data.length,
        offset,
      });
      offset += header.length + data.length;
    }

    const centralOffset = offset;
    let centralSize = 0;

    for (const record of records) {
      const header = makeCentralDirectoryHeader(record);
      await handle.write(header);
      centralSize += header.length;
    }

    await handle.write(
      makeEndOfCentralDirectory(records.length, centralSize, centralOffset),
    );
  } finally {
    await handle.close();
  }
}
