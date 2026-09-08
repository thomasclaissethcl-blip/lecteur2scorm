(function () {
  'use strict';

  const SIG_EOCD = 0x06054b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_LOCAL = 0x04034b50;

  function readUint32(view, offset) {
    return view.getUint32(offset, true);
  }

  function readUint16(view, offset) {
    return view.getUint16(offset, true);
  }

  function findEOCD(view) {
    const min = Math.max(0, view.byteLength - 0xffff - 22);
    for (let i = view.byteLength - 22; i >= min; i--) {
      if (readUint32(view, i) === SIG_EOCD) return i;
    }
    throw new Error('Archive ZIP invalide : fin de répertoire central introuvable.');
  }

  function decodeName(bytes, utf8Flag) {
    try {
      return new TextDecoder(utf8Flag ? 'utf-8' : 'windows-1252').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Ce navigateur ne fournit pas DecompressionStream, nécessaire pour décompresser ce ZIP.');
    }
    let stream;
    try {
      stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    } catch (error) {
      throw new Error('Le navigateur ne prend pas en charge la décompression ZIP deflate-raw : ' + error.message);
    }
    const out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  }

  function normalizePath(path) {
    const parts = [];
    String(path || '').replace(/\\/g, '/').split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop();
      else parts.push(part);
    });
    return parts.join('/');
  }

  class BrowserZip {
    constructor(buffer, entries) {
      this.buffer = buffer;
      this.view = new DataView(buffer);
      this.entries = entries;
      this.byName = new Map(entries.map(entry => [entry.name, entry]));
    }

    static async fromFile(file) {
      const buffer = await file.arrayBuffer();
      return BrowserZip.fromArrayBuffer(buffer);
    }

    static fromArrayBuffer(buffer) {
      const view = new DataView(buffer);
      const eocd = findEOCD(view);
      const disk = readUint16(view, eocd + 4);
      const centralDisk = readUint16(view, eocd + 6);
      const entriesOnDisk = readUint16(view, eocd + 8);
      const totalEntries = readUint16(view, eocd + 10);
      const centralSize = readUint32(view, eocd + 12);
      const centralOffset = readUint32(view, eocd + 16);

      if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
        throw new Error('Les archives ZIP multi-disques ne sont pas prises en charge.');
      }
      if (centralOffset === 0xffffffff || centralSize === 0xffffffff || totalEntries === 0xffff) {
        throw new Error('ZIP64 n’est pas encore pris en charge par cette première version.');
      }

      const entries = [];
      let ptr = centralOffset;
      for (let i = 0; i < totalEntries; i++) {
        if (ptr + 46 > view.byteLength || readUint32(view, ptr) !== SIG_CENTRAL) {
          throw new Error('Archive ZIP invalide : entrée du répertoire central illisible.');
        }

        const flags = readUint16(view, ptr + 8);
        const method = readUint16(view, ptr + 10);
        const compressedSize = readUint32(view, ptr + 20);
        const uncompressedSize = readUint32(view, ptr + 24);
        const nameLength = readUint16(view, ptr + 28);
        const extraLength = readUint16(view, ptr + 30);
        const commentLength = readUint16(view, ptr + 32);
        const localOffset = readUint32(view, ptr + 42);

        if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
          throw new Error('Une entrée ZIP64 a été détectée ; elle n’est pas encore prise en charge.');
        }

        const nameBytes = new Uint8Array(buffer, ptr + 46, nameLength);
        const rawName = decodeName(nameBytes, Boolean(flags & 0x0800));
        const name = normalizePath(rawName);
        const isDirectory = rawName.endsWith('/');

        if (flags & 0x0001) {
          throw new Error(`Le fichier « ${name} » est chiffré ; les ZIP protégés par mot de passe ne sont pas pris en charge.`);
        }

        entries.push({
          name,
          rawName,
          flags,
          method,
          compressedSize,
          uncompressedSize,
          localOffset,
          isDirectory
        });

        ptr += 46 + nameLength + extraLength + commentLength;
      }

      return new BrowserZip(buffer, entries);
    }

    listFiles() {
      return this.entries.filter(entry => !entry.isDirectory && entry.name);
    }

    findManifest() {
      const candidates = this.entries.filter(entry => !entry.isDirectory && /(^|\/)imsmanifest\.xml$/i.test(entry.name));
      candidates.sort((a, b) => a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length);
      return candidates[0] || null;
    }

    async read(name) {
      const normalized = normalizePath(name);
      const entry = this.byName.get(normalized);
      if (!entry) throw new Error(`Fichier introuvable dans le ZIP : ${normalized}`);
      if (entry.isDirectory) return new Uint8Array();

      const offset = entry.localOffset;
      if (offset + 30 > this.view.byteLength || readUint32(this.view, offset) !== SIG_LOCAL) {
        throw new Error(`En-tête ZIP local invalide pour « ${entry.name} ».`);
      }
      const localNameLength = readUint16(this.view, offset + 26);
      const localExtraLength = readUint16(this.view, offset + 28);
      const dataStart = offset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + entry.compressedSize;
      if (dataEnd > this.view.byteLength) {
        throw new Error(`Données ZIP tronquées pour « ${entry.name} ».`);
      }

      const compressed = new Uint8Array(this.buffer, dataStart, entry.compressedSize);
      if (entry.method === 0) return new Uint8Array(compressed);
      if (entry.method === 8) return inflateRaw(compressed);
      throw new Error(`Méthode de compression ZIP non prise en charge (${entry.method}) pour « ${entry.name} ».`);
    }

    async text(name) {
      const bytes = await this.read(name);
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  window.BrowserZip = BrowserZip;
  window.normalizeScormPath = normalizePath;
})();
