
// ============================================================
// FIREBASE INIT
// ============================================================
var ADMIN_EMAIL = 'louispilippe2021@gmail.com';
var FB_CONFIG = {
  apiKey: "AIzaSyBoD5b_iGOqmzt5R8VXUnjEKDk6xZsgK0c",
  authDomain: "financese-1b835.firebaseapp.com",
  projectId: "financese-1b835",
  storageBucket: "financese-1b835.firebasestorage.app",
  messagingSenderId: "294563602629",
  appId: "1:294563602629:web:cbbdd7c809f9ce35c090ac"
};
firebase.initializeApp(FB_CONFIG);
var db = firebase.firestore();
var auth = firebase.auth();

// ============================================================
// STATE
// ============================================================
var _user = null;
var _role = 'viewer';
var _data = { events:[], expenses:[], revenues:[], users:[] };
var _unsub = [];
var _charts = {};

// ============================================================
// UTILS
// ============================================================
function _g(id) { return document.getElementById(id); }

function _m(n) {
  var x = Math.abs(Number(n) || 0).toFixed(2).split('.');
  x[0] = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (Number(n) < 0 ? '-' : '') + '$' + x.join('.');
}

function _evName(id) {
  for (var i = 0; i < _data.events.length; i++)
    if (_data.events[i].id == id) return _data.events[i].name;
  return '-';
}

function _sumExp(eid) {
  var t = 0;
  for (var i = 0; i < _data.expenses.length; i++)
    if (!eid || _data.expenses[i].eventId == eid) t += Number(_data.expenses[i].amount) || 0;
  return t;
}

function _sumRev(eid) {
  var t = 0;
  for (var i = 0; i < _data.revenues.length; i++)
    if (!eid || _data.revenues[i].eventId == eid) t += Number(_data.revenues[i].amount) || 0;
  return t;
}

function _getEvConfig(eid) {
  // Returns fonds commun config + shareholders for a given event
  var ev = null;
  for (var i = 0; i < _data.events.length; i++) if (_data.events[i].id == eid) { ev = _data.events[i]; break; }
  if (!ev) return { fcOn:true, fcPct:10, shareholders:[{name:'Vincent',pct:18},{name:'LP Cote',pct:41},{name:'LP Viens',pct:41}] };
  return {
    fcOn: ev.fcOn !== false,
    fcPct: (ev.fcPct !== undefined && ev.fcPct !== null) ? Number(ev.fcPct) : 10,
    shareholders: ev.shareholders && ev.shareholders.length ? ev.shareholders : [{name:'Vincent',pct:18},{name:'LP Cote',pct:41},{name:'LP Viens',pct:41}]
  };
}

function _split(eid) {
  var r = _sumRev(eid), d = _sumExp(eid), pr = r - d;
  var cfg = eid ? _getEvConfig(eid) : { fcOn:true, fcPct:10, shareholders:[{name:'Vincent',pct:18},{name:'LP Cote',pct:41},{name:'LP Viens',pct:41}] };
  var fo = (cfg.fcOn && pr > 0) ? pr * (cfg.fcPct / 100) : 0;
  var pa = Math.max(pr - fo, 0);
  var shares = {};
  if (cfg.shareholders) {
    cfg.shareholders.forEach(function(s) { shares[s.name] = pa * (s.pct / 100); });
  }
  return { rev:r, dep:d, profit:pr, fonds:fo, apart:pa, shares:shares, cfg:cfg };
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, type) {
  var t = _g('toast');
  t.className = 'toast' + (type ? ' ' + type : '');
  var icons = { success:'✓', error:'✕', info:'!' };
  t.innerHTML = '<span>' + (icons[type] || '●') + '</span> ' + msg;
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._tmr);
  t._tmr = setTimeout(function() { t.classList.remove('show'); }, 3000);
}

// ============================================================
// LOADING / LOGIN
// ============================================================
function showLoading(msg) {
  var l = _g('loading'); if (l) l.style.display = 'flex';
  var lt = _g('loading-txt'); if (lt) lt.textContent = msg || 'Chargement...';
}
function hideLoading() { var l = _g('loading'); if (l) l.style.display = 'none'; }
function showLogin() { var l = _g('login-screen'); if (l) l.style.display = 'flex'; hideLoading(); }
function hideLogin() { var l = _g('login-screen'); if (l) l.style.display = 'none'; }

function doLogin() {
  var email = _g('l-email').value.trim(), pass = _g('l-pass').value;
  _g('l-err').textContent = '';
  if (!email || !pass) { _g('l-err').textContent = 'Entrez votre email et mot de passe'; return; }
  showLoading('Connexion...');
  auth.signInWithEmailAndPassword(email, pass).catch(function() {
    hideLoading(); _g('l-err').textContent = 'Email ou mot de passe invalide';
  });
}

function doLogout() {
  _unsub.forEach(function(u) { try { u(); } catch(e) {} });
  _unsub = [];
  auth.signOut();
}

// ============================================================
// AUTH STATE
// ============================================================
auth.onAuthStateChanged(function(user) {
  if (!user) {
    _user = null; _role = 'viewer';
    _unsub.forEach(function(u) { try { u(); } catch(e) {} });
    _unsub = []; _data = { events:[], expenses:[], revenues:[], users:[] };
    showLogin(); return;
  }
  _user = user;
  showLoading('Chargement...');
  hideLogin();

  if (user.email.toLowerCase() === ADMIN_EMAIL) {
    _role = 'admin';
    db.collection('users').doc(user.uid).set(
      { email:user.email, name:'LP Cote', role:'admin', uid:user.uid }, { merge:true }
    );
    _boot();
  } else {
    db.collection('users').doc(user.uid).get().then(function(doc) {
      _role = doc.exists ? (doc.data().role || 'viewer') : 'viewer';
      _boot();
    }).catch(function() { _role = 'viewer'; _boot(); });
  }
});

function _boot() {
  _updateNav();
  _initSettingsListener();
  var ue = _g('user-email');
  if (ue) ue.textContent = _user.email + (_role === 'admin' ? ' (Admin)' : _role === 'manager' ? ' (Manager)' : '');
  _initListeners();
  hideLoading();
  showPage('dash');
}

function _updateNav() {
  var els = document.querySelectorAll('.admin-only');
  for (var i = 0; i < els.length; i++)
    els[i].style.display = _role === 'admin' ? '' : 'none';
  var mels = document.querySelectorAll('.manager-up');
  for (var i = 0; i < mels.length; i++)
    mels[i].style.display = (_role === 'admin' || _role === 'manager') ? '' : 'none';
}

// ============================================================
// FIRESTORE LISTENERS
// ============================================================
function _initListeners() {
  _unsub.push(
    db.collection('events').orderBy('date','desc').onSnapshot(function(s) {
      _data.events = [];
      s.forEach(function(d) { _data.events.push(Object.assign({ id:d.id }, d.data())); });
      _refresh();
    }),
    db.collection('expenses').orderBy('createdAt','desc').onSnapshot(function(s) {
      _data.expenses = [];
      s.forEach(function(d) { _data.expenses.push(Object.assign({ id:d.id }, d.data())); });
      _refresh();
    }),
    db.collection('revenues').orderBy('createdAt','desc').onSnapshot(function(s) {
      _data.revenues = [];
      s.forEach(function(d) { _data.revenues.push(Object.assign({ id:d.id }, d.data())); });
      _refresh();
    }),
    db.collection('users').onSnapshot(function(s) {
      _data.users = [];
      s.forEach(function(d) { _data.users.push(Object.assign({ uid:d.id }, d.data())); });
      _rUsers();
    })
  );
}


// ============================================================
// SHAREHOLDER FORM (create event)
// ============================================================
var _shRows = [];

function _initShareholderForm() {
  _shRows = [{name:'Vincent',pct:18},{name:'LP Cote',pct:41},{name:'LP Viens',pct:41}];
  _renderShForm();
}

function _renderShForm() {
  var c = _g('shareholders-form'); if(!c) return;
  var h = '';
  for(var i=0;i<_shRows.length;i++){
    h += '<div class="modal-row">'
      + '<input placeholder="Nom" value="'+_shRows[i].name+'" onchange="_shRows['+i+'].name=this.value">'
      + '<input type="number" min="0" max="100" step="0.1" placeholder="%" value="'+_shRows[i].pct+'" style="max-width:80px" onchange="_shRows['+i+'].pct=Number(this.value);_updatePctTotal()">'
      + '<button class="rm" onclick="_removeShRow('+i+')">✕</button>'
      + '</div>';
  }
  h += '<div class="pct-total" id="pct-total-create"></div>';
  c.innerHTML = h;
  _updatePctTotal();
}

function addShareholderRow() {
  _shRows.push({name:'',pct:0});
  _renderShForm();
}

function _removeShRow(i) {
  _shRows.splice(i,1);
  _renderShForm();
}

function _updatePctTotal() {
  var t = 0;
  for(var i=0;i<_shRows.length;i++) t += Number(_shRows[i].pct)||0;
  var el = _g('pct-total-create');
  if(el) { el.textContent = 'Total: '+t.toFixed(1)+'%'; el.style.color = Math.abs(t-100)<0.1 ? 'var(--green)' : 'var(--red)'; }
  var mel = _g('pct-total-modal');
  if(mel) { mel.textContent = 'Total: '+t.toFixed(1)+'%'; mel.style.color = Math.abs(t-100)<0.1 ? 'var(--green)' : 'var(--red)'; }
}

// ============================================================
// EDIT EVENT MODAL
// ============================================================
var _editEid = null;
var _editShRows = [];

function openEvModal(eid) {
  if(_role !== 'admin') { toast('Admin seulement','error'); return; }
  _editEid = eid;
  var cfg = _getEvConfig(eid);
  _editShRows = cfg.shareholders.map(function(s){ return {name:s.name, pct:s.pct}; });
  _renderEvModal(cfg);
  var m = _g('ev-modal'); if(m) { m.style.display='flex'; }
}

function closeEvModal() {
  var m = _g('ev-modal'); if(m) m.style.display='none';
  _editEid = null; _editShRows = [];
}

function _renderEvModal(cfg) {
  var shHTML = '';
  for(var i=0;i<_editShRows.length;i++){
    shHTML += '<div class="modal-row">'
      + '<input placeholder="Nom" value="'+_editShRows[i].name+'" onchange="_editShRows['+i+'].name=this.value">'
      + '<input type="number" min="0" max="100" step="0.1" placeholder="%" value="'+_editShRows[i].pct+'" style="max-width:80px" onchange="_editShRows['+i+'].pct=Number(this.value);_updatePctTotalModal()">'
      + '<button class="rm" onclick="_removeEditShRow('+i+')">✕</button>'
      + '</div>';
  }

  var c = _g('ev-modal-content');
  c.innerHTML = '<div style="margin-bottom:14px">'
    + '<div class="ct" style="margin-bottom:8px">Fonds commun</div>'
    + '<div class="frow">'
    + '<div><lbl>Activer</lbl><select id="modal-fc-on"><option value="1"'+(cfg.fcOn?' selected':'')+'>Oui</option><option value="0"'+(!cfg.fcOn?' selected':'')+'>Non</option></select></div>'
    + '<div><lbl>Pourcentage (%)</lbl><input id="modal-fc-pct" type="number" min="0" max="100" step="0.1" value="'+cfg.fcPct+'"></div>'
    + '</div></div>'
    + '<div style="border-top:1px solid var(--border);padding-top:14px">'
    + '<div class="ct" style="margin-bottom:6px">Actionnaires <span style="color:var(--muted);font-weight:400;font-size:.7rem">(total doit etre 100%)</span></div>'
    + shHTML
    + '<div class="pct-total" id="pct-total-modal"></div>'
    + '<button class="btn bo" style="margin-top:6px;font-size:.72rem" onclick="addEditShRow()">+ Ajouter actionnaire</button>'
    + '</div>'
    + '<button class="btn bw" style="margin-top:18px;width:100%" onclick="saveEvConfig()">Enregistrer</button>';
  _updatePctTotalModal();
}

function _updatePctTotalModal() {
  var t=0;
  for(var i=0;i<_editShRows.length;i++) t+=Number(_editShRows[i].pct)||0;
  var el=_g('pct-total-modal');
  if(el){el.textContent='Total: '+t.toFixed(1)+'%';el.style.color=Math.abs(t-100)<0.1?'var(--green)':'var(--red)';}
}

function addEditShRow() {
  _editShRows.push({name:'',pct:0});
  var cfg = _getEvConfig(_editEid);
  _renderEvModal(cfg);
}

function _removeEditShRow(i) {
  _editShRows.splice(i,1);
  var cfg = _getEvConfig(_editEid);
  _renderEvModal(cfg);
}

function saveEvConfig() {
  if(!_editEid) return;
  var fcOn = _g('modal-fc-on').value === '1';
  var fcPct = Number(_g('modal-fc-pct').value) || 10;
  var total = 0;
  for(var i=0;i<_editShRows.length;i++) total += Number(_editShRows[i].pct)||0;
  if(Math.abs(total-100) > 0.1) { toast('Le total des actionnaires doit etre 100%','error'); return; }
  var sh = _editShRows.map(function(s){ return {name:s.name, pct:Number(s.pct)}; });
  db.collection('events').doc(_editEid).update({ fcOn:fcOn, fcPct:fcPct, shareholders:sh })
    .then(function(){
      toast('Parametres sauvegardes!','success');
      logHistory('Config evenement modifiee', _editEid, 'Config mise a jour', 0, {
  'Fonds commun': fcOn ? 'Oui ('+fcPct+'%)' : 'Non',
  'Actionnaires': sh.map(function(s){return s.name+' '+s.pct+'%';}).join(', ')
});
      closeEvModal();
      // onSnapshot will fire -> _refresh() -> openEvent(_currentEid) auto re-render
    }).catch(function(e){ alert('Erreur: '+e.message); });
}

// ============================================================
// HISTORY
// ============================================================
function logHistory(action, eventId, detail, amount, detailObj) {
  if (!_user) return;
  var payload = {
    action: action, eventId: eventId || '', detail: detail || '',
    amount: amount || 0, by: _user.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (detailObj) payload.detailObj = detailObj;
  db.collection('history').add(payload);
}

function openHistModal(jsonStr) {
  try {
    var obj = JSON.parse(decodeURIComponent(jsonStr));
    var html = '<table style="width:100%;border-collapse:collapse;font-size:.84rem">';
    Object.keys(obj).forEach(function(k) {
      var val = obj[k];
      if (typeof val === 'object' && val !== null) val = JSON.stringify(val, null, 2);
      html += '<tr style="border-bottom:1px solid var(--border)">'
        + '<td style="padding:8px 10px 8px 0;color:var(--muted);white-space:nowrap;vertical-align:top">'+k+'</td>'
        + '<td style="padding:8px 0;word-break:break-word">'+val+'</td></tr>';
    });
    html += '</table>';
    _g('hist-modal-body').innerHTML = html;
    _g('hist-modal').style.display = 'flex';
  } catch(e) { alert('Erreur lecture détail'); }
}

function closeHistModal() { _g('hist-modal').style.display='none'; }

function _rHistory() {
  var tb = _g('history-tb'); if (!tb) return;
  tb.innerHTML = '<tr><td colspan="6" class="empty">Chargement...</td></tr>';
  db.collection('history').orderBy('createdAt','desc').limit(60).get().then(function(snap) {
    if (snap.empty) { tb.innerHTML = '<tr><td colspan="6" class="empty">Aucune action</td></tr>'; return; }
    var h = '';
    snap.forEach(function(d) {
      var r = d.data();
      var dt = r.createdAt ? new Date(r.createdAt.toDate()).toLocaleString('fr-CA') : '-';
      var bc = r.action.indexOf('supprime') > -1 ? 'jr' : r.action.indexOf('ajoute') > -1 ? 'jg' : 'jw';
      var detailCell = '-';
      if (r.detailObj) {
        var enc = encodeURIComponent(JSON.stringify(r.detailObj));
        detailCell = '<button class="btn bo" style="padding:2px 8px;font-size:.7rem" onclick="openHistModal(\''+enc+'\')">Voir détails</button>';
      } else if (r.detail) {
        detailCell = '<span style="max-width:140px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle" title="'+r.detail+'">'+r.detail+'</span>';
      }
      h += '<tr><td>' + dt + '</td><td><span class="bj ' + bc + '">' + r.action + '</span></td>'
        + '<td>' + _evName(r.eventId) + '</td><td>' + detailCell + '</td>'
        + '<td>' + (r.amount ? _m(r.amount) : '-') + '</td><td>' + r.by + '</td></tr>';
    });
    tb.innerHTML = h;
  });
}

// ============================================================
// CHARTS
// ============================================================
function _rCharts() {
  var evs = _data.events;
  if (!evs.length) return;

  var labels = [], revArr = [], depArr = [], profArr = [];
  for (var i = 0; i < evs.length; i++) {
    var ev = evs[i];
    var r = _sumRev(ev.id), d = _sumExp(ev.id);
    labels.push(ev.name.length > 14 ? ev.name.substr(0,14)+'…' : ev.name);
    revArr.push(r); depArr.push(d); profArr.push(r - d);
  }

  var gridColor = '#1f1f1f', tickColor = '#666';
  var scalesOpt = {
    x: { ticks:{color:tickColor}, grid:{color:gridColor} },
    y: { ticks:{color:tickColor, callback:function(v){return '$'+v;}}, grid:{color:gridColor} }
  };
  var legOpt = { labels:{color:'#aaa', font:{size:11}} };

  function mkChart(id, cfg) {
    var el = _g(id); if (!el) return;
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
    _charts[id] = new Chart(el, cfg);
  }

  mkChart('ch-revdep', { type:'bar', data:{
    labels:labels,
    datasets:[
      { label:'Revenus', data:revArr, backgroundColor:'rgba(74,222,128,.75)', borderRadius:4 },
      { label:'Depenses', data:depArr, backgroundColor:'rgba(248,113,113,.75)', borderRadius:4 }
    ]
  }, options:{ responsive:true, plugins:{legend:legOpt}, scales:scalesOpt }});

  mkChart('ch-profit', { type:'bar', data:{
    labels:labels,
    datasets:[{ label:'Profit', data:profArr,
      backgroundColor:profArr.map(function(v){return v>=0?'rgba(74,222,128,.75)':'rgba(248,113,113,.75)';}),
      borderRadius:4 }]
  }, options:{ responsive:true, plugins:{legend:legOpt}, scales:scalesOpt }});

  // Aggregate split dynamically per event config
  var chFonds=0, chShares={};
  _data.events.forEach(function(ev){
    var evSp=_split(ev.id);
    chFonds+=evSp.fonds;
    Object.keys(evSp.shares).forEach(function(n){ chShares[n]=(chShares[n]||0)+evSp.shares[n]; });
  });
  var chLabels=[], chData=[], chColors=['rgba(251,191,36,.85)','rgba(192,132,252,.85)','rgba(74,222,128,.85)','rgba(99,179,237,.85)','rgba(248,113,113,.85)'];
  if(chFonds>0){ chLabels.push('Fonds commun'); chData.push(chFonds); }
  Object.keys(chShares).forEach(function(n,i){
    if(chShares[n]>0){ chLabels.push(n+' '+chShares[n].toFixed(0)+'$'); chData.push(chShares[n]); }
  });
  mkChart('ch-split', { type:'doughnut', data:{
    labels:chLabels,
    datasets:[{ data:chData,
      backgroundColor:chColors.slice(0,chData.length),
      borderColor:'#111', borderWidth:2 }]
  }, options:{ responsive:true, plugins:{legend:legOpt} }});
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(id) {
  if (id !== 'ev-detail') _currentEid = null;
  document.querySelectorAll('.pg').forEach(function(el) { el.classList.remove('on'); });
  document.querySelectorAll('.nb').forEach(function(el) { el.classList.remove('on'); });
  var pg = _g('pg-' + id); if (pg) pg.classList.add('on');
  var nb = _g('nb-' + id); if (nb) nb.classList.add('on');
  if (id === 'graphs') setTimeout(_rCharts, 80);
  if (id === 'history') _rHistory();
}

function showTab(tabId, groupId) {
  var g = _g(groupId); if (!g) return;
  g.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('on'); });
  g.querySelectorAll('.tab').forEach(function(el) { el.classList.remove('on'); });
  var tc = _g('tc-' + tabId); if (tc) tc.classList.add('on');
  var tb = _g('tb-' + tabId); if (tb) tb.classList.add('on');
}

// ============================================================
// SELECT POPULATION
// ============================================================
function _fillSels() {
  ['exp-ev','rev-ev','pdf-sel'].forEach(function(sid) {
    var el = _g(sid); if (!el) return;
    var v = el.value;
    el.innerHTML = '<option value="">-- Choisir --</option>';
    _data.events.forEach(function(ev) {
      var o = document.createElement('option');
      o.value = ev.id;
      o.textContent = ev.name + ' (' + (ev.date||'') + ')';
      el.appendChild(o);
    });
    el.value = v;
  });
}

// ============================================================
// EVENTS CRUD
// ============================================================
function addEvent() {
  if (_role === 'viewer') { toast('Permission refusee', 'error'); return; }
  var nm = _g('ev-n').value.trim();
  if (!nm) { alert('Entrez un nom'); return; }
  // Sync shareholder names from DOM inputs before saving
  var shInputs = document.querySelectorAll('#shareholders-form .modal-row');
  var shFinal = [];
  for(var si=0;si<_shRows.length;si++){
    var nm2 = _shRows[si].name; var pct2 = Number(_shRows[si].pct)||0;
    if(nm2) shFinal.push({name:nm2, pct:pct2});
  }
  var shTotal = shFinal.reduce(function(a,s){return a+s.pct;},0);
  if(shFinal.length && Math.abs(shTotal-100) > 0.1){ toast('Total actionnaires doit etre 100%','error'); return; }
  if(!shFinal.length) shFinal = [{name:'Vincent',pct:18},{name:'LP Cote',pct:41},{name:'LP Viens',pct:41}];
  var fcOn2 = _g('ev-fc-on').value === '1';
  var fcPct2 = Number(_g('ev-fc-pct').value)||10;
  db.collection('events').add({
    name:nm, date:_g('ev-d').value, lieu:_g('ev-l').value,
    prix:Number(_g('ev-p').value)||0, objectif:Number(_g('ev-obj').value)||0,
    notes:_g('ev-notes').value||'', fcOn:fcOn2, fcPct:fcPct2, shareholders:shFinal,
    createdBy:_user.email, createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    ['ev-n','ev-l','ev-notes'].forEach(function(id){_g(id).value='';});
    _g('ev-obj').value=''; _shRows=[{name:'Vincent',pct:18},{name:'LP Cote',pct:41},{name:'LP Viens',pct:41}]; _renderShForm();
    toast('Evenement ajoute!','success');
    logHistory('Evenement ajoute', null, nm, 0, {
  'Nom': nm,
  'Date': _g('ev-d').value||'-',
  'Lieu': _g('ev-l').value||'-',
  'Prix billet': _g('ev-p').value||0,
  'Objectif billets': _g('ev-obj').value||0,
  'Fonds commun': fcOn2 ? 'Oui ('+fcPct2+'%)' : 'Non',
  'Actionnaires': shFinal.map(function(s){return s.name+' '+s.pct+'%';}).join(', ')
});
  }).catch(function(e) { alert('Erreur: '+e.message); });
}

function delEvent(id) {
  if (_role !== 'admin') { toast('Admin seulement','error'); return; }
  if (!confirm('Supprimer cet evenement et toutes ses donnees?')) return;
  var batch = db.batch();
  var evName = _evName(id);
  var promises = [
    db.collection('expenses').where('eventId','==',id).get(),
    db.collection('revenues').where('eventId','==',id).get()
  ];
  Promise.all(promises).then(function(results) {
    results.forEach(function(snap) { snap.forEach(function(d) { batch.delete(d.ref); }); });
    batch.delete(db.collection('events').doc(id));
    return batch.commit();
  }).then(function() {
    logHistory('Evenement supprime', id, evName, 0, { 'Nom': evName, 'ID': id });
    toast('Evenement supprime','success');
    showPage('ev-list');
  });
}

// ============================================================
// EXPENSES CRUD
// ============================================================
function addExpense() {
  if (_role === 'viewer') { toast('Permission refusee — contactez un admin','error'); return; }
  var eid = _g('exp-ev').value, amt = _g('exp-am').value;
  if (!eid) { alert('Choisissez un evenement'); return; }
  if (!amt || Number(amt) <= 0) { alert('Entrez un montant valide'); return; }
  var cat = _g('exp-ca').value, desc = _g('exp-de').value;
  db.collection('expenses').add({
    eventId:eid, cat:cat, desc:desc, amount:Number(amt),
    paidBy:_g('exp-pb').value, status:_g('exp-st').value,
    refund:_g('exp-rf').value, notes:_g('exp-no').value,
    addedBy:_user.email, createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    ['exp-de','exp-am','exp-no'].forEach(function(id){_g(id).value='';});
    toast('Depense ajoutee!','success');
    logHistory('Depense ajoutee', eid, cat+' — '+desc, Number(amt), { 'Categorie': cat, 'Description': desc, 'Montant': _m(Number(amt)), 'Fournisseur': _g('exp-sup').value||'-', 'Statut': _g('exp-status').value });
  }).catch(function(e) { alert('Erreur: '+e.message); });
}

function delExpense(id, eid, desc_, amt_) {
  if (_role !== 'admin') { toast('Admin seulement','error'); return; }
  if (!confirm('Supprimer cette depense?')) return;
  var dLabel = desc_ ? decodeURIComponent(desc_) : '-';
  db.collection('expenses').doc(id).delete().then(function() {
    toast('Depense supprimee','success');
    logHistory('Depense supprimee', eid, dLabel, 0, { 'Description': dLabel, 'Montant': _m(Number(amt_)||0) });
    if (eid) openEvent(eid);
  });
}

// ============================================================
// REVENUES CRUD
// ============================================================
function addRevenue() {
  if (_role === 'viewer') { toast('Permission refusee — contactez un admin','error'); return; }
  var eid = _g('rev-ev').value, amt = _g('rev-am').value;
  if (!eid) { alert('Choisissez un evenement'); return; }
  if (!amt || Number(amt) <= 0) { alert('Entrez un montant valide'); return; }
  var cat = _g('rev-ca').value, desc = _g('rev-de').value;
  db.collection('revenues').add({
    eventId:eid, cat:cat, desc:desc, amount:Number(amt),
    status:_g('rev-st').value, notes:_g('rev-no').value,
    addedBy:_user.email, createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    ['rev-de','rev-am','rev-no'].forEach(function(id){_g(id).value='';});
    toast('Revenu ajoute!','success');
    logHistory('Revenu ajoute', eid, cat+' — '+desc, Number(amt), { 'Categorie': cat, 'Description': desc, 'Montant': _m(Number(amt)), 'Payeur': _g('rev-qui').value||'-' });
  }).catch(function(e) { alert('Erreur: '+e.message); });
}

function delRevenue(id, eid, desc_, amt_) {
  if (_role !== 'admin') { toast('Admin seulement','error'); return; }
  if (!confirm('Supprimer ce revenu?')) return;
  var dLabel = desc_ ? decodeURIComponent(desc_) : '-';
  db.collection('revenues').doc(id).delete().then(function() {
    toast('Revenu supprime','success');
    logHistory('Revenu supprime', eid, dLabel, 0, { 'Description': dLabel, 'Montant': _m(Number(amt_)||0) });
    if (eid) openEvent(eid);
  });
}

// ============================================================
// EVENT DETAIL
// ============================================================
function openEvent(eid) {
  _currentEid = eid;
  var ev = null;
  for (var i = 0; i < _data.events.length; i++) if (_data.events[i].id == eid) { ev = _data.events[i]; break; }
  if (!ev) return;

  var sp = _split(eid);
  var exps = _data.expenses.filter(function(e) { return e.eventId == eid; });
  var revs = _data.revenues.filter(function(r) { return r.eventId == eid; });
  var bankBalance = revs.reduce(function(a,b){ return a + Number(b.amount||0); }, 0) - exps.reduce(function(a,b){ return a + Number(b.amount||0); }, 0);
  var canDel = _role === 'admin';

  // Progress bar
  var progHTML = '';
  if (ev.objectif && ev.objectif > 0) {
    var billet_revs = revs.filter(function(r) { return r.cat && (r.cat.toLowerCase().indexOf('billet') > -1 || r.cat.toLowerCase().indexOf('porte') > -1); });
    var pct = Math.min((billet_revs.length / ev.objectif) * 100, 100);
    var cls = pct >= 100 ? 'over' : pct >= 70 ? 'warn' : 'ok';
    progHTML = '<div class="prog-wrap"><div class="prog-label">Billets: ' + billet_revs.length + ' / ' + ev.objectif + ' (' + Math.round(pct) + '%)</div>'
      + '<div class="prog-bar-bg"><div class="prog-bar ' + cls + '" style="width:' + pct + '%"></div></div></div>';
  }

  var _evNotes = Array.isArray(ev.notes) ? ev.notes : (ev.notes ? [{text:String(ev.notes),done:false}] : []);
  var _editNoteBtn = (_role==='admin'||_role==='manager') ? '<button class="btn bo" style="padding:3px 9px;font-size:.7rem;margin-left:8px" onclick="openNotesModal(\''+eid+'\')">&#9998; Modifier</button>' : '';
  var _checkItems = _evNotes.map(function(n,i){
    var ds = n.done ? 'text-decoration:line-through;color:var(--muted)' : '';
    var ic = n.done ? '&#9745;' : '&#9744;';
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
      +'<span style="font-size:1.1rem;cursor:pointer;user-select:none" onclick="_toggleNote(\''+eid+'\','+i+')">'+ic+'</span>'
      +'<span style="'+ds+'">'+n.text+'</span></div>';
  }).join('');
  var notesHTML = '<div class="notes-card"><div style="display:flex;align-items:center;margin-bottom:8px"><div class="ct" style="margin:0">Notes &amp; Checklist</div>'+_editNoteBtn+'</div>'+(_checkItems||'<div style="color:var(--muted);font-size:.82rem">Aucune note — cliquez Modifier pour en ajouter.</div>')+'</div>';

  var colors = ['y','p','g','b','w'];
  var splitCards = [];
  if(sp.cfg.fcOn) {
    splitCards.push('<div class="spb"><div class="sn">Fonds commun</div><div class="sa y">'+_m(sp.fonds)+'</div><div class="sc">'+sp.cfg.fcPct+'%</div></div>');
  }
  (sp.cfg.shareholders||[]).forEach(function(s,i){
    var col = colors[(i+1)%colors.length]||'w';
    var amt = sp.apart*(s.pct/100);
    splitCards.push('<div class="spb"><div class="sn">'+s.name+'</div><div class="sa '+col+'">'+_m(amt)+'</div><div class="sc">'+s.pct+'%</div></div>');
  });
  var splitHTML = splitCards.join('');

  var expRows = exps.length ? exps.map(function(e) {
    var bc = e.status=='paye'?'jg':'jy', sl = e.status=='paye'?'Paye':'En attente';
    var eBtn = (_role==='admin'||_role==='manager') ? '<button class="btn bo" style="padding:2px 6px;font-size:.65rem;margin-right:3px" onclick="openEditExpense(\''+eid+'\',\''+e.id+'\')" title="Modifier">&#9998;</button>' : '';
    var dBtn = canDel ? '<button class="btn br2" style="padding:2px 6px;font-size:.65rem" onclick="delExpense(\''+e.id+'\',\''+eid+'\',\''+encodeURIComponent(e.desc||e.cat||'')+'\','+e.amount+')">&#x2715;</button>' : '';
    return '<tr><td><span class="bj jw">'+e.cat+'</span></td><td>'+(e.desc||'-')+'</td><td class="r">'+_m(e.amount)+'</td><td>'+e.paidBy+'</td><td><span class="bj '+bc+'">'+sl+'</span></td><td>'+(e.refund||'-')+'</td><td>'+(e.notes||'-')+'</td><td style="white-space:nowrap">'+eBtn+dBtn+'</td></tr>';
  }).join('') : '<tr><td colspan="8" class="empty">Aucune depense</td></tr>';

  var revRows = revs.length ? revs.map(function(r) {
    var bc = r.status=='recu'?'jg':'jy', sl = r.status=='recu'?'Recu':'En attente';
    var eBtn = (_role==='admin'||_role==='manager') ? '<button class="btn bo" style="padding:2px 6px;font-size:.65rem;margin-right:3px" onclick="openEditRevenue(\''+eid+'\',\''+r.id+'\')" title="Modifier">&#9998;</button>' : '';
    var dBtn = canDel ? '<button class="btn br2" style="padding:2px 6px;font-size:.65rem" onclick="delRevenue(\''+r.id+'\',\''+eid+'\',\''+encodeURIComponent(r.desc||r.cat||'')+'\','+r.amount+')">&#x2715;</button>' : '';
    return '<tr><td><span class="bj jg">'+r.cat+'</span></td><td>'+(r.desc||'-')+'</td><td class="g">'+_m(r.amount)+'</td><td><span class="bj '+bc+'">'+sl+'</span></td><td>'+(r.notes||'-')+'</td><td style="white-space:nowrap">'+eBtn+dBtn+'</td></tr>';
  }).join('') : '<tr><td colspan="6" class="empty">Aucun revenu</td></tr>';

  var delBtn = canDel ? '<button class="btn br2" style="margin-left:6px" onclick="delEvent(\''+eid+'\')">Supprimer</button>' : '';
  var editEvBtn = (_role==='admin') ? '<button class="btn bo" style="margin-left:auto" onclick="openEvInfoModal(\''+eid+'\')">Modifier</button>' : '';

  var html = '<button class="back-btn" onclick="showPage(\'ev-list\')">&#8592; Retour</button>'
    + notesHTML
    + '<div class="ev-detail-header"><div>'
    + '<div class="ev-detail-title">'+ev.name+'</div>'
    + '<div class="ev-detail-sub">'+(ev.date||'')+(ev.lieu?' &nbsp;·&nbsp; '+ev.lieu:'')+'</div>'
    + progHTML + '</div>' + (editEvBtn || delBtn ? '<div style="display:flex;gap:6px">'+editEvBtn+delBtn+'</div>' : '') + '</div>'
    + '<div class="grid">'
    + '<div class="stat"><div class="sl">Revenus</div><div class="sv g">'+_m(sp.rev)+'</div></div>'
    + '<div class="stat"><div class="sl">Depenses</div><div class="sv r">'+_m(sp.dep)+'</div></div>'
    + '<div class="stat"><div class="sl">Profit brut</div><div class="sv '+(sp.profit>=0?'g':'r')+'">'+_m(sp.profit)+'</div></div>'
    + '<div class="stat"><div class="sl">Fonds commun</div><div class="sv y">'+_m(sp.fonds)+'</div></div>'
    + '<div class="stat"><div class="sl">A partager</div><div class="sv p">'+_m(sp.apart)+'</div></div>'
    + '<div class="stat"><div class="sl">Prix billet</div><div class="sv w">'+_m(ev.prix||0)+'</div></div>'
    + '</div>'
    + '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div class="ct" style="margin:0">Partage</div>'+(_role==='admin'?'<button class="btn by2" style="padding:4px 10px;font-size:.72rem" onclick="openEvModal(\''+eid+'\')">Modifier config</button>':'')+'</div><div class="spw">'+splitHTML+'</div></div>'
    + '<div id="ev-tabs"><div class="tab-bar">'
    + '<button id="tb-dep" class="tab on" onclick="showTab(\'dep\',\'ev-tabs\')">Depenses ('+exps.length+')</button>'
    + '<button id="tb-rev2" class="tab" onclick="showTab(\'rev2\',\'ev-tabs\')">Revenus ('+revs.length+')</button>'
    + '</div>'
    + '<div id="tc-dep" class="tab-content on">'
    + (_role!=='viewer' ? '<div class="inline-form"><div class="frow">'
      + '<div><lbl>Categorie</lbl><select id="iev-exp-ca">'+_buildOpts(_settings.expCats,['Lieu','Commissions','Salaires','DJ','Contenu/Video','Marketing','Accessoires','Materiel','Transport','Nourriture','Fonds commun','Autre'])+'</select></div>'
      + '<div style="flex:2"><lbl>Description</lbl><input id="iev-exp-de" placeholder="Ex: Location salle"></div>'
      + '<div><lbl>Montant ($)</lbl><input id="iev-exp-am" type="number" step="0.01" style="width:100px"></div>'
      + '</div><div class="frow">'
      + '<div><lbl>Payé par</lbl><select id="iev-exp-pb">'+_buildOpts(_settings.payers,['Banque de l'évènement','Fonds commun','LP Cote','LP Viens','Vincent'])+'</select></div>'
      + '<div><lbl>Statut</lbl><select id="iev-exp-st"><option value="paye">Paye</option><option value="en attente">En attente</option></select></div>'
      + '<div><lbl>Remb.</lbl><select id="iev-exp-rf"><option value="non">Non</option><option value="oui">Oui</option></select></div>'
      + '<div style="flex:2"><lbl>Notes</lbl><input id="iev-exp-no" placeholder="Optionnel"></div>'
      + '</div><button class="btn bw" style="margin-top:6px" onclick="addExpInline(\''+eid+'\')" >+ Ajouter depense</button></div>' : '')
    + '<div style="overflow-x:auto"><table><thead><tr><th>Cat.</th><th>Desc.</th><th>Montant</th><th>Paye par</th><th>Statut</th><th>Remb.</th><th>Notes</th><th></th></tr></thead><tbody>'+expRows+'</tbody></table></div>'
    + '</div>'
    + '<div id="tc-rev2" class="tab-content">'
    + (_role!=='viewer' ? '<div class="inline-form"><div class="frow">'
      + '<div><lbl>Categorie</lbl><select id="iev-rev-ca">'+_buildOpts(_settings.revCats,['Billets en ligne','Vente porte','Cash porte','Remboursement salle','Virements','Commandite','Autre'])+'</select></div>'
      + '<div style="flex:2"><lbl>Description</lbl><input id="iev-rev-de" placeholder="Ex: Vente Stripe"></div>'
      + '<div><lbl>Montant ($)</lbl><input id="iev-rev-am" type="number" step="0.01" style="width:100px"></div>'
      + '</div><div class="frow">'
      + '<div><lbl>Statut</lbl><select id="iev-rev-st"><option value="recu">Recu</option><option value="en attente">En attente</option></select></div>'
      + '<div style="flex:3"><lbl>Notes</lbl><input id="iev-rev-no" placeholder="Optionnel"></div>'
      + '</div><button class="btn bg2" style="margin-top:6px" onclick="addRevInline(\''+eid+'\')" >+ Ajouter revenu</button></div>' : '')
    + '<div style="overflow-x:auto"><table><thead><tr><th>Cat.</th><th>Desc.</th><th>Montant</th><th>Statut</th><th>Notes</th><th></th></tr></thead><tbody>'+revRows+'</tbody></table></div>'
    + '</div>'
    + '</div>';

  document.querySelectorAll('.pg').forEach(function(el) { el.classList.remove('on'); });
  document.querySelectorAll('.nb').forEach(function(el) { el.classList.remove('on'); });
  var det = _g('pg-ev-detail');
  if (det) { det.innerHTML = html; det.classList.add('on'); }
  document.querySelectorAll('.pg').forEach(function(el){ el.classList.remove('on'); });
  var evPg = _g('pg-ev-detail'); if (evPg) evPg.classList.add('on');
}

// ============================================================
// DASHBOARD
// ============================================================
function _rDash() {
  // Aggregate all events
  var totalRev=0, totalDep=0, totalFonds=0, totalApart=0;
  _data.events.forEach(function(ev){
    var evSp=_split(ev.id);
    totalRev+=evSp.rev; totalDep+=evSp.dep;
    totalFonds+=evSp.fonds; totalApart+=evSp.apart;
  });
  var totalProfit = totalRev - totalDep;
  var ds = _g('d-stats'); if (!ds) return;
  var stats = [
    ['Total revenus', _m(totalRev), 'g'],
    ['Total depenses', _m(totalDep), 'r'],
    ['Profit brut', _m(totalProfit), totalProfit>=0?'g':'r'],
    ['Fonds commun', _m(totalFonds), 'y'],
    ['A partager', _m(totalApart), 'p'],
    ['Evenements', _data.events.length, 'w']
  ];
  ds.innerHTML = stats.map(function(s) {
    return '<div class="stat"><div class="sl">'+s[0]+'</div><div class="sv '+s[2]+'">'+s[1]+'</div></div>';
  }).join('');

  var tb = _g('d-ev'); if (!tb) return;
  if (!_data.events.length) { tb.innerHTML='<tr><td colspan="7" class="empty">Aucun evenement</td></tr>'; return; }
  tb.innerHTML = _data.events.map(function(ev) {
    var s = _split(ev.id);
    return '<tr style="cursor:pointer" onclick="openEvent(\''+ev.id+'\')">'
      + '<td><b>'+ev.name+'</b></td><td>'+(ev.date||'')+'</td>'
      + '<td class="r">'+_m(s.dep)+'</td><td class="g">'+_m(s.rev)+'</td>'
      + '<td class="'+(s.profit>=0?'g':'r')+'">'+_m(s.profit)+'</td>'
      + '<td class="y">'+_m(s.fonds)+'</td>'
      + '<td><span class="bj '+(s.profit>=0?'jg':'jr')+'">'+(s.profit>=0?'Rentable':'Deficit')+'</span></td></tr>';
  }).join('');

  var dsp = _g('d-split'); if (!dsp) return;
  // Aggregate all events' splits
  var aggFonds=0, aggShares={};
  _data.events.forEach(function(ev){
    var evSp=_split(ev.id);
    aggFonds+=evSp.fonds;
    Object.keys(evSp.shares).forEach(function(name){
      aggShares[name]=(aggShares[name]||0)+evSp.shares[name];
    });
  });
  var dspH = '';
  if (aggFonds > 0) {
    dspH += '<div class="spb"><div class="sn">Fonds commun</div><div class="sa y">'+_m(aggFonds)+'</div></div>';
  }
  Object.keys(aggShares).forEach(function(name,i){
    var cols=['p','g','g','w','y'];
    if (aggShares[name] > 0) {
      dspH+='<div class="spb"><div class="sn">'+name+'</div><div class="sa '+cols[i%cols.length]+'">'+_m(aggShares[name])+'</div></div>';
    }
  });
  if (!dspH) dspH = '<div style="color:var(--muted);font-size:.82rem">Aucun partage disponible</div>';
  dsp.innerHTML=dspH;
}

// ============================================================
// EVENT LIST
// ============================================================
function _rEvList() {
  var c = _g('ev-list-wrap'); if (!c) return;
  if (!_data.events.length) { c.innerHTML='<div class="empty">Aucun evenement</div>'; return; }
  c.innerHTML = '<div class="ev-grid">' + _data.events.map(function(ev) {
    var s = _split(ev.id);
    return '<div class="ev-card" onclick="openEvent(\''+ev.id+'\')">'
      + '<div class="ev-name">'+ev.name+'</div>'
      + '<div class="ev-date">'+(ev.date||'')+(ev.lieu?' · '+ev.lieu:'')+'</div>'
      + '<div class="ev-stats">'
      + '<div class="ev-stat">Revenus: <span class="g">'+_m(s.rev)+'</span></div>'
      + '<div class="ev-stat">Depenses: <span class="r">'+_m(s.dep)+'</span></div>'
      + '<div class="ev-stat">Profit: <span class="'+(s.profit>=0?'g':'r')+'">'+_m(s.profit)+'</span></div>'
      + '</div></div>';
  }).join('') + '</div>';
}

// ============================================================
// USERS
// ============================================================
function _rUsers() {
  var tb = _g('users-tb'); if (!tb) return;
  if (!_data.users.length) { tb.innerHTML='<tr><td colspan="4" class="empty">Aucun utilisateur</td></tr>'; return; }
  tb.innerHTML = _data.users.map(function(u) {
    var isSelf = _user && u.uid === _user.uid;
    var delBtn = (!isSelf && _role==='admin')
      ? '<button class="btn br2" style="padding:2px 7px;font-size:.7rem" onclick="delUser(\''+u.uid+'\')">Supprimer</button>' : '';
    return '<tr><td>'+(u.name||'-')+'</td><td>'+u.email+'</td>'
      + '<td><select class="fs" style="width:130px" onchange="changeRole(\''+u.uid+'\',this.value)" '+(isSelf||_role!=='admin'?'disabled':'')+'>'
      + ['admin','manager','viewer'].map(function(r){return '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+r.charAt(0).toUpperCase()+r.slice(1)+'</option>';}).join('')
      + '</select></td><td>'+delBtn+'</td></tr>';
  }).join('');
}

function createUser() {
  if (_role !== 'admin') { toast('Permission refusee','error'); return; }
  var email=_g('u-email').value.trim(), pass=_g('u-pass').value, name=_g('u-name').value.trim(), role=_g('u-role').value;
  if (!email||!pass||!name) { alert('Remplissez tous les champs'); return; }
  if (pass.length < 6) { alert('Mot de passe: min 6 caracteres'); return; }
  var sec;
  try { sec = firebase.app('sec'); } catch(e) { sec = firebase.initializeApp(firebase.app().options, 'sec'); }
  sec.auth().createUserWithEmailAndPassword(email, pass).then(function(c) {
    return db.collection('users').doc(c.user.uid).set({ email:email, name:name, role:role, uid:c.user.uid });
  }).then(function() {
    sec.auth().signOut();
    ['u-email','u-pass','u-name'].forEach(function(id){_g(id).value='';});
    toast('Utilisateur cree!','success');
    logHistory('Utilisateur cree', null, name+' ('+email+')', 0, { 'Nom': name, 'Email': email, 'Role': role }, 0);
  }).catch(function(e) { alert('Erreur: '+e.message); });
}

function changeRole(uid, role) {
  if (_role !== 'admin') return;
  db.collection('users').doc(uid).update({ role:role }).then(function() { toast('Role mis a jour','success'); });
}

function delUser(uid) {
  if (_role !== 'admin') return;
  if (!confirm('Supprimer cet utilisateur?')) return;
  db.collection('users').doc(uid).delete().then(function() { toast('Utilisateur supprime','success'); });
}

// ============================================================
// EXPORT
// ============================================================
function doExportPDF() {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  var eid = _g('pdf-sel') ? _g('pdf-sel').value : null;
  var evL = eid ? _evName(eid) : 'Tous les evenements';
  var sp = _split(eid||null);
  doc.setFillColor(10,10,10); doc.rect(0,0,210,297,'F');
  doc.setFillColor(20,20,20); doc.rect(0,0,210,32,'F');
  doc.setTextColor(245,245,245); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text('SOUTHEVENTS',15,14);
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
  doc.text('RAPPORT - '+evL.toUpperCase(),15,22);
  doc.text(new Date().toLocaleDateString('fr-CA'),170,22);
  var y=42;
  var rows=[
    ['Total revenus',_m(sp.rev),[74,222,128]],
    ['Total depenses',_m(sp.dep),[248,113,113]],
    ['Profit brut',_m(sp.profit),sp.profit>=0?[74,222,128]:[248,113,113]],
    ['Fonds commun (10%)',_m(sp.fonds),[251,191,36]],
    ['A partager',_m(sp.apart),[192,132,252]],
    ['Vincent (18%)',_m(sp.vincent),[192,132,252]],
    ['LP Cote (41%)',_m(sp.lpcote),[74,222,128]],
    ['LP Viens (41%)',_m(sp.lpviens),[74,222,128]]
  ];
  doc.setTextColor(80,80,80); doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.text('RESUME FINANCIER',15,y);
  doc.setDrawColor(35,35,35); doc.line(15,y+2,195,y+2); y+=10;
  rows.forEach(function(row) {
    doc.setTextColor(140,140,140); doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text(row[0],15,y);
    doc.setTextColor(row[2][0],row[2][1],row[2][2]); doc.setFont('helvetica','bold'); doc.text(row[1],140,y); y+=9;
  });
  doc.save('Southevents_'+new Date().toISOString().split('T')[0]+'.pdf');
}

function doExportXLSX() {
  var wb = XLSX.utils.book_new();
  var evRows = [['Nom','Date','Lieu','Prix','Depenses','Revenus','Profit','Fonds','LP Cote','LP Viens','Vincent']];
  _data.events.forEach(function(ev) {
    var s = _split(ev.id);
    evRows.push([ev.name,ev.date,ev.lieu,Number(ev.prix||0),s.dep,s.rev,s.profit,s.fonds,s.lpcote,s.lpviens,s.vincent]);
  });
  var expRows = [['Evenement','Categorie','Description','Montant','Paye par','Statut','Remboursable','Notes','Ajoute par']];
  _data.expenses.forEach(function(e) {
    expRows.push([_evName(e.eventId),e.cat,e.desc,Number(e.amount),e.paidBy,e.status,e.refund,e.notes,e.addedBy||'']);
  });
  var revRows = [['Evenement','Categorie','Description','Montant','Statut','Notes','Ajoute par']];
  _data.revenues.forEach(function(r) {
    revRows.push([_evName(r.eventId),r.cat,r.desc,Number(r.amount),r.status,r.notes,r.addedBy||'']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(evRows), 'Evenements');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Depenses');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revRows), 'Revenus');
  XLSX.writeFile(wb, 'Southevents_'+new Date().toISOString().split('T')[0]+'.xlsx');
}

// ============================================================
// REFRESH
// ============================================================
var _currentEid = null;

function _refresh() {
  _fillSels();
  _rEvList();
  _rDash();
  if (_currentEid) openEvent(_currentEid);
}

window.onload = function() { _initShareholderForm(); };


// ============================================================
// SETTINGS
// ============================================================
var _settings = {
  expCats: ['Lieu','Commissions','Salaires','DJ','Contenu/Video','Marketing','Accessoires','Materiel','Transport','Nourriture','Fonds commun','Autre'],
  revCats: ['Billets en ligne','Vente porte','Cash porte','Remboursement salle','Virements','Commandite','Autre'],
  payers:  ['LP Cote','LP Viens','Vincent','Fonds commun']
};

function _buildOpts(arr, fallback) {
  var list = (arr && arr.length) ? arr : fallback;
  return list.map(function(c){ return '<option>'+c+'</option>'; }).join('');
}

function _initSettingsListener() {
  db.collection('settings').doc('app').onSnapshot(function(snap) {
    if (!snap.exists) return;
    var d = snap.data();
    if (d.expCats && d.expCats.length) _settings.expCats = d.expCats;
    if (d.revCats && d.revCats.length) _settings.revCats = d.revCats;
    if (d.payers  && d.payers.length)  _settings.payers  = d.payers;
  });
}

// ============================================================
// INLINE EXPENSE ADD
// ============================================================
function addExpInline(eid) {
  if (_role === 'viewer') { toast('Permission refusee', 'error'); return; }
  var amt = Number((_g('iev-exp-am')||{}).value||0);
  if (!amt || amt <= 0) { toast('Entrez un montant valide', 'error'); return; }
  var cat  = (_g('iev-exp-ca')||{}).value||'';
  var desc = (_g('iev-exp-de')||{}).value||'';
  var pb   = (_g('iev-exp-pb')||{}).value||'';
  var st   = (_g('iev-exp-st')||{}).value||'paye';
  var rf   = (_g('iev-exp-rf')||{}).value||'non';
  var no   = (_g('iev-exp-no')||{}).value||'';
  db.collection('expenses').add({
    eventId:eid, cat:cat, desc:desc, amount:amt,
    paidBy:pb, status:st, refund:rf, notes:no,
    addedBy:_user.email, createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    ['iev-exp-de','iev-exp-am','iev-exp-no'].forEach(function(id){ var el=_g(id); if(el) el.value=''; });
    toast('Depense ajoutee!', 'success');
    logHistory('Depense ajoutee', eid, cat+' — '+desc, amt, {Categorie:cat, Description:desc, Montant:_m(amt), 'Paye par':pb, Statut:st, Remboursable:rf});
  }).catch(function(e){ toast('Erreur: '+e.message, 'error'); });
}

// ============================================================
// INLINE REVENUE ADD
// ============================================================
function addRevInline(eid) {
  if (_role === 'viewer') { toast('Permission refusee', 'error'); return; }
  var amt = Number((_g('iev-rev-am')||{}).value||0);
  if (!amt || amt <= 0) { toast('Entrez un montant valide', 'error'); return; }
  var cat  = (_g('iev-rev-ca')||{}).value||'';
  var desc = (_g('iev-rev-de')||{}).value||'';
  var st   = (_g('iev-rev-st')||{}).value||'recu';
  var no   = (_g('iev-rev-no')||{}).value||'';
  db.collection('revenues').add({
    eventId:eid, cat:cat, desc:desc, amount:amt,
    status:st, notes:no, addedBy:_user.email,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    ['iev-rev-de','iev-rev-am','iev-rev-no'].forEach(function(id){ var el=_g(id); if(el) el.value=''; });
    toast('Revenu ajoute!', 'success');
    logHistory('Revenu ajoute', eid, cat+' — '+desc, amt, {Categorie:cat, Description:desc, Montant:_m(amt), Statut:st});
  }).catch(function(e){ toast('Erreur: '+e.message, 'error'); });
}

// ============================================================
// EDIT EVENT INFO
// ============================================================
var _editInfoEid = null;
function openEvInfoModal(eid) {
  if (_role !== 'admin') { toast('Admin seulement', 'error'); return; }
  _editInfoEid = eid;
  var ev = _data.events.find(function(e){ return e.id===eid; });
  if (!ev) return;
  _g('ev-edit-name').value  = ev.name||'';
  _g('ev-edit-date').value  = ev.date||'';
  _g('ev-edit-lieu').value  = ev.lieu||'';
  _g('ev-edit-prix').value  = ev.prix||0;
  _g('ev-edit-obj').value   = ev.objectif||'';
  _g('ev-info-modal').style.display = 'flex';
}
function closeEvInfoModal() { _g('ev-info-modal').style.display='none'; _editInfoEid=null; }
function saveEvInfo() {
  if (!_editInfoEid) return;
  var nm=_g('ev-edit-name').value, dt=_g('ev-edit-date').value, li=_g('ev-edit-lieu').value;
  var pr=Number(_g('ev-edit-prix').value)||0, obj=Number(_g('ev-edit-obj').value)||0;
  db.collection('events').doc(_editInfoEid).update({name:nm,date:dt,lieu:li,prix:pr,objectif:obj})
    .then(function(){
      toast('Evenement mis a jour', 'success');
      logHistory('Evenement modifie',_editInfoEid,nm,0,{Nom:nm,Date:dt,Lieu:li,'Prix billet':_m(pr),'Objectif billets':obj});
      closeEvInfoModal();
    }).catch(function(e){ toast('Erreur: '+e.message,'error'); });
}

// ============================================================
// EDIT EXPENSE / REVENUE MODAL
// ============================================================
var _editEr = {type:null, id:null, eid:null};
function openEditExpense(eid, id) {
  if (_role==='viewer') { toast('Permission refusee','error'); return; }
  _editEr = {type:'expense', id:id, eid:eid};
  var e = _data.expenses.find(function(x){ return x.id===id; }); if (!e) return;
  var payers = (_settings.payers&&_settings.payers.length) ? _settings.payers : ['LP Cote','LP Viens','Vincent','Fonds commun'];
  _g('er-paidBy').innerHTML = payers.map(function(p){ return '<option>'+p+'</option>'; }).join('');
  _g('er-paidBy').value     = e.paidBy||payers[0];
  _g('er-status').innerHTML = '<option value="paye">Paye</option><option value="en attente">En attente</option>';
  _g('er-status').value     = e.status||'paye';
  _g('er-refund').value     = e.refund||'non';
  _g('er-notes').value      = e.notes||'';
  _g('er-paidby-row').style.display = '';
  _g('er-refund-row').style.display = '';
  _g('er-modal-title').textContent  = 'Modifier depense';
  _g('edit-er-modal').style.display = 'flex';
}
function openEditRevenue(eid, id) {
  if (_role==='viewer') { toast('Permission refusee','error'); return; }
  _editEr = {type:'revenue', id:id, eid:eid};
  var r = _data.revenues.find(function(x){ return x.id===id; }); if (!r) return;
  _g('er-paidBy').innerHTML = '<option value="na">N/A</option>';
  _g('er-status').innerHTML = '<option value="recu">Recu</option><option value="en attente">En attente</option>';
  _g('er-status').value     = r.status||'recu';
  _g('er-notes').value      = r.notes||'';
  _g('er-paidby-row').style.display = 'none';
  _g('er-refund-row').style.display = 'none';
  _g('er-modal-title').textContent  = 'Modifier revenu';
  _g('edit-er-modal').style.display = 'flex';
}
function closeEditErModal() { _g('edit-er-modal').style.display='none'; _editEr={type:null,id:null,eid:null}; }
function saveEditEr() {
  if (!_editEr.type||!_editEr.id) return;
  var notes = _g('er-notes').value;
  if (_editEr.type==='expense') {
    var pb=_g('er-paidBy').value, st=_g('er-status').value, rf=_g('er-refund').value;
    db.collection('expenses').doc(_editEr.id).update({paidBy:pb,status:st,refund:rf,notes:notes})
      .then(function(){ toast('Depense mise a jour','success'); closeEditErModal(); })
      .catch(function(e){ toast('Erreur: '+e.message,'error'); });
  } else {
    db.collection('revenues').doc(_editEr.id).update({status:_g('er-status').value,notes:notes})
      .then(function(){ toast('Revenu mis a jour','success'); closeEditErModal(); })
      .catch(function(e){ toast('Erreur: '+e.message,'error'); });
  }
}

// ============================================================
// NOTES CHECKLIST
// ============================================================
var _notesEid=null, _noteItems=[];
function openNotesModal(eid) {
  _notesEid = eid;
  var ev = _data.events.find(function(e){ return e.id===eid; }); if (!ev) return;
  _noteItems = Array.isArray(ev.notes)
    ? ev.notes.map(function(n){ return {text:n.text||'',done:!!n.done}; })
    : (ev.notes ? [{text:String(ev.notes),done:false}] : []);
  _renderNotesList();
  _g('notes-modal').style.display = 'flex';
}
function closeNotesModal() { _g('notes-modal').style.display='none'; _notesEid=null; }
function _renderNotesList() {
  var c = _g('notes-modal-list'); if (!c) return;
  if (!_noteItems.length) { c.innerHTML='<div style="color:var(--muted);font-size:.82rem">Aucune note. Ajoutez-en ci-dessous.</div>'; return; }
  c.innerHTML = _noteItems.map(function(n,i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
      +'<input type="checkbox"'+(n.done?' checked':'')+' onchange="_noteItems['+i+'].done=this.checked" style="width:16px;height:16px;cursor:pointer">'
      +'<input value="'+n.text.replace(/"/g,'&quot;')+'" style="flex:1;margin-bottom:0" oninput="_noteItems['+i+'].text=this.value">'
      +'<button class="btn br2" style="padding:2px 8px;font-size:.7rem" onclick="_noteItems.splice('+i+',1);_renderNotesList()">&#x2715;</button>'
      +'</div>';
  }).join('');
}
function addNoteItem() {
  var inp=_g('notes-new-item'); if (!inp) return;
  var txt=inp.value.trim(); if (!txt) return;
  _noteItems.push({text:txt,done:false}); inp.value=''; _renderNotesList();
}
function saveNotes() {
  if (!_notesEid) return;
  db.collection('events').doc(_notesEid).update({notes:_noteItems})
    .then(function(){ toast('Checklist sauvegardee','success'); closeNotesModal(); })
    .catch(function(e){ toast('Erreur: '+e.message,'error'); });
}
function _toggleNote(eid,idx) {
  var ev=_data.events.find(function(e){ return e.id===eid; }); if (!ev) return;
  var notes = Array.isArray(ev.notes) ? ev.notes.slice() : [];
  if (!notes[idx]) return;
  notes[idx] = {text:notes[idx].text, done:!notes[idx].done};
  db.collection('events').doc(eid).update({notes:notes}).catch(function(){});
}

// ============================================================
// FONDS COMMUN
// ============================================================

function _rFc() {
  var contributions = 0, fundSpend = 0, reimburse = 0, moves = [];

  _data.events.forEach(function(ev) {
    var sp = _split(ev.id);
    var eventRev = _data.revenues.filter(function(r){ return r.eventId === ev.id; }).reduce(function(a,b){ return a + Number(b.amount || 0); }, 0);
    var eventExp = _data.expenses.filter(function(e){ return e.eventId === ev.id && String(e.paidBy || '').toLowerCase() !== 'fonds commun'; }).reduce(function(a,b){ return a + Number(b.amount || 0); }, 0);
    var bank = eventRev - eventExp;
    if (sp.fonds > 0) {
      contributions += sp.fonds;
      moves.push({type:'credit', label:'Contribution événement', evName:ev.name, amount:sp.fonds, date:ev.date||'', note:'Part du fonds commun'});
    }
    moves.push({type:'bank', label:'Banque événement', evName:ev.name, amount:bank, date:ev.date||'', note:'Revenus - dépenses'});
  });

  _data.expenses.forEach(function(exp) {
    var paidBy = String(exp.paidBy || '').toLowerCase();
    var ev = _data.events.find(function(e) { return e.id === exp.eventId; }) || {};
    if (paidBy.indexOf('fonds commun') > -1) {
      fundSpend += Number(exp.amount || 0);
      moves.push({type:'debit', label:exp.desc || exp.cat || 'Dépense', evName:ev.name || '-', amount:Number(exp.amount||0), date:exp.createdAt ? new Date(exp.createdAt.toDate ? exp.createdAt.toDate() : exp.createdAt).toLocaleDateString('fr-CA') : '', note:'Sortie du fonds'});
    }
    if ((exp.refund || '').toLowerCase() === 'oui') {
      reimburse += Number(exp.amount || 0);
      moves.push({type:'credit', label:exp.desc || exp.cat || 'Remboursement', evName:ev.name || '-', amount:Number(exp.amount||0), date:exp.createdAt ? new Date(exp.createdAt.toDate ? exp.createdAt.toDate() : exp.createdAt).toLocaleDateString('fr-CA') : '', note:'Remboursé par revenus'});
    }
  });

  var netSpent = fundSpend - reimburse;
  var pendingRecovery = Math.max(fundSpend - reimburse, 0);
  var balance = contributions - netSpent;

  var fcStats = _g('fc-stats');
  if (fcStats) {
    fcStats.innerHTML = [
      ['Contributions', _m(contributions), 'y'],
      ['Dépenses FC', _m(fundSpend), 'r'],
      ['Remboursé', _m(reimburse), 'g'],
      ['Solde réel', _m(balance), balance >= 0 ? 'g' : 'r']
    ].map(function(s){ return '<div class="stat"><div class="sl">'+s[0]+'</div><div class="sv '+s[2]+'">'+s[1]+'</div></div>'; }).join('');
  }

  var summary = _g('fc-summary');
  if (summary) {
    summary.innerHTML = '<div class="card"><div class="ct">État du fonds commun</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'
      + '<div class="stat"><div class="sl">À récupérer</div><div class="sv y">'+_m(pendingRecovery)+'</div></div>'
      + '<div class="stat"><div class="sl">Net utilisé</div><div class="sv r">'+_m(netSpent)+'</div></div>'
      + '<div class="stat"><div class="sl">Contributions</div><div class="sv g">'+_m(contributions)+'</div></div>'
      + '</div></div>';
  }

  moves.sort(function(a,b) { return (b.date || '').localeCompare(a.date || ''); });
  var tb = _g('fc-tb');
  if (!tb) return;
  if (!moves.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Aucun mouvement</td></tr>'; return; }

  var running = 0;
  tb.innerHTML = moves.map(function(m) {
    if (m.type === 'credit') running += m.amount;
    else if (m.type === 'debit') running -= m.amount;
    var typeLabel = m.type === 'bank' ? 'Banque' : (m.type === 'credit' ? 'Crédit' : 'Débit');
    var amountClass = m.type === 'bank' ? (m.amount >= 0 ? 'g' : 'r') : (m.type === 'credit' ? 'g' : 'r');
    var sign = m.type === 'bank' ? '' : (m.type === 'credit' ? '+' : '-');
    return '<tr>'
      + '<td>'+(m.date || '-')+'</td>'
      + '<td><span class="bj '+(m.type === 'bank' ? 'jy' : (m.type === 'credit' ? 'jg' : 'jr'))+'">'+typeLabel+'</span></td>'
      + '<td>'+m.evName+'</td>'
      + '<td>'+m.label+(m.note ? ' <span style="color:var(--muted)">— '+m.note+'</span>' : '')+'</td>'
      + '<td class="'+amountClass+'">'+(m.type === 'bank' ? _m(m.amount) : sign+_m(m.amount))+'</td>'
      + '<td class="'+(running >= 0 ? 'g' : 'r')+'">'+_m(running)+'</td>'
      + '</tr>';
  }).join('');
}


