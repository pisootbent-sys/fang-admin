// ============================================================
//  ระบบธุรการ สกร.ระดับอำเภอฝาง - Code.gs (Version 2.2)
//  Fix: setSharing แยก try/catch ไม่ให้ crash ทั้ง function
// ============================================================
 
var SHEET_ID  = '1_C_zyidGq2IRoQRIIa13gGANYJUGFvUWBDq2VHb5bDI';
var FOLDER_ID = '17SRtCTftGz0Lqg1de_rVkt7crTEANqxQ';
var LOGO_FILE_ID = 'ใส่ไฟล์ไอดีโลโก้ที่นี่';   // ID ไฟล์โลโก้ใน Google Drive
 
var HEADERS_INCOMING = [
  'id', 'เลขรับ', 'เลขที่หนังสือ', 'ลงวันที่',
  'จากหน่วยงาน', 'เรื่อง', 'วันที่รับ', 'หมายเหตุ',
  'ลิงก์ไฟล์', 'วันที่สร้าง'
];
 
// ─── Web App Entry ────────────────────────────────────────────
 
function doGet(e) {
  // เปิดลิงก์ /exec?ping=1 เพื่อทดสอบว่า API ทำงาน (ได้ข้อความ JSON)
  if (e && e.parameter && e.parameter.ping) return jsonOut_({ success: true, pong: true });
  try {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('ระบบธุรการ สกร.อำเภอฝาง')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  } catch (err) {
    // ไม่มีไฟล์ index ในโปรเจกต์ (ใช้หน้าเว็บบน GitHub Pages แทน)
    return jsonOut_({ success: true, message: 'API พร้อมใช้งาน — เปิดระบบผ่านหน้าเว็บบน GitHub Pages' });
  }
}
 
// ─── API สำหรับหน้าเว็บที่โฮสต์นอก Apps Script (เช่น GitHub Pages) ──────
// หน้าเว็บส่ง POST (JSON ในรูปข้อความ) มาที่ลิงก์ /exec — ทุกคำสั่งต้องแนบ u/p
// ชื่อผู้ใช้/รหัสผ่านตั้งใน Project Settings > Script Properties:
//   ADMIN_USER, ADMIN_PASS (แอดมิน)   USER_USER, USER_PASS (ผู้ใช้ทั่วไป ดูอย่างเดียว)
// ถ้าไม่ได้ตั้ง จะใช้ค่าเดิม 009/009 และ 09/09 (แนะนำให้เปลี่ยนทันที)

var ADMIN_ONLY_ACTIONS = {
  createYearSheet: 1, addData: 1, updateData: 1, deleteData: 1,
  uploadFile: 1, ocrExtract: 1, mergeAgencies: 1
};

function authRole_(u, p) {
  var props = PropertiesService.getScriptProperties();
  var au = props.getProperty('ADMIN_USER') || '009', ap = props.getProperty('ADMIN_PASS') || '009';
  var uu = props.getProperty('USER_USER')  || '09',  up = props.getProperty('USER_PASS')  || '09';
  if (u && p && u === au && p === ap) return 'admin';
  if (u && p && u === uu && p === up) return 'user';
  return null;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var CUR_ = { u: '', role: '' };   // ผู้ใช้ของคำสั่งที่กำลังทำงาน (ใช้บันทึกประวัติ)

function usingDefaultPass_() {
  var props = PropertiesService.getScriptProperties();
  return !props.getProperty('ADMIN_PASS') || !props.getProperty('USER_PASS');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var role = authRole_(String(req.u || ''), String(req.p || ''));
    var u = req.u; delete req.u; delete req.p;
    CUR_ = { u: String(u || ''), role: role || '' };
    if (!role) {
      Utilities.sleep(800);   // หน่วงเล็กน้อย ลดการเดารหัสผ่านรัวๆ
      out = { success: false, auth: false, error: 'AUTH' };
    } else if (req.action === 'login') {
      out = { success: true, role: role, defaultPass: usingDefaultPass_() };
    } else if (ADMIN_ONLY_ACTIONS[req.action] && role !== 'admin') {
      out = { success: false, error: 'ไม่มีสิทธิ์ทำรายการนี้' };
    } else {
      out = handleClientRequest(req);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    out = { success: false, error: err.message };
  }
  return jsonOut_(out);
}

// ─── Main Dispatcher ─────────────────────────────────────────

function handleClientRequest(req) {
  try {
    var a = req.action;
    if (a === 'getAvailableYears') return getAvailableYears();
    if (a === 'createYearSheet')   return createYearSheet(req.year);
    if (a === 'getData')           return { success: true, data: getData(req.year) };
    if (a === 'addData')           return addData(req.data, req.year);
    if (a === 'updateData')        return updateData(req.data, req.year);
    if (a === 'deleteData')        return deleteData(req.id, req.year);
    if (a === 'uploadFile')        return uploadFile(req.fileData);
    if (a === 'getLogo')           return getLogo();
    if (a === 'ocrExtract')        return ocrExtract(req.fileData);
    if (a === 'mergeAgencies')     return mergeAgencies(req.map, req.year);
    if (a === 'getAgencyDirectory') return getAgencyDirectory();
    return { success: false, error: 'Unknown action: ' + a };
  } catch (e) {
    Logger.log('handleClientRequest error: ' + e.message);
    return { success: false, error: e.message };
  }
}
 
// ─── Utilities ────────────────────────────────────────────────
 
function getSpreadsheet() {
  try { return SpreadsheetApp.openById(SHEET_ID); }
  catch (e) {
    try { return SpreadsheetApp.getActiveSpreadsheet(); }
    catch (e2) { throw new Error('ไม่สามารถเปิด Spreadsheet ได้'); }
  }
}
 
function getBuddhistYear() { return new Date().getFullYear() + 543; }
function getSheetName(y)   { return 'หนังสือรับ' + y; }
 
// authorize helper — รันใน Script Editor เพื่อให้สิทธิ์
function authorizeApp() {
  DriveApp.getRootFolder();
  SpreadsheetApp.openById(SHEET_ID);
  // ขอสิทธิ์เรียก API ภายนอก (ใช้อ่านข้อความจาก OCR)
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis?name=drive&preferred=true', { muteHttpExceptions: true });
  Logger.log('Authorization สำเร็จ');
}
 
// ─── Logo (อ่านจาก Google Drive ตาม LOGO_FILE_ID) ──────────────
 
function getLogo() {
  try {
    // อ่าน ID จาก Script Properties ก่อน (ไม่หายเวลาวางโค้ดใหม่) ถ้าไม่มีค่อยใช้ค่าในโค้ด
    var id = PropertiesService.getScriptProperties().getProperty('LOGO_FILE_ID') || LOGO_FILE_ID;
    if (!id || id.indexOf('ใส่') === 0) return { success: false, error: 'ยังไม่ได้ตั้งค่า LOGO_FILE_ID' };
    var cache = CacheService.getScriptCache();
    var key = 'logo_data_uri_' + id;
    var hit = cache.get(key);
    if (hit) return { success: true, src: hit };
    var blob = DriveApp.getFileById(id).getBlob();
    var src = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    if (src.length < 95000) cache.put(key, src, 21600);
    return { success: true, src: src };
  } catch (e) { return { success: false, error: e.message }; }
}
 
// ─── OCR: อ่านข้อความจากไฟล์หนังสือด้วย Google Drive (ฟรี) ──────
 
function ocrExtract(fileData) {
  var tmpId = null;
  try {
    if (!fileData || !fileData.base64) throw new Error('ไม่พบข้อมูลไฟล์');
    // ปิดการใช้ Gemini แล้ว — ใช้ OCR ฟรีของ Drive อย่างเดียว
    if (typeof Drive === 'undefined') throw new Error('ยังไม่ได้เปิดใช้ Drive API v3 (เมนู Services ด้านซ้าย > + > Drive API)');
    if (!fileData || !fileData.base64) throw new Error('ไม่พบข้อมูลไฟล์');
    var mime = fileData.mimeType || 'application/octet-stream';
    var blob = Utilities.newBlob(Utilities.base64Decode(fileData.base64), mime, fileData.name || 'scan');
    var created = Drive.Files.create(
      { name: 'OCR_tmp_' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
      blob,
      { ocrLanguage: 'th' }
    );
    tmpId = created.id;
    var text = docToText_(tmpId);
    return { success: true, mode: 'drive', text: String(text || '').slice(0, 20000) };
  } catch (e) {
    Logger.log('ocrExtract error: ' + e.message);
    return { success: false, error: 'อ่านไฟล์ไม่สำเร็จ: ' + e.message };
  } finally {
    if (tmpId) { try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (e2) {} }
  }
}
 
// อ่านข้อความจาก Google Doc ที่ OCR แล้ว
function docToText_(id) {
  var errs = [];
  // วิธีที่ 1: เรียก Drive export ด้วย token ของผู้ใช้ (ต้องมีสิทธิ์ external_request)
  try {
    var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text%2Fplain', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) return res.getContentText('UTF-8');
    errs.push('HTTP ' + res.getResponseCode());
  } catch (e) { errs.push(e.message); }
  // วิธีที่ 2: Drive Advanced Service
  try {
    var r = Drive.Files.export(id, 'text/plain', { alt: 'media' });
    if (typeof r === 'string') return r;
    if (r && typeof r.getDataAsString === 'function') return r.getDataAsString('UTF-8');
    if (r && r.length) return Utilities.newBlob(r).getDataAsString('UTF-8');
  } catch (e2) { errs.push(e2.message); }
  throw new Error('ยังไม่ได้อนุญาตสิทธิ์ที่จำเป็น — เปิด Script Editor เลือกฟังก์ชัน authorizeApp แล้วกด Run (กดอนุญาตทุกข้อ) จากนั้น Deploy > Manage deployments > แก้ไข > New version แล้วลองใหม่  [รายละเอียด: ' + errs.join(' | ') + ']');
}
 
// ─── ส่งออกรายงาน Excel ──────────────────────────────
 
// (ส่งออก Excel สร้างไฟล์ฝั่งหน้าเว็บ ไม่ต้องเรียก server)
 
// ─── รวมชื่อหน่วยงานที่ซ้ำ/พิมพ์ไม่ตรงกัน (เฉพาะปีที่เลือก) ─────
 
function mergeAgencies(map, year) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (!year) year = getBuddhistYear();
    var sheet = getSpreadsheet().getSheetByName(getSheetName(year));
    if (!sheet) throw new Error('ไม่พบ Sheet ปี ' + year);
    map = map || {};
    function has(k) { return Object.prototype.hasOwnProperty.call(map, k) && map[k]; }
    var colA = HEADERS_INCOMING.indexOf('จากหน่วยงาน') + 1;
    var colS = HEADERS_INCOMING.indexOf('เรื่อง') + 1;
    var last = sheet.getLastRow();
    if (last < 2) return { success: true, changed: 0 };
    var rngA = sheet.getRange(2, colA, last - 1, 1), rngS = sheet.getRange(2, colS, last - 1, 1);
    var va = rngA.getValues(), vs = rngS.getValues();
    var changedRows = 0, touchA = false, touchS = false;
    for (var i = 0; i < va.length; i++) {
      var rowChanged = false;
      var cur = String(va[i][0]).trim();
      if (has(cur) && map[cur] !== cur) { va[i][0] = String(map[cur]).trim(); touchA = true; rowChanged = true; }
      // หนังสือหลายฉบับ: เก็บเป็น JSON ในคอลัมน์ เรื่อง
      var s = String(vs[i][0]).replace(/^'/, '');
      if (s.charAt(0) === '[') {
        try {
          var arr = JSON.parse(s), ch = false;
          if (Array.isArray(arr)) {
            arr.forEach(function(o) {
              if (o && typeof o === 'object') {
                var a = String(o['จากหน่วยงาน'] || '').trim();
                if (has(a) && map[a] !== a) { o['จากหน่วยงาน'] = String(map[a]).trim(); ch = true; }
              }
            });
            if (ch) { vs[i][0] = "'" + JSON.stringify(arr); touchS = true; rowChanged = true; }
          }
        } catch (pe) {}
      }
      if (rowChanged) changedRows++;
    }
    if (touchA) rngA.setValues(va);
    if (touchS) rngS.setValues(vs);
    try {
      var ar = getAgencySheet_();
      if (!ar.created) {
        var dir = readAgencyDir_(ar.sheet), agg = {}, out = [];
        dir.forEach(function(r) {
          var a = (has(r.agency) && map[r.agency] !== r.agency) ? String(map[r.agency]).trim() : r.agency;
          var k = a + '\u0001' + r.prefix;
          if (Object.prototype.hasOwnProperty.call(agg, k)) { var t = out[agg[k]]; t.count += r.count; if (r.last > t.last) t.last = r.last; }
          else { agg[k] = out.length; out.push({ agency: a, prefix: r.prefix, count: r.count, last: r.last }); }
        });
        writeAgencyDir_(ar.sheet, out);
      }
    } catch (de) {}
    return { success: true, changed: changedRows };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
 
// ─── ทะเบียนหน่วยงาน + รูปแบบเลขที่หนังสือ (เรียนรู้จากข้อมูลที่บันทึก ใช้ร่วมทุกปี) ─────
// เช่น หน่วยงาน "สำนักงาน..เชียงใหม่" ใช้รูปแบบ "ที่ ศธ 07043(กอ)/" แล้วเติมเฉพาะเลขหลัง /
 
var AGENCY_SHEET = 'ทะเบียนหน่วยงาน';
var AGENCY_HEADERS = ['หน่วยงาน', 'รูปแบบเลขที่หนังสือ', 'จำนวนครั้ง', 'ใช้ล่าสุด'];
 
function splitDocNo_(no) {
  var s = String(no || '').replace(/^'/, '').replace(/\s+/g, ' ').trim();
  var m = s.match(/^(.*\/\s*[^\d]*?)(\d+)$/);
  if (m) return { prefix: m[1], suffix: m[2] };
  m = s.match(/^(.*\/)\s*([^\/\d][^\/]*)$/);   // ส่วนท้ายเป็นตัวอักษร เช่น .../พิเศษ
  return m ? { prefix: m[1], suffix: m[2].trim() } : null;
}
 
// ดึงคู่ (หน่วยงาน, เลขที่หนังสือ) ของทุกฉบับในหนึ่งเลขรับ
function recordPairs_(rec) {
  var out = [];
  var raw = String(rec['เรื่อง'] || '').replace(/^'/, '');
  if (raw.charAt(0) === '[') {
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.some(function(o) { return o && typeof o === 'object'; })) {
        arr.forEach(function(o) {
          if (o && typeof o === 'object') out.push({ from: String(o['จากหน่วยงาน'] || '').trim(), no: String(o['เลขที่หนังสือ'] || '').trim() });
        });
        return out;
      }
    } catch (e) {}
  }
  out.push({ from: String(rec['จากหน่วยงาน'] || '').trim(), no: String(rec['เลขที่หนังสือ'] || '').trim() });
  return out;
}
 
function getAgencySheet_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(AGENCY_SHEET);
  if (sh) return { sheet: sh, created: false };
  sh = ss.insertSheet(AGENCY_SHEET);
  var r = sh.getRange(1, 1, 1, AGENCY_HEADERS.length);
  r.setValues([AGENCY_HEADERS]);
  r.setBackground('#3d5a99').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  [320, 260, 90, 170].forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange('A:B').setNumberFormat('@');
  sh.setFrozenRows(1);
  return { sheet: sh, created: true };
}
 
function readAgencyDir_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 4).getValues().map(function(r) {
    return { agency: String(r[0]).trim(), prefix: String(r[1]), count: Number(r[2]) || 0, last: String(r[3] || '') };
  }).filter(function(r) { return r.agency && r.prefix; });
}
 
function writeAgencyDir_(sh, rows) {
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 4).clearContent();
  if (!rows.length) return;
  rows.sort(function(a, b) { return a.agency.localeCompare(b.agency, 'th') || b.count - a.count; });
  sh.getRange(2, 1, rows.length, 4).setValues(rows.map(function(r) { return [r.agency, r.prefix, r.count, r.last]; }));
}
 
// สร้างทะเบียนจากข้อมูลทุกปีที่มีอยู่ (ทำอัตโนมัติครั้งแรก หรือรันเองจาก Script Editor ได้)
function rebuildAgencyDirectory() {
  var res = getAgencySheet_();
  return rebuildAgencyDir_(res.sheet);
}
 
function rebuildAgencyDir_(sh) {
  var agg = {}, order = [];
  getSpreadsheet().getSheets().forEach(function(s) {
    if (!/^หนังสือรับ\d{4}$/.test(s.getName()) || s.getLastRow() < 2) return;
    var vals = s.getDataRange().getDisplayValues();
    var h = vals[0];
    var iF = h.indexOf('จากหน่วยงาน'), iN = h.indexOf('เลขที่หนังสือ'), iS = h.indexOf('เรื่อง'), iC = h.indexOf('วันที่สร้าง');
    if (iF < 0 || iN < 0) return;
    for (var i = 1; i < vals.length; i++) {
      var rec = { 'จากหน่วยงาน': vals[i][iF], 'เลขที่หนังสือ': vals[i][iN], 'เรื่อง': iS >= 0 ? vals[i][iS] : '' };
      var created = iC >= 0 ? String(vals[i][iC]) : '';
      recordPairs_(rec).forEach(function(p) {
        var sp = splitDocNo_(p.no);
        if (!p.from || !sp) return;
        var key = p.from + '\u0001' + sp.prefix;
        if (!agg[key]) { agg[key] = { agency: p.from, prefix: sp.prefix, count: 0, last: '' }; order.push(key); }
        agg[key].count++;
        if (created > agg[key].last) agg[key].last = created;
      });
    }
  });
  var rows = order.map(function(k) { return agg[k]; });
  writeAgencyDir_(sh, rows);
  return rows;
}
 
function getAgencyDirectory() {
  try {
    var res = getAgencySheet_();
    var rows = res.created ? rebuildAgencyDir_(res.sheet) : readAgencyDir_(res.sheet);
    return { success: true, rows: rows.map(function(r) { return [r.agency, r.prefix, r.count, r.last]; }) };
  } catch (e) { return { success: false, error: e.message }; }
}
 
// บันทึกรูปแบบเลขที่ที่ใช้จริง (เพิ่มใหม่ถ้ายังไม่เคยมี / นับครั้งเพิ่มถ้า incExisting)
function learnAgencyPairs_(pairs, incExisting) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var res = getAgencySheet_();
    var rows = res.created ? rebuildAgencyDir_(res.sheet) : readAgencyDir_(res.sheet);
    var idx = {};
    rows.forEach(function(r, i) { idx[r.agency + '\u0001' + r.prefix] = i; });
    var now = new Date().toISOString(), changed = false;
    pairs.forEach(function(p) {
      var sp = splitDocNo_(p.no);
      if (!p.from || !sp) return;
      var key = p.from + '\u0001' + sp.prefix;
      if (Object.prototype.hasOwnProperty.call(idx, key)) {
        if (incExisting) { rows[idx[key]].count++; rows[idx[key]].last = now; changed = true; }
      } else {
        idx[key] = rows.length;
        rows.push({ agency: p.from, prefix: sp.prefix, count: 1, last: now });
        changed = true;
      }
    });
    if (changed) writeAgencyDir_(res.sheet, rows);
  } catch (e) {
    Logger.log('learnAgencyPairs_: ' + e.message);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
 
// ─── Year Management ──────────────────────────────────────────
 
function getAvailableYears() {
  try {
    var years = getSpreadsheet().getSheets()
      .map(function(s) { return s.getName(); })
      .filter(function(n) { return /^หนังสือรับ\d{4}$/.test(n); })
      .map(function(n) { return parseInt(n.replace('หนังสือรับ', ''), 10); })
      .filter(function(y) { return y > 2400; })
      .sort(function(a, b) { return b - a; });
    if (!years.length) years.push(getBuddhistYear());
    return { success: true, years: years };
  } catch (e) { return { success: false, error: e.message }; }
}
 
function createYearSheet(year) {
  try {
    var ss = getSpreadsheet();
    var name = getSheetName(year);
    if (ss.getSheetByName(name)) return { success: true, sheetName: name };
    var sheet = ss.insertSheet(name);
    var r = sheet.getRange(1, 1, 1, HEADERS_INCOMING.length);
    r.setValues([HEADERS_INCOMING]);
    r.setBackground('#3d5a99').setFontColor('#ffffff')
     .setFontWeight('bold').setHorizontalAlignment('center');
    [50,90,120,110,160,300,110,160,110,110].forEach(function(w, i) {
      sheet.setColumnWidth(i + 1, w);
    });
    sheet.setFrozenRows(1);
    return { success: true, sheetName: name };
  } catch (e) { return { success: false, error: e.message }; }
}
 
// ─── CRUD ─────────────────────────────────────────────────────
 
function getData(year) {
  try {
    if (!year) year = getBuddhistYear();
    var sheet = getSpreadsheet().getSheetByName(getSheetName(year));
    if (!sheet || sheet.getLastRow() < 2) return [];
    var rows = sheet.getDataRange().getDisplayValues();
    var h = rows[0];
    return rows.slice(1).map(function(row) {
      var obj = {};
      h.forEach(function(key, i) { obj[key] = String(row[i]).replace(/^'/, ''); });
      return obj;
    });
  } catch (e) { Logger.log('getData: ' + e.message); return []; }
}
 
// ─── บันทึกประวัติการใช้งาน + ถังขยะ ────────────────────────────
var AUDIT_SHEET = 'บันทึกการใช้งาน';
var TRASH_SHEET = 'ถังขยะ';

function getOrMakeSheet_(name, headers, widths) {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name);
  var r = sh.getRange(1, 1, 1, headers.length);
  r.setValues([headers]);
  r.setBackground('#3d5a99').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  (widths || []).forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(1);
  return sh;
}

function audit_(action, year, recNo, detail) {
  try {
    var sh = getOrMakeSheet_(AUDIT_SHEET, ['เวลา', 'ผู้ใช้', 'สิทธิ์', 'การกระทำ', 'ปี', 'เลขรับ', 'รายละเอียด'], [160, 110, 70, 110, 60, 100, 380]);
    sh.appendRow([Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'), CUR_.u, CUR_.role, action, year || '', "'" + (recNo || ''), String(detail || '').slice(0, 300)]);
  } catch (e) { Logger.log('audit_: ' + e.message); }
}

function addData(data, year) {
  // ล็อกกันสองคนบันทึกพร้อมกันแล้วได้เลขรับซ้ำ
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (le) {
    return { success: false, error: 'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่อีกครั้ง' };
  }
  var res;
  try {
    res = addDataLocked_(data, year);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
  // เรียนรู้ทะเบียนหน่วยงานหลังปล่อยล็อกเลขรับแล้ว (ฟังก์ชันนี้ขอล็อกของมันเอง)
  if (res && res.success) { try { learnAgencyPairs_(recordPairs_(res.data), true); } catch (le) {} }
  return res;
}

function addDataLocked_(data, year) {
  try {
    if (!year) year = getBuddhistYear();
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(getSheetName(year));
    if (!sheet) { createYearSheet(year); sheet = ss.getSheetByName(getSheetName(year)); }
 
    var rnIdx = HEADERS_INCOMING.indexOf('เลขรับ');
    var lastRow = sheet.getLastRow();
    var maxNum = 0;
    if (lastRow >= 2) {
      sheet.getRange(2, rnIdx + 1, lastRow - 1, 1).getValues().forEach(function(r) {
        var parts = String(r[0]).replace(/'/g, '').split('/');
        if (parts.length === 2 && parseInt(parts[0], 10) == year) {
          var n = parseInt(parts[1], 10);
          if (n > maxNum) maxNum = n;
        }
      });
    }
    data['เลขรับ']      = year + '/' + (maxNum + 1);
    data['id']          = data['id'] || Utilities.getUuid();
    data['วันที่สร้าง'] = new Date().toISOString();
 
    var row = HEADERS_INCOMING.map(function(h) {
      var v = data[h] || '';
      return (h === 'ลิงก์ไฟล์' || h === 'เลขรับ' || h === 'เรื่อง') && v ? "'" + v : v;
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    audit_('เพิ่ม', year, data['เลขรับ'], (data['เลขที่หนังสือ'] || '') + ' | ' + (data['จากหน่วยงาน'] || ''));
    return { success: true, data: data };
  } catch (e) { return { success: false, error: e.message }; }
}
 
function updateData(data, year) {
  try {
    if (!year) year = getBuddhistYear();
    var sheet = getSpreadsheet().getSheetByName(getSheetName(year));
    if (!sheet) throw new Error('ไม่พบ Sheet ปี ' + year);
 
    var values = sheet.getDataRange().getValues();
    var idIdx  = HEADERS_INCOMING.indexOf('id');
    var rowIdx = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idIdx]).replace(/'/g,'') === String(data['id'])) {
        rowIdx = i + 1; break;
      }
    }
    if (rowIdx === -1) throw new Error('ไม่พบข้อมูล id=' + data['id']);
 
    data['วันที่สร้าง'] = new Date().toISOString();
    var row = HEADERS_INCOMING.map(function(h) {
      var v = (data[h] !== undefined) ? data[h] : values[rowIdx - 1][HEADERS_INCOMING.indexOf(h)];
      return (h === 'ลิงก์ไฟล์' || h === 'เรื่อง') && v ? "'" + v : v;
    });
    sheet.getRange(rowIdx, 1, 1, HEADERS_INCOMING.length).setValues([row]);
    audit_('แก้ไข', year, String(values[rowIdx - 1][HEADERS_INCOMING.indexOf('เลขรับ')]).replace(/'/g, ''), (data['เลขที่หนังสือ'] || '') + ' | ' + (data['จากหน่วยงาน'] || ''));
    try { learnAgencyPairs_(recordPairs_(data), false); } catch (le) {}
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}
 
function deleteData(id, year) {
  try {
    if (!year) year = getBuddhistYear();
    var sheet = getSpreadsheet().getSheetByName(getSheetName(year));
    if (!sheet) throw new Error('ไม่พบ Sheet');
    var values = sheet.getDataRange().getValues();
    var idIdx  = HEADERS_INCOMING.indexOf('id');
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idIdx]).replace(/'/g,'') === String(id)) {
        // ย้ายไปแผ่น "ถังขยะ" ก่อนลบ เพื่อกู้คืนได้ (เปิดแผ่นถังขยะ คัดลอกแถวกลับไปวางในแผ่นปีนั้น)
        try {
          var tr = getOrMakeSheet_(TRASH_SHEET, ['ลบเมื่อ', 'ลบโดย', 'ปี'].concat(HEADERS_INCOMING), [150, 100, 60]);
          var old = values[i].map(function(v, k) {
            var t = String(v instanceof Date ? v.toISOString() : v);
            return (HEADERS_INCOMING[k] === 'ลิงก์ไฟล์' || HEADERS_INCOMING[k] === 'เรื่อง' || HEADERS_INCOMING[k] === 'เลขรับ') && t ? "'" + t.replace(/^'/, '') : t;
          });
          tr.appendRow([Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'), CUR_.u, year].concat(old));
        } catch (te) { throw new Error('สำรองลงถังขยะไม่สำเร็จ จึงยังไม่ลบ: ' + te.message); }
        audit_('ลบ', year, String(values[i][HEADERS_INCOMING.indexOf('เลขรับ')]).replace(/'/g, ''), String(values[i][HEADERS_INCOMING.indexOf('เลขที่หนังสือ')]));
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    throw new Error('ไม่พบข้อมูล');
  } catch (e) { return { success: false, error: e.message }; }
}
 
// ─── File Upload ──────────────────────────────────────────────
// แยก setSharing ออกเป็น try/catch ต่างหาก
// ถ้า policy องค์กรบล็อก sharing → ยังคืน URL กลับได้ ไม่ crash
 
function uploadFile(fileData) {
  var file;
 
  // Step 1: สร้างไฟล์ใน Drive
  try {
    if (!fileData || !fileData.base64) throw new Error('ไม่พบข้อมูลไฟล์');
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var blob = Utilities.newBlob(
      Utilities.base64Decode(fileData.base64),
      fileData.mimeType || 'application/octet-stream',
      fileData.name
    );
    file = folder.createFile(blob);
  } catch (e) {
    return { success: false, error: 'อัพโหลดไฟล์ไม่สำเร็จ: ' + e.message };
  }
 
  // Step 2: พยายาม setSharing — ถ้าไม่ได้ก็ไม่เป็นไร ไฟล์ upload สำเร็จแล้ว
  // รูปแบบการแชร์ตั้งได้ที่ Script Properties ชื่อ FILE_SHARING:
  //   link   = ทุกคนที่มีลิงก์ดูได้ (ค่าเริ่มต้น ใช้ได้โดยไม่ต้องล็อกอิน Google)
  //   domain = เฉพาะบัญชี Google ในหน่วยงาน (ปลอดภัยกว่า แต่ต้องล็อกอินบัญชีหน่วยงานในเบราว์เซอร์ก่อนจึงเปิดไฟล์ได้)
  //   private = ไม่แชร์ (เปิดได้เฉพาะเจ้าของโฟลเดอร์)
  try {
    var mode = PropertiesService.getScriptProperties().getProperty('FILE_SHARING') || 'link';
    if (mode === 'domain') file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    else if (mode === 'private') file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    else file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('setSharing ไม่สำเร็จ (อาจถูก policy บล็อก): ' + e.message);
  }
 
  return {
    success: true,
    file: {
      name: fileData.name,
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view'
    }
  };
}
// ─── สำรองข้อมูลอัตโนมัติ ──────────────────────────────────────
// คัดลอก Google Sheet ทั้งไฟล์ไปเก็บในโฟลเดอร์ย่อย "สำรองข้อมูล" (ใน FOLDER_ID) เก็บล่าสุด 8 ชุด
// ตั้งให้ทำงานทุกสัปดาห์: Apps Script > เมนูซ้าย Triggers (ไอคอนนาฬิกา) > Add Trigger
//   Function = backupWeekly, Event source = Time-driven, Type = Week timer
// ทดสอบทันที: เลือกฟังก์ชัน backupWeekly แล้วกด Run

function backupWeekly() {
  var root = DriveApp.getFolderById(FOLDER_ID);
  var it = root.getFoldersByName('สำรองข้อมูล');
  var folder = it.hasNext() ? it.next() : root.createFolder('สำรองข้อมูล');
  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd_HHmm');
  DriveApp.getFileById(SHEET_ID).makeCopy('สำรอง_หนังสือรับ_' + stamp, folder);
  var files = [], fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort(function(a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(8).forEach(function(f) { try { f.setTrashed(true); } catch (e) {} });
  Logger.log('สำรองข้อมูลสำเร็จ: ' + stamp + ' (เก็บ ' + Math.min(files.length, 8) + ' ชุด)');
}
