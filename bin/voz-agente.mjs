#!/usr/bin/env node
// voz-agente — falar com um agente do Habblaud pelo NOME que o habblaud deu, sem teclado.
// STT: termux-speech-to-text (Android) → whisper-cli local (+ captura mic). TTS: termux-tts-speak → espeak|play.
// Envio: POST /api/messages {agentId,text}. Agentes/nomes: GET /api/snapshot.
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.HABBLAUD_URL || 'http://127.0.0.1:4747').replace(/\/$/, '');
const TIMEOUT = Number(process.env.VOZ_TIMEOUT_MS || 45000);
const POLL_MS = 1500;
const WHISPER = process.env.HABBLAUD_WHISPER_BIN || (existsSync('/data/data/com.termux/files/usr/bin/whisper-cli') ? 'whisper-cli' : '');
const WMODEL = process.env.HABBLAUD_WHISPER_MODEL || (existsSync(`${process.env.HOME}/.local/share/whisper/ggml-base.bin`) ? `${process.env.HOME}/.local/share/whisper/ggml-base.bin` : '');
const REC_SEC = Number(process.env.VOZ_REC_SEC || 7);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

function sh(cmd, a, inp, to=60000) {
  const r = spawnSync(cmd, a, { input: inp, encoding: 'utf8', timeout: to });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}
function has(cmd) { if (cmd.includes('/')) return existsSync(cmd); const r = sh('command', ['-v', cmd]); return r.ok || sh('which', [cmd]).ok; }
function speak(text) {
  if (flag('--sem-tts')) return;
  const t = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!t) return;
  if (has('termux-tts-speak')) { const r = sh('termux-tts-speak', [t], null, 20000); if (r.ok) return; }
  // espeak -> play (sox) para tocar de fato
  if (has('espeak') && has('play')) {
    const p = spawnSync('sh', ['-c', 'espeak -v pt -s 145 --stdout "$1" 2>/dev/null | play -q -t wav - 2>/dev/null', '_', t], { timeout: 20000 });
    if (p.status === 0) return;
  }
  if (has('espeak-ng')) { sh('espeak-ng', ['-v', 'pt', t], null, 20000); return; }
  if (has('espeak')) sh('espeak', ['-v', 'pt', t], null, 20000);
}
function recordWav(sec) {
  const dir = mkdtempSync(join(tmpdir(), 'voz-')); const f = join(dir, 'in.wav');
  // 1) termux-microphone-record (precisa app Termux:API)
  if (has('termux-microphone-record')) {
    const r = sh('termux-microphone-record', ['-f', f, '-l', String(sec), '-e', 'wav', '-r', '16000', '-b', '16', '-c', '1'], null, (sec + 10) * 1000);
    if (r.ok && existsSync(f)) return f;
    sh('termux-microphone-record', ['-q'], null, 5000);
  }
  // 2) rec/parecord best-effort (pode não captar mic real sem Termux:API source)
  if (has('rec')) {
    const r = sh('rec', ['-q', '-r', '16000', '-c', '1', '-b', '16', f, 'trim', '0', String(sec)], null, (sec + 10) * 1000);
    if (existsSync(f)) return f;
  }
  try { unlinkSync(f); } catch {}
  return null;
}
function whisperStt(wav) {
  if (!WHISPER || !WMODEL || !existsSync(wav)) return { ok: false, err: 'whisper-cli/modelo indisponível' };
  const r = sh(WHISPER, ['-m', WMODEL, '-f', wav, '-l', 'auto', '-nt', '-np'], null, 120000);
  const txt = (r.out || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (txt) return { ok: true, text: txt };
  return { ok: false, err: r.err || r.out || 'vazio' };
}
function listen() {
  const txt = opt('--texto', '').trim();
  if (txt) return txt;
  const audio = opt('--audio', '').trim();
  if (audio) { const w = whisperStt(audio); if (!w.ok) throw new Error('STT áudio falhou: ' + w.err); return w.text; }
  // 1) termux-speech-to-text (Android dialog, sem teclado) — requer app Termux:API
  if (has('termux-speech-to-text')) {
    process.stderr.write('[voz] ouvindo (termux-speech-to-text, fale agora)...\n');
    const r = sh('termux-speech-to-text', [], null, 60000);
    if (r.ok && r.out) return r.out.trim();
    process.stderr.write('[voz] termux-speech-to-text falhou; tentando whisper local...\n');
  }
  // 2) gravar + whisper local
  if (WHISPER && WMODEL) {
    process.stderr.write(`[voz] gravando ${REC_SEC}s (whisper local)... fale agora.\n`);
    const wav = recordWav(REC_SEC);
    if (wav) {
      const w = whisperStt(wav);
      try { unlinkSync(wav); } catch {}
      if (w.ok) return w.text;
      throw new Error('whisper não transcreveu: ' + w.err + ' (mic real requer app Termux:API; ou use --texto/--audio)');
    }
  }
  throw new Error('STT indisponível: instale app Termux:API + permissão de microfone, ou use --texto "agente NOME, comando" / --audio <wav>. (whisper-cli=' + !!WHISPER + ' modelo=' + !!WMODEL + ')');
}
async function jget(p) {
  const r = await fetch(BASE + p, { headers: { accept: 'application/json' } });
  const t = await r.text(); try { return JSON.parse(t); } catch { throw new Error(`GET ${p}: ${t.slice(0, 160)}`); }
}
async function jpost(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { status: r.status, ok: r.ok, json: j };
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function score(name, q) {
  const n = norm(name), k = norm(q);
  if (!n || !k) return 0;
  if (n === k) return 100;
  if (n.startsWith(k) || k.startsWith(n)) return 90;
  if (n.includes(k) || k.includes(n)) return 80;
  const nw = new Set(n.split(' ')), kw = k.split(' ').filter(Boolean);
  const hit = kw.filter(w => nw.has(w) || n.includes(w)).length;
  return hit ? 50 + 10 * hit : 0;
}
function parseUtterance(text) {
  let t = String(text || '').trim();
  t = t.replace(/^(open|habblaud|oi|olá|ola)[, ]+/i, '').trim();
  // "agente Francisco, rode os testes" | "Francisco, rode os testes" | "para Francisco: rode..."
  let m = t.match(/^(?:agente\s+)?([^,:\-]+)[,:\-]\s*(.+)$/i);
  if (m) return { who: m[1].trim(), cmd: m[2].trim() };
  m = t.match(/^agente\s+(\S+)\s+(.+)$/i);
  if (m) return { who: m[1].trim(), cmd: m[2].trim() };
  return { who: '', cmd: t };
}
async function agents() {
  const snap = await jget('/api/snapshot');
  return Array.isArray(snap.agents) ? snap.agents : [];
}
function resolve(list, who) {
  const ranked = list.map(a => ({ a, s: score(a.name, who) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s);
  if (!ranked.length) return { ok: false, reason: 'nenhum agente com esse nome' };
  if (ranked.length > 1 && ranked[0].s === ranked[1].s && ranked[0].s < 100) return { ok: false, reason: 'ambíguo', choices: ranked.slice(0, 3).map(x => x.a.name) };
  return { ok: true, agent: ranked[0].a };
}
async function waitReply(agentId, since, ms) {
  const end = Date.now() + ms;
  let last = '';
  while (Date.now() < end) {
    try {
      const snap = await jget('/api/snapshot');
      const a = (snap.agents || []).find(x => x.id === agentId);
      if (a) {
        const recent = Array.isArray(a.recent) ? a.recent : [];
        const fresh = recent.filter(it => (it.at || 0) >= since).map(it => it.text || it.detail || '').filter(Boolean);
        const txt = fresh.join(' · ').trim();
        if (txt && txt !== last) { last = txt; /* keep polling briefly for a better chunk */ }
        // heuristic: if agent produced a "think"/"say"-like text or we got something after initial, return
        if (last) return { ok: true, text: last, status: a.status };
      }
    } catch {}
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  return last ? { ok: true, text: last } : { ok: false, text: '' };
}
async function main() {
  if (flag('--help') || flag('-h')) {
    console.log('uso: voz-agente.mjs [--listar] [--texto "Agente, comando"] [--nome Francisco --msg "comando"] [--sem-tts]\n' +
      'fala (termux-speech-to-text) -> resolve nome do habblaud -> POST /api/messages -> TTS da resposta.\n' +
      'env: HABBLAUD_URL (default http://127.0.0.1:4747), VOZ_TIMEOUT_MS (default 45000)');
    return;
  }
  const list = await agents();
  if (flag('--listar')) {
    if (!list.length) { console.log('(nenhum agente)'); return; }
    for (const a of list) console.log(`${a.name}\t${a.status}\t${a.kind}\t${a.account}\t${a.id}`);
    return;
  }
  let who = opt('--nome', ''), cmd = opt('--msg', '');
  const dry = flag('--dry-run');
  if (!who || !cmd) {
    const heard = listen();
    console.log('[voz] ouvi:', heard);
    if (!has('termux-speech-to-text') && flag('--texto')) { /* ok */ }
    const p = parseUtterance(heard);
    who = who || p.who; cmd = cmd || p.cmd;
  }
  if (!who) { const msg = 'Não entendi o nome do agente. Diga: "agente <nome>, <comando>". Agentes: ' + list.map(a=>a.name).join(', '); console.error(msg); if(!flag('--sem-tts')) speak(msg); process.exit(2); }
  if (!cmd) { const msg = `Entendi o agente ${who}, mas não o comando.`; console.error(msg); if(!flag('--sem-tts')) speak(msg); process.exit(2); }
  const resv = resolve(list, who);
  if (!resv.ok) { const msg = resv.reason === 'ambíguo' ? `Nome ambíguo: ${resv.choices.join(', ')}` : `Não achei agente "${who}". Disponíveis: ${list.map(a=>a.name).join(', ')||'nenhum'}`; console.error(msg); if(!flag('--sem-tts')) speak(msg); process.exit(3); }
  const ag = resv.agent;
  console.log(`[voz] agente=${ag.name} (${ag.id}, ${ag.status}) cmd=${cmd}`);
  if (dry) { console.log('[voz] dry-run: não enviado.'); return; }
  const sent = await jpost('/api/messages', { agentId: ag.id, text: cmd });
  if (!sent.ok) { const msg = `Falha ao enviar: ${sent.status} ${sent.json?.error || sent.json?.raw || ''}`; console.error(msg); if(!flag('--sem-tts')) speak('Falha ao enviar a mensagem.'); process.exit(4); }
  console.log('[voz] enviado', sent.status, sent.json?.id || '');
  if (!flag('--sem-tts')) speak(`Mensagem enviada para ${ag.name}.`);
  const since = Date.now();
  const rep = await waitReply(ag.id, since, TIMEOUT);
  if (rep.ok && rep.text) { console.log('[voz] atividade:', rep.text); if(!flag('--sem-tts')) speak(rep.text.slice(0, 500)); }
  else { console.log('[voz] sem resposta textual capturada no tempo limite (entrega ok).'); if(!flag('--sem-tts')) speak('Entregue. Sem resposta capturada ainda.'); }
}
main().catch(e => { console.error('[voz] erro:', e.message || e); try{ if(!process.argv.includes('--sem-tts')) speak('Erro na voz agente.'); }catch{} process.exit(1); });
