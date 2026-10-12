// Minimal .xlsx writer (no library): one formatted sheet with a title block, a styled header,
// borders, number/date formats, column widths, a filter and a frozen header. ZIP is "stored" (no compression).

const enc = new TextEncoder();
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

// ---------- ZIP (store) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zip(files) {
  const parts = []; const central = []; let offset = 0;
  for (const [name, text] of files) {
    const data = enc.encode(text); const nm = enc.encode(name); const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, 0, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(local.buffer), nm, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, nm.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cenSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- workbook ----------
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd-mmm-yyyy"/><numFmt numFmtId="165" formatCode="#,##0.###"/></numFmts>
<fonts count="5">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="18"/><color rgb="FF16263F"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF6E757D"/><name val="Calibri"/></font>
<font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF212529"/><name val="Calibri"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF16263F"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F5F8"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFC8CED6"/></left><right style="thin"><color rgb="FFC8CED6"/></right><top style="thin"><color rgb="FFC8CED6"/></top><bottom style="thin"><color rgb="FFC8CED6"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="14">
<xf/>
<xf fontId="1" applyFont="1"><alignment horizontal="centerContinuous"/></xf>
<xf fontId="2" applyFont="1"><alignment horizontal="centerContinuous"/></xf>
<xf fontId="3" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf borderId="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="3" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="center"/></xf>
<xf numFmtId="10" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf fontId="4" applyFont="1"><alignment horizontal="centerContinuous"/></xf>
<xf numFmtId="4" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf fontId="2" applyFont="1"/>
<xf fillId="3" borderId="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf fontId="3" fillId="2" applyFont="1" applyFill="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const serial = (iso) => (Date.parse(iso + 'T00:00:00Z') / 86400000) + 25569;

/**
 * report: {title, subtitle, columns: [{label, type: 't'|'n'|'m'|'d'|'p'}], rows: [[...]], company}
 * Returns a Blob (.xlsx).
 */
export function reportToXlsx(report) {
  const cols = report.columns;
  const n = cols.length;
  const last = colName(n - 1);
  const rows = [];
  const cell = (ref, v, s, type) => {
    if (v === '' || v === null || v === undefined) return `<c r="${ref}" s="${s}"/>`;
    if (type === 'd' && /^\d{4}-\d{2}-\d{2}/.test(v)) return `<c r="${ref}" s="${s}"><v>${serial(String(v).slice(0, 10))}</v></c>`;
    if ((type === 'n' || type === 'm' || type === 'p') && isFinite(Number(v))) return `<c r="${ref}" s="${s}"><v>${Number(v)}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const line = (r, cells, ht) => rows.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.join('')}</row>`);
  const span = (r, text, s) => [cell('A' + r, text, s, 't'), ...cols.slice(1).map((_, i) => `<c r="${colName(i + 1)}${r}" s="${s}"/>`)];
  line(1, span(1, report.company || 'ALAKER SWEETS', 1), 28);
  line(2, span(2, 'Inventory Management System', 2), 16);
  line(3, span(3, report.title, 9), 24);
  line(4, [cell('A4', report.subtitle || '', 11, 't'), cell(last + '4', 'Printed: ' + new Date().toLocaleString('en-GB'), 11, 't')]);
  const H = 6;
  line(H, cols.map((c, i) => cell(colName(i) + H, c.label, 3, 't')), 24);
  const style = { t: 4, n: 5, m: 10, d: 7, p: 8 };
  report.rows.forEach((r, k) => {
    const rr = H + 1 + k;
    line(rr, cols.map((c, i) => {
      let s = style[c.type] || 4;
      if (c.type === 'n' && Number(r[i]) % 1 !== 0) s = 6;
      return cell(colName(i) + rr, r[i], s, c.type);
    }));
  });
  const endRow = H + report.rows.length;
  line(endRow + 2, [cell('A' + (endRow + 2), 'Number of records: ' + report.rows.length, 4, 't')]);
  // column widths from content
  const widths = cols.map((c, i) => {
    const longest = Math.max(String(c.label).length, ...report.rows.slice(0, 500).map((r) => String(r[i] ?? '').length));
    return Math.min(Math.max(longest + 3, c.type === 'd' ? 13 : 9), 55);
  });
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${H}" topLeftCell="A${H + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
${report.rows.length ? `<autoFilter ref="A${H}:${last}${endRow}"/>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${widths.reduce((a, b) => a + b, 0) > 110 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L&amp;8ALAKER SWEETS - ${esc(report.title)}&amp;C&amp;8Page &amp;P of &amp;N&amp;R&amp;8&amp;D &amp;T</oddFooter></headerFooter>
</worksheet>`;
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>${report.rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Report!$A$${H}:$${last}$${endRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">Report!$${H}:$${H}</definedName></definedNames>` : ''}</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  return zip(files);
}
