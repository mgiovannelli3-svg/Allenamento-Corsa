// Apre i file .zip scaricati da Garmin Connect e restituisce i file FIT contenuti.
// Usa la decompressione integrata nel browser (nessuna libreria esterna).

export async function unzipFits(buffer) {
  const view = new DataView(buffer);
  const out = [];
  // cerca la "directory centrale" dalla fine del file
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Archivio zip non valido');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const lower = name.toLowerCase();
    if (!lower.endsWith('.fit') && !lower.endsWith('.zip')) continue;
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buffer.slice(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflate(raw);
    else continue;
    if (lower.endsWith('.zip')) out.push(...await unzipFits(data)); // zip dentro zip (export completo)
    else out.push({ name, data });
  }
  return out;
}

async function inflate(raw) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([raw]).stream().pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}
