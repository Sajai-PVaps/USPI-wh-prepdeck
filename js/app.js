/* ===================== Firebase init ===================== */
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ORDERS = db.collection('orders');
const INVENTORY = db.collection('inventory');
const TEAM_MEMBERS = db.collection('team_members');

/* ===================== State ===================== */
let allOrders = [];
let allInventory = [];
let allTeamMembers = [];
let currentUser = null;   // {email, name, team}
let ordersUnsub = null;
let inventoryUnsub = null;
let teamMembersUnsub = null;

const STATUSES = ["Order Received","Label Acknowledged","Packed","Shipped","Delivered","Exception"];
const STATUS_CLASS = {
  "Order Received":"tag-received","Label Acknowledged":"tag-ack","Packed":"tag-packed",
  "Shipped":"tag-shipped","Delivered":"tag-delivered","Exception":"tag-exception"
};
const STORAGE_STATUS_CLASS = {
  "In Storage":"tag-instorage","Partially Shipped":"tag-partial","Depleted":"tag-depleted","Returned to Client":"tag-returned"
};

// Mirrors the Firestore security rules — used here only to decide which
// buttons to SHOW. The real enforcement lives server-side in Firestore
// Rules; a user could inspect this file and remove the hiding, but the
// database itself will still reject any write their team isn't allowed
// to make. See README.md -> "Security".
const STATUS_PERMISSIONS = {
  'Warehouse': ['Label Acknowledged','Packed','Shipped','Exception'],
  'Transactions': ['Delivered','Exception','Shipped'],
  'Admin': STATUSES
};
function canSetStatus(team, status){
  return (STATUS_PERMISSIONS[team]||[]).includes(status);
}
function canCreateOrders(team){ return team==='Order Intake' || team==='Admin'; }
function canManageStorage(team){ return team==='Warehouse' || team==='Admin'; }

/* ===================== Helpers ===================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function toast(msg, isErr){
  const wrap = $('#toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 3800);
}
function fmtDateTime(ms){
  if(!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ', ' +
         d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
function fmtDate(ms){
  if(!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function timeAgo(ms){
  if(!ms) return '—';
  const diff = Date.now() - ms;
  const h = diff/3600000;
  if(h < 1) return Math.round(diff/60000) + 'm';
  if(h < 24) return Math.round(h) + 'h';
  return Math.round(h/24) + 'd';
}
function isToday(ms){
  if(!ms) return false;
  const d = new Date(ms), n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
}
function dateInputToMs(val){
  if(!val) return null;
  return new Date(val + 'T00:00:00').getTime();
}
function genRef(prefix){
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase();
}
function openModal(id){ $('#'+id).classList.add('active'); }
function closeModal(id){ $('#'+id).classList.remove('active'); }
function marketplaceLabel(o){
  return o.marketplace === 'Other' && o.marketplaceOther ? 'Other: '+o.marketplaceOther : o.marketplace;
}

/* ===================== Login gate (real per-person accounts) ===================== */
// Soft, client-side cool-down after repeated failed attempts. This is a UX
// nicety only — the real brute-force protection is Firebase Authentication's
// own server-side throttling, which can't be bypassed by clearing local
// storage. See README.md -> "Security".
const LOGIN_ATTEMPTS_KEY = 'prepdeck_login_attempts';
function getAttempts(){
  try{ return JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY)) || {count:0, first:0}; }
  catch(e){ return {count:0, first:0}; }
}
function recordFailedAttempt(){
  const a = getAttempts();
  const now = Date.now();
  if(now - a.first > 5*60000){ a.count = 0; a.first = now; }
  a.count += 1;
  localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(a));
  return a;
}
function clearAttempts(){ localStorage.removeItem(LOGIN_ATTEMPTS_KEY); }
function cooldownRemaining(){
  const a = getAttempts();
  if(a.count < 5) return 0;
  const elapsed = Date.now() - a.first;
  const wait = 2*60000 - elapsed;
  return wait > 0 ? wait : 0;
}
function updateGateButtonState(){
  const remaining = cooldownRemaining();
  const btn = $('#gate-submit');
  if(remaining > 0){
    btn.disabled = true;
    const secs = Math.ceil(remaining/1000);
    $('#gate-error').textContent = `Too many failed attempts. Try again in ${Math.ceil(secs/60)} minute(s).`;
    setTimeout(updateGateButtonState, 1000);
  } else {
    btn.disabled = false;
  }
}

function initGate(){
  updateGateButtonState();
  $('#gate-submit').addEventListener('click', async ()=>{
    if(cooldownRemaining() > 0) return;
    const email = $('#gate-email').value.trim().toLowerCase();
    const password = $('#gate-password').value;
    $('#gate-error').textContent = '';
    if(!email || !password){ $('#gate-error').textContent = 'Enter your email and password.'; return; }

    try{
      await firebase.auth().signInWithEmailAndPassword(email, password);
      clearAttempts();
      // enterApp() runs from onAuthStateChanged once the profile loads
    }catch(err){
      recordFailedAttempt();
      updateGateButtonState();
      console.error(err);
      if(cooldownRemaining() > 0) return; // updateGateButtonState() already set the cooldown message
      if(err.code === 'auth/too-many-requests'){
        $('#gate-error').textContent = 'Too many attempts — Firebase has temporarily locked this out. Try again shortly.';
      } else if(err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential'){
        $('#gate-error').textContent = 'Incorrect email or password.';
      } else if(err.code === 'auth/invalid-email'){
        $('#gate-error').textContent = 'That email address doesn\u2019t look right.';
      } else {
        $('#gate-error').textContent = 'Could not sign in. Check your connection and try again.';
      }
    }
  });
}

function showGate(){
  $('#app').style.display = 'none';
  $('#gate').style.display = 'flex';
  $('#gate-password').value = '';
  updateGateButtonState();
}

function enterApp(profile){
  currentUser = profile;
  $('#gate').style.display = 'none';
  $('#app').style.display = 'flex';
  $('#who-name').textContent = currentUser.name;
  $('#who-team').textContent = currentUser.team;
  $('#nav-admin').style.display = currentUser.team === 'Admin' ? 'flex' : 'none';
  $('#open-new-order').style.display = canCreateOrders(currentUser.team) ? 'flex' : 'none';
  $('#fab-new-order').style.display = canCreateOrders(currentUser.team) ? 'flex' : 'none';
  startSync();
}

/* Both buttons perform a full, real sign-out. With per-person logins, there
   is no safe way to "switch" to another teammate without their own
   password — letting that happen would defeat the whole point of individual
   accounts. Both are offered because people expect the option, but the next
   person always has to sign in with their own credentials. */
function doSignOut(){
  if(ordersUnsub) ordersUnsub();
  if(inventoryUnsub) inventoryUnsub();
  if(teamMembersUnsub) teamMembersUnsub();
  ordersUnsub = inventoryUnsub = teamMembersUnsub = null;
  allOrders = []; allInventory = []; allTeamMembers = [];
  firebase.auth().signOut();
}
$('#switch-user').addEventListener('click', doSignOut);
$('#log-out').addEventListener('click', doSignOut);

/* ===================== Mobile nav (drawer + FAB) ===================== */
function openDrawer(){ $('#sidebar').classList.add('open'); $('#sidebar-backdrop').classList.add('open'); }
function closeDrawer(){ $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('open'); }
$('#hamburger').addEventListener('click', openDrawer);
$('#sidebar-close').addEventListener('click', closeDrawer);
$('#sidebar-backdrop').addEventListener('click', closeDrawer);
$('#fab-new-order').addEventListener('click', ()=>openModal('modal-new'));

/* ===================== Auth state + Firestore sync ===================== */
firebase.auth().onAuthStateChanged(async user=>{
  if(!user){ showGate(); return; }
  try{
    const doc = await TEAM_MEMBERS.doc(user.email.toLowerCase()).get();
    if(!doc.exists){
      $('#gate-error').textContent = 'Your account isn\u2019t set up yet in Prep Deck. Ask your admin to add you under Admin / Team.';
      firebase.auth().signOut();
      return;
    }
    enterApp({ email: user.email.toLowerCase(), name: doc.data().name, team: doc.data().team });
  }catch(err){
    console.error(err);
    toast('Could not load your profile. Check your connection.', true);
  }
});

function startSync(){
  if(ordersUnsub) return; // already listening

  ordersUnsub = ORDERS.orderBy('createdAt','desc').limit(3000)
    .onSnapshot(snap => {
      allOrders = snap.docs.map(d => ({id:d.id, ...d.data()}));
      $('#conn-status').innerHTML = '<span class="conn-dot"></span>Live sync';
      renderAll();
    }, err => {
      console.error(err);
      $('#conn-status').innerHTML = '<span class="conn-dot off"></span>Connection error';
      toast('Could not reach the database. Check firebase-config.js and your Firestore rules.', true);
    });

  inventoryUnsub = INVENTORY.orderBy('createdAt','desc').limit(3000)
    .onSnapshot(snap => {
      allInventory = snap.docs.map(d => ({id:d.id, ...d.data()}));
      renderAll();
    }, err => console.error(err));

  if(currentUser.team === 'Admin'){
    teamMembersUnsub = TEAM_MEMBERS.onSnapshot(snap=>{
      allTeamMembers = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderTeamMembers();
    }, err => console.error(err));
  }
}

/* ===================== Nav ===================== */
$$('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.nav-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active'));
    $('#view-'+btn.dataset.view).classList.add('active');
    $('#view-title').textContent = btn.textContent.trim();
    closeDrawer();
  });
});

/* ===================== Render: everything ===================== */
function renderAll(){
  renderDashboard();
  renderOrdersTable();
  renderKanban();
  renderComms();
  renderStorage();
}

/* ---- Dashboard ---- */
function renderDashboard(){
  $('#today-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'}).toUpperCase();

  const today = allOrders.filter(o=>isToday(o.createdAt));
  $('#stat-received').textContent = today.length;
  $('#stat-ack').textContent = allOrders.filter(o=>o.status==='Order Received').length;
  $('#stat-packed').textContent = allOrders.filter(o=>o.packedAt && isToday(o.packedAt)).length;
  $('#stat-shipped').textContent = allOrders.filter(o=>o.shippedAt && isToday(o.shippedAt)).length;
  $('#stat-delivered').textContent = allOrders.filter(o=>o.deliveredAt && isToday(o.deliveredAt)).length;
  $('#stat-exception').textContent = allOrders.filter(o=>o.status==='Exception').length;

  const cutoff = Date.now() - 30*86400000;
  const recent = allOrders.filter(o=>o.createdAt >= cutoff);
  const mix = {};
  recent.forEach(o=>{ const k = marketplaceLabel(o); mix[k] = (mix[k]||0)+1; });
  const mixEl = $('#market-mix');
  mixEl.innerHTML = Object.keys(mix).length ? Object.entries(mix).map(([k,v])=>`
    <div class="stat-card"><div class="num">${v}</div><div class="lbl">${k}</div></div>
  `).join('') : `<div style="color:var(--text-dim);font-size:13px;">No orders in the last 30 days yet.</div>`;

  const active = allInventory.filter(s=>s.status!=='Depleted' && s.status!=='Returned to Client');
  const clients = new Set(active.map(s=>s.client));
  const cartons = active.reduce((sum,s)=>sum + (s.cartonsRemaining||0), 0);
  $('#stat-storage-clients').textContent = clients.size;
  $('#stat-storage-cartons').textContent = cartons;
  $('#stat-storage-batches').textContent = active.length;

  const attention = allOrders.filter(o=>{
    if(o.status === 'Exception') return true;
    if(o.status === 'Order Received' && Date.now()-o.createdAt > 24*3600000) return true;
    if(o.status === 'Packed' && o.packedAt && Date.now()-o.packedAt > 24*3600000) return true;
    return false;
  }).sort((a,b)=>a.createdAt-b.createdAt).slice(0,15);

  const body = $('#attention-body');
  if(!attention.length){
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:24px;">Nothing needs attention right now. 🎉</td></tr>`;
  } else {
    body.innerHTML = attention.map(o=>`
      <tr onclick="showDetail('${o.id}')">
        <td data-label="Order Ref" class="mono">${o.orderRef}</td>
        <td data-label="Marketplace"><span class="pill-market">${marketplaceLabel(o)}</span></td>
        <td data-label="Client">${o.client}</td>
        <td data-label="Product">${o.productName}</td>
        <td data-label="Status"><span class="tag ${STATUS_CLASS[o.status]}">${o.status}</span></td>
        <td data-label="Age" class="mono">${timeAgo(o.createdAt)}</td>
      </tr>
    `).join('');
  }
}

/* ---- Orders table ---- */
function renderOrdersTable(){
  const mFilter = $('#f-marketplace').value;
  const sFilter = $('#f-status').value;
  const dFilter = $('#f-date').value;

  let list = allOrders.filter(o=>{
    if(mFilter && o.marketplace !== mFilter) return false;
    if(sFilter && o.status !== sFilter) return false;
    if(dFilter){
      const d = new Date(o.createdAt);
      const ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      if(ds !== dFilter) return false;
    }
    return true;
  });

  $('#orders-count').textContent = list.length + ' order' + (list.length===1?'':'s');
  $('#orders-empty').style.display = list.length ? 'none' : 'block';

  $('#orders-body').innerHTML = list.map(o=>`
    <tr onclick="showDetail('${o.id}')">
      <td data-label="Order Ref" class="mono">${o.orderRef}</td>
      <td data-label="Marketplace"><span class="pill-market">${marketplaceLabel(o)}</span></td>
      <td data-label="Client">${o.client}${o.priority==='Urgent'?' <span class="priority-urgent">● URGENT</span>':''}</td>
      <td data-label="Delivery Location">${o.deliveryLocation||'—'}</td>
      <td data-label="Product">${o.productName}${o.quantity>1?' ×'+o.quantity:''}</td>
      <td data-label="Label Created" class="mono">${o.labelCreatedDate ? fmtDate(o.labelCreatedDate) : '—'}</td>
      <td data-label="Label Tracking">${o.labelTrackingId ? `<span class="code-chip">${o.labelTrackingId}</span>` : '—'}</td>
      <td data-label="USPS Tracking">${o.uspsTrackingNumber ? `<span class="code-chip">${o.uspsTrackingNumber}</span>` : '—'}</td>
      <td data-label="Status"><span class="tag ${STATUS_CLASS[o.status]}">${o.status}</span></td>
      <td data-label="Received" class="mono">${fmtDateTime(o.createdAt)}</td>
    </tr>
  `).join('');
}
['f-marketplace','f-status','f-date'].forEach(id=>$('#'+id).addEventListener('change', renderOrdersTable));

/* ---- Warehouse Kanban ---- */
function renderKanban(){
  const col1 = allOrders.filter(o=>o.status==='Order Received');
  const col2 = allOrders.filter(o=>o.status==='Label Acknowledged');
  const col3 = allOrders.filter(o=>o.status==='Packed');

  $('#wq-count-1').textContent = col1.length;
  $('#wq-count-2').textContent = col2.length;
  $('#wq-count-3').textContent = col3.length;

  const canAct = canSetStatus(currentUser.team, 'Label Acknowledged') || currentUser.team==='Admin';

  const card = (o, actionLabel, actionFn, allowed) => `
    <div class="k-card" onclick="showDetail('${o.id}')">
      <div class="ref">${o.orderRef} ${o.priority==='Urgent'?'<span class="priority-urgent">● URGENT</span>':''}</div>
      <div class="prod">${o.productName} — ${o.client}</div>
      <div class="meta"><span class="pill-market">${marketplaceLabel(o)}</span><span class="mono" style="font-size:11px;color:var(--text-dim);">${timeAgo(o.createdAt)} ago</span></div>
      ${allowed ? `<button class="quick" onclick="event.stopPropagation();${actionFn}('${o.id}')">${actionLabel}</button>` : ''}
    </div>`;

  const wAllowed = canAct;
  $('#wq-col-1').innerHTML = col1.length ? col1.map(o=>card(o,'✓ Acknowledge Label','quickAck',wAllowed)).join('') : `<div style="color:var(--text-dim);font-size:12.5px;padding:10px;">Queue is clear.</div>`;
  $('#wq-col-2').innerHTML = col2.length ? col2.map(o=>card(o,'✓ Mark Packed','quickPack',wAllowed)).join('') : `<div style="color:var(--text-dim);font-size:12.5px;padding:10px;">Nothing to pack.</div>`;
  $('#wq-col-3').innerHTML = col3.length ? col3.map(o=>card(o,'🚚 Ship (add USPS #)','quickShip',wAllowed)).join('') : `<div style="color:var(--text-dim);font-size:12.5px;padding:10px;">Nothing ready to ship.</div>`;
}

async function quickAck(id){
  try{
    await ORDERS.doc(id).update({
      status:'Label Acknowledged', warehouseAckBy: currentUser.name, warehouseAckAt: Date.now(), updatedAt: Date.now()
    });
    toast('Label acknowledged.');
  }catch(e){ permissionToast(e); }
}
async function quickPack(id){
  try{
    await ORDERS.doc(id).update({
      status:'Packed', packedBy: currentUser.name, packedAt: Date.now(), updatedAt: Date.now()
    });
    toast('Marked as packed.');
  }catch(e){ permissionToast(e); }
}
async function quickShip(id){
  const tn = prompt('Enter the USPS tracking number for this package:');
  if(!tn) return;
  try{
    await ORDERS.doc(id).update({
      status:'Shipped', uspsTrackingNumber: tn.trim(), shippedBy: currentUser.name, shippedAt: Date.now(),
      deliveryStatus:'In Transit', updatedAt: Date.now()
    });
    toast('Shipped — USPS tracking saved.');
  }catch(e){ permissionToast(e); }
}
function permissionToast(e){
  console.error(e);
  if(e.code === 'permission-denied'){
    toast('Your team doesn\u2019t have permission to do that in Prep Deck.', true);
  } else {
    toast('Could not save that change. Check your connection.', true);
  }
}
window.quickAck = quickAck; window.quickPack = quickPack; window.quickShip = quickShip;

/* ---- Comms & Issues ---- */
let commsFilter = 'all';
$$('.chip-toggle[data-comms]').forEach(b=>b.addEventListener('click', ()=>{
  $$('.chip-toggle[data-comms]').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
  commsFilter = b.dataset.comms;
  renderComms();
}));
function renderComms(){
  let items = [];
  allOrders.forEach(o=>{
    (o.notes||[]).forEach(n=> items.push({...n, orderRef:o.orderRef, orderId:o.id, client:o.client}) );
  });
  if(commsFilter==='issues') items = items.filter(n=>n.type==='issue');
  if(commsFilter==='whatsapp') items = items.filter(n=>n.type==='whatsapp');
  items.sort((a,b)=>b.createdAt-a.createdAt);
  items = items.slice(0,200);

  const list = $('#comms-list');
  if(!items.length){ list.innerHTML = `<div class="empty-state"><div class="big">Nothing logged yet</div><div>Notes, WhatsApp updates, and flagged issues added from any order will show up here.</div></div>`; return; }
  list.innerHTML = items.map(n=>`
    <div class="note type-${n.type} mono" style="margin-bottom:10px;font-family:var(--font-body);cursor:pointer;" onclick="showDetail('${n.orderId}')">
      <div class="head"><span><b>${n.orderRef}</b> · ${n.client} · ${n.author} (${n.team})</span><span>${fmtDateTime(n.createdAt)}</span></div>
      <div>${n.type==='issue'?'🚩 ':''}${n.type==='whatsapp'?'💬 ':''}${n.text}</div>
    </div>
  `).join('');
}

/* ===================== New Order modal ===================== */
$('#open-new-order').addEventListener('click', ()=>openModal('modal-new'));
$$('[data-close]').forEach(b=>b.addEventListener('click', ()=>closeModal(b.dataset.close)));

$('#no-marketplace').addEventListener('change', ()=>{
  $('#no-marketplace-other-wrap').style.display = $('#no-marketplace').value==='Other' ? 'block' : 'none';
});

$('#no-submit').addEventListener('click', async ()=>{
  const client = $('#no-client').value.trim();
  const deliveryLocation = $('#no-delivery-location').value.trim();
  const product = $('#no-product').value.trim();
  const labelTracking = $('#no-label-tracking').value.trim();
  const marketplace = $('#no-marketplace').value;
  const marketplaceOther = $('#no-marketplace-other').value.trim();
  const labelCreatedDate = dateInputToMs($('#no-label-created-date').value);

  if(!client || !deliveryLocation || !product || !labelTracking || !labelCreatedDate){
    toast('Fill in client, delivery location, product, label creation date, and label tracking ID.', true);
    return;
  }
  if(marketplace==='Other' && !marketplaceOther){
    toast('Specify the marketplace name.', true);
    return;
  }

  const orderRef = genRef('ORD');
  const notes = [];
  const noteText = $('#no-notes').value.trim();
  if(noteText) notes.push({id:'n'+Date.now(), text:noteText, author:currentUser.name, team:currentUser.team, type:'note', createdAt:Date.now()});

  const order = {
    orderRef,
    marketplace,
    marketplaceOther: marketplace==='Other' ? marketplaceOther : '',
    client,
    deliveryLocation,
    productName: product,
    quantity: Number($('#no-qty').value)||1,
    priority: $('#no-priority').value,
    labelCreatedDate,
    labelTrackingId: labelTracking,
    labelUrl: $('#no-label-url').value.trim(),
    status: 'Order Received',
    intakeBy: currentUser.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deliveryStatus: 'Pending',
    notes
  };
  try{
    await ORDERS.doc(orderRef).set(order);
    toast('Order '+orderRef+' created.');
    closeModal('modal-new');
    ['no-client','no-delivery-location','no-product','no-label-tracking','no-label-url','no-notes','no-marketplace-other'].forEach(id=>$('#'+id).value='');
    $('#no-qty').value = 1;
    $('#no-label-created-date').value = '';
    $('#no-marketplace-other-wrap').style.display = 'none';
  }catch(e){
    permissionToast(e);
  }
});

/* ===================== Order Detail modal ===================== */
let detailOrderId = null;

function showDetail(id){
  const o = allOrders.find(x=>x.id===id);
  if(!o) return;
  detailOrderId = id;

  $('#dt-ref').textContent = o.orderRef;
  $('#dt-marketplace').innerHTML = `<span class="pill-market">${marketplaceLabel(o)}</span>`;
  $('#dt-client').textContent = o.client;
  $('#dt-delivery-location').textContent = o.deliveryLocation || '—';
  $('#dt-priority').innerHTML = o.priority==='Urgent' ? '<span class="priority-urgent">● URGENT</span>' : 'Normal';
  $('#dt-product').textContent = o.productName + (o.quantity ? ' · Qty '+o.quantity : '');
  $('#dt-label-created').textContent = o.labelCreatedDate ? fmtDate(o.labelCreatedDate) : '—';
  $('#dt-label-tracking').textContent = o.labelTrackingId || '—';
  $('#dt-usps').textContent = o.uspsTrackingNumber || '—';

  $('#dt-status-row').innerHTML = `<span class="tag ${STATUS_CLASS[o.status]}" style="font-size:12px;padding:6px 12px;">${o.status}</span>
    ${o.deliveryStatus ? `<span class="tag outline" style="color:var(--text-dim);">USPS: ${o.deliveryStatus}</span>` : ''}`;

  const steps = [
    {label:'Order received', done:!!o.createdAt, ts:o.createdAt, by:o.intakeBy},
    {label:'Label acknowledged by warehouse', done:!!o.warehouseAckAt, ts:o.warehouseAckAt, by:o.warehouseAckBy},
    {label:'Packed', done:!!o.packedAt, ts:o.packedAt, by:o.packedBy},
    {label:'Shipped (USPS)', done:!!o.shippedAt, ts:o.shippedAt, by:o.shippedBy},
    {label:'Delivered', done:!!o.deliveredAt, ts:o.deliveredAt, by:null},
  ];
  $('#dt-timeline').innerHTML = steps.map(s=>`
    <div class="timeline-step ${s.done?'done':''}">
      <div class="tt">${s.label}${s.by?' — '+s.by:''}</div>
      <div class="ts">${s.done ? fmtDateTime(s.ts) : 'Pending'}</div>
    </div>
  `).join('');

  const team = currentUser.team;
  const actions = [];
  if(o.status==='Order Received' && canSetStatus(team,'Label Acknowledged')) actions.push(['✓ Acknowledge Label', ()=>quickAck(o.id).then(refreshDetail)]);
  if(o.status==='Label Acknowledged' && canSetStatus(team,'Packed')) actions.push(['✓ Mark Packed', ()=>quickPack(o.id).then(refreshDetail)]);
  if(o.status==='Packed' && canSetStatus(team,'Shipped')) actions.push(['🚚 Add USPS Tracking & Ship', ()=>quickShip(o.id).then(refreshDetail)]);
  if(o.status==='Shipped'){
    if(canSetStatus(team,'Delivered')) actions.push(['✓ Mark Delivered', ()=>updateStatus(o.id,{status:'Delivered', deliveryStatus:'Delivered', deliveredAt:Date.now()})]);
    if(canSetStatus(team,'Exception')) actions.push(['⚠ Mark Delivery Exception', ()=>updateStatus(o.id,{status:'Exception', deliveryStatus:'Exception'})]);
  }
  if(o.status==='Exception'){
    if(canSetStatus(team,'Shipped')) actions.push(['↺ Resolve → In Transit', ()=>updateStatus(o.id,{status:'Shipped', deliveryStatus:'In Transit'})]);
    if(canSetStatus(team,'Delivered')) actions.push(['✓ Resolve → Delivered', ()=>updateStatus(o.id,{status:'Delivered', deliveryStatus:'Delivered', deliveredAt:Date.now()})]);
  }
  if(o.status!=='Exception' && o.status!=='Delivered' && canSetStatus(team,'Exception')) actions.push(['🚩 Mark as Exception', ()=>updateStatus(o.id,{status:'Exception'})]);

  $('#dt-actions').innerHTML = actions.map((a,i)=>`<button data-i="${i}">${a[0]}</button>`).join('');
  $$('#dt-actions button').forEach((btn,i)=> btn.addEventListener('click', actions[i][1]) );
  $('#dt-actions-note').style.display = (!actions.length && o.status!=='Delivered') ? 'block' : 'none';

  const notes = (o.notes||[]).slice().sort((a,b)=>b.createdAt-a.createdAt);
  $('#dt-notes').innerHTML = notes.length ? notes.map(n=>`
    <div class="note type-${n.type}">
      <div class="head"><span><b>${n.author}</b> · ${n.team}</span><span>${fmtDateTime(n.createdAt)}</span></div>
      <div>${n.text}</div>
    </div>
  `).join('') : `<div style="color:var(--text-dim);font-size:12.5px;">No notes yet.</div>`;

  $('#dt-note-text').value = '';
  openModal('modal-detail');
}
window.showDetail = showDetail;

async function updateStatus(id, fields){
  try{
    await ORDERS.doc(id).update({...fields, updatedAt: Date.now()});
    toast('Order updated.');
    refreshDetail();
  }catch(e){ permissionToast(e); }
}
function refreshDetail(){
  if(detailOrderId) setTimeout(()=>showDetail(detailOrderId), 250);
}

async function addNoteToOrder(type){
  const text = $('#dt-note-text').value.trim();
  if(!text){ toast('Write a note first.', true); return; }
  const o = allOrders.find(x=>x.id===detailOrderId);
  if(!o) return;
  const note = {id:'n'+Date.now(), text, author:currentUser.name, team:currentUser.team, type, createdAt:Date.now()};
  const updates = { notes: [...(o.notes||[]), note], updatedAt: Date.now() };
  if(type==='issue') updates.flaggedIssue = true;
  try{
    await ORDERS.doc(o.id).update(updates);
    $('#dt-note-text').value = '';
    toast(type==='issue' ? 'Issue flagged.' : type==='whatsapp' ? 'WhatsApp message logged.' : 'Note added.');
    refreshDetail();
  }catch(e){ permissionToast(e); }
}
$('#dt-add-note').addEventListener('click', ()=>addNoteToOrder('note'));
$('#dt-add-whatsapp').addEventListener('click', ()=>addNoteToOrder('whatsapp'));
$('#dt-flag-issue').addEventListener('click', ()=>addNoteToOrder('issue'));

/* ===================== STORAGE / INVENTORY ===================== */
function refreshStorageClientFilter(){
  const sel = $('#st-client-filter');
  const current = sel.value;
  const clients = Array.from(new Set(allInventory.map(s=>s.client))).sort();
  sel.innerHTML = '<option value="">All clients</option>' + clients.map(c=>`<option ${c===current?'selected':''}>${c}</option>`).join('');
}

function renderStorage(){
  refreshStorageClientFilter();
  const cFilter = $('#st-client-filter').value;
  const sFilter = $('#st-status-filter').value;

  let list = allInventory.filter(s=>{
    if(cFilter && s.client !== cFilter) return false;
    if(sFilter && s.status !== sFilter) return false;
    return true;
  });

  $('#storage-empty').style.display = list.length ? 'none' : 'block';
  $('#storage-body').innerHTML = list.map(s=>`
    <tr onclick="showStockDetail('${s.id}')">
      <td data-label="Batch Ref" class="mono">${s.invRef}</td>
      <td data-label="Client">${s.client}</td>
      <td data-label="Product">${s.productName}${s.productRef?' <span class="mono" style="color:var(--text-dim);font-size:11px;">('+s.productRef+')</span>':''}</td>
      <td data-label="Cartons Remaining"><b>${s.cartonsRemaining}</b></td>
      <td data-label="Cartons Received">${s.cartonsReceived}</td>
      <td data-label="Date Received" class="mono">${fmtDate(s.dateReceived)}</td>
      <td data-label="Location / Bin">${s.warehouseLocation||'—'}</td>
      <td data-label="Status"><span class="tag ${STORAGE_STATUS_CLASS[s.status]}">${s.status}</span></td>
    </tr>
  `).join('');

  $('#open-new-stock').style.display = canManageStorage(currentUser.team) ? 'inline-flex' : 'none';
}
['st-client-filter','st-status-filter'].forEach(id=>$('#'+id).addEventListener('change', renderStorage));

$('#open-new-stock').addEventListener('click', ()=>openModal('modal-stock'));

$('#st-submit').addEventListener('click', async ()=>{
  const client = $('#st-client').value.trim();
  const product = $('#st-product').value.trim();
  const cartons = Number($('#st-cartons').value);
  const dateReceived = dateInputToMs($('#st-date-received').value);

  if(!client || !product || !cartons || cartons < 1 || !dateReceived){
    toast('Fill in client, product, cartons received, and date received.', true);
    return;
  }

  const invRef = genRef('INV');
  const batch = {
    invRef,
    client,
    productName: product,
    productRef: $('#st-product-ref').value.trim(),
    cartonsReceived: cartons,
    cartonsRemaining: cartons,
    unitsPerCarton: Number($('#st-units-per-carton').value) || null,
    dateReceived,
    warehouseLocation: $('#st-location').value.trim(),
    condition: $('#st-condition').value,
    notes: $('#st-notes').value.trim(),
    status: 'In Storage',
    receivedBy: currentUser.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    adjustments: []
  };
  try{
    await INVENTORY.doc(invRef).set(batch);
    toast('Stock intake logged: '+invRef);
    closeModal('modal-stock');
    ['st-client','st-product','st-product-ref','st-location','st-notes'].forEach(id=>$('#'+id).value='');
    $('#st-cartons').value = 1;
    $('#st-units-per-carton').value = '';
    $('#st-date-received').value = '';
  }catch(e){
    permissionToast(e);
  }
});

let detailStockId = null;
function showStockDetail(id){
  const s = allInventory.find(x=>x.id===id);
  if(!s) return;
  detailStockId = id;

  $('#sd-ref').textContent = s.invRef;
  $('#sd-status-row').innerHTML = `<span class="tag ${STORAGE_STATUS_CLASS[s.status]}" style="font-size:12px;padding:6px 12px;">${s.status}</span>`;
  $('#sd-client').textContent = s.client;
  $('#sd-product').textContent = s.productName;
  $('#sd-product-ref').textContent = s.productRef || '—';
  $('#sd-date-received').textContent = fmtDate(s.dateReceived);
  $('#sd-cartons-received').textContent = s.cartonsReceived;
  $('#sd-cartons-remaining').textContent = s.cartonsRemaining;
  $('#sd-units').textContent = s.unitsPerCarton || '—';
  $('#sd-location').textContent = s.warehouseLocation || '—';
  $('#sd-condition').textContent = s.condition || '—';
  $('#sd-received-by').textContent = s.receivedBy || '—';

  const hist = (s.adjustments||[]).slice().sort((a,b)=>b.at-a.at);
  $('#sd-history').innerHTML = hist.length ? hist.map(a=>`
    <div class="note">
      <div class="head"><span><b>${a.by}</b></span><span>${fmtDateTime(a.at)}</span></div>
      <div>${a.delta>0?'+':''}${a.delta} cartons — ${a.reason||'No reason given'}</div>
    </div>
  `).join('') : `<div style="color:var(--text-dim);font-size:12.5px;">No adjustments yet.</div>`;

  $('#sd-adjust-qty').value = '';
  $('#sd-adjust-reason').value = '';

  const canManage = canManageStorage(currentUser.team);
  $$('#sd-apply-adjust, #sd-mark-depleted, #sd-mark-returned').forEach(()=>{});
  ['sd-apply-adjust','sd-mark-depleted','sd-mark-returned'].forEach(id=>{
    $('#'+id).style.display = canManage ? 'inline-flex' : 'none';
  });

  openModal('modal-stock-detail');
}
window.showStockDetail = showStockDetail;

$('#sd-apply-adjust').addEventListener('click', async ()=>{
  const s = allInventory.find(x=>x.id===detailStockId);
  if(!s) return;
  const delta = Number($('#sd-adjust-qty').value);
  const reason = $('#sd-adjust-reason').value.trim();
  if(!delta){ toast('Enter a positive or negative number of cartons.', true); return; }

  const newRemaining = Math.max(0, s.cartonsRemaining + delta);
  let newStatus = s.status;
  if(newRemaining === 0) newStatus = 'Depleted';
  else if(newRemaining < s.cartonsReceived) newStatus = 'Partially Shipped';
  else newStatus = 'In Storage';

  const adj = {id:'a'+Date.now(), delta, reason, by: currentUser.name, at: Date.now()};
  try{
    await INVENTORY.doc(s.id).update({
      cartonsRemaining: newRemaining, status: newStatus,
      adjustments: [...(s.adjustments||[]), adj], updatedAt: Date.now()
    });
    toast('Stock adjusted.');
    setTimeout(()=>showStockDetail(s.id), 250);
  }catch(e){ permissionToast(e); }
});
$('#sd-mark-depleted').addEventListener('click', async ()=>{
  const s = allInventory.find(x=>x.id===detailStockId);
  if(!s) return;
  try{
    await INVENTORY.doc(s.id).update({status:'Depleted', updatedAt: Date.now()});
    toast('Marked depleted.');
    setTimeout(()=>showStockDetail(s.id), 250);
  }catch(e){ permissionToast(e); }
});
$('#sd-mark-returned').addEventListener('click', async ()=>{
  const s = allInventory.find(x=>x.id===detailStockId);
  if(!s) return;
  try{
    await INVENTORY.doc(s.id).update({status:'Returned to Client', updatedAt: Date.now()});
    toast('Marked returned to client.');
    setTimeout(()=>showStockDetail(s.id), 250);
  }catch(e){ permissionToast(e); }
});

/* ===================== ADMIN / TEAM MEMBERS ===================== */
function renderTeamMembers(){
  if(currentUser.team !== 'Admin') return;
  $('#tm-body').innerHTML = allTeamMembers.map(m=>`
    <tr>
      <td data-label="Email" class="mono">${m.id}</td>
      <td data-label="Name">${m.name}</td>
      <td data-label="Team"><span class="pill-market">${m.team}</span></td>
      <td data-label=""><button class="row-btn-sm" onclick="deleteTeamMember('${m.id}')">Remove</button></td>
    </tr>
  `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:20px;">No team members added yet.</td></tr>`;
}

$('#tm-submit').addEventListener('click', async ()=>{
  const email = $('#tm-email').value.trim().toLowerCase();
  const name = $('#tm-name').value.trim();
  const team = $('#tm-team').value;
  $('#tm-error').textContent = '';
  if(!email || !name){ $('#tm-error').textContent = 'Enter both an email and a name.'; return; }
  if(!/^\S+@\S+\.\S+$/.test(email)){ $('#tm-error').textContent = 'That email address doesn\u2019t look right.'; return; }

  try{
    await TEAM_MEMBERS.doc(email).set({ name, team, updatedAt: Date.now() });
    toast('Saved '+name+' ('+team+'). Remember to also create their login in the Firebase console if you haven\u2019t yet.');
    $('#tm-email').value=''; $('#tm-name').value='';
  }catch(e){
    console.error(e);
    $('#tm-error').textContent = e.code==='permission-denied' ? 'Only Admin accounts can manage team members.' : 'Could not save. Check your connection.';
  }
});

async function deleteTeamMember(email){
  if(email === currentUser.email){
    toast('You can\u2019t remove your own account from here.', true);
    return;
  }
  if(!confirm('Remove '+email+' from Prep Deck? Their Firebase login will still exist until you also delete it in the Firebase console.')) return;
  try{
    await TEAM_MEMBERS.doc(email).delete();
    toast('Removed.');
  }catch(e){
    permissionToast(e);
  }
}
window.deleteTeamMember = deleteTeamMember;

/* ===================== Global search ===================== */
$('#global-search').addEventListener('keydown', async (e)=>{
  if(e.key !== 'Enter') return;
  const term = e.target.value.trim();
  if(!term) return;

  let match = allOrders.find(o =>
    o.orderRef===term || o.deliveryLocation===term || o.labelTrackingId===term || o.uspsTrackingNumber===term
  );

  if(!match){
    try{
      const byId = await ORDERS.doc(term).get();
      if(byId.exists){ match = {id:byId.id, ...byId.data()}; }
      else {
        for(const field of ['labelTrackingId','uspsTrackingNumber']){
          const q = await ORDERS.where(field,'==',term).limit(1).get();
          if(!q.empty){ match = {id:q.docs[0].id, ...q.docs[0].data()}; break; }
        }
      }
    }catch(err){ console.error(err); }
  }

  if(match){ showDetail(match.id); return; }

  const stockMatch = allInventory.find(s => s.invRef===term || s.productRef===term);
  if(stockMatch){ showStockDetail(stockMatch.id); return; }

  toast('No order or stock batch found matching "'+term+'".', true);
});

/* ===================== Reports / CSV export ===================== */
$('#rep-export').addEventListener('click', ()=>{
  const from = $('#rep-from').value ? new Date($('#rep-from').value).getTime() : 0;
  const to = $('#rep-to').value ? new Date($('#rep-to').value).getTime()+86400000 : Infinity;
  const market = $('#rep-market').value;
  const client = $('#rep-client').value.trim().toLowerCase();

  const rows = allOrders.filter(o=>{
    if(o.createdAt < from || o.createdAt > to) return false;
    if(market && o.marketplace !== market) return false;
    if(client && !(o.client||'').toLowerCase().includes(client)) return false;
    return true;
  });

  if(!rows.length){ toast('No orders match those filters.', true); return; }

  const headers = ['Order Ref','Marketplace','Client','Delivery Location','Product','Qty','Priority',
    'Label Created','Label Tracking ID','USPS Tracking','Status','Delivery Status','Intake By','Received At',
    'Ack By','Ack At','Packed By','Packed At','Shipped By','Shipped At','Delivered At'];
  const csvRows = [headers.join(',')];
  rows.forEach(o=>{
    const line = [o.orderRef,marketplaceLabel(o),o.client,o.deliveryLocation,o.productName,o.quantity,o.priority,
      fmtDate(o.labelCreatedDate),o.labelTrackingId,o.uspsTrackingNumber,o.status,o.deliveryStatus,o.intakeBy,
      fmtDateTime(o.createdAt),o.warehouseAckBy,fmtDateTime(o.warehouseAckAt),o.packedBy,fmtDateTime(o.packedAt),
      o.shippedBy,fmtDateTime(o.shippedAt),fmtDateTime(o.deliveredAt)]
      .map(v => `"${(v??'').toString().replace(/"/g,'""')}"`).join(',');
    csvRows.push(line);
  });
  const blob = new Blob([csvRows.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'prep-deck-orders-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  toast('Exported '+rows.length+' orders.');
});

$('#rep-export-storage').addEventListener('click', ()=>{
  if(!allInventory.length){ toast('No stock batches logged yet.', true); return; }
  const headers = ['Batch Ref','Client','Product','Product Ref','Cartons Received','Cartons Remaining',
    'Units per Carton','Date Received','Location / Bin','Condition','Status','Logged By'];
  const csvRows = [headers.join(',')];
  allInventory.forEach(s=>{
    const line = [s.invRef,s.client,s.productName,s.productRef,s.cartonsReceived,s.cartonsRemaining,
      s.unitsPerCarton,fmtDate(s.dateReceived),s.warehouseLocation,s.condition,s.status,s.receivedBy]
      .map(v => `"${(v??'').toString().replace(/"/g,'""')}"`).join(',');
    csvRows.push(line);
  });
  const blob = new Blob([csvRows.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'prep-deck-storage-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  toast('Exported '+allInventory.length+' stock batches.');
});

/* ===================== Boot ===================== */
initGate();
