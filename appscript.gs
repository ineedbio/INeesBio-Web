// =====================================================
// INeedPOSN — Google Apps Script Backend
// วาง code นี้ใน script.google.com แล้ว Deploy
// =====================================================

// ── ตั้งค่าตรงนี้ ──────────────────────────────────
const SS_ID   = 'ใส่ Spreadsheet ID ของคุณที่นี่';   // จาก URL ของ Google Sheet
const SHEET   = 'Orders';
const FOLDER  = 'INeedPOSN_Slips';                   // ชื่อโฟลเดอร์ใน Drive สำหรับเก็บสลิป
// ────────────────────────────────────────────────────

/* ── CORS helper ── */
function cors(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── POST handler ── */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'create_order') return cors(ContentService.createTextOutput(JSON.stringify(createOrder(body.order))));
    if (body.action === 'update_status') return cors(ContentService.createTextOutput(JSON.stringify(updateStatus(body.orderId, body.status))));
    return cors(ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unknown action' })));
  } catch (err) {
    return cors(ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message })));
  }
}

/* ── GET handler ── */
function doGet(e) {
  try {
    if (e.parameter.action === 'get_orders') return cors(ContentService.createTextOutput(JSON.stringify(getOrders())));
    return cors(ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unknown action' })));
  } catch (err) {
    return cors(ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message })));
  }
}

/* ── Get or create sheet with headers ── */
function getSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET);
    const headers = ['ORDER ID','วันที่สมัคร','ชื่อ-นามสกุล','อีเมล','เบอร์โทร','LINE ID','โรงเรียน','คอร์ส','courseKey','ราคา (฿)','URL สลิป','สถานะ'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1a1a2e').setFontColor('#ffd60a').setFontWeight('bold');
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(7, 220);
    sheet.setColumnWidth(8, 180);
    sheet.setColumnWidth(11, 200);
  }
  return sheet;
}

/* ── Get or create Drive folder for slips ── */
function getFolder() {
  const iter = DriveApp.getFoldersByName(FOLDER);
  return iter.hasNext() ? iter.next() : DriveApp.createFolder(FOLDER);
}

/* ── Upload base64 slip image to Drive, return public URL ── */
function uploadSlip(base64DataUrl, orderId) {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) return '';
  try {
    const parts    = base64DataUrl.split(',');
    const mime     = parts[0].replace('data:', '').replace(';base64', '');
    const decoded  = Utilities.base64Decode(parts[1]);
    const blob     = Utilities.newBlob(decoded, mime, orderId + '_slip');
    const folder   = getFolder();
    const file     = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  } catch (err) {
    Logger.log('Slip upload error: ' + err.message);
    return 'ERROR:' + err.message;
  }
}

/* ── Create a new order row ── */
function createOrder(order) {
  const sheet   = getSheet();
  const slipUrl = uploadSlip(order.slip, order.id);
  sheet.appendRow([
    order.id,
    new Date(order.timestamp),
    order.name,
    order.email,
    order.phone,
    order.line   || '',
    order.school || '',
    order.course,
    order.courseKey,
    order.price,
    slipUrl,
    'pending'
  ]);
  // Colour the status cell
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 12).setBackground('#2a1f00').setFontColor('#ff9f0a');

  // Auto-resize key columns
  sheet.autoResizeColumn(3);
  return { ok: true, orderId: order.id, slipUrl };
}

/* ── Fetch all orders (newest first) ── */
function getOrders() {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, orders: [] };

  const orders = data.slice(1).map(row => ({
    id        : String(row[0]),
    timestamp : row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
    name      : String(row[2]),
    email     : String(row[3]),
    phone     : String(row[4]),
    line      : String(row[5]),
    school    : String(row[6]),
    course    : String(row[7]),
    courseKey : String(row[8]),
    price     : Number(row[9]),
    slipUrl   : String(row[10]),
    status    : String(row[11]),
  })).reverse();

  return { ok: true, orders };
}

/* ── Update status of a single order ── */
function updateStatus(orderId, status) {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  const COLOR = { pending: ['#2a1f00','#ff9f0a'], paid: ['#0a2a14','#30d158'], rejected: ['#2a0a08','#ff453a'] };
  const c     = COLOR[status] || ['#111','#aaa'];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderId)) {
      const cell = sheet.getRange(i + 1, 12);
      cell.setValue(status).setBackground(c[0]).setFontColor(c[1]);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Order not found: ' + orderId };
}
