/* ════════════════════════════════════════════
   FIREBASE CONFIG
════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updatePassword, deleteUser
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBanU4t5ihAW199V-_BegSSqM-jkw2iNd4",
  authDomain: "painel-financeiro-92b85.firebaseapp.com",
  projectId: "painel-financeiro-92b85",
  storageBucket: "painel-financeiro-92b85.firebasestorage.app",
  messagingSenderId: "417200745753",
  appId: "1:417200745753:web:8ccd9b004bfeeb61cd6988"
};

const fireApp = initializeApp(firebaseConfig);
const firestoreDB = getFirestore(fireApp);
const fireAuth    = getAuth(fireApp);

/* App secundário: cria contas Auth sem derrubar a sessão do admin */
const fireAppSec  = initializeApp(firebaseConfig, 'secondary');
const fireAuthSec = getAuth(fireAppSec);

/* ════════════════════════════════════════════
   DB — Firestore com cache em memória
   Estrutura: /dados/{uid}/colecoes/{nome} -> { valor: "[JSON]" }
════════════════════════════════════════════ */
let _uid         = null;
let _cache       = {};
let _unsubscribes = [];

const COLECOES = ['salarios','extras','saidas','entradas','investimentos',
                  'criterios','tiposConta','tiposInvest','usuarios'];

const DEFAULTS = {
  salarios:[], extras:[], saidas:[], entradas:[], investimentos:[],
  criterios:['Hora Extra','Bônus','PLR','Comissão'],
  tiposConta:['Cartão de Crédito','Boleto','Financiamento','PIX','Salário','Aluguel'],
  tiposInvest:['Renda Fixa','Ações','FII','Tesouro Direto','Criptomoedas','CDB'],
  usuarios:[]
};

function fsdoc(col){ return doc(firestoreDB,'dados',_uid,'colecoes',col); }

const DB = {
  get(k){
    if(_cache[k]!==undefined)return _cache[k];
    return DEFAULTS[k]!==undefined?JSON.parse(JSON.stringify(DEFAULTS[k])):null;
  },
  async set(k,v){
    _cache[k]=v;
    if(!_uid)return;
    try{ await setDoc(fsdoc(k),{valor:JSON.stringify(v)}); }
    catch(e){ console.error('Firestore write error:',e); }
  },
  async iniciar(uid){
    _uid=uid;
    _unsubscribes.forEach(u=>u());
    _unsubscribes=[];
    for(const col of COLECOES){
      const snap=await getDoc(fsdoc(col));
      if(snap.exists()){
        try{ _cache[col]=JSON.parse(snap.data().valor); }
        catch{ _cache[col]=JSON.parse(JSON.stringify(DEFAULTS[col])); }
      } else {
        _cache[col]=JSON.parse(JSON.stringify(DEFAULTS[col]));
        await setDoc(fsdoc(col),{valor:JSON.stringify(_cache[col])});
      }
      // Listener tempo real — sincroniza entre máquinas
      const unsub=onSnapshot(fsdoc(col),(snap)=>{
        if(!snap.exists())return;
        try{
          const novo=JSON.parse(snap.data().valor);
          if(JSON.stringify(_cache[col])!==JSON.stringify(novo)){
            _cache[col]=novo;
            if(typeof renderizarTudo==='function'){
              renderizarTudo();
              reconstruirFiltros();
              renderCriterios();
              renderTiposConta();
              renderTiposInvest();
              renderUsers();
            }
          }
        }catch{}
      });
      _unsubscribes.push(unsub);
    }
  },
  limpar(){
    _unsubscribes.forEach(u=>u());
    _unsubscribes=[];
    _cache={};
    _uid=null;
  }
};

/* ════════════════════════════════════════════
   FMT
════════════════════════════════════════════ */
const Fmt={
  brl(v){return(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});},
  parse(s){return parseFloat((s||'').replace(/\./g,'').replace(',','.'))||0;},
  ref(r){if(!r)return'—';const[y,m]=r.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]+'/'+y;},
  toInput(v){if(!v&&v!==0)return'';return(+v).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.');},
  uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);},
  addMonths(ym,n){const[y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+n,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;},
  nowYM(){const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}
};

/* ════════════════════════════════════════════
   TOAST
════════════════════════════════════════════ */
const Toast={show(msg,type='info',dur=3200){const c=document.getElementById('toastContainer');const t=document.createElement('div');t.className=`toast ${type}`;t.innerHTML=`<div class="toast-dot"></div><span>${msg}</span>`;c.appendChild(t);setTimeout(()=>{t.style.animation='toastOut .3s ease forwards';setTimeout(()=>t.remove(),300);},dur);}};

/* ════════════════════════════════════════════
   TEMA / SIDEBAR  (preferências locais)
════════════════════════════════════════════ */
function toggleTheme(){const n=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);localStorage.setItem('fp_theme',n);}
function initTheme(){document.documentElement.setAttribute('data-theme',localStorage.getItem('fp_theme')||'dark');}
function togglePwd(id,btn){const el=document.getElementById(id);const show=el.type==='password';el.type=show?'text':'password';btn.innerHTML=show?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;}
let sidebarCollapsed=false;
function toggleSidebar(){sidebarCollapsed=!sidebarCollapsed;document.getElementById('sidebar').classList.toggle('collapsed',sidebarCollapsed);document.getElementById('collapseIcon').textContent=sidebarCollapsed?'›':'‹';localStorage.setItem('fp_sidebarCollapsed',sidebarCollapsed);}
function initSidebar(){sidebarCollapsed=localStorage.getItem('fp_sidebarCollapsed')==='true';if(sidebarCollapsed){document.getElementById('sidebar').classList.add('collapsed');document.getElementById('collapseIcon').textContent='›';}}

/* ════════════════════════════════════════════
   AUTH — Firebase Authentication
   Login: nome de usuário → mapeado para email@finpanel.local
════════════════════════════════════════════ */
let currentUser=null;

/* Converte nome → email interno Firebase */
function toEmail(nome){return nome.trim().toLowerCase().replace(/\s+/g,'_')+'@finpanel.local';}

function setLoginLoading(on){
  const btn=document.querySelector('#loginScreen .btn-primary');
  if(!btn)return;
  btn.disabled=on;
  btn.textContent=on?'Entrando…':'Entrar';
}

async function fazerLogin(){
  const nome=document.getElementById('loginUser').value.trim();
  const senha=document.getElementById('loginPass').value;
  const err=document.getElementById('loginError');
  err.classList.remove('visible');
  if(!nome||!senha){
    err.textContent='Preencha usuário e senha.';
    err.classList.add('visible');
    return;
  }
  setLoginLoading(true);
  try{
    await signInWithEmailAndPassword(fireAuth,toEmail(nome),senha);
    // onAuthStateChanged assume o controle
  }catch(e){
    let msg='Usuário ou senha incorretos.';
    if(e.code==='auth/network-request-failed') msg='Sem conexão com a internet.';
    if(e.code==='auth/too-many-requests')      msg='Muitas tentativas. Aguarde alguns minutos.';
    err.textContent=msg;
    err.classList.add('visible');
    document.getElementById('loginPass').value='';
  }finally{
    setLoginLoading(false);
  }
}

/* ── SETUP PRIMEIRO ACESSO ──
   Chamado pelo onAuthStateChanged quando não há usuários cadastrados.
   Mostra um formulário inline na tela de login para criar o admin inicial. ── */
function mostrarSetupAdmin(){
  const box=document.querySelector('.login-box');
  if(!box||document.getElementById('setupAdminForm'))return;

  // Esconde o formulário de login normal
  document.querySelector('.login-form').style.display='none';
  document.querySelector('.login-footer').style.display='none';
  document.querySelector('.login-title').textContent='Primeiro acesso';
  document.querySelector('.login-sub').textContent='Crie o usuário Administrador para começar.';

  const form=document.createElement('div');
  form.id='setupAdminForm';
  form.innerHTML=`
    <div id="setupError" style="display:none;color:var(--expense);font-size:.82rem;padding:8px 12px;background:rgba(255,77,106,.08);border-radius:var(--radius-sm);border:1px solid rgba(255,77,106,.2);margin-bottom:12px;"></div>
    <div class="form-group"><label>Nome do administrador</label><input type="text" id="setupNome" placeholder="Ex: Administrador" value="Administrador"/></div>
    <div class="form-group" style="margin-top:10px;"><label>Senha</label><div class="password-wrap"><input type="password" id="setupSenha" placeholder="Mínimo 6 caracteres"/><button class="password-toggle" type="button" onclick="togglePwd('setupSenha',this)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
    <button class="btn btn-primary btn-full" style="margin-top:16px;" onclick="criarAdminInicial()">Criar e entrar</button>
  `;
  box.appendChild(form);
  setTimeout(()=>document.getElementById('setupSenha').focus(),100);
}

async function criarAdminInicial(){
  const nome=document.getElementById('setupNome').value.trim()||'Administrador';
  const senha=document.getElementById('setupSenha').value;
  const errEl=document.getElementById('setupError');
  errEl.style.display='none';
  if(senha.length<6){errEl.textContent='A senha deve ter ao menos 6 caracteres.';errEl.style.display='block';return;}
  const btn=document.querySelector('#setupAdminForm .btn-primary');
  btn.disabled=true;btn.textContent='Criando…';
  try{
    const email=toEmail(nome);
    await createUserWithEmailAndPassword(fireAuth,email,senha);
    // onAuthStateChanged vai cuidar do resto (salva metadados e entra no app)
  }catch(e){
    btn.disabled=false;btn.textContent='Criar e entrar';
    errEl.textContent=e.code==='auth/email-already-in-use'?'Usuário já existe. Tente fazer login normalmente.':('Erro: '+e.message);
    errEl.style.display='block';
  }
}

async function fazerLogout(){
  await signOut(fireAuth);
  DB.limpar();
  currentUser=null;
  sessionStorage.removeItem('fp_tab');
  closeUserDropdown();
  const ls=document.getElementById('loginScreen'),appEl=document.getElementById('appWrapper');
  ls.style.display='flex';
  appEl.classList.remove('visible');
  setTimeout(()=>ls.classList.remove('hidden'),10);
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
  document.getElementById('loginError').classList.remove('visible');
  Toast.show('Sessão encerrada','info');
}

async function aoAutenticar(firebaseUser){
  await DB.iniciar(firebaseUser.uid);
  const email=firebaseUser.email;
  let usuarios=DB.get('usuarios')||[];
  let meta=usuarios.find(u=>u.email===email);
  if(!meta){
    // Primeiro login deste usuário Firebase: cria os metadados automaticamente
    const nome=email.replace('@finpanel.local','').replace(/_/g,' ');
    const nomeFmt=nome.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
    const newId=usuarios.length?Math.max(...usuarios.map(u=>u.id))+1:1;
    const perfil=usuarios.length===0?'admin':'usuario'; // primeiro usuário sempre vira admin
    meta={id:newId,nome:nomeFmt,email,perfil};
    usuarios.push(meta);
    await DB.set('usuarios',usuarios);
  }
  currentUser=meta;
  // Marca setup como concluído (permite que a tela de login normal apareça para outros usuários)
  try{await setDoc(doc(firestoreDB,'setup','status'),{inicializado:true,em:new Date().toISOString()});}catch{}
  entrarNoApp();
  Toast.show(`Bem-vindo, ${currentUser.nome}!`,'success');
}

function entrarNoApp(){
  const ls=document.getElementById('loginScreen'),appEl=document.getElementById('appWrapper');
  ls.classList.add('hidden');
  setTimeout(()=>{ls.style.display='none';appEl.classList.add('visible');},350);
  atualizarAvatar();
  const ym=Fmt.nowYM();
  filtroAno=ym.split('-')[0];
  filtroRef=ym;
  reconstruirFiltros();
  renderizarTudo();
  renderCriterios();renderTiposConta();renderTiposInvest();renderUsers();
  const ultimaAba=sessionStorage.getItem('fp_tab')||'salario';
  navigateTo(ultimaAba,true);
}

/* ════════════════════════════════════════════
   TROCAR SENHA
════════════════════════════════════════════ */
function abrirTrocarSenha(){closeUserDropdown();['novaSenha','confirmarSenha'].forEach(id=>document.getElementById(id).value='');const e=document.getElementById('senhaErro');e.style.display='none';e.textContent='';document.getElementById('modalTrocarSenha').classList.remove('hidden');}
async function confirmarTrocarSenha(){
  const nova=document.getElementById('novaSenha').value,conf=document.getElementById('confirmarSenha').value;
  const errEl=document.getElementById('senhaErro');
  if(nova.length<4){errEl.textContent='A senha deve ter ao menos 4 caracteres.';errEl.style.display='block';return;}
  if(nova!==conf){errEl.textContent='As senhas não coincidem.';errEl.style.display='block';return;}
  errEl.style.display='none';
  try{
    await updatePassword(fireAuth.currentUser,nova);
    closeModal('modalTrocarSenha');
    Toast.show('Senha alterada com sucesso','success');
  }catch(e){
    errEl.textContent='Erro: faça logout e login novamente antes de trocar a senha.';
    errEl.style.display='block';
  }
}

/* ════════════════════════════════════════════
   DROPDOWN
════════════════════════════════════════════ */
function toggleUserDropdown(){const dd=document.getElementById('userDropdown'),av=document.getElementById('userAvatar'),open=dd.classList.contains('open');dd.classList.toggle('open',!open);av.classList.toggle('open',!open);}
function closeUserDropdown(){document.getElementById('userDropdown').classList.remove('open');document.getElementById('userAvatar').classList.remove('open');}
document.addEventListener('click',e=>{const w=document.querySelector('.avatar-wrap');if(w&&!w.contains(e.target))closeUserDropdown();});

/* ════════════════════════════════════════════
   NAVEGAÇÃO
════════════════════════════════════════════ */
const tabNames={salario:'Salário',saidas:'Saídas',entradas:'Entradas',controle:'Controle',investimento:'Investimento',configuracao:'Configuração'};
function navigateTo(tab,skipSave=false){
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
  document.querySelectorAll('.tab-panel').forEach(el=>el.classList.toggle('active',el.id==='tab-'+tab));
  document.getElementById('topbarTitle').textContent=tabNames[tab]||tab;
  document.querySelector('.main').scrollTo({top:0,behavior:'smooth'});
  if(!skipSave)sessionStorage.setItem('fp_tab',tab);
  syncFiltroDisplays();
  if(tab==='controle')renderControle();
  if(tab==='investimento'){renderInvestTable();atualizarStatsInvest();}
  if(tab==='saidas'){renderSaidasTable();atualizarStatsSaida();}
  if(tab==='entradas'){renderEntradasTable();atualizarStatsEntrada();}
}
document.querySelectorAll('.nav-item').forEach(item=>item.addEventListener('click',()=>navigateTo(item.dataset.tab)));
document.querySelectorAll('.sub-tab').forEach(tab=>{tab.addEventListener('click',()=>{const k=tab.dataset.subtab;document.querySelectorAll('.sub-tab').forEach(t=>t.classList.toggle('active',t.dataset.subtab===k));document.querySelectorAll('.sub-panel').forEach(p=>p.classList.toggle('active',p.id==='subtab-'+k));});});

/* ════════════════════════════════════════════
   MÁSCARA MOEDA
════════════════════════════════════════════ */
function maskCurrency(input){let v=input.value.replace(/\D/g,'');if(!v){input.value='';return;}v=(parseInt(v)/100).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.');input.value=v;}

/* ════════════════════════════════════════════
   FILTRO GLOBAL
════════════════════════════════════════════ */
let filtroAno='',filtroRef='';
const abaFiltroAnos=['filtroAno','saidaFiltroAnoDisp','entradaFiltroAnoDisp','ctrlFiltroAnoDisp','investFiltroAnoDisp'];
const abaFiltroRefs=['filtroRef','saidaFiltroRefDisp','entradaFiltroRefDisp','ctrlFiltroRefDisp','investFiltroRefDisp'];
const abaFiltroLabels=['filtroLabel','saidaFiltroLabel','entradaFiltroLabel','ctrlFiltroLabel','investFiltroLabel'];
function getAllRefs(){const set=new Set();(DB.get('salarios')||[]).forEach(s=>set.add(s.ref));(DB.get('extras')||[]).forEach(e=>set.add(e.ref));[...(DB.get('entradas')||[]),...(DB.get('saidas')||[]),...(DB.get('investimentos')||[])].forEach(e=>{if(!e)return;if(e.forma==='parcelado'&&e.primeiraParcela){for(let i=0;i<(e.nParcelas||1);i++)set.add(Fmt.addMonths(e.primeiraParcela,i));}else if(e.ref){set.add(e.ref);}});return[...set].sort().reverse();}
function reconstruirFiltros(){const allRefs=getAllRefs();const anos=[...new Set(allRefs.map(r=>r.split('-')[0]))].sort().reverse();const refs=filtroAno?allRefs.filter(r=>r.startsWith(filtroAno+'-')):allRefs;abaFiltroAnos.forEach(id=>{const sel=document.getElementById(id);if(!sel)return;sel.innerHTML='<option value="">Todos</option>';anos.forEach(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;sel.appendChild(o);});sel.value=filtroAno;});abaFiltroRefs.forEach(id=>{const sel=document.getElementById(id);if(!sel)return;sel.innerHTML='<option value="">Todos os períodos</option>';refs.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=Fmt.ref(r);sel.appendChild(o);});sel.value=filtroRef;});atualizarLabels();}
function atualizarLabels(){abaFiltroLabels.forEach(id=>{const lbl=document.getElementById(id);if(!lbl)return;if(filtroRef){lbl.textContent='Exibindo: '+Fmt.ref(filtroRef);lbl.style.display='inline';}else if(filtroAno){lbl.textContent='Ano: '+filtroAno;lbl.style.display='inline';}else{lbl.style.display='none';}});}
function syncFiltroDisplays(){abaFiltroAnos.forEach(id=>{const s=document.getElementById(id);if(s)s.value=filtroAno;});abaFiltroRefs.forEach(id=>{const s=document.getElementById(id);if(s)s.value=filtroRef;});atualizarLabels();}
function onFiltroAnoChange(){const src=abaFiltroAnos.find(id=>{const s=document.getElementById(id);return s&&document.activeElement===s;});filtroAno=document.getElementById(src||'filtroAno').value;filtroRef='';reconstruirFiltros();renderizarTudo();}
function onFiltroRefChange(){const src=abaFiltroRefs.find(id=>{const s=document.getElementById(id);return s&&document.activeElement===s;});filtroRef=document.getElementById(src||'filtroRef').value;syncFiltroDisplays();renderizarTudo();}
function limparFiltro(){filtroAno='';filtroRef='';reconstruirFiltros();renderizarTudo();}
function renderizarTudo(){renderSalarioTable();renderExtrasTable();atualizarStats();renderSaidasTable();atualizarStatsSaida();renderEntradasTable();atualizarStatsEntrada();renderInvestTable();atualizarStatsInvest();renderControle();}

/* ════════════════════════════════════════════
   SORT helpers
════════════════════════════════════════════ */
const sortSt={salario:{col:'ref',dir:1},extras:{col:'ref',dir:1}};
function sortTable(tbl,col){if(sortSt[tbl].col===col)sortSt[tbl].dir*=-1;else{sortSt[tbl].col=col;sortSt[tbl].dir=1;}const tableEl=document.getElementById(tbl==='salario'?'salarioTable':'extrasTable');tableEl.querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(sortSt[tbl].dir===1?'↑':'↓'):'↕';});tbl==='salario'?renderSalarioTable():renderExtrasTable();}

/* ════════════════════════════════════════════
   ABA SALÁRIO
════════════════════════════════════════════ */
let editingSalRef=null;
function getSalRows(ano,ref){let raw=DB.get('salarios')||[];if(ref)raw=raw.filter(e=>e.ref===ref);else if(ano)raw=raw.filter(e=>e.ref.startsWith(ano+'-'));const map={};raw.forEach(e=>{if(!map[e.ref])map[e.ref]={ref:e.ref,adiantamento:0,pagamento:0,bruto:0};if(e.tipo==='adiantamento')map[e.ref].adiantamento+=e.valor;if(e.tipo==='pagamento')map[e.ref].pagamento+=e.valor;if(e.tipo==='bruto')map[e.ref].bruto+=e.valor;});return Object.values(map).map(r=>({...r,liquido:r.adiantamento+r.pagamento}));}
function renderSalarioTable(){const tbody=document.getElementById('salarioBody');const srch=document.getElementById('filterSalario').value.toLowerCase();let rows=getSalRows(filtroAno,filtroRef);if(srch)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch));const{col,dir}=sortSt.salario;rows.sort((a,b)=>{const av=col==='ref'?a.ref:(a[col]||0),bv=col==='ref'?b.ref:(b[col]||0);return av<bv?-dir:av>bv?dir:0;});document.getElementById('salarioBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');atualizarStats();if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6">Nenhum registro encontrado.</td></tr>`;return;}tbody.innerHTML=rows.map(r=>r.ref===editingSalRef?buildSalEditRow(r):buildSalReadRow(r)).join('');}
function buildSalReadRow(r){return`<tr><td class="td-ref">${Fmt.ref(r.ref)}</td><td class="td-value-income">${Fmt.brl(r.adiantamento)}</td><td class="td-value-income">${Fmt.brl(r.pagamento)}</td><td class="td-value-income" style="font-weight:600;">${Fmt.brl(r.liquido)}</td><td class="td-value-neutral">${r.bruto?Fmt.brl(r.bruto):'<span style="color:var(--text-muted)">—</span>'}</td><td><div class="actions-cell"><button class="btn-icon edit" onclick="iniciarEdicaoSal('${r.ref}')" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirSalario('${r.ref}')" title="Excluir">✕</button></div></td></tr>`;}
function buildSalEditRow(r){return`<tr class="row-editing"><td><input type="month" class="inline-month" id="se_ref" value="${r.ref}" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="se_adi" value="${Fmt.toInput(r.adiantamento)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></div></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="se_pag" value="${Fmt.toInput(r.pagamento)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></div></td><td><span class="inline-auto">auto</span></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="se_bru" value="${Fmt.toInput(r.bruto)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></div></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarSal('${r.ref}')" title="Confirmar">✔</button><button class="btn-icon cancel-edit" onclick="cancelarSal()" title="Cancelar">✕</button></div></td></tr>`;}
function iniciarEdicaoSal(ref){editingSalRef=ref;renderSalarioTable();setTimeout(()=>{const el=document.getElementById('se_ref');if(el)el.focus();},40);}
function cancelarSal(){editingSalRef=null;renderSalarioTable();}
async function salvarSal(refOrig){const novaRef=document.getElementById('se_ref').value;if(!novaRef){Toast.show('Informe a referência','error');return;}const adi=Fmt.parse(document.getElementById('se_adi').value);const pag=Fmt.parse(document.getElementById('se_pag').value);const bru=Fmt.parse(document.getElementById('se_bru').value);let sal=DB.get('salarios')||[];sal=sal.filter(e=>e.ref!==refOrig);if(adi>0)sal.push({id:Fmt.uid(),ref:novaRef,tipo:'adiantamento',valor:adi});if(pag>0)sal.push({id:Fmt.uid(),ref:novaRef,tipo:'pagamento',valor:pag});if(bru>0)sal.push({id:Fmt.uid(),ref:novaRef,tipo:'bruto',valor:bru});await DB.set('salarios',sal);editingSalRef=null;reconstruirFiltros();renderSalarioTable();atualizarStats();Toast.show('Salário atualizado','success');}
let editingExtraId=null;
function renderExtrasTable(){const tbody=document.getElementById('extrasBody');const srch=document.getElementById('filterExtras').value.toLowerCase();let rows=DB.get('extras')||[];if(filtroRef)rows=rows.filter(r=>r.ref===filtroRef);else if(filtroAno)rows=rows.filter(r=>r.ref.startsWith(filtroAno+'-'));if(srch)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch)||r.tipo.toLowerCase().includes(srch));const{col,dir}=sortSt.extras;rows.sort((a,b)=>{const av=col==='ref'?a.ref:col==='liquido'?a.liquido:col==='bruto'?a.bruto:a.tipo,bv=col==='ref'?b.ref:col==='liquido'?b.liquido:col==='bruto'?b.bruto:b.tipo;return av<bv?-dir:av>bv?dir:0;});document.getElementById('extrasBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');atualizarStats();if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="5">Nenhum extra registrado.</td></tr>`;return;}const criterios=DB.get('criterios')||[];tbody.innerHTML=rows.map(r=>r.id===editingExtraId?buildExtEditRow(r,criterios):buildExtReadRow(r)).join('');}
function buildExtReadRow(r){return`<tr><td class="td-ref">${Fmt.ref(r.ref)}</td><td><span class="td-tag">${r.tipo}</span></td><td class="td-value-income">${Fmt.brl(r.liquido||0)}</td><td class="td-value-neutral">${(r.bruto||0)?Fmt.brl(r.bruto):'<span style="color:var(--text-muted)">—</span>'}</td><td><div class="actions-cell"><button class="btn-icon edit" onclick="iniciarEdicaoExt('${r.id}')" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirExtra('${r.id}')" title="Excluir">✕</button></div></td></tr>`;}
function buildExtEditRow(r,criterios){const opts=criterios.map(c=>`<option value="${c}"${c===r.tipo?' selected':''}>${c}</option>`).join('');return`<tr class="row-editing"><td><input type="month" class="inline-month" id="ee_ref" value="${r.ref}" onkeydown="handleInlineKey(event,'ext','${r.id}')"/></td><td><select class="inline-select" id="ee_tipo">${opts||`<option value="${r.tipo}">${r.tipo}</option>`}</select></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="ee_liq" value="${Fmt.toInput(r.liquido||0)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'ext','${r.id}')"/></div></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="ee_bru" value="${Fmt.toInput(r.bruto||0)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'ext','${r.id}')"/></div></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarExt('${r.id}')" title="Confirmar">✔</button><button class="btn-icon cancel-edit" onclick="cancelarExt()" title="Cancelar">✕</button></div></td></tr>`;}
function iniciarEdicaoExt(id){editingExtraId=id;renderExtrasTable();setTimeout(()=>{const el=document.getElementById('ee_ref');if(el)el.focus();},40);}
function cancelarExt(){editingExtraId=null;renderExtrasTable();}
async function salvarExt(id){const novaRef=document.getElementById('ee_ref').value;const tipo=document.getElementById('ee_tipo').value;const liquido=Fmt.parse(document.getElementById('ee_liq').value);const bruto=Fmt.parse(document.getElementById('ee_bru').value);if(!novaRef){Toast.show('Informe a referência','error');return;}if(!tipo){Toast.show('Selecione o tipo','error');return;}if(!liquido&&!bruto){Toast.show('Informe ao menos o Líquido ou Bruto','error');return;}const ext=DB.get('extras')||[];const idx=ext.findIndex(e=>e.id===id);if(idx>-1)ext[idx]={...ext[idx],ref:novaRef,tipo,liquido,bruto};await DB.set('extras',ext);editingExtraId=null;reconstruirFiltros();renderExtrasTable();atualizarStats();Toast.show('Extra atualizado','success');}
function handleInlineKey(e,tbl,key){if(e.key==='Enter'){e.preventDefault();tbl==='sal'?salvarSal(key):salvarExt(key);}if(e.key==='Escape'){tbl==='sal'?cancelarSal():cancelarExt();}}
let pendingDeleteSalRef=null;
function pedirExcluirSalario(ref){pendingDeleteSalRef=ref;document.getElementById('deleteSalarioMsg').innerHTML=`Excluir todos os registros de <strong style="color:var(--text-primary)">${Fmt.ref(ref)}</strong>?`;document.getElementById('modalExcluirSalario').classList.remove('hidden');}
async function confirmarExclusaoSalario(){if(!pendingDeleteSalRef)return;await DB.set('salarios',(DB.get('salarios')||[]).filter(e=>e.ref!==pendingDeleteSalRef));closeModal('modalExcluirSalario');pendingDeleteSalRef=null;reconstruirFiltros();renderSalarioTable();atualizarStats();Toast.show('Registros excluídos','error');}
let pendingDeleteExtraId=null;
function pedirExcluirExtra(id){const r=(DB.get('extras')||[]).find(x=>x.id===id);if(!r)return;pendingDeleteExtraId=id;document.getElementById('deleteExtraDesc').textContent=`${r.tipo} (${Fmt.ref(r.ref)})`;document.getElementById('modalExcluirExtra').classList.remove('hidden');}
async function confirmarExclusaoExtra(){await DB.set('extras',(DB.get('extras')||[]).filter(r=>r.id!==pendingDeleteExtraId));closeModal('modalExcluirExtra');pendingDeleteExtraId=null;reconstruirFiltros();renderExtrasTable();atualizarStats();Toast.show('Extra removido','error');}
function onTabelaChange(){const t=document.getElementById('insertTabela').value;document.getElementById('salarioFields').style.display=t==='salario'?'block':'none';document.getElementById('extrasFields').style.display=t==='extras'?'block':'none';}
async function confirmarInsercaoSalario(){const ref=document.getElementById('insertRef').value;if(!ref){Toast.show('Selecione a referência','error');return;}const tab=document.getElementById('insertTabela').value;if(tab==='salario'){const tipo=document.getElementById('salarioTipo').value;const valor=Fmt.parse(document.getElementById('salarioValor').value);if(!valor){Toast.show('Informe um valor válido','error');return;}const sal=DB.get('salarios')||[];sal.push({id:Fmt.uid(),ref,tipo,valor});await DB.set('salarios',sal);document.getElementById('salarioValor').value='';Toast.show(`${tipo.charAt(0).toUpperCase()+tipo.slice(1)} de ${Fmt.brl(valor)} registrado`,'success');}else{const tipo=document.getElementById('extrasTipo').value;if(!tipo){Toast.show('Nenhum critério disponível','error');return;}const liquido=Fmt.parse(document.getElementById('extrasLiquido').value);const bruto=Fmt.parse(document.getElementById('extrasBruto').value);if(!liquido&&!bruto){Toast.show('Informe ao menos o Líquido ou Bruto','error');return;}const ext=DB.get('extras')||[];ext.push({id:Fmt.uid(),ref,tipo,liquido,bruto});await DB.set('extras',ext);document.getElementById('extrasLiquido').value='';document.getElementById('extrasBruto').value='';Toast.show(`Extra "${tipo}" registrado`,'success');}reconstruirFiltros();renderSalarioTable();renderExtrasTable();atualizarStats();renderControle();}
function atualizarStats(){const srchSal=(document.getElementById('filterSalario')?document.getElementById('filterSalario').value:'').toLowerCase();const srchExt=(document.getElementById('filterExtras')?document.getElementById('filterExtras').value:'').toLowerCase();let rows=getSalRows(filtroAno,filtroRef);if(srchSal)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srchSal));let ext=DB.get('extras')||[];if(filtroRef)ext=ext.filter(e=>e.ref===filtroRef);else if(filtroAno)ext=ext.filter(e=>e.ref.startsWith(filtroAno+'-'));if(srchExt)ext=ext.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srchExt)||r.tipo.toLowerCase().includes(srchExt));document.getElementById('statLiquido').textContent=Fmt.brl(rows.reduce((s,r)=>s+r.liquido,0));document.getElementById('statBruto').textContent=Fmt.brl(rows.reduce((s,r)=>s+r.bruto,0));document.getElementById('statExtras').textContent=Fmt.brl(ext.reduce((s,r)=>s+(r.liquido||0),0));}

/* ════════════════════════════════════════════
   ABA SAÍDAS
════════════════════════════════════════════ */
const saidaSortSt={col:'ref',dir:1};
let editingSaidaId=null;
function expandirSaidas(saidas,ano,ref){const rows=[];saidas.forEach(s=>{if(s.forma==='avista'){const r=s.ref;const ok=ref?r===ref:(ano?r.startsWith(ano+'-'):true);if(ok)rows.push({...s,parcelaNum:null,parcelaRef:r,parcelaTotal:1,valorExib:s.valor,_parcelaIdx:'av'});}else{for(let i=0;i<(s.nParcelas||1);i++){const pr=Fmt.addMonths(s.primeiraParcela,i);const ok=ref?pr===ref:(ano?pr.startsWith(ano+'-'):true);if(ok)rows.push({...s,parcelaNum:i+1,parcelaRef:pr,parcelaTotal:s.nParcelas,valorExib:s.valor,_parcelaIdx:i});}}});return rows;}
function sortSaida(col){if(saidaSortSt.col===col)saidaSortSt.dir*=-1;else{saidaSortSt.col=col;saidaSortSt.dir=1;}document.getElementById('saidasTable').querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(saidaSortSt.dir===1?'↑':'↓'):'↕';});renderSaidasTable();}
function renderSaidasTable(){const tbody=document.getElementById('saidasBody');const srch=(document.getElementById('filterSaidas')?document.getElementById('filterSaidas').value:'').toLowerCase();let rows=expandirSaidas(DB.get('saidas')||[],filtroAno,filtroRef);if(srch)rows=rows.filter(r=>(r.descricao||'').toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||Fmt.ref(r.parcelaRef).toLowerCase().includes(srch));const{col,dir}=saidaSortSt;rows.sort((a,b)=>{let av,bv;if(col==='ref')av=a.parcelaRef,bv=b.parcelaRef;else if(col==='tipo')av=a.tipo,bv=b.tipo;else if(col==='descricao')av=a.descricao,bv=b.descricao;else if(col==='valor')av=a.valorExib,bv=b.valorExib;else av=a.parcelaRef,bv=b.parcelaRef;return av<bv?-dir:av>bv?dir:0;});document.getElementById('saidasBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');atualizarStatsSaida();if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="7">Nenhuma saída encontrada.</td></tr>`;return;}const tipos=DB.get('tiposConta')||[];tbody.innerHTML=rows.map(r=>r.id===editingSaidaId?buildSaidaEditRow(r,tipos):buildSaidaReadRow(r)).join('');}
function buildSaidaReadRow(r){const pago=(r.pagos||{})[r._parcelaIdx]||false;const sc=pago?'pago':'pendente',st=pago?'✔ Pago':'● Pendente';const parcelaStr=r.parcelaNum!=null?`${r.parcelaNum}/${r.parcelaTotal}`:'—';const acoes=`<div class="actions-cell"><button class="btn-icon edit" onclick="iniciarEdicaoSaida('${r.id}')" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirSaida('${r.id}')" title="Excluir">✕</button></div>`;return`<tr><td class="td-ref">${Fmt.ref(r.parcelaRef)}</td><td><span class="td-tag">${r.tipo||'—'}</span></td><td style="font-size:.84rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.descricao||'—'}</td><td class="td-mono">${parcelaStr}</td><td class="td-value-expense">${Fmt.brl(r.valorExib)}</td><td><button class="status-btn ${sc}" onclick="toggleStatusSaida('${r.id}','${r._parcelaIdx}')">${st}<span class="status-dot"></span></button></td><td>${acoes}</td></tr>`;}
function buildSaidaEditRow(r,tipos){const tipoOpts=tipos.map(t=>`<option value="${t}"${t===r.tipo?' selected':''}>${t}</option>`).join('');const pago=(r.pagos||{})[r._parcelaIdx]||false;const sc=pago?'pago':'pendente',st=pago?'✔ Pago':'● Pendente';return`<tr class="row-editing"><td class="td-ref">${Fmt.ref(r.parcelaRef)}</td><td><select class="inline-select" id="es_tipo" style="min-width:100px;">${tipoOpts}</select></td><td><input class="inline-input" id="es_desc" value="${(r.descricao||'').replace(/"/g,'&quot;')}" style="min-width:110px;" onkeydown="handleInlineSaidaKey(event,'${r.id}')"/></td><td class="td-mono">${r.parcelaNum!=null?`${r.parcelaNum}/${r.parcelaTotal}`:'—'}</td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="es_val" value="${Fmt.toInput(r.valor)}" oninput="maskCurrency(this)" onkeydown="handleInlineSaidaKey(event,'${r.id}')" style="min-width:80px;"/></div></td><td><button class="status-btn ${sc}" onclick="toggleStatusSaida('${r.id}','${r._parcelaIdx}')">${st}<span class="status-dot"></span></button></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarSaida('${r.id}')">✔</button><button class="btn-icon cancel-edit" onclick="cancelarSaida()">✕</button></div></td></tr>`;}
function iniciarEdicaoSaida(id){editingSaidaId=id;renderSaidasTable();setTimeout(()=>{const el=document.getElementById('es_desc');if(el)el.focus();},40);}
function cancelarSaida(){editingSaidaId=null;renderSaidasTable();}
async function salvarSaida(id){const tipo=document.getElementById('es_tipo').value;const descricao=document.getElementById('es_desc').value.trim();const valor=Fmt.parse(document.getElementById('es_val').value);if(!descricao){Toast.show('Informe a descrição','error');return;}if(!valor){Toast.show('Informe o valor','error');return;}const saidas=DB.get('saidas')||[];const idx=saidas.findIndex(e=>e.id===id);if(idx<0)return;saidas[idx].tipo=tipo;saidas[idx].descricao=descricao;saidas[idx].valor=valor;await DB.set('saidas',saidas);editingSaidaId=null;reconstruirFiltros();renderSaidasTable();atualizarStatsSaida();renderControle();Toast.show('Saída atualizada','success');}
function handleInlineSaidaKey(e,id){if(e.key==='Enter'){e.preventDefault();salvarSaida(id);}if(e.key==='Escape')cancelarSaida();}
async function toggleStatusSaida(id,parcelaIdx){const saidas=DB.get('saidas')||[];const idx=saidas.findIndex(e=>e.id===id);if(idx<0)return;if(!saidas[idx].pagos)saidas[idx].pagos={};const key=parcelaIdx==='av'?'av':parseInt(parcelaIdx);saidas[idx].pagos[key]=!saidas[idx].pagos[key];await DB.set('saidas',saidas);renderSaidasTable();atualizarStatsSaida();Toast.show(saidas[idx].pagos[key]?'Marcado como pago':'Marcado como pendente','info');}
function atualizarStatsSaida(){const srch=(document.getElementById('filterSaidas')?document.getElementById('filterSaidas').value:'').toLowerCase();let rows=expandirSaidas(DB.get('saidas')||[],filtroAno,filtroRef);if(srch)rows=rows.filter(r=>(r.descricao||'').toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||Fmt.ref(r.parcelaRef).toLowerCase().includes(srch));let total=0,pendente=0,pago=0;rows.forEach(r=>{total+=r.valorExib;const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);const pg=(r.pagos||{})[key]||false;if(pg)pago+=r.valorExib;else pendente+=r.valorExib;});document.getElementById('saidaStatTotal').textContent=Fmt.brl(total);document.getElementById('saidaStatPendente').textContent=Fmt.brl(pendente);document.getElementById('saidaStatPago').textContent=Fmt.brl(pago);}
function onSaidaFormaChange(){const parcelado=document.getElementById('saidaForma').value==='parcelado';document.getElementById('parcelaFields').classList.toggle('visible',parcelado);document.getElementById('saidaValorLabel').textContent=parcelado?'Valor de cada parcela':'Valor Pago';}
async function confirmarInsercaoSaida(){const ref=document.getElementById('saidaRef').value;const tipo=document.getElementById('saidaTipoConta').value;const descricao=document.getElementById('saidaDescricao').value.trim();const forma=document.getElementById('saidaForma').value;const valor=Fmt.parse(document.getElementById('saidaValor').value);if(!ref){Toast.show('Selecione a referência','error');return;}if(!tipo){Toast.show('Selecione o tipo de conta','error');return;}if(!descricao){Toast.show('Informe a descrição','error');return;}if(!valor){Toast.show('Informe o valor','error');return;}const saida={id:Fmt.uid(),ref,tipo,descricao,forma,valor,pagos:{}};if(forma==='parcelado'){const nParcelas=parseInt(document.getElementById('saidaNParcelas').value)||0;const primeiraParcela=document.getElementById('saidaPrimeiraParcela').value;if(!nParcelas||nParcelas<1){Toast.show('Informe o número de parcelas','error');return;}if(!primeiraParcela){Toast.show('Informe a 1ª parcela','error');return;}saida.nParcelas=nParcelas;saida.primeiraParcela=primeiraParcela;}else{saida.nParcelas=1;}const saidas=DB.get('saidas')||[];saidas.push(saida);await DB.set('saidas',saidas);['saidaRef','saidaDescricao','saidaValor','saidaNParcelas','saidaPrimeiraParcela'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('saidaForma').value='avista';document.getElementById('parcelaFields').classList.remove('visible');document.getElementById('saidaValorLabel').textContent='Valor Pago';reconstruirFiltros();renderSaidasTable();atualizarStatsSaida();renderControle();Toast.show(`Saída "${descricao}" registrada`,'success');}
let pendingDeleteSaidaId=null;
function pedirExcluirSaida(id){const s=(DB.get('saidas')||[]).find(x=>x.id===id);if(!s)return;pendingDeleteSaidaId=id;document.getElementById('deleteSaidaDesc').textContent=s.descricao||'registro';document.getElementById('modalExcluirSaida').classList.remove('hidden');}
async function confirmarExclusaoSaida(){await DB.set('saidas',(DB.get('saidas')||[]).filter(e=>e.id!==pendingDeleteSaidaId));closeModal('modalExcluirSaida');pendingDeleteSaidaId=null;reconstruirFiltros();renderSaidasTable();atualizarStatsSaida();renderControle();Toast.show('Saída excluída','error');}

/* ════════════════════════════════════════════
   ABA ENTRADAS
════════════════════════════════════════════ */
const entradaSortSt={col:'ref',dir:1};
let editingEntradaId=null;
function expandirEntradas(entradas,ano,ref){const rows=[];entradas.forEach(s=>{if(s.forma==='avista'){const r=s.ref;const ok=ref?r===ref:(ano?r.startsWith(ano+'-'):true);if(ok)rows.push({...s,parcelaNum:null,parcelaRef:r,parcelaTotal:1,valorExib:s.valor,_parcelaIdx:'av'});}else{for(let i=0;i<(s.nParcelas||1);i++){const pr=Fmt.addMonths(s.primeiraParcela,i);const ok=ref?pr===ref:(ano?pr.startsWith(ano+'-'):true);if(ok)rows.push({...s,parcelaNum:i+1,parcelaRef:pr,parcelaTotal:s.nParcelas,valorExib:s.valor,_parcelaIdx:i});}}});return rows;}
function sortEntrada(col){if(entradaSortSt.col===col)entradaSortSt.dir*=-1;else{entradaSortSt.col=col;entradaSortSt.dir=1;}document.getElementById('entradasTable').querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(entradaSortSt.dir===1?'↑':'↓'):'↕';});renderEntradasTable();}
function renderEntradasTable(){const tbody=document.getElementById('entradasBody');const srch=(document.getElementById('filterEntrada')?document.getElementById('filterEntrada').value:'').toLowerCase();let rows=expandirEntradas(DB.get('entradas')||[],filtroAno,filtroRef);if(srch)rows=rows.filter(r=>(r.descricao||'').toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||Fmt.ref(r.parcelaRef).toLowerCase().includes(srch));const{col,dir}=entradaSortSt;rows.sort((a,b)=>{let av,bv;if(col==='ref')av=a.parcelaRef,bv=b.parcelaRef;else if(col==='tipo')av=a.tipo,bv=b.tipo;else if(col==='descricao')av=a.descricao,bv=b.descricao;else if(col==='valor')av=a.valorExib,bv=b.valorExib;else av=a.parcelaRef,bv=b.parcelaRef;return av<bv?-dir:av>bv?dir:0;});document.getElementById('entradaBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');atualizarStatsEntrada();if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="7">Nenhuma entrada encontrada.</td></tr>`;return;}const tipos=DB.get('tiposConta')||[];tbody.innerHTML=rows.map(r=>r.id===editingEntradaId?buildEntradaEditRow(r,tipos):buildEntradaReadRow(r)).join('');}
function buildEntradaReadRow(r){const pago=(r.pagos||{})[r._parcelaIdx]||false;const sc=pago?'pago':'pendente',st=pago?'✔ Recebido':'● Pendente';const parcelaStr=r.parcelaNum!=null?`${r.parcelaNum}/${r.parcelaTotal}`:'—';const acoes=`<div class="actions-cell"><button class="btn-icon edit" onclick="iniciarEdicaoEntrada('${r.id}')" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirEntrada('${r.id}')" title="Excluir">✕</button></div>`;return`<tr><td class="td-ref">${Fmt.ref(r.parcelaRef)}</td><td><span class="td-tag">${r.tipo||'—'}</span></td><td style="font-size:.84rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.descricao||'—'}</td><td class="td-mono">${parcelaStr}</td><td class="td-value-income">${Fmt.brl(r.valorExib)}</td><td><button class="status-btn ${sc}" onclick="toggleStatusEntrada('${r.id}','${r._parcelaIdx}')">${st}<span class="status-dot"></span></button></td><td>${acoes}</td></tr>`;}
function buildEntradaEditRow(r,tipos){const tipoOpts=tipos.map(t=>`<option value="${t}"${t===r.tipo?' selected':''}>${t}</option>`).join('');const pago=(r.pagos||{})[r._parcelaIdx]||false;const sc=pago?'pago':'pendente',st=pago?'✔ Recebido':'● Pendente';return`<tr class="row-editing"><td class="td-ref">${Fmt.ref(r.parcelaRef)}</td><td><select class="inline-select" id="ee2_tipo" style="min-width:100px;">${tipoOpts}</select></td><td><input class="inline-input" id="ee2_desc" value="${(r.descricao||'').replace(/"/g,'&quot;')}" style="min-width:110px;" onkeydown="handleInlineEntradaKey(event,'${r.id}')"/></td><td class="td-mono">${r.parcelaNum!=null?`${r.parcelaNum}/${r.parcelaTotal}`:'—'}</td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="ee2_val" value="${Fmt.toInput(r.valor)}" oninput="maskCurrency(this)" onkeydown="handleInlineEntradaKey(event,'${r.id}')" style="min-width:80px;"/></div></td><td><button class="status-btn ${sc}" onclick="toggleStatusEntrada('${r.id}','${r._parcelaIdx}')">${st}<span class="status-dot"></span></button></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarEntrada('${r.id}')">✔</button><button class="btn-icon cancel-edit" onclick="cancelarEntrada()">✕</button></div></td></tr>`;}
function iniciarEdicaoEntrada(id){editingEntradaId=id;renderEntradasTable();setTimeout(()=>{const el=document.getElementById('ee2_desc');if(el)el.focus();},40);}
function cancelarEntrada(){editingEntradaId=null;renderEntradasTable();}
async function salvarEntrada(id){const tipo=document.getElementById('ee2_tipo').value;const descricao=document.getElementById('ee2_desc').value.trim();const valor=Fmt.parse(document.getElementById('ee2_val').value);if(!descricao){Toast.show('Informe a descrição','error');return;}if(!valor){Toast.show('Informe o valor','error');return;}const entradas=DB.get('entradas')||[];const idx=entradas.findIndex(e=>e.id===id);if(idx<0)return;entradas[idx].tipo=tipo;entradas[idx].descricao=descricao;entradas[idx].valor=valor;await DB.set('entradas',entradas);editingEntradaId=null;reconstruirFiltros();renderEntradasTable();atualizarStatsEntrada();renderControle();Toast.show('Entrada atualizada','success');}
function handleInlineEntradaKey(e,id){if(e.key==='Enter'){e.preventDefault();salvarEntrada(id);}if(e.key==='Escape')cancelarEntrada();}
async function toggleStatusEntrada(id,parcelaIdx){const entradas=DB.get('entradas')||[];const idx=entradas.findIndex(e=>e.id===id);if(idx<0)return;if(!entradas[idx].pagos)entradas[idx].pagos={};const key=parcelaIdx==='av'?'av':parseInt(parcelaIdx);entradas[idx].pagos[key]=!entradas[idx].pagos[key];await DB.set('entradas',entradas);renderEntradasTable();atualizarStatsEntrada();Toast.show(entradas[idx].pagos[key]?'Marcado como recebido':'Marcado como pendente','info');}
function atualizarStatsEntrada(){const srch=(document.getElementById('filterEntrada')?document.getElementById('filterEntrada').value:'').toLowerCase();let rows=expandirEntradas(DB.get('entradas')||[],filtroAno,filtroRef);if(srch)rows=rows.filter(r=>(r.descricao||'').toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||Fmt.ref(r.parcelaRef).toLowerCase().includes(srch));let total=0,pendente=0,pago=0;rows.forEach(r=>{total+=r.valorExib;const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);const pg=(r.pagos||{})[key]||false;if(pg)pago+=r.valorExib;else pendente+=r.valorExib;});document.getElementById('entradaStatTotal').textContent=Fmt.brl(total);document.getElementById('entradaStatPendente').textContent=Fmt.brl(pendente);document.getElementById('entradaStatPago').textContent=Fmt.brl(pago);}
function onEntradaFormaChange(){const parcelado=document.getElementById('entradaForma').value==='parcelado';document.getElementById('entradaParcelaFields').classList.toggle('visible',parcelado);document.getElementById('entradaValorLabel').textContent=parcelado?'Valor de cada parcela':'Valor Recebido';}
async function confirmarInsercaoEntrada(){const ref=document.getElementById('entradaRef').value;const tipo=document.getElementById('entradaTipoConta').value;const descricao=document.getElementById('entradaDescricao').value.trim();const forma=document.getElementById('entradaForma').value;const valor=Fmt.parse(document.getElementById('entradaValor').value);if(!ref){Toast.show('Selecione a referência','error');return;}if(!tipo){Toast.show('Selecione o tipo de conta','error');return;}if(!descricao){Toast.show('Informe a descrição','error');return;}if(!valor){Toast.show('Informe o valor','error');return;}const entrada={id:Fmt.uid(),ref,tipo,descricao,forma,valor,pagos:{}};if(forma==='parcelado'){const nParcelas=parseInt(document.getElementById('entradaNParcelas').value)||0;const primeiraParcela=document.getElementById('entradaPrimeiraParcela').value;if(!nParcelas||nParcelas<1){Toast.show('Informe o número de parcelas','error');return;}if(!primeiraParcela){Toast.show('Informe a 1ª parcela','error');return;}entrada.nParcelas=nParcelas;entrada.primeiraParcela=primeiraParcela;}else{entrada.nParcelas=1;}const entradas=DB.get('entradas')||[];entradas.push(entrada);await DB.set('entradas',entradas);['entradaRef','entradaDescricao','entradaValor','entradaNParcelas','entradaPrimeiraParcela'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('entradaForma').value='avista';document.getElementById('entradaParcelaFields').classList.remove('visible');document.getElementById('entradaValorLabel').textContent='Valor Recebido';reconstruirFiltros();renderEntradasTable();atualizarStatsEntrada();renderControle();Toast.show(`Entrada "${descricao}" registrada`,'success');}
let pendingDeleteEntradaId=null;
function pedirExcluirEntrada(id){const e=(DB.get('entradas')||[]).find(x=>x.id===id);if(!e)return;pendingDeleteEntradaId=id;document.getElementById('deleteEntradaDesc').textContent=e.descricao||'registro';document.getElementById('modalExcluirEntrada').classList.remove('hidden');}
async function confirmarExclusaoEntrada(){await DB.set('entradas',(DB.get('entradas')||[]).filter(e=>e.id!==pendingDeleteEntradaId));closeModal('modalExcluirEntrada');pendingDeleteEntradaId=null;reconstruirFiltros();renderEntradasTable();atualizarStatsEntrada();renderControle();Toast.show('Entrada excluída','error');}

/* ════════════════════════════════════════════
   ABA INVESTIMENTO
════════════════════════════════════════════ */
const investSortSt={col:'ref',dir:1};
let editingInvestId=null;
function getInvestRows(ano,ref){let rows=DB.get('investimentos')||[];if(ref)rows=rows.filter(r=>r.ref===ref);else if(ano)rows=rows.filter(r=>r.ref.startsWith(ano+'-'));return rows;}
function onInvestOperacaoChange(){const op=document.getElementById('investOperacao').value;const isRetirada=op==='retirada';document.getElementById('investValorLabel').textContent=isRetirada?'Valor Retirado':'Valor Aportado';const btn=document.getElementById('investBtnConfirmar');btn.style.background=isRetirada?'var(--expense)':'var(--invest)';document.getElementById('investBtnLabel').textContent=isRetirada?'Confirmar Retirada':'Confirmar Aporte';}
function sortInvest(col){if(investSortSt.col===col)investSortSt.dir*=-1;else{investSortSt.col=col;investSortSt.dir=1;}document.getElementById('investTable').querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(investSortSt.dir===1?'↑':'↓'):'↕';});renderInvestTable();}
function renderInvestTable(){const tbody=document.getElementById('investBody');const srch=(document.getElementById('filterInvest').value||'').toLowerCase();let rows=getInvestRows(filtroAno,filtroRef);if(srch)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||(r.descricao||'').toLowerCase().includes(srch)||(r.operacao||'aporte').toLowerCase().includes(srch));const{col,dir}=investSortSt;rows.sort((a,b)=>{let av,bv;if(col==='ref')av=a.ref,bv=b.ref;else if(col==='tipo')av=a.tipo,bv=b.tipo;else if(col==='operacao')av=a.operacao||'aporte',bv=b.operacao||'aporte';else if(col==='descricao')av=a.descricao,bv=b.descricao;else if(col==='valor')av=a.valor,bv=b.valor;else av=a.ref,bv=b.ref;return av<bv?-dir:av>bv?dir:0;});document.getElementById('investBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');atualizarStatsInvest();if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6">Nenhum registro encontrado.</td></tr>`;return;}tbody.innerHTML=rows.map(r=>{const op=r.operacao||'aporte';const isRetirada=op==='retirada';const opBadge=isRetirada?`<span class="nature-badge despesa">📉 Retirada</span>`:`<span class="nature-badge receita">📈 Aporte</span>`;const valClass=isRetirada?'td-value-expense':'td-value-invest';return`<tr><td class="td-ref">${Fmt.ref(r.ref)}</td><td>${opBadge}</td><td><span class="td-tag">${r.tipo||'—'}</span></td><td style="font-size:.84rem;">${r.descricao||'—'}</td><td style="font-family:var(--font-mono);font-weight:500;" class="${valClass}">${isRetirada?'−':''}${Fmt.brl(r.valor)}</td><td><div class="actions-cell"><button class="btn-icon danger" onclick="pedirExcluirInvest('${r.id}')" title="Excluir">✕</button></div></td></tr>`;}).join('');}
function atualizarStatsInvest(){const srch=(document.getElementById('filterInvest')?document.getElementById('filterInvest').value:'').toLowerCase();let rowsFiltro=getInvestRows(filtroAno,filtroRef);if(srch)rowsFiltro=rowsFiltro.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||(r.descricao||'').toLowerCase().includes(srch)||(r.operacao||'aporte').toLowerCase().includes(srch));const allRows=DB.get('investimentos')||[];const totalAportes=rowsFiltro.filter(r=>(r.operacao||'aporte')==='aporte').reduce((s,r)=>s+r.valor,0);const totalRetiradas=rowsFiltro.filter(r=>r.operacao==='retirada').reduce((s,r)=>s+r.valor,0);const patrimonioLiquido=allRows.filter(r=>(r.operacao||'aporte')==='aporte').reduce((s,r)=>s+r.valor,0)-allRows.filter(r=>r.operacao==='retirada').reduce((s,r)=>s+r.valor,0);document.getElementById('investStatTotal').textContent=Fmt.brl(totalAportes);document.getElementById('investStatRetiradas').textContent=Fmt.brl(totalRetiradas);document.getElementById('investStatPatrimonio').textContent=Fmt.brl(patrimonioLiquido);}
async function confirmarInsercaoInvest(){const ref=document.getElementById('investRef').value;const operacao=document.getElementById('investOperacao').value;const tipo=document.getElementById('investTipo').value;const descricao=document.getElementById('investDescricao').value.trim();const valor=Fmt.parse(document.getElementById('investValor').value);if(!ref){Toast.show('Selecione a referência','error');return;}if(!tipo){Toast.show('Selecione o tipo de investimento','error');return;}if(!valor){Toast.show('Informe o valor','error');return;}const inv=DB.get('investimentos')||[];inv.push({id:Fmt.uid(),ref,operacao,tipo,descricao,valor});await DB.set('investimentos',inv);['investRef','investDescricao','investValor'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('investOperacao').value='aporte';onInvestOperacaoChange();reconstruirFiltros();renderInvestTable();atualizarStatsInvest();renderControle();const label=operacao==='retirada'?'Retirada':'Aporte';Toast.show(`${label} de ${Fmt.brl(valor)} em ${tipo} registrado`,'success');}
let pendingDeleteInvestId=null;
function pedirExcluirInvest(id){const r=(DB.get('investimentos')||[]).find(x=>x.id===id);if(!r)return;pendingDeleteInvestId=id;const op=r.operacao==='retirada'?'Retirada':'Aporte';document.getElementById('deleteInvestDesc').textContent=`${op}: ${r.tipo} — ${Fmt.brl(r.valor)} (${Fmt.ref(r.ref)})`;document.getElementById('modalExcluirInvest').classList.remove('hidden');}
async function confirmarExclusaoInvest(){await DB.set('investimentos',(DB.get('investimentos')||[]).filter(r=>r.id!==pendingDeleteInvestId));closeModal('modalExcluirInvest');pendingDeleteInvestId=null;reconstruirFiltros();renderInvestTable();atualizarStatsInvest();renderControle();Toast.show('Registro excluído','error');}

/* ════════════════════════════════════════════
   ABA CONTROLE
════════════════════════════════════════════ */
const ctrlSortSt={receitas:{col:'total',dir:-1},despesas:{col:'total',dir:-1}};
const ctrlMainSortSt={col:'ref',dir:1};
function getLinhasCtrl(ano,ref){const linhas=[];const salRows=getSalRows(ano,ref);salRows.forEach(r=>{if(r.liquido>0)linhas.push({ref:r.ref,origem:'Salário',tipo:'Salário Líquido',descricao:'Adiantamento + Pagamento',valor:r.liquido,natureza:'receita'});});let extras=DB.get('extras')||[];if(ref)extras=extras.filter(e=>e.ref===ref);else if(ano)extras=extras.filter(e=>e.ref.startsWith(ano+'-'));extras.forEach(e=>{if((e.liquido||0)>0)linhas.push({ref:e.ref,origem:'Salário',tipo:e.tipo,descricao:'Extra — '+e.tipo,valor:e.liquido||0,natureza:'receita'});});const entRows=expandirEntradas(DB.get('entradas')||[],ano,ref);entRows.forEach(r=>{linhas.push({ref:r.parcelaRef,origem:'Entradas',tipo:r.tipo||'Entrada',descricao:r.descricao||(r.tipo||'Entrada'),valor:r.valorExib,natureza:'receita'});});const saiRows=expandirSaidas(DB.get('saidas')||[],ano,ref);saiRows.forEach(r=>{linhas.push({ref:r.parcelaRef,origem:'Saídas',tipo:r.tipo||'Saída',descricao:r.descricao||(r.tipo||'Saída'),valor:r.valorExib,natureza:'despesa'});});return linhas;}
function agruparPorTipo(linhas,natureza){const map={};linhas.filter(l=>l.natureza===natureza).forEach(l=>{if(!map[l.tipo])map[l.tipo]={tipo:l.tipo,registros:0,total:0};map[l.tipo].registros++;map[l.tipo].total+=l.valor;});return Object.values(map);}
function renderControle(){const linhas=getLinhasCtrl(filtroAno,filtroRef);const totalReceitas=linhas.filter(l=>l.natureza==='receita').reduce((s,l)=>s+l.valor,0);const totalDespesas=linhas.filter(l=>l.natureza==='despesa').reduce((s,l)=>s+l.valor,0);const investRows=getInvestRows(filtroAno,filtroRef);const totalInvest=investRows.filter(r=>(r.operacao||'aporte')==='aporte').reduce((s,r)=>s+r.valor,0)-investRows.filter(r=>r.operacao==='retirada').reduce((s,r)=>s+r.valor,0);const saldo=totalReceitas-totalDespesas-totalInvest;document.getElementById('ctrlStatReceitas').textContent=Fmt.brl(totalReceitas);document.getElementById('ctrlStatDespesas').textContent=Fmt.brl(totalDespesas);document.getElementById('ctrlStatInvest').textContent=Fmt.brl(totalInvest);const saldoEl=document.getElementById('ctrlStatSaldo');saldoEl.textContent=Fmt.brl(saldo);saldoEl.className='stat-value '+(saldo>=0?'saldo-pos':'saldo-neg');document.getElementById('ctrlSaldoCard').className='stat-card '+(saldo>=0?'green':'red');renderCtrlGrupo('receitas',agruparPorTipo(linhas,'receita'),totalReceitas,'receita');renderCtrlGrupo('despesas',agruparPorTipo(linhas,'despesa'),totalDespesas,'despesa');renderCtrlTable();renderCtrlResumoOrigem();}
function sortCtrl(tabela,col){const st=ctrlSortSt[tabela];if(st.col===col)st.dir*=-1;else{st.col=col;st.dir=1;}const tableId=tabela==='receitas'?'ctrlReceitasTable':'ctrlDespesasTable';document.getElementById(tableId).querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(st.dir===1?'↑':'↓'):'↕';});renderControle();}
function renderCtrlGrupo(tabela,grupos,grandTotal,natureza){const st=ctrlSortSt[tabela];const badgeEl=document.getElementById(tabela==='receitas'?'ctrlReceitasBadge':'ctrlDespesasBadge');const tbody=document.getElementById(tabela==='receitas'?'ctrlReceitasBody':'ctrlDespesasBody');const barClass=natureza==='receita'?'receita':'despesa';const valClass=natureza==='receita'?'td-value-income':'td-value-expense';grupos.sort((a,b)=>{const av=st.col==='tipo'?a.tipo:st.col==='registros'?a.registros:st.col==='perc'?(a.total/grandTotal):a.total;const bv=st.col==='tipo'?b.tipo:st.col==='registros'?b.registros:st.col==='perc'?(b.total/grandTotal):b.total;return av<bv?-st.dir:av>bv?st.dir:0;});badgeEl.textContent=grupos.length+' tipo'+(grupos.length!==1?'s':'');if(!grupos.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="4">Nenhum registro no período.</td></tr>`;return;}const rows=grupos.map(g=>{const perc=grandTotal>0?(g.total/grandTotal*100):0;const barW=Math.round(perc*0.8);return`<tr><td style="font-size:.84rem;font-weight:500;">${g.tipo}</td><td class="td-mono" style="text-align:center;">${g.registros}</td><td class="${valClass}">${Fmt.brl(g.total)}</td><td><div class="perc-bar-wrap"><div class="perc-bar ${barClass}" style="width:${barW}px;"></div><span class="perc-val">${perc.toFixed(1)}%</span></div></td></tr>`;}).join('');const totalRow=`<tr class="ctrl-total-row"><td style="font-size:.82rem;">Total</td><td class="td-mono" style="text-align:center;">${grupos.reduce((s,g)=>s+g.registros,0)}</td><td class="${valClass}">${Fmt.brl(grandTotal)}</td><td><span class="perc-val">100%</span></td></tr>`;tbody.innerHTML=rows+totalRow;}
function renderCtrlResumoOrigem(){const linhas=getLinhasCtrl(filtroAno,filtroRef);const srch=(document.getElementById('filterCtrl')?document.getElementById('filterCtrl').value:'').toLowerCase();const resumo={};linhas.forEach(l=>{const t=l.tipo;if(!resumo[t])resumo[t]={tipo:t,entradas:0,saidas:0};if(l.natureza==='receita')resumo[t].entradas+=l.valor;else resumo[t].saidas+=l.valor;});let rows=Object.values(resumo);if(srch)rows=rows.filter(r=>r.tipo.toLowerCase().includes(srch));rows.sort((a,b)=>(b.entradas-b.saidas)-(a.entradas-a.saidas));const tbody=document.getElementById('ctrlResumoBody');if(!tbody)return;document.getElementById('ctrlResumoBadge').textContent=rows.length+' tipo'+(rows.length!==1?'s':'');if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="4">Nenhum dado no período.</td></tr>`;return;}const totalSaldo=rows.reduce((s,r)=>s+(r.entradas-r.saidas),0);tbody.innerHTML=rows.map(r=>{const saldo=r.entradas-r.saidas;const saldoClass=saldo>=0?'td-value-income':'td-value-expense';const saldoStr=saldo>=0?Fmt.brl(saldo):`−${Fmt.brl(Math.abs(saldo))}`;const entStr=r.entradas>0?`<span class="td-value-income">${Fmt.brl(r.entradas)}</span>`:`<span style="color:var(--text-muted)">—</span>`;const saiStr=r.saidas>0?`<span class="td-value-expense">−${Fmt.brl(r.saidas)}</span>`:`<span style="color:var(--text-muted)">—</span>`;return`<tr><td style="font-size:.84rem;font-weight:500;">${r.tipo}</td><td style="text-align:right;">${entStr}</td><td style="text-align:right;">${saiStr}</td><td style="text-align:right;"><span class="${saldoClass}" style="font-weight:600;">${saldoStr}</span></td></tr>`;}).join('');const totSaldoClass=totalSaldo>=0?'td-value-income':'td-value-expense';const totSaldoStr=totalSaldo>=0?Fmt.brl(totalSaldo):`−${Fmt.brl(Math.abs(totalSaldo))}`;const totEntradas=rows.reduce((s,r)=>s+r.entradas,0);const totSaidas=rows.reduce((s,r)=>s+r.saidas,0);tbody.innerHTML+=`<tr class="ctrl-total-row"><td style="font-size:.82rem;">Total</td><td style="text-align:right;" class="td-value-income">${Fmt.brl(totEntradas)}</td><td style="text-align:right;" class="td-value-expense">−${Fmt.brl(totSaidas)}</td><td style="text-align:right;"><span class="${totSaldoClass}" style="font-weight:700;">${totSaldoStr}</span></td></tr>`;}
function sortCtrlMain(col){if(ctrlMainSortSt.col===col)ctrlMainSortSt.dir*=-1;else{ctrlMainSortSt.col=col;ctrlMainSortSt.dir=1;}document.getElementById('ctrlTable').querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(ctrlMainSortSt.dir===1?'↑':'↓'):'↕';});renderCtrlTable();}
function renderCtrlTable(){const tbody=document.getElementById('ctrlBody');const srch=(document.getElementById('filterCtrl').value||'').toLowerCase();let linhas=getLinhasCtrl(filtroAno,filtroRef);if(srch)linhas=linhas.filter(l=>Fmt.ref(l.ref).toLowerCase().includes(srch)||(l.origem||'').toLowerCase().includes(srch)||(l.tipo||'').toLowerCase().includes(srch)||(l.descricao||'').toLowerCase().includes(srch));const{col,dir}=ctrlMainSortSt;linhas.sort((a,b)=>{let av,bv;if(col==='ref')av=a.ref,bv=b.ref;else if(col==='origem')av=a.origem,bv=b.origem;else if(col==='tipo')av=a.tipo,bv=b.tipo;else if(col==='descricao')av=a.descricao,bv=b.descricao;else if(col==='valor')av=a.valor,bv=b.valor;else av=a.ref,bv=b.ref;return av<bv?-dir:av>bv?dir:0;});document.getElementById('ctrlTotalBadge').textContent=linhas.length+' registro'+(linhas.length!==1?'s':'');if(!linhas.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6">Nenhum dado no período selecionado.</td></tr>`;renderCtrlResumoOrigem();return;}tbody.innerHTML=linhas.map(l=>{const valClass=l.natureza==='receita'?'td-value-income':'td-value-expense';const naturezaBadge=l.natureza==='receita'?`<span class="nature-badge receita">↑ Receita</span>`:`<span class="nature-badge despesa">↓ Despesa</span>`;return`<tr><td class="td-ref">${Fmt.ref(l.ref)}</td><td><span class="origin-badge">${l.origem}</span></td><td><span class="td-tag">${l.tipo}</span></td><td style="font-size:.83rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.descricao}</td><td class="${valClass}">${Fmt.brl(l.valor)}</td><td>${naturezaBadge}</td></tr>`;}).join('');renderCtrlResumoOrigem();}

/* ════════════════════════════════════════════
   CRITÉRIOS / TIPOS
════════════════════════════════════════════ */
function renderCriterios(){const crit=DB.get('criterios')||[];document.getElementById('criteriasEmpty').style.display=crit.length?'none':'block';document.getElementById('criteriaList').innerHTML=crit.map((c,i)=>`<div class="criteria-tag"><span>${c}</span><button class="criteria-remove" onclick="removerCriterio(${i})">✕</button></div>`).join('');const sel=document.getElementById('extrasTipo');sel.innerHTML=crit.length?crit.map(c=>`<option value="${c}">${c}</option>`).join(''):'<option value="">Nenhum critério</option>';}
async function adicionarCriterio(){const el=document.getElementById('criterioInput'),val=el.value.trim();if(!val){Toast.show('Digite o nome do critério','error');return;}const crit=DB.get('criterios')||[];if(crit.includes(val)){Toast.show('Critério já existe','error');return;}crit.push(val);await DB.set('criterios',crit);el.value='';renderCriterios();Toast.show(`Critério "${val}" adicionado`,'success');}
async function removerCriterio(i){const crit=DB.get('criterios')||[];const nome=crit[i];crit.splice(i,1);await DB.set('criterios',crit);renderCriterios();Toast.show(`Critério "${nome}" removido`,'info');}
function renderTiposConta(){const tipos=DB.get('tiposConta')||[];document.getElementById('tiposContaEmpty').style.display=tipos.length?'none':'block';document.getElementById('tiposContaList').innerHTML=tipos.map((t,i)=>`<div class="criteria-tag"><span>${t}</span><button class="criteria-remove" onclick="removerTipoConta(${i})">✕</button></div>`).join('');const opts=tipos.length?tipos.map(t=>`<option value="${t}">${t}</option>`).join(''):'<option value="">Nenhum tipo cadastrado</option>';['saidaTipoConta','entradaTipoConta'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=opts;});}
async function adicionarTipoConta(){const el=document.getElementById('tipoContaInput'),val=el.value.trim();if(!val){Toast.show('Digite o nome do tipo','error');return;}const tipos=DB.get('tiposConta')||[];if(tipos.includes(val)){Toast.show('Tipo já existe','error');return;}tipos.push(val);await DB.set('tiposConta',tipos);el.value='';renderTiposConta();Toast.show(`Tipo "${val}" adicionado`,'success');}
async function removerTipoConta(i){const tipos=DB.get('tiposConta')||[];const nome=tipos[i];tipos.splice(i,1);await DB.set('tiposConta',tipos);renderTiposConta();Toast.show(`Tipo "${nome}" removido`,'info');}
function renderTiposInvest(){const tipos=DB.get('tiposInvest')||[];document.getElementById('tiposInvestEmpty').style.display=tipos.length?'none':'block';document.getElementById('tiposInvestList').innerHTML=tipos.map((t,i)=>`<div class="criteria-tag"><span>${t}</span><button class="criteria-remove" onclick="removerTipoInvest(${i})">✕</button></div>`).join('');const opts=tipos.length?tipos.map(t=>`<option value="${t}">${t}</option>`).join(''):'<option value="">Nenhum tipo cadastrado</option>';const el=document.getElementById('investTipo');if(el)el.innerHTML=opts;}
async function adicionarTipoInvest(){const el=document.getElementById('tipoInvestInput'),val=el.value.trim();if(!val){Toast.show('Digite o nome do tipo','error');return;}const tipos=DB.get('tiposInvest')||[];if(tipos.includes(val)){Toast.show('Tipo já existe','error');return;}tipos.push(val);await DB.set('tiposInvest',tipos);el.value='';renderTiposInvest();Toast.show(`Tipo "${val}" adicionado`,'success');}
async function removerTipoInvest(i){const tipos=DB.get('tiposInvest')||[];const nome=tipos[i];tipos.splice(i,1);await DB.set('tiposInvest',tipos);renderTiposInvest();Toast.show(`Tipo "${nome}" removido`,'info');}

/* ════════════════════════════════════════════
   USUÁRIOS
════════════════════════════════════════════ */
const uColors=['#4D79FF','#00C97A','#FF4D6A','#FFB830','#9B59B6','#00B5D8'];
const gColor=id=>uColors[id%uColors.length];
/* Renderiza lista de usuários com botões de editar e excluir */
function renderUsers(){
  const users=DB.get('usuarios')||[];
  const list=document.getElementById('userList');
  if(!users.length){list.innerHTML='<div class="text-muted" style="padding:20px 0;text-align:center;">Nenhum usuário cadastrado</div>';return;}
  list.innerHTML=users.map(u=>`<div class="user-card">
    <div class="user-avatar" style="background:${gColor(u.id)}22;color:${gColor(u.id)};">${u.nome.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
    <div class="user-info"><div class="user-name">${u.nome}</div><div class="user-role-text">${u.perfil==='admin'?'Administrador':'Usuário'}</div></div>
    <span class="badge badge-${u.perfil}">${u.perfil==='admin'?'Admin':'Usuário'}</span>
    <div class="flex-gap" style="margin-left:6px;">
      <button class="btn-icon edit" onclick="editarUsuario(${u.id})" title="Editar">✎</button>
      <button class="btn-icon danger" onclick="pedirExcluirUser(${u.id})" title="Excluir">✕</button>
    </div>
  </div>`).join('');
}

/* Criar novo usuário: cadastra no Firebase Auth via app secundário + salva metadados */
async function salvarUsuario(){
  const editId=document.getElementById('editUserId').value;
  const nome=document.getElementById('userNome').value.trim();
  const perfil=document.getElementById('userPerfil').value;
  const senha=document.getElementById('userSenha').value;
  const senhaEdit=document.getElementById('userSenhaEdit')?document.getElementById('userSenhaEdit').value:'';

  if(!nome){Toast.show('Informe o nome do usuário','error');return;}

  const users=DB.get('usuarios')||[];

  /* ── MODO EDIÇÃO ── */
  if(editId){
    const idx=users.findIndex(u=>u.id==editId);
    if(idx<0)return;
    users[idx].nome=nome;
    users[idx].perfil=perfil;
    // Atualiza senha se preenchida — só funciona se o usuário editado for o logado
    if(senhaEdit&&senhaEdit.length>=4){
      if(fireAuth.currentUser&&fireAuth.currentUser.email===users[idx].email){
        try{
          await updatePassword(fireAuth.currentUser,senhaEdit);
          Toast.show('Senha atualizada com sucesso','success');
        }catch(e){
          Toast.show('Para trocar a senha, use "Trocar senha" no seu avatar','error',5000);
        }
      } else {
        Toast.show('Só é possível alterar a senha do seu próprio usuário','error',5000);
      }
    } else if(senhaEdit&&senhaEdit.length>0&&senhaEdit.length<4){
      Toast.show('Senha deve ter ao menos 4 caracteres','error');return;
    }
    await DB.set('usuarios',users);
    limparUserForm();renderUsers();
    Toast.show(`Usuário "${nome}" atualizado`,'success');
    return;
  }

  /* ── MODO CRIAÇÃO ── */
  if(!senha||senha.length<4){Toast.show('Senha deve ter ao menos 4 caracteres','error');return;}
  const email=toEmail(nome);
  if(users.find(u=>u.email===email)){Toast.show('Já existe um usuário com esse nome','error');return;}

  // Cria conta no Firebase Auth usando o app secundário (não derruba sessão do admin)
  try{
    Toast.show('Criando conta…','info',2000);
    await createUserWithEmailAndPassword(fireAuthSec,email,senha);
    await signOut(fireAuthSec); // desconecta o app secundário imediatamente
  }catch(e){
    if(e.code==='auth/email-already-in-use'){
      Toast.show('Já existe uma conta Firebase com esse nome','error');return;
    }
    Toast.show('Erro ao criar conta: '+e.message,'error');return;
  }

  const newId=users.length?Math.max(...users.map(u=>u.id))+1:1;
  users.push({id:newId,nome,email,perfil});
  await DB.set('usuarios',users);
  limparUserForm();renderUsers();
  Toast.show(`Usuário "${nome}" criado com sucesso! Ele já pode fazer login.`,'success');
}

function editarUsuario(id){
  const u=(DB.get('usuarios')||[]).find(x=>x.id===id);
  if(!u)return;
  document.getElementById('editUserId').value=u.id;
  document.getElementById('userNome').value=u.nome;
  document.getElementById('userPerfil').value=u.perfil;
  document.getElementById('userSenha').value='';
  if(document.getElementById('userSenhaEdit'))document.getElementById('userSenhaEdit').value='';
  if(document.getElementById('senhaNovoGroup'))document.getElementById('senhaNovoGroup').style.display='none';
  if(document.getElementById('senhaEditGroup'))document.getElementById('senhaEditGroup').style.display='block';
  if(document.getElementById('userFormTitle'))document.getElementById('userFormTitle').textContent='Editar Usuário';
}

function limparUserForm(){
  ['editUserId','userNome','userSenha','userSenhaEdit'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const pEl=document.getElementById('userPerfil');if(pEl)pEl.value='usuario';
  const tEl=document.getElementById('userFormTitle');if(tEl)tEl.textContent='Novo Usuário';
  if(document.getElementById('senhaNovoGroup'))document.getElementById('senhaNovoGroup').style.display='block';
  if(document.getElementById('senhaEditGroup'))document.getElementById('senhaEditGroup').style.display='none';
}

let pendingDeleteId=null;
function pedirExcluirUser(id){const u=(DB.get('usuarios')||[]).find(x=>x.id===id);if(!u)return;pendingDeleteId=id;document.getElementById('deleteUserName').textContent=u.nome;document.getElementById('modalExcluirUser').classList.remove('hidden');}
async function confirmarExclusaoUser(){
  const users=(DB.get('usuarios')||[]).filter(u=>u.id!==pendingDeleteId);
  await DB.set('usuarios',users);
  closeModal('modalExcluirUser');
  renderUsers();atualizarAvatar();
  Toast.show('Usuário excluído do painel. A conta Firebase Auth permanece — exclua manualmente no console se necessário.','info',6000);
  pendingDeleteId=null;
}

/* ════════════════════════════════════════════
   AVATAR / MODAL
════════════════════════════════════════════ */
function atualizarAvatar(){if(!currentUser)return;const ini=currentUser.nome.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();document.getElementById('userAvatar').textContent=ini;document.getElementById('dropdownName').textContent=currentUser.nome;document.getElementById('dropdownRole').textContent=currentUser.perfil==='admin'?'Administrador':'Usuário';}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden');}));

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
function initUI(){
  initTheme();
  initSidebar();
  const now=new Date();
  document.getElementById('topbarDate').textContent=now.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  const ym=Fmt.nowYM();
  ['insertRef','saidaRef','saidaPrimeiraParcela','entradaRef','entradaPrimeiraParcela','investRef'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=ym;});
  document.getElementById('loginUser').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('loginPass').focus();});
  document.getElementById('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')fazerLogin();});
}

/* Firebase Auth observer — ponto central de entrada */
onAuthStateChanged(fireAuth,async(firebaseUser)=>{
  if(firebaseUser){
    await aoAutenticar(firebaseUser);
  }else{
    // Não autenticado — verifica se é primeiro acesso verificando um doc público de setup
    const ls=document.getElementById('loginScreen');
    ls.style.display='flex';
    ls.classList.remove('hidden');
    document.getElementById('appWrapper').classList.remove('visible');
    await verificarPrimeiroAcesso();
  }
});

/* Verifica se existe algum usuário cadastrado no sistema.
   Usa um documento público /setup/status para saber se o sistema foi inicializado. */
async function verificarPrimeiroAcesso(){
  try{
    const setupSnap=await getDoc(doc(firestoreDB,'setup','status'));
    if(!setupSnap.exists()){
      // Nunca foi inicializado — mostra tela de criação do admin
      mostrarSetupAdmin();
    }
    // Se existe, login normal (formulário já está visível)
  }catch(e){
    // Sem permissão ou erro de rede — não mostra setup, deixa login normal
    console.warn('Setup check failed:',e.message);
  }
}

initUI();
