export interface DbpfResource {
  type: number;
  group: number;
  instHi: number;
  instLo: number;
  data: Uint8Array;
  compType: number;
  sizeDecomp: number;
}

/**
 * Parses a DBPF 2.1 container (.save or .package).
 * Handles index flags: bits 0/1/2 indicate type/group/instHi are constant
 * (stored once after the flags word, not repeated per entry).
 */
export function parseDbpf(buffer: ArrayBuffer): DbpfResource[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'DBPF') throw new Error('Not a DBPF file');

  const major = view.getUint32(4, true);
  const minor = view.getUint32(8, true);
  if (major !== 2 || minor !== 1) throw new Error(`Unsupported DBPF version ${major}.${minor}`);

  const indexCount = view.getUint32(36, true);
  const indexOffset = view.getUint32(64, true);

  const resources: DbpfResource[] = [];

  // Index header: 4-byte flags word
  const flags = view.getUint32(indexOffset, true);
  const typeConst    = (flags & 0x01) !== 0;
  const groupConst   = (flags & 0x02) !== 0;
  const instHiConst  = (flags & 0x04) !== 0;

  // Constant fields follow the flags word
  let headerPos = indexOffset + 4;
  let constType   = 0;
  let constGroup  = 0;
  let constInstHi = 0;
  if (typeConst)   { constType   = view.getUint32(headerPos, true); headerPos += 4; }
  if (groupConst)  { constGroup  = view.getUint32(headerPos, true); headerPos += 4; }
  if (instHiConst) { constInstHi = view.getUint32(headerPos, true); headerPos += 4; }

  // Per-entry size depends on which fields are NOT constant
  const entrySize = 32 - (typeConst ? 4 : 0) - (groupConst ? 4 : 0) - (instHiConst ? 4 : 0);

  let pos = headerPos;
  for (let i = 0; i < indexCount; i++) {
    if (pos + entrySize > buffer.byteLength) break;

    let off = pos;
    const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
    const group   = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
    const instHi  = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
    const instLo  = view.getUint32(off, true); off += 4;
    const offset  = view.getUint32(off, true); off += 4;
    const sizeComp   = view.getUint32(off, true) & 0x7fffffff; off += 4;
    const sizeDecomp = view.getUint32(off, true); off += 4;
    const compType   = view.getUint16(off, true);

    resources.push({
      type, group, instHi, instLo,
      data: bytes.slice(offset, offset + sizeComp),
      compType,
      sizeDecomp,
    });

    pos += entrySize;
  }

  return resources;
}

export function instanceIdHex(r: DbpfResource): string {
  return (
    r.instHi.toString(16).padStart(8, '0') +
    r.instLo.toString(16).padStart(8, '0')
  );
}
