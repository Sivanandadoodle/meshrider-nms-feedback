// Mesh Rider NMS - feedback store (v3).
//
// What changed from v2: people can attach screenshots and files.
//
// A submission or a reply may carry `files`, a list of
// {name, type, data} where `data` is a base64 data URL. Each file is written
// into a Drive folder, shared "anyone with the link can view" so the public
// feedback page can show it, and its URL is recorded. Submissions keep theirs
// in a new Attachments column; replies keep theirs inside the reply object.
//
// The Attachments column is added to an existing sheet automatically, so the
// 48 rows already there are untouched and keep working.
//
// TO INSTALL: open the feedback Sheet, Extensions -> Apps Script, replace the
// whole script with this, save, then Deploy -> Manage deployments -> Edit
// (pencil) -> Version: New version -> Deploy. Keep the SAME deployment so the
// /exec address does not change - the product and the feedback page both use it.

var SHEET_NAME   = 'Feedback';
var NOTIFY_EMAIL = '';                    // <-- your address, or '' for no email
var FOLDER_NAME  = 'NMS Feedback Attachments';
var MAX_FILE_MB  = 8;                     // per file, after the page has shrunk it
var MAX_FILES    = 4;                     // per submission or reply

var HEADERS = ['ID','Received','Screen','Type','Priority','Comment','Name','Email','Role','Status','Replies','Attachments'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); return sh; }
  // An older sheet has 11 columns. Add the twelfth once, in place.
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (head.indexOf('Attachments') === -1) {
    sh.getRange(1, HEADERS.length).setValue('Attachments');
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function parseJson_(v, fallback) { try { return JSON.parse(v || ''); } catch (e) { return fallback; } }

function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

/**
 * Save the attached files and return [{name, type, url}].
 *
 * Anything that is not a plain data URL is ignored rather than trusted, and a
 * file that fails to save is skipped - one bad attachment must not lose the
 * comment it came with.
 */
function saveFiles_(files) {
  if (!files || !files.length) return [];
  var out = [], f = null;
  var n = Math.min(files.length, MAX_FILES);
  for (var i = 0; i < n; i++) {
    try {
      var d = files[i] || {};
      var m = String(d.data || '').match(/^data:([^;,]+);base64,(.+)$/);
      if (!m) continue;
      var bytes = Utilities.base64Decode(m[2]);
      if (bytes.length > MAX_FILE_MB * 1024 * 1024) continue;
      var name = String(d.name || 'attachment').replace(/[\\\/\r\n]/g, '_').slice(0, 120);
      if (!f) f = folder_();
      var file = f.createFile(Utilities.newBlob(bytes, m[1], name));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      out.push({ name: name, type: m[1], url: 'https://drive.google.com/uc?id=' + file.getId() });
    } catch (e) { /* skip this one, keep the rest */ }
  }
  return out;
}

function doGet(e) {
  // ?info=1 answers with which Sheet this is and which version is deployed.
  // Nobody can find their way back from an /exec address otherwise, and it
  // costs one line to make that never be a problem again.
  if (e && e.parameter && e.parameter.info) {
    var ss0 = SpreadsheetApp.getActiveSpreadsheet();
    return json_({ version: 3, sheetName: ss0.getName(), sheetUrl: ss0.getUrl(),
                   attachmentsFolder: FOLDER_NAME });
  }

  var sh = sheet_(), last = sh.getLastRow(), out = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      out.push({
        id: String(r[0]), createdAt: r[1], screen: r[2], type: r[3], priority: r[4],
        comment: r[5], name: r[6], email: r[7], role: r[8], status: r[9],
        replies: parseJson_(r[10], []), attachments: parseJson_(r[11], [])
      });
    }
  }
  out.reverse();  // newest first
  return json_({ feedback: out });
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var sh = sheet_();
    var action = d.action || (d.kind === 'reply' ? 'reply' : 'submit');

    if (action === 'reply') {
      var id = String(d.id || ''), last = sh.getLastRow();
      var ids = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) !== id) continue;
        var row = i + 2;
        if (d.status) sh.getRange(row, 10).setValue(d.status);
        var text = d.text || d.response;
        var att = saveFiles_(d.files);
        if (text || att.length) {
          var arr = parseJson_(sh.getRange(row, 11).getValue(), []);
          arr.push({ text: text || '', at: d.at || new Date().toISOString(),
                     by: d.by || 'anonymous', attachments: att });
          sh.getRange(row, 11).setValue(JSON.stringify(arr));
        }
        return json_({ ok: true, attachments: att });
      }
      return json_({ ok: false, error: 'id not found' });
    }

    // submit
    var files = saveFiles_(d.files);
    var newId = Utilities.getUuid();
    sh.appendRow([newId, new Date(), d.screen || '', d.type || '', d.priority || '',
                  d.comment || '', d.name || '', d.email || '', d.role || '',
                  'New', '[]', JSON.stringify(files)]);
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(NOTIFY_EMAIL,
        'NMS feedback: ' + (d.type || 'note') + ' on ' + (d.screen || '?'),
        (d.comment || '') + '\n\n- ' + (d.name || 'anonymous') + '  ' + (d.email || '') +
        (files.length ? '\n\n' + files.length + ' attachment(s):\n' +
          files.map(function (x) { return x.url; }).join('\n') : ''));
    }
    return json_({ ok: true, id: newId, attachments: files });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
