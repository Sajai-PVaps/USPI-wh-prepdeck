/* ===================== Firebase init ===================== */
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ORDERS = db.collection('orders');

/* ===================== State ===================== */
let allOrders = [];      // live array kept in sync with Firestore
let currentUser = null;  // {name, team}
let ordersUnsub = null;

const STATUSES = ["Order Received","Label Acknowledged","Packed","Shipped","Delivered","Exception"];
const STATUS_CLASS = {
  "Order Received":"tag-received","Label Acknowledged":"tag-ack","Packed":"tag-packed",
  "Shipped":"tag-shipped","Delivered":"tag-delivered","Exception":"tag-exception"
};

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
function genOrderRef(){
  return 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase();
}
function openModal(id){ $('#'+id).classList.add('active'); }
function closeModal(id){ $('#'+id).classList.remove('active'); }

/* ===================== Login gate ===================== */
function initGate(){
  const saved = localStorage.getItem('prepdeck_user');
  if(saved){
    currentUser = JSON.parse(saved);
    enterApp();
    return;
  }
  $('#gate-submit').addEventListener('click', ()=>{
    const name = $('#gate-name').value.trim();
    const team = $('#gate-team').value;
    const code = $('#gate-code').value;
    if(!name){ $('#gate-error').textContent = 'Enter your name.'; return; }
    if(code !== ACCESS_CODE){ $('#gate-error').textContent = 'Incorrect access code.'; return; }
    currentUser = {name, team};
    localStorage.setItem('prepdeck_user', JSON.stringify(currentUser));
    enterApp();
  });
}
function enterApp(){
  $('#gate').style.display = 'none';
  $('#app').style.display = 'flex';
  $('#who-name').textContent = currentUser.name;
  $('#who-team').textContent = currentUser.team;
  startSync();
}
$('#switch-user').addEventListener('click', ()=>{
  localStorage.removeItem('prepdeck_user');
  location.reload();
});

/* ===================== Firestore sync ===================== */
function startSync(){
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
}

/* ===================== Nav ===================== */
$$('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.nav-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active'));
    $('#view-'+btn.dataset.view).classList.add('active');
    $('#view-title').textContent = btn.textContent.replace(/^\S+\s/, '');
  });
});

/* ===================== Render: everything ===================== */
function renderAll(){
  renderDashboard();
  renderOrdersTable();
  renderKanban();
  renderComms();
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

  // marketplace mix, last 30 days
  const cutoff = Date.now() - 30*86400000;
  const recent = allOrders.filter(o=>o.createdAt >= cutoff);
  const mix = {};
  recent.forEach(o=> mix[o.marketplace] = (mix[o.marketplace]||0)+1 );
  const mixEl = $('#market-mix');
  mixEl.innerHTML = Object.keys(mix).length ? Object.entries(mix).map(([k,v])=>`
    <div class="stat-card"><div class="num">${v}</div><div class="lbl">${k}</div></div>
  `).join('') : `<div style="color:var(--text-dim);font-size:13px;">No orders in the last 30 days yet.</div>`;

  // attention list
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
        <td class="mono">${o.orderRef}</td>
        <td><span class="pill-market">${o.marketplace}</span></td>
        <td>${o.client}</td>
        <td>${o.productName}</td>
        <td><span class="tag ${STATUS_CLASS[o.status]}">${o.status}</span></td>
        <td class="mono">${timeAgo(o.createdAt)}</td>
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
      <td class="mono">${o.orderRef}</td>
      <td><span class="pill-market">${o.marketplace}</span></td>
      <td>${o.client}${o.priority==='Urgent'?' <span class="priority-urgent">● URGENT</span>':''}</td>
      <td class="mono">${o.marketplaceOrderId||'—'}</td>
      <td>${o.productName}</td>
      <td>${o.labelTrackingId ? `<span class="code-chip">${o.labelTrackingId}</span>` : '—'}</td>
      <td>${o.uspsTrackingNumber ? `<span class="code-chip">${o.uspsTrackingNumber}</span>` : '—'}</td>
      <td><span class="tag ${STATUS_CLASS[o.status]}">${o.status}</span></td>
      <td class="mono">${fmtDateTime(o.createdAt)}</td>
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

  const card = (o, actionLabel, actionFn) => `
    <div class="k-card" onclick="showDetail('${o.id}')">
      <div class="ref">${o.orderRef} ${o.priority==='Urgent'?'<span class="priority-urgent">● URGENT</span>':''}</div>
      <div class="prod">${o.productName} — ${o.client}</div>
      <div class="meta"><span class="pill-market">${o.marketplace}</span><span class="mono" style="font-size:11px;color:var(--text-dim);">${timeAgo(o.createdAt)} ago</span></div>
      <button class="quick" onclick="event.stopPropagation();${actionFn}('${o.id}')">${actionLabel}</button>
    </div>`;

  $('#wq-col-1').innerHTML = col1.length ? col1.map(o=>card(o,'✓ Acknowledge Label','quickAck')).join('') : `<div style="color:var(--text-dim);font-size:12.5px;padding:10px;">Queue is clear.</div>`;
  $('#wq-col-2').innerHTML = col2.length ? col2.map(o=>card(o,'✓ Mark Packed','quickPack')).join('') : `<div style="color:var(--text-dim);font-size:12.5px;padding:10px;">Nothing to pack.</div>`;
  $('#wq-col-3').innerHTML = col3.length ? col3.map(o=>card(o,'🚚 Ship (add USPS #)','quickShip')).join('') : `<div style="color:var(--text-dim);font-size:12.5px;padding:10px;">Nothing ready to ship.</div>`;
}

async function quickAck(id){
  await ORDERS.doc(id).update({
    status:'Label Acknowledged', warehouseAckBy: currentUser.name, warehouseAckAt: Date.now(), updatedAt: Date.now()
  });
  toast('Label acknowledged.');
}
async function quickPack(id){
  await ORDERS.doc(id).update({
    status:'Packed', packedBy: currentUser.name, packedAt: Date.now(), updatedAt: Date.now()
  });
  toast('Marked as packed.');
}
async function quickShip(id){
  const tn = prompt('Enter the USPS tracking number for this package:');
  if(!tn) return;
  await ORDERS.doc(id).update({
    status:'Shipped', uspsTrackingNumber: tn.trim(), shippedBy: currentUser.name, shippedAt: Date.now(),
    deliveryStatus:'In Transit', updatedAt: Date.now()
  });
  toast('Shipped — USPS tracking saved.');
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

$('#no-submit').addEventListener('click', async ()=>{
  const client = $('#no-client').value.trim();
  const marketId = $('#no-market-order-id').value.trim();
  const product = $('#no-product').value.trim();
  const labelTracking = $('#no-label-tracking').value.trim();
  if(!client || !marketId || !product || !labelTracking){
    toast('Fill in client, marketplace order ID, product, and label tracking ID.', true);
    return;
  }
  const orderRef = genOrderRef();
  const notes = [];
  const noteText = $('#no-notes').value.trim();
  if(noteText) notes.push({id:'n'+Date.now(), text:noteText, author:currentUser.name, team:currentUser.team, type:'note', createdAt:Date.now()});

  const order = {
    orderRef,
    marketplace: $('#no-marketplace').value,
    client,
    marketplaceOrderId: marketId,
    productName: product,
    sku: $('#no-sku').value.trim(),
    quantity: Number($('#no-qty').value)||1,
    priority: $('#no-priority').value,
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
    ['no-client','no-market-order-id','no-product','no-sku','no-label-tracking','no-label-url','no-notes'].forEach(id=>$('#'+id).value='');
    $('#no-qty').value = 1;
  }catch(e){
    console.error(e);
    toast('Could not save the order. Check your connection.', true);
  }
});

/* ===================== Order Detail modal ===================== */
let detailOrderId = null;

function showDetail(id){
  const o = allOrders.find(x=>x.id===id);
  if(!o) return;
  detailOrderId = id;

  $('#dt-ref').textContent = o.orderRef;
  $('#dt-marketplace').innerHTML = `<span class="pill-market">${o.marketplace}</span>`;
  $('#dt-client').textContent = o.client;
  $('#dt-market-id').textContent = o.marketplaceOrderId || '—';
  $('#dt-priority').innerHTML = o.priority==='Urgent' ? '<span class="priority-urgent">● URGENT</span>' : 'Normal';
  $('#dt-product').textContent = o.productName;
  $('#dt-sku').textContent = (o.sku||'—') + ' · Qty ' + (o.quantity||1);
  $('#dt-label-tracking').textContent = o.labelTrackingId || '—';
  $('#dt-usps').textContent = o.uspsTrackingNumber || '—';

  $('#dt-status-row').innerHTML = `<span class="tag ${STATUS_CLASS[o.status]}" style="font-size:12px;padding:6px 12px;">${o.status}</span>
    ${o.deliveryStatus ? `<span class="tag outline" style="color:var(--text-dim);">USPS: ${o.deliveryStatus}</span>` : ''}`;

  // timeline
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

  // actions based on status
  const actions = [];
  if(o.status==='Order Received') actions.push(['✓ Acknowledge Label', ()=>quickAck(o.id).then(refreshDetail)]);
  if(o.status==='Label Acknowledged') actions.push(['✓ Mark Packed', ()=>quickPack(o.id).then(refreshDetail)]);
  if(o.status==='Packed') actions.push(['🚚 Add USPS Tracking & Ship', ()=>quickShip(o.id).then(refreshDetail)]);
  if(o.status==='Shipped'){
    actions.push(['✓ Mark Delivered', ()=>updateStatus(o.id,{status:'Delivered', deliveryStatus:'Delivered', deliveredAt:Date.now()})]);
    actions.push(['⚠ Mark Delivery Exception', ()=>updateStatus(o.id,{status:'Exception', deliveryStatus:'Exception'})]);
  }
  if(o.status==='Exception'){
    actions.push(['↺ Resolve → In Transit', ()=>updateStatus(o.id,{status:'Shipped', deliveryStatus:'In Transit'})]);
    actions.push(['✓ Resolve → Delivered', ()=>updateStatus(o.id,{status:'Delivered', deliveryStatus:'Delivered', deliveredAt:Date.now()})]);
  }
  if(o.status!=='Exception' && o.status!=='Delivered') actions.push(['🚩 Mark as Exception', ()=>updateStatus(o.id,{status:'Exception'})]);

  $('#dt-actions').innerHTML = actions.map((a,i)=>`<button data-i="${i}">${a[0]}</button>`).join('');
  $$('#dt-actions button').forEach((btn,i)=> btn.addEventListener('click', actions[i][1]) );

  // notes
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
  await ORDERS.doc(id).update({...fields, updatedAt: Date.now()});
  toast('Order updated.');
  refreshDetail();
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
  await ORDERS.doc(o.id).update(updates);
  $('#dt-note-text').value = '';
  toast(type==='issue' ? 'Issue flagged.' : type==='whatsapp' ? 'WhatsApp message logged.' : 'Note added.');
  refreshDetail();
}
$('#dt-add-note').addEventListener('click', ()=>addNoteToOrder('note'));
$('#dt-add-whatsapp').addEventListener('click', ()=>addNoteToOrder('whatsapp'));
$('#dt-flag-issue').addEventListener('click', ()=>addNoteToOrder('issue'));

/* ===================== Global search ===================== */
$('#global-search').addEventListener('keydown', async (e)=>{
  if(e.key !== 'Enter') return;
  const term = e.target.value.trim();
  if(!term) return;

  let match = allOrders.find(o =>
    o.orderRef===term || o.marketplaceOrderId===term || o.labelTrackingId===term || o.uspsTrackingNumber===term
  );

  if(!match){
    // fall back to a direct Firestore lookup in case it's outside the loaded window
    try{
      const byId = await ORDERS.doc(term).get();
      if(byId.exists){ match = {id:byId.id, ...byId.data()}; }
      else {
        for(const field of ['marketplaceOrderId','labelTrackingId','uspsTrackingNumber']){
          const q = await ORDERS.where(field,'==',term).limit(1).get();
          if(!q.empty){ match = {id:q.docs[0].id, ...q.docs[0].data()}; break; }
        }
      }
    }catch(err){ console.error(err); }
  }

  if(match){ showDetail(match.id); }
  else toast('No order found matching "'+term+'".', true);
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

  const headers = ['Order Ref','Marketplace','Client','Marketplace Order ID','Product','SKU','Qty','Priority',
    'Label Tracking ID','USPS Tracking','Status','Delivery Status','Intake By','Received At','Ack By','Ack At',
    'Packed By','Packed At','Shipped By','Shipped At','Delivered At'];
  const csvRows = [headers.join(',')];
  rows.forEach(o=>{
    const line = [o.orderRef,o.marketplace,o.client,o.marketplaceOrderId,o.productName,o.sku,o.quantity,o.priority,
      o.labelTrackingId,o.uspsTrackingNumber,o.status,o.deliveryStatus,o.intakeBy,fmtDateTime(o.createdAt),
      o.warehouseAckBy,fmtDateTime(o.warehouseAckAt),o.packedBy,fmtDateTime(o.packedAt),o.shippedBy,
      fmtDateTime(o.shippedAt),fmtDateTime(o.deliveredAt)]
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

/* ===================== Boot ===================== */
initGate();
