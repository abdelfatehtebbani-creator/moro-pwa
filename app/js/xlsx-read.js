// Reads the first sheet of an .xlsx file in the browser (no library): the zip is opened with the browser's own
// deflate, the sheet and its shared strings are read as XML. Returns the rows as arrays of cell values.
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflate(data) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** The files of a zip: {name: Uint8Array} for the names asked (read from the central directory). */
async function unzip(buf, want) {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extra = u16(b, p + 30), comment = u16(b, p + 32), local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!want.some((w) => name === w || (w.endsWith('/') && name.startsWith(w)))) continue;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const raw = b.subarray(start, start + size);
    files[name] = method === 0 ? raw : await inflate(raw);
  }
  return files;
}

const colIndex = (ref) => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

/** Rows of the first sheet of an .xlsx File (strings and numbers). */
export async function readXlsx(file) {
  const files = await unzip(await file.arrayBuffer(), ['xl/sharedStrings.xml', 'xl/worksheets/']);
  const dec = new TextDecoder();
  const xml = (s) => new DOMParser().parseFromString(dec.decode(s), 'application/xml');
  const shared = files['xl/sharedStrings.xml'] ? [...xml(files['xl/sharedStrings.xml']).getElementsByTagName('si')]
    .map((si) => [...si.getElementsByTagName('t')].map((x) => x.textContent).join('')) : [];
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))[0];
  if (!sheetName) throw new Error('no sheet');
  const rows = [];
  for (const r of xml(files[sheetName]).getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const type = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
      let val = '';
      if (type === 's' && v) val = shared[Number(v.textContent)] || '';
      else if (type === 'inlineStr' && is) val = is.textContent;
      else if (v) val = type === 'str' || type === 'b' ? v.textContent : (isNaN(Number(v.textContent)) ? v.textContent : Number(v.textContent));
      row[colIndex(c.getAttribute('r') || 'A')] = val;
    }
    rows.push(Array.from(row, (x) => (x === undefined ? '' : x)));
  }
  return rows;
}
