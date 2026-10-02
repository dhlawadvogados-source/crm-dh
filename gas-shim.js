/*************************************************************
 * CRM DH LAW - camada "Apps Script no navegador"
 *
 * Este arquivo faz o código do Apps Script (js/codigo.js) rodar
 * direto no navegador, sem servidor:
 *   - imita SpreadsheetApp / Session / Utilities etc.
 *   - lê a planilha inteira pela Google Sheets API e grava as
 *     alterações de volta (batchUpdate) ao final de cada ação;
 *   - substitui o google.script.run, então o front (index.html)
 *     continua chamando as funções do mesmo jeito de antes;
 *   - faz o login com a conta Google (Google Identity Services).
 *
 * Normalmente você NÃO precisa mexer aqui. As configurações
 * ficam em js/config.js e a lógica do CRM em js/codigo.js.
 *************************************************************/
(function () {
  'use strict';

  var CFG = window.CRM_CONFIG || {};
  var SHEET_ID = String(CFG.SPREADSHEET_ID || '').trim();
  var SCOPES = 'https://www.googleapis.com/auth/spreadsheets openid email';
  var STALE_MS = (CFG.RECARREGAR_APOS_SEGUNDOS || 20) * 1000;
  var BACKEND_URL = CFG.BACKEND_URL || 'js/codigo.js';
  var H2C_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var JSPDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  /* =========================================================
   * Datas (o Sheets guarda data como número de dias desde 30/12/1899)
   * ========================================================= */
  var EPOCH = Date.UTC(1899, 11, 30);
  function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
  function serialToDate(s) {
    var u = new Date(EPOCH + Math.round(s * 86400000));
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
  }
  function dateToSerial(d) {
    var u = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
    return (u - EPOCH) / 86400000;
  }
  function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = '0' + n; return n; }
  var MES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DIA_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Utilities.formatDate (padrão Java/SimpleDateFormat). Usa o fuso do navegador.
  function formatDate(d, _tz, pat) {
    if (!isDate(d) || isNaN(d.getTime())) throw new Error('Utilities.formatDate: data inválida');
    var out = '', i = 0;
    pat = String(pat);
    while (i < pat.length) {
      var ch = pat.charAt(i);
      if (ch === "'") {
        var j = pat.indexOf("'", i + 1); if (j < 0) j = pat.length;
        out += (j === i + 1) ? "'" : pat.slice(i + 1, j); i = j + 1; continue;
      }
      if (!/[A-Za-z]/.test(ch)) { out += ch; i++; continue; }
      var k = i; while (k < pat.length && pat.charAt(k) === ch) k++;
      var n = k - i; i = k;
      switch (ch) {
        case 'y': out += n === 2 ? pad(d.getFullYear() % 100) : d.getFullYear(); break;
        case 'M': out += n >= 3 ? MES_EN[d.getMonth()] : pad(d.getMonth() + 1, n); break;
        case 'd': out += pad(d.getDate(), n); break;
        case 'H': out += pad(d.getHours(), n); break;
        case 'h': out += pad((d.getHours() % 12) || 12, n); break;
        case 'm': out += pad(d.getMinutes(), n); break;
        case 's': out += pad(d.getSeconds(), n); break;
        case 'S': out += pad(d.getMilliseconds(), 3); break;
        case 'E': out += DIA_EN[d.getDay()]; break;
        case 'a': out += d.getHours() < 12 ? 'AM' : 'PM'; break;
        case 'u': out += (d.getDay() || 7); break;
        default: out += new Array(n + 1).join(ch);
      }
    }
    return out;
  }

  /* =========================================================
   * Como o Sheets interpreta o que é digitado (versão conservadora):
   * "2026-08-05" e "05/08/2026" viram data, "1234.5" vira número,
   * o resto fica como texto.
   * ========================================================= */
  function parseEntered(s) {
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      var d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      if (d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) return { date: d };
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      var d2 = new Date(+m[3], +m[2] - 1, +m[1]);
      if (d2.getMonth() === +m[2] - 1 && d2.getDate() === +m[1]) return { date: d2 };
    }
    if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s)) return { num: Number(s) };
    return null;
  }

  function displayOf(v) {
    if (v === '' || v == null) return '';
    if (isDate(v)) return formatDate(v, '', 'yyyy-MM-dd');
    if (typeof v === 'number') return String(v).replace('.', ',');
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }

  function hexToColor(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16); if (isNaN(n)) return null;
    return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
  }

  /* =========================================================
   * Modelo em memória da planilha + fila de alterações
   * ========================================================= */
  var PENDING = [];           // requests do batchUpdate, na ordem em que aconteceram
  function push(req) { PENDING.push(req); }

  function SheetModel(ss, id, title, rowCount, colCount) {
    this._ss = ss; this._id = id; this._title = title;
    this._rowCount = rowCount || 1000; this._colCount = colCount || 26;
    this.v = [];   // valores
    this.f = [];   // formato: 'T' texto, 'D' data/hora, '' outro
    this.dsp = []; // texto exibido (para getDisplayValues)
  }
  SheetModel.prototype._ensureRow = function (r) { // r = índice 0-based
    while (this.v.length <= r) { this.v.push([]); this.f.push([]); this.dsp.push([]); }
  };
  SheetModel.prototype._get = function (r, c) {
    var row = this.v[r]; if (!row) return '';
    var x = row[c]; return (x === undefined || x === null) ? '' : x;
  };
  SheetModel.prototype._fmt = function (r, c) { var row = this.f[r]; return (row && row[c]) || ''; };
  SheetModel.prototype._growGrid = function (rows, cols) {
    if (rows > this._rowCount) {
      var addR = Math.max(rows - this._rowCount, 0);
      push({ appendDimension: { sheetId: this._id, dimension: 'ROWS', length: addR } });
      this._rowCount += addR;
    }
    if (cols > this._colCount) {
      var addC = cols - this._colCount;
      push({ appendDimension: { sheetId: this._id, dimension: 'COLUMNS', length: addC } });
      this._colCount += addC;
    }
  };
  SheetModel.prototype._lastRow = function () {
    for (var r = this.v.length - 1; r >= 0; r--) {
      var row = this.v[r];
      for (var c = 0; c < row.length; c++) { var x = row[c]; if (x !== '' && x !== undefined && x !== null) return r + 1; }
    }
    return 0;
  };
  SheetModel.prototype._lastCol = function () {
    var m = 0;
    for (var r = 0; r < this.v.length; r++) {
      var row = this.v[r];
      for (var c = row.length - 1; c >= m; c--) { var x = row[c]; if (x !== '' && x !== undefined && x !== null) { m = c + 1; break; } }
    }
    return m;
  };

  /* ---------- Range ---------- */
  function Range(sh, row, col, nr, nc) {
    if (!(row >= 1) || !(col >= 1) || !(nr >= 1) || !(nc >= 1)) throw new Error('As coordenadas ou dimensões do intervalo são inválidas.');
    this._sh = sh; this._r = row - 1; this._c = col - 1; this._nr = nr; this._nc = nc;
  }
  Range.prototype.getRow = function () { return this._r + 1; };
  Range.prototype.getColumn = function () { return this._c + 1; };
  Range.prototype.getNumRows = function () { return this._nr; };
  Range.prototype.getNumColumns = function () { return this._nc; };
  Range.prototype.getLastRow = function () { return this._r + this._nr; };
  Range.prototype.getLastColumn = function () { return this._c + this._nc; };
  Range.prototype.getSheet = function () { return this._sh._facade; };
  Range.prototype.getValues = function () {
    var out = [];
    for (var i = 0; i < this._nr; i++) {
      var row = [];
      for (var j = 0; j < this._nc; j++) {
        var x = this._sh._get(this._r + i, this._c + j);
        row.push(isDate(x) ? new Date(x.getTime()) : x);
      }
      out.push(row);
    }
    return out;
  };
  Range.prototype.getDisplayValues = function () {
    var out = [];
    for (var i = 0; i < this._nr; i++) {
      var row = [], d = this._sh.dsp[this._r + i] || [];
      for (var j = 0; j < this._nc; j++) {
        var s = d[this._c + j];
        row.push(s === undefined || s === null ? displayOf(this._sh._get(this._r + i, this._c + j)) : String(s));
      }
      out.push(row);
    }
    return out;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.getDisplayValue = function () { return this.getDisplayValues()[0][0]; };
  Range.prototype.setValue = function (v) {
    var m = []; for (var i = 0; i < this._nr; i++) { var row = []; for (var j = 0; j < this._nc; j++) row.push(v); m.push(row); }
    return this.setValues(m);
  };
  Range.prototype.setValues = function (m) {
    var sh = this._sh;
    if (!m || m.length !== this._nr) throw new Error('O número de linhas nos dados não corresponde ao número de linhas no intervalo. Os dados têm ' + (m ? m.length : 0) + ', mas o intervalo tem ' + this._nr + '.');
    sh._growGrid(this._r + this._nr, this._c + this._nc);
    var rows = [], dateCells = [];
    for (var i = 0; i < this._nr; i++) {
      if (!m[i] || m[i].length !== this._nc) throw new Error('O número de colunas nos dados não corresponde ao número de colunas no intervalo. Os dados têm ' + (m[i] ? m[i].length : 0) + ', mas o intervalo tem ' + this._nc + '.');
      var r = this._r + i; sh._ensureRow(r);
      var cells = [];
      for (var j = 0; j < this._nc; j++) {
        var c = this._c + j;
        var enc = encodeCell(m[i][j], sh._fmt(r, c));
        sh.v[r][c] = enc.store; sh.dsp[r][c] = undefined;
        if (enc.date && sh._fmt(r, c) !== 'D') { sh.f[r][c] = 'D'; dateCells.push([r, c]); }
        cells.push(enc.cd);
      }
      rows.push({ values: cells });
    }
    push({ updateCells: { start: { sheetId: sh._id, rowIndex: this._r, columnIndex: this._c }, rows: rows, fields: 'userEnteredValue' } });
    dateCells.forEach(function (rc) {
      push({ repeatCell: { range: { sheetId: sh._id, startRowIndex: rc[0], endRowIndex: rc[0] + 1, startColumnIndex: rc[1], endColumnIndex: rc[1] + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } }, fields: 'userEnteredFormat.numberFormat' } });
    });
    return this;
  };
  Range.prototype.clearContent = function () {
    var sh = this._sh;
    for (var i = 0; i < this._nr; i++) {
      var r = this._r + i; if (!sh.v[r]) continue;
      for (var j = 0; j < this._nc; j++) { sh.v[r][this._c + j] = ''; sh.dsp[r][this._c + j] = undefined; }
    }
    push({ updateCells: { range: this._gridRange(), fields: 'userEnteredValue' } });
    return this;
  };
  Range.prototype.clear = Range.prototype.clearContent;
  Range.prototype._gridRange = function () {
    return { sheetId: this._sh._id, startRowIndex: this._r, endRowIndex: this._r + this._nr, startColumnIndex: this._c, endColumnIndex: this._c + this._nc };
  };
  Range.prototype._fmtReq = function (fmt, fields) {
    this._sh._growGrid(this._r + this._nr, this._c + this._nc);
    push({ repeatCell: { range: this._gridRange(), cell: { userEnteredFormat: fmt }, fields: fields } });
    return this;
  };
  Range.prototype.setNumberFormat = function (p) {
    var sh = this._sh, code = '';
    var nf;
    if (p === '@') { nf = { type: 'TEXT' }; code = 'T'; }
    else if (/[dy]/i.test(p) && !/[#0]/.test(p)) { nf = { type: 'DATE', pattern: p }; code = 'D'; }
    else nf = { type: 'NUMBER', pattern: p };
    for (var i = 0; i < this._nr; i++) { var r = this._r + i; sh._ensureRow(r); for (var j = 0; j < this._nc; j++) sh.f[r][this._c + j] = code; }
    return this._fmtReq({ numberFormat: nf }, 'userEnteredFormat.numberFormat');
  };
  Range.prototype.setNumberFormats = function (m) { return this.setNumberFormat(m[0][0]); };
  Range.prototype.setFontWeight = function (w) { return this._fmtReq({ textFormat: { bold: w === 'bold' } }, 'userEnteredFormat.textFormat.bold'); };
  Range.prototype.setBackground = function (c) { var col = hexToColor(c); return col ? this._fmtReq({ backgroundColor: col }, 'userEnteredFormat.backgroundColor') : this; };
  Range.prototype.setFontColor = function (c) { var col = hexToColor(c); return col ? this._fmtReq({ textFormat: { foregroundColor: col } }, 'userEnteredFormat.textFormat.foregroundColor') : this; };

  function encodeCell(v, fmt) {
    if (v === null || v === undefined || v === '') return { store: '', cd: {} };
    if (typeof v === 'number') {
      if (!isFinite(v)) return { store: String(v), cd: { userEnteredValue: { stringValue: String(v) } } };
      return { store: fmt === 'D' ? serialToDate(v) : v, cd: { userEnteredValue: { numberValue: v } } };
    }
    if (typeof v === 'boolean') return { store: v, cd: { userEnteredValue: { boolValue: v } } };
    if (isDate(v)) {
      if (isNaN(v.getTime())) return { store: '', cd: {} };
      return { store: new Date(v.getTime()), cd: { userEnteredValue: { numberValue: dateToSerial(v) } }, date: true };
    }
    var s = String(v);
    if (fmt === 'T') return { store: s, cd: { userEnteredValue: { stringValue: s } } };
    if (s.charAt(0) === '=') return { store: s, cd: { userEnteredValue: { formulaValue: s } } };
    var p = parseEntered(s);
    if (p && p.date) return { store: p.date, cd: { userEnteredValue: { numberValue: dateToSerial(p.date) } }, date: true };
    if (p && 'num' in p) return { store: fmt === 'D' ? serialToDate(p.num) : p.num, cd: { userEnteredValue: { numberValue: p.num } } };
    return { store: s, cd: { userEnteredValue: { stringValue: s } } };
  }

  /* ---------- Sheet (fachada no formato do Apps Script) ---------- */
  function Sheet(model) { this._m = model; model._facade = this; }
  Sheet.prototype.getName = function () { return this._m._title; };
  Sheet.prototype.getSheetName = Sheet.prototype.getName;
  Sheet.prototype.getSheetId = function () { return this._m._id; };
  Sheet.prototype.getParent = function () { return SS; };
  Sheet.prototype.getMaxRows = function () { return this._m._rowCount; };
  Sheet.prototype.getMaxColumns = function () { return this._m._colCount; };
  Sheet.prototype.getLastRow = function () { return this._m._lastRow(); };
  Sheet.prototype.getLastColumn = function () { return this._m._lastCol(); };
  Sheet.prototype.getRange = function (a, b, c, d) {
    if (typeof a === 'string') return a1Range(this._m, a);
    return new Range(this._m, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  };
  Sheet.prototype.getDataRange = function () {
    return new Range(this._m, 1, 1, Math.max(1, this._m._lastRow()), Math.max(1, this._m._lastCol()));
  };
  Sheet.prototype.appendRow = function (arr) {
    if (!arr || !arr.length) return this;
    var r = this._m._lastRow() + 1;
    new Range(this._m, r, 1, 1, arr.length).setValues([arr.slice()]);
    return this;
  };
  Sheet.prototype.deleteRows = function (start, num) {
    var m = this._m; num = num || 1;
    if (start < 1 || start + num - 1 > m._rowCount) throw new Error('Esses linhas estão fora do intervalo.');
    m.v.splice(start - 1, num); m.f.splice(start - 1, num); m.dsp.splice(start - 1, num);
    m._rowCount -= num;
    push({ deleteDimension: { range: { sheetId: m._id, dimension: 'ROWS', startIndex: start - 1, endIndex: start - 1 + num } } });
    return this;
  };
  Sheet.prototype.deleteRow = function (r) { return this.deleteRows(r, 1); };
  Sheet.prototype.setFrozenRows = function (n) {
    push({ updateSheetProperties: { properties: { sheetId: this._m._id, gridProperties: { frozenRowCount: n } }, fields: 'gridProperties.frozenRowCount' } });
  };
  Sheet.prototype.setFrozenColumns = function (n) {
    push({ updateSheetProperties: { properties: { sheetId: this._m._id, gridProperties: { frozenColumnCount: n } }, fields: 'gridProperties.frozenColumnCount' } });
  };
  Sheet.prototype.clear = function () { return this.getRange(1, 1, Math.max(1, this._m._lastRow()), Math.max(1, this._m._lastCol())).clearContent(), this; };
  Sheet.prototype.clearContents = Sheet.prototype.clear;
  Sheet.prototype.activate = function () { return this; };
  Sheet.prototype.setColumnWidth = function () { return this; };
  Sheet.prototype.autoResizeColumns = function () { return this; };

  function colToNum(s) { var n = 0; s = s.toUpperCase(); for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function a1Range(m, a1) {
    a1 = String(a1).replace(/^.*!/, '').replace(/\$/g, '');
    var p = a1.split(':');
    var s = p[0].match(/^([A-Za-z]+)(\d+)$/), e = p[1] ? p[1].match(/^([A-Za-z]+)(\d+)$/) : s;
    if (!s || !e) throw new Error('Intervalo não suportado: ' + a1);
    var r1 = +s[2], c1 = colToNum(s[1]), r2 = +e[2], c2 = colToNum(e[1]);
    return new Range(m, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
  }

  /* ---------- Spreadsheet (um só objeto, recarregado por dentro) ---------- */
  var SS = {
    _sheets: [],
    getId: function () { return SHEET_ID; },
    getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit'; },
    getName: function () { return SS._title || ''; },
    getSheets: function () { return SS._sheets.map(function (m) { return m._facade; }); },
    getSheetByName: function (n) {
      for (var i = 0; i < SS._sheets.length; i++) if (SS._sheets[i]._title === n) return SS._sheets[i]._facade;
      return null;
    },
    insertSheet: function (name) {
      name = name || ('Página' + (SS._sheets.length + 1));
      if (SS.getSheetByName(name)) throw new Error('Já existe uma página com o nome "' + name + '".');
      var id = 100000 + Math.floor(Math.random() * 2000000000);
      var m = new SheetModel(SS, id, name, 1000, 26);
      new Sheet(m); SS._sheets.push(m);
      push({ addSheet: { properties: { sheetId: id, title: name, gridProperties: { rowCount: 1000, columnCount: 26 } } } });
      return m._facade;
    },
    deleteSheet: function (sheet) {
      var m = sheet._m; SS._sheets = SS._sheets.filter(function (x) { return x !== m; });
      push({ deleteSheet: { sheetId: m._id } });
    },
    getActiveSheet: function () { return SS._sheets[0] ? SS._sheets[0]._facade : null; },
    toast: function () {}
  };

  function buildModel(json) {
    SS._title = json.properties && json.properties.title;
    SS._sheets = (json.sheets || []).map(function (s) {
      var p = s.properties || {}, gp = p.gridProperties || {};
      var m = new SheetModel(SS, p.sheetId, p.title, gp.rowCount, gp.columnCount);
      var rd = (s.data && s.data[0] && s.data[0].rowData) || [];
      for (var r = 0; r < rd.length; r++) {
        var vals = (rd[r] && rd[r].values) || [];
        var rv = [], rf = [], rs = [];
        for (var c = 0; c < vals.length; c++) {
          var cell = vals[c] || {}, ev = cell.effectiveValue, t = cell.effectiveFormat && cell.effectiveFormat.numberFormat && cell.effectiveFormat.numberFormat.type;
          var code = (t === 'TEXT') ? 'T' : ((t === 'DATE' || t === 'DATE_TIME' || t === 'TIME') ? 'D' : '');
          var v = '';
          if (ev) {
            if ('numberValue' in ev) v = code === 'D' ? serialToDate(ev.numberValue) : ev.numberValue;
            else if ('stringValue' in ev) v = ev.stringValue;
            else if ('boolValue' in ev) v = ev.boolValue;
            else if ('errorValue' in ev) v = cell.formattedValue || '#ERROR!';
          }
          rv.push(v); rf.push(code); rs.push(cell.formattedValue === undefined ? '' : cell.formattedValue);
        }
        m.v.push(rv); m.f.push(rf); m.dsp.push(rs);
      }
      new Sheet(m);
      return m;
    });
    SS._loadedAt = Date.now();
  }

  /* =========================================================
   * Serviços do Apps Script que o código usa
   * ========================================================= */
  var USER = { email: '' };
  var PDF_JOBS = {}; var PDF_SEQ = 0;
  function notAvailable(what) { return function () { throw new Error(what + ' só funciona no Apps Script (não está disponível na versão web).'); }; }

  var SpreadsheetApp = {
    openById: function (id) {
      if (String(id) !== SHEET_ID) throw new Error('Esta versão do CRM só acessa a planilha configurada em js/config.js.');
      return SS;
    },
    openByUrl: function (url) { var m = String(url).match(/[-\w]{25,}/); return SpreadsheetApp.openById(m ? m[0] : ''); },
    getActiveSpreadsheet: function () { return SS; },
    getActive: function () { return SS; },
    create: notAvailable('Criar planilha nova'),
    flush: function () {}
  };
  var Session = {
    getActiveUser: function () { return { getEmail: function () { return USER.email; } }; },
    getEffectiveUser: function () { return { getEmail: function () { return USER.email; } }; },
    getScriptTimeZone: function () { return 'America/Sao_Paulo'; },
    getTemporaryActiveUserKey: function () { return USER.email; }
  };
  function utf8b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function PdfMarker(html) { this._html = html; }
  PdfMarker.prototype.getBytes = function () { return this; };
  PdfMarker.prototype.getAs = function () { return this; };
  PdfMarker.prototype.setName = function () { return this; };
  var Utilities = {
    formatDate: formatDate,
    getUuid: function () {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) { var r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); });
    },
    newBlob: function (data, contentType) {
      var str = String(data == null ? '' : data);
      return {
        getAs: function (ct) { if (/pdf/i.test(ct)) return new PdfMarker(str); return this; },
        getBytes: function () { return str; },
        getDataAsString: function () { return str; },
        getContentType: function () { return contentType || 'text/plain'; },
        setName: function () { return this; }
      };
    },
    base64Encode: function (x) {
      if (x instanceof PdfMarker) { var key = '\u0001PDF#' + (++PDF_SEQ); PDF_JOBS[key] = x._html; return key; }
      if (Array.isArray(x)) return btoa(String.fromCharCode.apply(null, x.map(function (b) { return b & 255; })));
      return utf8b64(String(x));
    },
    base64Decode: function (s) { var b = atob(s); var a = []; for (var i = 0; i < b.length; i++) a.push(b.charCodeAt(i)); return a; },
    sleep: function () {},
    jsonStringify: JSON.stringify, jsonParse: JSON.parse
  };
  var PROPS = {};
  var PropertiesService = {
    getScriptProperties: propsApi, getUserProperties: propsApi, getDocumentProperties: propsApi
  };
  function propsApi() {
    return {
      getProperty: function (k) { if (k === 'DB_ID_V2') return SHEET_ID; return k in PROPS ? PROPS[k] : null; },
      setProperty: function (k, v) { PROPS[k] = String(v); return this; },
      getProperties: function () { var o = { DB_ID_V2: SHEET_ID }; for (var k in PROPS) o[k] = PROPS[k]; return o; },
      deleteProperty: function (k) { delete PROPS[k]; return this; }
    };
  }
  var Logger = { log: function () { console.log.apply(console, ['[CRM]'].concat([].slice.call(arguments))); } };
  var MailApp = { sendEmail: notAvailable('Enviar e-mail'), getRemainingDailyQuota: function () { return 0; } };
  var GmailApp = { sendEmail: notAvailable('Enviar e-mail') };
  var ScriptApp = { getProjectTriggers: function () { return []; }, deleteTrigger: function () {}, newTrigger: notAvailable('Criar gatilho') };
  var HtmlService = { createHtmlOutput: notAvailable('HtmlService'), createHtmlOutputFromFile: notAvailable('HtmlService'), createTemplateFromFile: notAvailable('HtmlService') };
  var LockService = { getScriptLock: lockApi, getDocumentLock: lockApi, getUserLock: lockApi };
  function lockApi() { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {}, hasLock: function () { return true; } }; }
  var CacheService = { getScriptCache: cacheApi, getUserCache: cacheApi, getDocumentCache: cacheApi };
  var CACHE = {};
  function cacheApi() { return { get: function (k) { return k in CACHE ? CACHE[k] : null; }, put: function (k, v) { CACHE[k] = String(v); }, remove: function (k) { delete CACHE[k]; } }; }

  /* =========================================================
   * Carrega o código do Apps Script (js/codigo.js) isolado
   * ========================================================= */
  var BACKEND = null;
  function loadBackend() {
    if (BACKEND) return Promise.resolve(BACKEND);
    var p = window.CRM_BACKEND_SOURCE ? Promise.resolve(window.CRM_BACKEND_SOURCE)
      : fetch(BACKEND_URL, { cache: 'no-cache' }).then(function (r) {
          if (!r.ok) throw new Error('Não consegui carregar ' + BACKEND_URL + ' (' + r.status + ')');
          return r.text();
        });
    return p.then(function (src) {
      var names = ['SpreadsheetApp', 'Session', 'Utilities', 'PropertiesService', 'Logger', 'MailApp', 'GmailApp', 'ScriptApp', 'HtmlService', 'LockService', 'CacheService', 'console'];
      var body = src + '\n;return function(__n){ if(!/^[A-Za-z_$][\\w$]*$/.test(__n)) return undefined; try { return eval(__n); } catch(__e) { return undefined; } };';
      var factory = new Function(names.join(','), body);
      BACKEND = factory(SpreadsheetApp, Session, Utilities, PropertiesService, Logger, MailApp, GmailApp, ScriptApp, HtmlService, LockService, CacheService, console);
      return BACKEND;
    });
  }

  /* =========================================================
   * Transporte: Google Sheets API (pode ser trocado em testes)
   * ========================================================= */
  var LOAD_FIELDS = 'properties.title,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data.rowData.values(effectiveValue,formattedValue,effectiveFormat.numberFormat.type))';
  var Transport = window.CRM_TRANSPORT || {
    load: function () {
      return api('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(SHEET_ID) +
        '?includeGridData=true&fields=' + encodeURIComponent(LOAD_FIELDS));
    },
    commit: function (requests) {
      return api('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(SHEET_ID) + ':batchUpdate',
        { method: 'POST', body: JSON.stringify({ requests: requests }) });
    },
    userEmail: function () {
      return api('https://www.googleapis.com/oauth2/v3/userinfo').then(function (u) { return u.email || ''; });
    }
  };

  function api(url, opts, retried) {
    opts = opts || {};
    return Auth.token().then(function (tok) {
      var headers = { 'Authorization': 'Bearer ' + tok };
      if (opts.body) headers['Content-Type'] = 'application/json';
      return fetch(url, { method: opts.method || 'GET', headers: headers, body: opts.body });
    }).then(function (r) {
      if (r.status === 401 && !retried) { Auth.invalidate(); return api(url, opts, true); }
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
        if (!r.ok) {
          var msg = (j && j.error && j.error.message) || t || ('HTTP ' + r.status);
          if (r.status === 403 || r.status === 404) msg += ' — confira se esta conta Google tem acesso de edição à planilha.';
          throw new Error(msg);
        }
        return j;
      });
    });
  }

  function reload() {
    UI.status('Carregando dados da planilha...');
    return Transport.load().then(function (json) { buildModel(json); UI.status(''); });
  }

  /* =========================================================
   * Login (Google Identity Services)
   * ========================================================= */
  var TOKEN_KEY = 'crm_dh_token_v1';
  var Auth = (function () {
    var tok = null, exp = 0, waiters = [], client = null;
    try { var s = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); if (s && s.exp > Date.now() + 60000) { tok = s.tok; exp = s.exp; } } catch (e) {}
    function valid() { return tok && exp > Date.now() + 60000; }
    function ensureClient() {
      if (client) return client;
      if (!(window.google && google.accounts && google.accounts.oauth2)) throw new Error('A biblioteca de login do Google ainda não carregou. Aguarde um instante e tente de novo.');
      client = google.accounts.oauth2.initTokenClient({
        client_id: CFG.GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: function (resp) {
          if (resp.error) { UI.loginError('O Google recusou o login: ' + resp.error); return; }
          tok = resp.access_token; exp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ tok: tok, exp: exp })); } catch (e) {}
          var w = waiters; waiters = []; w.forEach(function (f) { f(tok); });
        },
        error_callback: function (err) { UI.loginError(err && err.type === 'popup_closed' ? 'A janela de login foi fechada.' : 'Não foi possível abrir o login do Google (' + (err && err.type) + '). Libere pop-ups para este site.'); }
      });
      return client;
    }
    return {
      has: valid,
      token: function () {
        if (window.CRM_TRANSPORT) return Promise.resolve('test');
        if (valid()) return Promise.resolve(tok);
        return new Promise(function (res) { waiters.push(res); UI.askLogin(!!tok); });
      },
      signIn: function () {
        try {
          var hint = ''; try { hint = localStorage.getItem('crm_dh_email') || ''; } catch (e) {}
          ensureClient().requestAccessToken({ prompt: tok ? '' : 'select_account', login_hint: hint || undefined });
        } catch (e) { UI.loginError(e.message); }
      },
      invalidate: function () { tok = null; exp = 0; try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} },
      signOut: function () {
        var t = tok; Auth.invalidate();
        try { localStorage.removeItem('crm_dh_email'); } catch (e) {}
        try { if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t, function () { location.reload(); }); else location.reload(); } catch (e) { location.reload(); }
      }
    };
  })();

  /* =========================================================
   * Inicialização: login -> confere acesso -> lê a planilha
   * ========================================================= */
  var readyPromise = null;
  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = Promise.resolve().then(function () {
      if (!window.CRM_TRANSPORT && (!CFG.GOOGLE_CLIENT_ID || /COLE_AQUI/.test(CFG.GOOGLE_CLIENT_ID))) throw new Error('CONFIG: falta o GOOGLE_CLIENT_ID em js/config.js (veja o LEIA-ME).');
      if (!SHEET_ID) throw new Error('CONFIG: falta o SPREADSHEET_ID em js/config.js.');
      return loadBackend();
    }).then(function () {
      return Transport.userEmail();
    }).then(function (email) {
      USER.email = String(email || '').toLowerCase();
      try { localStorage.setItem('crm_dh_email', USER.email); } catch (e) {}
      var allowed = BACKEND('ALLOWED_EMAILS');
      if (Array.isArray(allowed) && allowed.length && !allowed.some(function (x) { return String(x || '').trim().toLowerCase() === USER.email; })) {
        UI.denied(USER.email);
        throw new Error('Acesso restrito');
      }
      UI.loggedIn(USER.email);
      return reload();
    }).catch(function (e) {
      readyPromise = null;
      if (e.message !== 'Acesso restrito') UI.fatal(e.message);
      throw e;
    });
    return readyPromise;
  }

  /* =========================================================
   * Execução das funções (substitui o servidor do Apps Script)
   * ========================================================= */
  var chain = Promise.resolve();
  function runServer(name, args) {
    var p = chain.then(function () { return exec(name, args); });
    chain = p.catch(function () {});
    return p;
  }
  function exec(name, args) {
    return ready().then(function () {
      if (Date.now() - (SS._loadedAt || 0) > STALE_MS) return reload();
    }).then(function () {
      if (/_$/.test(name)) throw new Error('Script function not found: ' + name);
      var fn = BACKEND(name);
      if (typeof fn !== 'function') throw new Error('Script function not found: ' + name);
      PENDING = [];
      var result, thrown = null;
      try { result = fn.apply(null, JSON.parse(JSON.stringify(args || []))); } catch (e) { thrown = e; }
      var reqs = PENDING; PENDING = [];
      var saved = reqs.length ? UI.saving(Transport.commit(reqs)).catch(function (e) {
        SS._loadedAt = 0; // força reler a planilha na próxima ação
        throw new Error('Não consegui salvar na planilha: ' + e.message);
      }) : Promise.resolve();
      return saved.then(function () {
        if (thrown) throw (thrown instanceof Error ? thrown : new Error(String(thrown)));
        return resolvePdfs(result);
      });
    }).then(function (res) {
      return res === undefined ? undefined : JSON.parse(JSON.stringify(res, function (k, v) { return v === undefined ? null : v; }));
    });
  }

  /* ---------- PDF (o servidor fazia HTML -> PDF; aqui o navegador faz) ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }
  // O relatório é desenhado num iframe isolado (sem o CSS do CRM), fotografado com
  // html2canvas e fatiado em páginas A4 sem cortar linhas de tabela no meio.
  var jsPdfP = null;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function htmlToPdfBase64(html) {
    if (window.CRM_PDF_RENDER) return Promise.resolve(window.CRM_PDF_RENDER(html));
    var W = 794, PAGE_H = Math.floor(W * 297 / 210), SCALE = 2;
    var fr = document.createElement('iframe'), doc, win;
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + W + 'px;height:' + PAGE_H + 'px;border:0;';
    document.body.appendChild(fr);
    jsPdfP = jsPdfP || (window.jspdf ? Promise.resolve() : loadScript(JSPDF_LIB));
    return jsPdfP.then(function () {
      win = fr.contentWindow; doc = fr.contentDocument;
      doc.open(); doc.write(html); doc.close();
      return new Promise(function (res, rej) {  // html2canvas carregado DENTRO do iframe
        var s = doc.createElement('script'); s.src = H2C_LIB; s.onload = res;
        s.onerror = function () { rej(new Error('Falha ao carregar ' + H2C_LIB)); };
        (doc.head || doc.documentElement).appendChild(s);
      });
    }).then(function () {
      var imgs = [].slice.call(doc.images || []);
      return Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); }))
        .then(function () { return (doc.fonts && doc.fonts.ready) || 0; }).then(function () { return wait(120); });
    }).then(function () {
      var body = doc.body;
      var fullH = Math.max(doc.documentElement.scrollHeight, body.scrollHeight, 1);
      fr.style.height = fullH + 'px';
      // pontos onde dá para quebrar a página (fim de linhas, parágrafos, blocos)
      var cuts = [];
      [].forEach.call(body.querySelectorAll('tr,p,li,h1,h2,h3,h4,table,img,div'), function (el) {
        var r = el.getBoundingClientRect(); if (r.height > 0) { cuts.push(Math.round(r.top)); cuts.push(Math.round(r.bottom)); }
      });
      cuts.sort(function (a, b) { return a - b; });
      var slices = [], y = 0;
      while (y < fullH - 2) {
        var lim = y + PAGE_H, end = lim;
        if (lim < fullH) {
          var best = -1;
          for (var i = 0; i < cuts.length; i++) { var c = cuts[i]; if (c > y + PAGE_H * 0.55 && c <= lim) best = c; }
          if (best > 0) end = best;
        } else end = fullH;
        slices.push([y, end]); y = end;
      }
      return win.html2canvas(body, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, width: W, windowWidth: W, height: fullH, windowHeight: fullH, logging: false })
        .then(function (canvas) {
          var JsPDF = window.jspdf.jsPDF;
          var pdf = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
          var pw = pdf.internal.pageSize.getWidth(), k = pw / W;
          slices.forEach(function (sl, idx) {
            var h = sl[1] - sl[0];
            var part = document.createElement('canvas');
            part.width = canvas.width; part.height = Math.max(1, Math.round(h * SCALE));
            var ctx = part.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, part.width, part.height);
            ctx.drawImage(canvas, 0, Math.round(sl[0] * SCALE), canvas.width, part.height, 0, 0, part.width, part.height);
            if (idx > 0) pdf.addPage();
            pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, h * k);
          });
          return String(pdf.output('datauristring')).split(',')[1];
        });
    }).then(function (b64) { fr.remove(); return b64; }, function (e) { fr.remove(); throw e; });
  }
  // Se o PDF falhar (ex.: sem internet para as bibliotecas), baixa o relatório em HTML.
  function downloadHtmlFallback(html) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      a.download = 'Relatorio_DH_LAW.html'; document.body.appendChild(a); a.click(); a.remove();
      return true;
    } catch (e) { return false; }
  }
  function resolvePdfs(obj) {
    var jobs = [];
    (function walk(o, parent, key) {
      if (typeof o === 'string' && PDF_JOBS[o] !== undefined) { jobs.push({ p: parent, k: key, html: PDF_JOBS[o], id: o }); return; }
      if (o && typeof o === 'object') for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) walk(o[k], o, k);
    })(obj, null, null);
    if (!jobs.length) return Promise.resolve(obj);
    UI.status('Gerando PDF...');
    return jobs.reduce(function (p, j) {
      return p.then(function () {
        return htmlToPdfBase64(j.html).then(function (b64) { j.p[j.k] = b64; delete PDF_JOBS[j.id]; }, function (e) {
          delete PDF_JOBS[j.id];
          var baixou = downloadHtmlFallback(j.html);
          throw new Error('Não consegui gerar o PDF (' + (e && e.message || e) + ').' + (baixou ? ' Baixei o relatório em HTML: abra o arquivo e use Imprimir > Salvar como PDF.' : ''));
        });
      });
    }, Promise.resolve()).then(function () { UI.status(''); return obj; }, function (e) { UI.status(''); throw e; });
  }

  /* =========================================================
   * google.script.run de mentirinha
   * ========================================================= */
  function makeRunner(s, f, u) {
    var base = {
      withSuccessHandler: function (fn) { return makeRunner(fn, f, u); },
      withFailureHandler: function (fn) { return makeRunner(s, fn, u); },
      withUserObject: function (o) { return makeRunner(s, f, o); }
    };
    return new Proxy(base, {
      get: function (t, prop) {
        if (prop in t) return t[prop];
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        return function () {
          var args = [].slice.call(arguments);
          runServer(prop, args).then(function (r) { if (s) s(r, u); }, function (e) {
            var err = e instanceof Error ? e : new Error(String(e));
            if (err.message === 'Acesso restrito') return;
            if (f) f(err, u); else console.error('[CRM] ' + prop + ':', err);
          });
        };
      }
    });
  }
  var GSCRIPT = { run: makeRunner(null, null, undefined), host: { close: function () {}, setHeight: function () {}, editor: {} }, url: { getLocation: function (cb) { cb && cb({ hash: location.hash.slice(1), parameter: {}, parameters: {} }); } } };
  var _google = window.google || {}; _google.script = GSCRIPT;
  try {
    // a biblioteca de login do Google também usa "window.google"; garante que google.script não se perca
    Object.defineProperty(window, 'google', { configurable: true, enumerable: true,
      get: function () { return _google; },
      set: function (v) { _google = v || {}; if (!_google.script) _google.script = GSCRIPT; } });
  } catch (e) { window.google = _google; }

  /* =========================================================
   * Telas: login, acesso negado, erros, "salvando..."
   * ========================================================= */
  var UI = (function () {
    var gate, msgEl, btn, errEl, toast, toastTimer, saving = 0;
    function $(id) { return document.getElementById(id); }
    function init() {
      gate = $('loginGate'); msgEl = $('lgMsg'); btn = $('lgBtn'); errEl = $('lgErr'); toast = $('syncToast');
      if (btn) btn.onclick = function () { errEl.textContent = ''; Auth.signIn(); };
      var sw = $('lgSwitch'); if (sw) sw.onclick = function (e) { e.preventDefault(); Auth.signOut(); };
      var out = $('btnSair'); if (out) out.onclick = function (e) { e.preventDefault(); if (confirm('Sair da conta Google neste CRM?')) Auth.signOut(); };
    }
    function show(mode) {
      if (!gate) return;
      gate.className = 'lg-gate on ' + (mode || '');
      document.body.classList.add('lg-open');
    }
    function hide() { if (gate) { gate.className = 'lg-gate'; document.body.classList.remove('lg-open'); } }
    return {
      init: init,
      askLogin: function (expired) {
        if (!gate) return;
        msgEl.textContent = expired ? 'Sua sessão do Google expirou. Entre de novo para continuar de onde parou.' : 'Entre com a sua conta Google autorizada para acessar o CRM.';
        btn.style.display = ''; show('ask');
      },
      loginError: function (m) { if (errEl) errEl.textContent = m; show('ask'); },
      loggedIn: function (email) {
        hide();
        var w = $('who'); if (w) w.textContent = email;
      },
      denied: function (email) {
        if (!gate) return;
        msgEl.innerHTML = 'Esta ferramenta é privada da DH LAW.<br>Conta identificada: <b>' + (email || 'não identificada') + '</b>';
        btn.style.display = 'none'; show('denied');
      },
      fatal: function (m) {
        var l = $('loading'); if (l) { l.style.display = 'block'; l.innerHTML = '<b>Não foi possível abrir o CRM.</b><br><span style="font-size:13px">' + String(m).replace(/</g, '&lt;') + '</span>'; }
        if (gate && /CONFIG/.test(m)) { msgEl.textContent = m; btn.style.display = 'none'; show('denied'); }
      },
      status: function (t) { var l = $('loading'); if (l && t && l.style.display !== 'none') l.textContent = t; },
      saving: function (p) {
        if (!toast) return p;
        saving++; toast.textContent = 'Salvando na planilha...'; toast.className = 'sync-toast on';
        clearTimeout(toastTimer);
        return p.then(function (r) {
          if (--saving === 0) { toast.textContent = 'Salvo ✓'; toast.className = 'sync-toast on ok'; toastTimer = setTimeout(function () { toast.className = 'sync-toast'; }, 1400); }
          return r;
        }, function (e) {
          saving = Math.max(0, saving - 1); toast.textContent = 'Erro ao salvar'; toast.className = 'sync-toast on err';
          toastTimer = setTimeout(function () { toast.className = 'sync-toast'; }, 4000);
          throw e;
        });
      }
    };
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { UI.init(); ready().catch(function () {}); });
  else { UI.init(); ready().catch(function () {}); }

  // Para testes/diagnóstico no console do navegador
  window.CRM_SHIM = { ready: ready, reload: reload, run: runServer, model: SS, auth: Auth, _pending: function () { return PENDING; } };
})();
