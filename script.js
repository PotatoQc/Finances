const storageKey='southevents_v15_clean';
const defaultState={events:[],revenues:[],expenses:[],history:[],settings:{expCats:['Location','Nourriture','Son'],revCats:['Billets','Sponsoring','Dons'],payers:['Banque de l'évènement','Fonds commun','LP Cote','LP Viens','Vincent']}};
let state=load();
let currentPage='dash';
let modalHandler=null;

function load(){try{return {...defaultState,...JSON.parse(localStorage.getItem(storageKey)||'{}')}}catch(e){return structuredClone(defaultState)}}
function save(){localStorage.setItem(storageKey,JSON.stringify(state))}
function money(n){return new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(Number(n||0))}
function uid(){return 'e'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)}
function byId(id){return document.getElementById(id)}
function fmtDate(d){if(!d)return'-';const x=new Date(d);return isNaN(x)?d:x.toLocaleDateString('fr-CA')}
function sum(arr,key,evId){return arr.filter(x=>!evId||x.eventId===evId).reduce((a,b)=>a+Number(b[key]||0),0)}
function eventTotals(ev){const rev=sum(state.revenues,'amount',ev.id), exp=sum(state.expenses,'amount',ev.id);return {rev,exp,balance:rev-exp}}

function setPage(page){currentPage=page;document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));byId('page-'+page).classList.add('on');document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('on',b.dataset.page===page));const titles={dash:['Dashboard','Vue d’ensemble de vos événements'],events:['Événements','Liste et actions rapides'],add:['Créer événement','Ajout d’un nouvel événement'],funds:['Fonds commun','Solde et mouvements'],history:['Historique','Actions récentes'],settings:['Paramètres','Catégories et options']};byId('pageTitle').textContent=titles[page][0];byId('pageSub').textContent=titles[page][1];render()}

function render(){renderDash();renderEvents();renderFunds();renderHistory();renderSettings()}
function renderDash(){const k=byId('kpis'), t=byId('dashTable');const totals=state.events.reduce((a,e)=>{const tt=eventTotals(e);a.rev+=tt.rev;a.exp+=tt.exp;a.bal+=tt.balance;return a},{rev:0,exp:0,bal:0});k.innerHTML=[['Événements',state.events.length,'Total'],['Revenus',money(totals.rev),'Cumuls'],['Dépenses',money(totals.exp),'Cumuls'],['Solde',money(totals.bal),totals.bal>=0?'Positif':'Négatif']].map(x=>`<div class="kpi"><div class="l">${x[0]}</div><div class="v ${x[3]==='Négatif'?'r':'g'}">${x[1]}</div><div class="s">${x[2]||''}</div></div>`).join('');t.innerHTML=state.events.length?state.events.map(e=>{const tt=eventTotals(e);return `<tr><td>${e.name}</td><td>${fmtDate(e.date)}</td><td class="g">${money(tt.rev)}</td><td class="r">${money(tt.exp)}</td><td class="${tt.balance>=0?'g':'r'}">${money(tt.balance)}</td></tr>`}).join(''):`<tr><td colspan="5" class="muted">Aucune donnée</td></tr>`}
function renderEvents(){const el=byId('eventsList');if(!state.events.length){el.innerHTML='<div class="item muted">Aucun événement. Créez-en un à l’onglet Créer événement.</div>';return}el.innerHTML=state.events.map(e=>{const tt=eventTotals(e);return `<div class="item"><div class="item-head"><div><div><strong>${e.name}</strong></div><div class="muted">${fmtDate(e.date)} • ${e.place||'—'}</div></div><div><span class="badge ${tt.balance>=0?'g':'r'}">${money(tt.balance)}</span></div></div><div class="muted">Billet: ${e.ticketPrice?money(e.ticketPrice):'—'} • Objectif: ${e.objective||'—'} • Notes: ${e.notes||'—'}</div></div>`}).join('')}
function renderFunds(){const k=byId('fundKpis'), t=byId('fundTable');const contrib=state.events.reduce((a,e)=>a+Number(e.fundContribution||0),0), spend=state.expenses.filter(x=>String(x.paidBy||'').toLowerCase().includes('fonds commun')).reduce((a,b)=>a+Number(b.amount||0),0);const bal=contrib-spend;k.innerHTML=[['Contributions',money(contrib),'Entrées'],['Dépenses',money(spend),'Sorties'],['Solde',money(bal),bal>=0?'Stable':'À couvrir']].map(x=>`<div class="kpi"><div class="l">${x[0]}</div><div class="v ${x[3]==='À couvrir'?'r':'g'}">${x[1]}</div><div class="s">${x[2]}</div></div>`).join('');const moves=[];state.events.forEach(e=>{if(e.fundContribution)moves.push({date:e.date,type:'Contribution',event:e.name,amount:Number(e.fundContribution||0),bal:null})});state.expenses.filter(x=>String(x.paidBy||'').toLowerCase().includes('fonds commun')).forEach(x=>moves.push({date:x.date||'',type:'Dépense',event:(state.events.find(e=>e.id===x.eventId)||{}).name||'-',amount:-Number(x.amount||0)}));moves.sort((a,b)=>(a.date||'').localeCompare(b.date||''));let running=0;t.innerHTML=moves.length?moves.map(m=>{running+=m.amount;return `<tr><td>${fmtDate(m.date)}</td><td>${m.type}</td><td>${m.event}</td><td class="${m.amount>=0?'g':'r'}">${money(m.amount)}</td><td class="${running>=0?'g':'r'}">${money(running)}</td></tr>`}).join(''):`<tr><td colspan="5" class="muted">Aucun mouvement</td></tr>`}
function renderHistory(){const el=byId('historyList');el.innerHTML=state.history.length?state.history.slice().reverse().map(h=>`<div class="item"><div class="item-head"><strong>${h.type}</strong><span class="muted">${fmtDate(h.at)}</span></div><div>${h.text}</div></div>`).join(''):'<div class="item muted">Aucun historique</div>'}
function renderSettings(){byId('expCats').value=(state.settings.expCats||[]).join('
');byId('revCats').value=(state.settings.revCats||[]).join('
');byId('payers').value=(state.settings.payers||[]).join('
')}
function log(type,text){state.history.push({type,text,at:new Date().toISOString()});save()}

function openModal(title,body,handler){byId('modalTitle').textContent=title;byId('modalBody').innerHTML=body;modalHandler=handler;byId('modal').classList.remove('hidden')}
function closeModal(){byId('modal').classList.add('hidden');modalHandler=null}

function createEvent(data){const ev={id:uid(),name:data.name,date:data.date,place:data.place||'',ticketPrice:Number(data.ticketPrice||0),objective:Number(data.objective||0),notes:data.notes||'',fundContribution:0};state.events.push(ev);log('Événement créé',ev.name);save();render();setPage('events')}

function addRevenue(evId,amount,cat,notes){state.revenues.push({id:uid(),eventId:evId,amount:Number(amount||0),cat:cat||'Billets',notes:notes||'',date:new Date().toISOString()});log('Revenu ajouté',`${cat||'Revenu'} — ${money(amount)}`);save();render()}
function addExpense(evId,amount,cat,paidBy,notes){state.expenses.push({id:uid(),eventId:evId,amount:Number(amount||0),cat:cat||'Dépense',paidBy:paidBy||'Banque de l'évènement',notes:notes||'',date:new Date().toISOString()});log('Dépense ajoutée',`${cat||'Dépense'} — ${money(amount)}`);save();render()}

function seed(){state={...structuredClone(defaultState),events:[{id:'ev1',name:'Souper bénéfice',date:'2026-04-30',place:'Trois-Rivières',ticketPrice:35,objective:120,notes:'Vérifier la sono',fundContribution:500},{id:'ev2',name:'Tournoi',date:'2026-05-15',place:'Shawinigan',ticketPrice:20,objective:80,notes:'Liste bénévoles',fundContribution:200}],revenues:[{id:'r1',eventId:'ev1',amount:4200,cat:'Billets',notes:'Prévente',date:'2026-04-15T10:00:00Z'},{id:'r2',eventId:'ev2',amount:1600,cat:'Billets',notes:'Entrées',date:'2026-04-16T10:00:00Z'}],expenses:[{id:'x1',eventId:'ev1',amount:800,cat:'Location',paidBy:'Banque de l'évènement',notes:'Salle',date:'2026-04-15T11:00:00Z'},{id:'x2',eventId:'ev2',amount:350,cat:'Collations',paidBy:'Fonds commun',notes:'Achat groupé',date:'2026-04-16T11:00:00Z'}],history:[{type:'Démo',text:'Jeu de données de démonstration chargé',at:new Date().toISOString()}],settings:structuredClone(defaultState.settings)};save();render();setPage('dash')}
function reset(){localStorage.removeItem(storageKey);state=load();render();setPage('dash')}

byId('eventForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);createEvent(Object.fromEntries(fd.entries()));e.target.reset()})
byId('seedBtn').addEventListener('click',seed)
byId('resetBtn').addEventListener('click',reset)
byId('saveSettings').addEventListener('click',()=>{state.settings={expCats:byId('expCats').value.split(/
+/).map(s=>s.trim()).filter(Boolean),revCats:byId('revCats').value.split(/
+/).map(s=>s.trim()).filter(Boolean),payers:byId('payers').value.split(/
+/).map(s=>s.trim()).filter(Boolean)};save();log('Paramètres','Catégories mises à jour');render()})
byId('closeModal').addEventListener('click',closeModal)
byId('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()})
document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)))
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()})

// expose for future extensions
window.addRevenue=addRevenue;window.addExpense=addExpense;window.createEvent=createEvent;window.openModal=openModal;window.closeModal=closeModal;

render();
