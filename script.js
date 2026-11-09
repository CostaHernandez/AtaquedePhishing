'use strict';
/* =====================================================================
   CorreoSeguro · Simulador educativo anti-phishing
   - Todo ocurre en el navegador. No hay red, formularios de login ni envíos.
   - Los textos se insertan con textContent (nunca innerHTML con datos).
   - Los adjuntos solo guardan nombre y tamaño: jamás se leen ni ejecutan.
   ===================================================================== */

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const H = 36e5, KEY = 'cybershield_v2';
const fmt = t => new Date(t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const kb = n => Math.max(1, Math.round(n / 1024)) + ' KB';
const FOLDERS = [['inbox','📥','Recibidos'],['sent','📤','Enviados'],['drafts','📝','Borradores'],['spam','🚫','Spam'],['trash','🗑️','Papelera'],['archive','🗄️','Archivados']];

// ---------- Datos de ejemplo ("[[LINK]]" marca dónde va el enlace) ----------
const seed = () => [
 { id:'m1', folder:'inbox', from:'Banco Nacional', addr:'seguridad@banco-nacional-verifica.example', subject:'⚠ Su cuenta será suspendida en 24 horas', t:Date.now()-2*H, read:false, att:[], phish:true,
   body:'Estimado cliente:\n\nHemos detectado actividad inusual en su cuenta. Para evitar la suspensión debe verificar sus datos en las próximas 24 horas:\n\n[[LINK]]\n\nAtentamente,\nDepartamento de Seguridad',
   link:{ text:'Verificar mi cuenta ahora', url:'http://banco-nacional.verifica-cliente.example/login' },
   flags:['Dominio del remitente falso (banco-nacional-verifica.example).','Urgencia y amenaza de suspensión.','Saludo genérico: «Estimado cliente».','El texto del enlace oculta un dominio distinto.'] },
 { id:'m2', folder:'inbox', from:'Soporte Microsoft 365', addr:'no-reply@m1crosoft-soporte.example', subject:'Su contraseña caduca hoy', t:Date.now()-5*H, read:false, att:[], phish:true,
   body:'Hola,\n\nSu contraseña de Microsoft 365 caduca hoy. Mantenga su acceso:\n\n[[LINK]]\n\nSi no actúa perderá sus archivos.',
   link:{ text:'Conservar mi contraseña', url:'http://m1crosoft-soporte.example/reset' },
   flags:['«m1crosoft» sustituye la «i» por un «1».','Amenaza de pérdida de archivos.','Los servicios reales no piden mantener la contraseña por correo.'] },
 { id:'m3', folder:'inbox', from:'Recursos Humanos', addr:'rrhh@cybershield-nominas.example', subject:'Bono salarial 2026 – ver adjunto', t:Date.now()-9*H, read:false, trapAtt:true, phish:true,
   att:[{ n:'Bono_2026.pdf.exe', s:482000 }], link:null,
   body:'Buen día,\n\nAdjuntamos el detalle de su bono. Ábralo hoy mismo para confirmar su pago.\n\nRecursos Humanos',
   flags:['Adjunto con doble extensión (.pdf.exe): es un programa, no un PDF.','Oferta de dinero inesperada.','Dominio distinto del oficial (cybershield.example).'] },
 { id:'m4', folder:'inbox', from:'Envíos Express', addr:'aviso@envios-express-tracking.example', subject:'No pudimos entregar tu paquete', t:Date.now()-26*H, read:true, att:[], phish:true,
   body:'Intentamos entregar su paquete sin éxito. Pague una tasa de reenvío de $1.99:\n\n[[LINK]]',
   link:{ text:'Reprogramar entrega', url:'http://envios-express-tracking.example/pago' },
   flags:['No mencionas haber pedido ningún paquete.','Pide un pago pequeño para robar datos de tarjeta.','Dominio de seguimiento no oficial.'] },
 { id:'m5', folder:'inbox', from:'Equipo de TI', addr:'ti@cybershield.example', subject:'Recordatorio: capacitación de seguridad', t:Date.now()-30*H, read:true, att:[], phish:false, link:null,
   body:'Hola equipo,\n\nEl jueves a las 10:00 habrá una capacitación sobre seguridad. Se realizará en la sala de reuniones; no necesitas iniciar sesión en ningún enlace.\n\nGracias,\nTI' },
 { id:'m6', folder:'inbox', from:'Ana Torres', addr:'ana.torres@correo.example', subject:'Fotos del fin de semana', t:Date.now()-50*H, read:true, att:[{ n:'paseo.jpg', s:2048000 }], phish:false, link:null,
   body:'¡Hola! Te comparto una foto del paseo. ¡Fue genial! Cuéntame cuándo nos vemos.' },
 { id:'m7', folder:'spam', from:'Premios Mega', addr:'ganador@premios-mega.example', subject:'¡¡Ganaste un teléfono nuevo!!', t:Date.now()-70*H, read:false, att:[], phish:true,
   body:'¡FELICIDADES! Fuiste elegido entre 1 millón de usuarios. Reclama tu premio ya:\n\n[[LINK]]',
   link:{ text:'Reclamar premio', url:'http://premios-mega.example/gratis' },
   flags:['Premio de un concurso en el que no participaste.','Exceso de signos de exclamación y mayúsculas.','Ya estaba en Spam: tu proveedor lo detectó.'] },
 { id:'m8', folder:'sent', from:'Yo', addr:'laura.mendez@cybershield.example', to:'ana.torres@correo.example', subject:'Re: Fotos del fin de semana', t:Date.now()-48*H, read:true, att:[], phish:false, link:null, body:'¡Gracias Ana! El sábado me va bien.' }
];

// ---------- Estado persistente (LocalStorage) ----------
let S, trapMail = null, draft = null, files = [];
const cur = { folder:'inbox', open:null, q:'' };
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.mails) return d; } catch (e) {} return { mails: seed(), clicks: 0, reports: 0, best: null }; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function toast(x) { const t = $('#toast'); t.textContent = x; t.style.display = 'block'; clearTimeout(toast.id); toast.id = setTimeout(() => t.style.display = 'none', 2800); }
const status = x => { const s = $('#status'); s.textContent = x; s.style.display = x ? 'block' : 'none'; };

// ---------- Navegación lateral ----------
function renderNav() {
  const n = $('#nav'); n.innerHTML = '';
  const c = el('button', 'compose-btn', '✏ Redactar'); c.onclick = () => openCompose(); n.append(c);
  // Misión: progreso al reportar los correos de phishing
  const ph = S.mails.filter(m => m.phish), done = ph.filter(m => m.reported).length;
  const mi = el('div', 'mission'); mi.append(el('b', null, '🎯 Misión: detecta el phishing'), el('span', null, done + ' de ' + ph.length + ' reportados'));
  const tr = el('div', 'track'), fl = el('div', 'fill g'); fl.style.width = pc(done, Math.max(ph.length, 1)) + '%'; tr.append(fl); mi.append(tr); n.append(mi);
  FOLDERS.forEach(([id, ic, name]) => {
    const b = el('button', 'f' + (id === cur.folder && !cur.q ? ' on' : '')); b.append(el('span', null, ic), el('span', null, name));
    const cnt = S.mails.filter(m => m.folder === id && !m.read).length;
    if (cnt && id !== 'sent') b.append(el('span', null, cnt));
    b.onclick = () => { cur.folder = id; cur.open = null; cur.q = ''; $('#search').value = ''; n.classList.remove('open'); render(); };
    n.append(b);
  });
  n.append(el('div', 'sep', 'Seguridad'));
  const d = el('button', 'f' + (cur.folder === 'dash' && !cur.q ? ' on' : '')); d.append(el('span', null, '📊'), el('span', null, 'Panel de evaluación'));
  d.onclick = () => { cur.folder = 'dash'; cur.open = null; cur.q = ''; $('#search').value = ''; n.classList.remove('open'); render(); };
  n.append(d);
}

// ---------- Lista de correos ----------
function renderList() {
  const main = $('#main'), q = cur.q.toLowerCase(); main.innerHTML = '';
  const list = S.mails.filter(m => q ? (m.from + m.subject + m.body + (m.addr || '')).toLowerCase().includes(q) : m.folder === cur.folder).sort((a, b) => b.t - a.t);
  const bar = el('div', 'bar'); bar.append(el('h2', null, q ? 'Resultados para «' + cur.q + '»' : FOLDERS.find(f => f[0] === cur.folder)[2]));
  if (cur.folder === 'trash' && !q) { const v = el('button', 'btn light', 'Vaciar papelera'); v.onclick = () => { S.mails = S.mails.filter(m => m.folder !== 'trash'); save(); render(); }; bar.append(v); }
  main.append(bar);
  if (!list.length) main.append(el('div', 'empty', 'No hay correos aquí. Prueba otra carpeta o redacta uno nuevo.'));
  list.forEach(m => {
    const r = el('div', 'row' + (m.read ? '' : ' unread')); r.tabIndex = 0;
    const who = ['sent', 'drafts'].includes(m.folder) ? 'Para: ' + (m.to || '(sin destinatario)') : m.from;
    r.append(el('span', 'who', who), el('span', 'msg', (m.subject || '(sin asunto)') + ' – ' + m.body.replace('[[LINK]]', '').replace(/\s+/g, ' ').slice(0, 90)), el('span', 'date', (m.att.length ? '📎 ' : '') + fmt(m.t)));
    const go = () => { if (m.folder === 'drafts') return openCompose(m); cur.open = m.id; m.read = true; save(); render(); };
    r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); };
    main.append(r);
  });
}

// ---------- Lectura de un correo ----------
function renderMail(m) {
  const main = $('#main'); main.innerHTML = '';
  const bar = el('div', 'bar');
  const add = (txt, fn) => { const b = el('button', 'btn light', txt); b.onclick = fn; bar.append(b); };
  add('← Volver', () => { cur.open = null; render(); });
  add('🗄 Archivar', () => move(m, 'archive', 'Correo archivado'));
  add('🚫 Spam', () => move(m, 'spam', 'Marcado como spam'));
  add('🚩 Reportar phishing', () => { S.reports = (S.reports || 0) + 1; m.reported = true; move(m, 'spam', m.phish ? '¡Bien hecho! Era phishing y ya está reportado al equipo de seguridad.' : 'Reportado. Este correo era legítimo: revisa las señales antes de reportar.'); });
  add('🗑 Eliminar', () => { if (m.folder === 'trash') { S.mails = S.mails.filter(x => x !== m); cur.open = null; save(); render(); toast('Eliminado definitivamente'); } else move(m, 'trash', 'Movido a la papelera'); });
  if (m.folder !== 'inbox') add('📥 A recibidos', () => move(m, 'inbox', 'Movido a recibidos'));
  add('🔍 Analizar', () => ana.classList.toggle('hidden'));
  add('✉ No leído', () => { m.read = false; cur.open = null; save(); render(); });
  main.append(bar);

  const a = el('article', 'mail');
  if (m.folder !== 'sent' && !m.addr.endsWith('@cybershield.example')) a.append(el('div', 'ext', '⚠ Remitente externo a CyberShield S.A.: verifica antes de abrir enlaces o adjuntos.'));
  a.append(el('h2', null, m.subject || '(sin asunto)'));
  a.append(el('div', 'meta', (m.folder === 'sent' ? 'Para: ' + m.to : 'De: ' + m.from + ' <' + m.addr + '>') + '  ·  ' + fmt(m.t)));
  const body = el('div', 'mbody');
  // Todo enlace (de ejemplo, escrito o insertado al redactar) lleva a la lección y nunca sale del sitio
  const mkLink = (text, url) => { const l = el('a', 'lnk', text); l.href = '#'; l.onmouseover = () => status(url); l.onmouseout = () => status(''); l.onclick = e => { e.preventDefault(); trap(m, text, url); }; return l; };
  m.body.split('[[LINK]]').forEach((p, i, arr) => {
    let last = 0;
    for (const x of p.matchAll(LINK_RE)) { body.append(document.createTextNode(p.slice(last, x.index)), mkLink(x[1] || x[3], x[2] || x[3])); last = x.index + x[0].length; }
    body.append(document.createTextNode(p.slice(last)));
    if (i < arr.length - 1 && m.link) body.append(mkLink(m.link.text, m.link.url));
  });
  a.append(body);
  const ana = el('div', 'ana hidden'), ul = el('ul'); ana.append(el('b', null, '🔍 Análisis de seguridad'), ul);
  analyze(m).forEach(x => ul.append(el('li', null, x))); a.append(ana);
  if (m.att.length) {
    const box = el('div', 'atts');
    m.att.forEach(f => { const b = el('button', 'att', '📎 ' + f.n + ' (' + kb(f.s) + ')'); b.onclick = () => m.trapAtt ? trap(m, f.n, null) : toast('Adjunto simulado: no se abre ni se ejecuta.'); box.append(b); });
    a.append(box);
  }
  const rep = el('button', 'btn', '↩ Responder'); rep.style.marginTop = '24px';
  rep.onclick = () => openCompose({ to: m.addr, subject: 'Re: ' + m.subject, body: '\n\n--- ' + m.from + ' escribió ---\n' + m.body.replace('[[LINK]]', m.link ? '[' + m.link.text + '](' + m.link.url + ')' : '') });
  a.append(rep); main.append(a);
}
function move(m, f, msg) { m.folder = f; cur.open = null; save(); render(); toast(msg); }
function render() { renderNav(); if (cur.folder === 'dash' && !cur.q) return renderDash(); const m = cur.open && S.mails.find(x => x.id === cur.open); m ? renderMail(m) : renderList(); }

// ---------- Redactar (todo simulado) ----------
function openCompose(d = {}) {
  draft = d.id ? d : null; files = (d.att || []).slice();
  $('#to').value = d.to || ''; $('#subj').value = d.subject || ''; $('#msg').value = d.body || '';
  showFiles(); $('#compose').classList.remove('hidden');
}
const showFiles = () => $('#files').textContent = files.length ? '📎 ' + files.map(f => f.n + ' (' + kb(f.s) + ')').join(', ') : '';
$('#file').onchange = e => { files = files.concat([...e.target.files].map(f => ({ n: f.name, s: f.size }))); e.target.value = ''; showFiles(); }; // solo nombre y tamaño
function closeCompose(keep) {
  const to = $('#to').value.trim(), subject = $('#subj').value.trim(), body = $('#msg').value;
  if (keep && (to || subject || body.trim() || files.length)) {
    if (draft) Object.assign(draft, { to, subject, body, att: files, t: Date.now() });
    else S.mails.push({ id: 'u' + Date.now(), folder: 'drafts', from: 'Yo', addr: 'laura.mendez@cybershield.example', to, subject, body, att: files, t: Date.now(), read: true, phish: false, link: null });
    save(); toast('Borrador guardado');
  }
  $('#compose').classList.add('hidden'); draft = null; render();
}
$('#cClose').onclick = () => closeCompose(true);
$('#cSend').onclick = () => {
  const to = $('#to').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return toast('Escribe un destinatario válido.');
  if (draft) S.mails = S.mails.filter(x => x !== draft);
  S.mails.push({ id: 'u' + Date.now(), folder: 'sent', from: 'Yo', addr: 'laura.mendez@cybershield.example', to, subject: $('#subj').value.trim(), body: $('#msg').value, att: files, t: Date.now(), read: true, phish: false, link: null });
  save(); $('#compose').classList.add('hidden'); draft = null; cur.folder = 'sent'; cur.open = null; render();
  toast('Enviado (simulado): no salió de tu navegador.');
};

$('#cLink').onclick = () => {
  const url = (prompt('Dirección del enlace (simulado; llevará a la lección):', 'https://') || '').replace(/\s+/g, '');
  if (!url) return;
  const text = prompt('Texto visible del enlace:', url) || url, ta = $('#msg');
  ta.value = ta.value.slice(0, ta.selectionStart) + (text === url ? url : '[' + text + '](' + url + ')') + ta.value.slice(ta.selectionEnd); ta.focus();
};

// ---------- Trampa de phishing → página educativa interna ----------
let trapInfo = null;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s]+|www\.[^\s]+)/g;   // [texto](url) o URL suelta
const linksIn = t => [...t.matchAll(LINK_RE)].map(x => ({ text: x[1] || x[3], url: x[2] || x[3] }));
function trap(m, text, url) { trapInfo = { m, text, url }; S.clicks++; save(); location.hash = '#caiste'; }
// Detecta señales de phishing en cualquier correo (también los que redactas)
function analyze(m) {
  const r = [], t = ((m.subject || '') + ' ' + m.body).toLowerCase();
  if (m.addr && m.folder !== 'sent' && !m.addr.endsWith('@cybershield.example')) r.push('Remitente externo: ' + m.addr + ' no es del dominio cybershield.example.');
  if (/urgente|24 horas|suspend|caduca|hoy mismo|inmediat|perder/.test(t)) r.push('Lenguaje de urgencia o amenaza para presionarte.');
  if (/premio|ganaste|ganador|bono|gratis/.test(t)) r.push('Promesa de dinero o premio inesperado.');
  if (/estimado cliente|querido usuario/.test(t)) r.push('Saludo genérico en lugar de tu nombre.');
  if (m.link) r.push('El enlace dice «' + m.link.text + '» pero lleva a ' + m.link.url + '.');
  linksIn(m.body).forEach(l => { if (l.text !== l.url) r.push('El texto «' + l.text + '» oculta el destino real ' + l.url + '.'); });
  (m.att || []).forEach(a => { if (/\.(pdf|docx?|xlsx?|jpe?g)\.(exe|js|scr|bat)$/i.test(a.n)) r.push('Adjunto «' + a.n + '» con doble extensión: es un ejecutable.'); });
  if (!r.length) r.push('No hay señales evidentes, pero verifica siempre el dominio real antes de hacer clic.');
  return r;
}
function route() {
  const on = location.hash === '#caiste';
  $('#edu').classList.toggle('hidden', !on); $('#app').classList.toggle('hidden', on);
  if (on) { fillEdu(); $('#edu').scrollTop = 0; }
}
function fillEdu() {
  const w = $('#eduWhat'), f = $('#eduFlags'); w.innerHTML = f.innerHTML = '';
  if (!trapInfo) { w.textContent = 'Abriste un enlace de demostración. En un ataque real podrías haber perdido tus datos.'; return; }
  const { m, text, url } = trapInfo;
  w.append(el('p', null, url ? 'Hiciste clic en «' + text + '» dentro del correo «' + (m.subject || '(sin asunto)') + '». Parecía legítimo, pero apuntaba a: ' + url
    : 'Abriste el adjunto «' + text + '» del correo «' + m.subject + '». En un ataque real habría instalado un programa malicioso.'));
  w.append(el('p', null, 'Remitente: ' + m.from + ' <' + m.addr + '>. Señales detectadas:'));
  (m.flags && m.flags.length ? m.flags : analyze(m)).forEach(x => f.append(el('li', null, x)));
}
$('#backMail').onclick = e => { e.preventDefault(); location.hash = ''; };

// ---------- Cuestionario con puntuación ----------
const QUIZ = [
 { q:'¿Qué señal revela mejor que un enlace es falso?', o:['Que empieza por https','Que al pasar el cursor el dominio real no coincide con el texto','Que es largo','Que tiene logotipo'], a:1, w:'Cualquiera puede usar https o copiar un logotipo; el dominio real es lo que cuenta.' },
 { q:'Tu «banco» te pide verificar tu cuenta en 24 h. ¿Qué haces?', o:['Hago clic rápido','Respondo con mis datos','Entro escribiendo yo la dirección oficial o con su app','Lo reenvío a mis amigos'], a:2, w:'Nunca uses el enlace del correo: accede por un canal que tú controles.' },
 { q:'Recibes «Factura.pdf.exe». ¿Es seguro?', o:['Sí, es un PDF','No: es un programa disfrazado de PDF','Sí, si tengo antivirus','Solo en el móvil'], a:1, w:'La extensión final (.exe) manda: es un ejecutable.' },
 { q:'Escribiste tu contraseña en un sitio falso. ¿Qué haces primero?', o:['Nada','Esperar unos días','Cambiarla de inmediato, activar verificación en 2 pasos y avisar','Borrar el correo'], a:2, w:'Actuar rápido limita el daño; borrar el correo no revierte nada.' },
 { q:'¿Qué protege tu cuenta aunque te roben la contraseña?', o:['Una contraseña corta','La verificación en dos pasos','Usar la misma clave siempre','Ocultar mi correo'], a:1, w:'El segundo factor bloquea el acceso con solo la contraseña.' }
];
function renderQuiz() {
  const box = $('#quiz'); box.innerHTML = '';
  QUIZ.forEach((x, i) => {
    const fs = el('fieldset', 'q'); fs.append(el('legend', null, (i + 1) + '. ' + x.q));
    x.o.forEach((o, j) => { const l = el('label'), r = el('input'); r.type = 'radio'; r.name = 'q' + i; r.value = j; l.append(r, ' ' + o); fs.append(l); });
    box.append(fs);
  });
  const b = el('button', 'btn', 'Ver mi puntuación'); b.onclick = grade; box.append(b);
  if (S.best != null) box.append(el('p', null, 'Tu mejor puntuación: ' + S.best + '/' + QUIZ.length));
}
function grade() {
  const res = $('#result'); res.innerHTML = ''; let pts = 0; const fails = [];
  QUIZ.forEach((x, i) => { const s = document.querySelector('input[name=q' + i + ']:checked'); if (s && +s.value === x.a) pts++; else fails.push(x); });
  if (S.best == null || pts > S.best) S.best = pts; save();
  res.append(el('h3', pts >= 4 ? 'ok' : 'ko', 'Puntuación: ' + pts + '/' + QUIZ.length));
  res.append(el('p', null, pts === 5 ? '¡Excelente! Sabes detectar el phishing. Comparte lo aprendido con tu entorno.'
    : pts >= 3 ? 'Vas bien, pero repasa las señales de alerta y verifica siempre el dominio real antes de hacer clic.'
    : 'Necesitas reforzar lo básico: relee las secciones de arriba, abre de nuevo los correos de ejemplo y vuelve a intentarlo.'));
  fails.forEach(x => res.append(el('p', 'ko', '✗ ' + x.q + ' → ' + x.o[x.a] + '. ' + x.w)));
}

// ---------- Panel de evaluación: campaña SIMULADA y ficticia en CyberShield S.A. ----------
// [departamento, empleados, clics, reportes]. Datos de ejemplo; no son personas reales.
const CAMPAIGN = [['Finanzas',28,11,6],['RR. HH.',14,6,2],['Ventas',36,19,3],['TI',22,3,13],['Operaciones',30,12,5],['Dirección',10,5,1]];
// [control, descripción, reducción de clics, reducción del impacto tras el clic] (valores ilustrativos)
const CONTROLS = [
 ['Capacitación y simulacros mensuales','Reduce clics; el efecto decae si no se repite.',.35,0],
 ['Filtro de correo y etiqueta de remitente externo','Bloquea o señala dominios sospechosos.',.25,0],
 ['Bloqueo de adjuntos ejecutables (.exe, .js)','Elimina el vector del adjunto malicioso.',.10,0],
 ['Botón «Reportar phishing» + respuesta del SOC','Retira el correo de otros buzones en minutos.',0,.20],
 ['Protección DNS / navegador','Bloquea dominios de phishing conocidos al hacer clic.',0,.30],
 ['MFA resistente a phishing (FIDO2)','Una contraseña robada no basta para entrar.',0,.70]];
const pc = (a, b) => Math.round(a / b * 100);
function renderDash() {
  const main = $('#main'); main.innerHTML = '';
  const T = CAMPAIGN.reduce((a, d) => [a[0] + d[1], a[1] + d[2], a[2] + d[3]], [0, 0, 0]);
  const w = el('div', 'dash');
  w.append(el('h2', null, 'Evaluación del ataque simulado · CyberShield S.A.'),
    el('p', 'mut', 'Datos ficticios de una campaña interna con fines formativos. Mide comportamiento por departamento; no identifica a personas.'));
  const k = el('div', 'kpis');
  [[pc(T[1], T[0]) + '%', 'Tasa de clic (efectividad del ataque)', 'bad'], [pc(T[2], T[0]) + '%', 'Tasa de reporte', 'good'], [T[0], 'Empleados evaluados', ''], [T[1], 'Clics totales', '']]
    .forEach(([v, l, c]) => { const d = el('div', 'kpi ' + c); d.append(el('b', null, v), el('span', null, l)); k.append(d); });
  w.append(k, el('h3', null, 'Resultados por departamento (rojo = clic, verde = reporte)'));
  CAMPAIGN.forEach(([n, e, c, r]) => {
    const row = el('div', 'brow'), bars = el('div');
    [[c, 'fill'], [r, 'fill g']].forEach(([v, cl]) => { const t = el('div', 'track'), f = el('div', cl); f.style.width = pc(v, e) + '%'; t.append(f); bars.append(t); });
    row.append(el('span', null, n), bars, el('span', 'mut', 'clic ' + pc(c, e) + '% · rep. ' + pc(r, e) + '%')); w.append(row);
  });
  const hi = [...CAMPAIGN].sort((a, b) => pc(b[2], b[1]) - pc(a[2], a[1]))[0], lo = [...CAMPAIGN].sort((a, b) => pc(b[3], b[1]) - pc(a[3], a[1]))[0];
  w.append(el('p', null, 'Lectura: mayor exposición en ' + hi[0] + ' (' + pc(hi[2], hi[1]) + '% hizo clic); mejor cultura de reporte en ' + lo[0] + ' (' + pc(lo[3], lo[1]) + '%). El ataque resulta efectivo mientras la tasa de clic supere a la de reporte.'));
  w.append(el('h3', null, 'Estrategias de mitigación: simulador de impacto'), el('p', 'mut', 'Reducciones estimadas e ilustrativas; en la práctica se validan con nuevas campañas.'));
  const boxes = CONTROLS.map(([n, d]) => { const l = el('label', 'ctl'), i = el('input'); i.type = 'checkbox'; i.onchange = upd; l.append(i, ' ' + n, el('small', null, d)); w.append(l); return i; });
  const proj = el('div', 'proj'); w.append(proj);
  function upd() {
    let c = pc(T[1], T[0]) / 100, i = .6;                       // supuesto: 6 de cada 10 que hacen clic introducen credenciales
    boxes.forEach((b, x) => { if (b.checked) { c *= 1 - CONTROLS[x][2]; i *= 1 - CONTROLS[x][3]; } });
    proj.textContent = 'Tasa de clic proyectada: ' + Math.round(c * 100) + '% · Cuentas comprometidas proyectadas: ' + (c * i * 100).toFixed(1) + '% de empleados (base sin controles: ' + (pc(T[1], T[0]) * .6).toFixed(1) + '%).';
  }
  upd();
  w.append(el('h3', null, 'Tu sesión'), el('p', null, 'Clics en trampas: ' + S.clicks + ' · Correos reportados: ' + (S.reports || 0) + ' · Mejor puntuación del cuestionario: ' + (S.best == null ? '—' : S.best + '/' + QUIZ.length)));
  main.append(w);
}

// ---------- Inicio ----------
S = load();
$('#search').oninput = e => { cur.q = e.target.value.trim(); cur.open = null; render(); };
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
$('#resetBtn').onclick = () => { if (confirm('¿Restablecer los correos de ejemplo y borrar tus datos locales?')) { localStorage.removeItem(KEY); location.hash = ''; location.reload(); } };
window.addEventListener('hashchange', route);
renderQuiz(); render(); route();
