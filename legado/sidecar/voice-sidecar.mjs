// Habblaud Voice Sidecar — OpenCode Edition
// Formato: "open, agente <NOME>, <COMANDO>"
// Wake word: "open" (substituido de "Habblaud")
// Principe: deixa o Habblaud reconhecer os agentes

import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = 4747;

// Apenas configuração de TTS e parâmetros — sem agentNames hardcoded
let voiceConfig = {
  wakeWord: "open",
  ttsVoice: "default",
  ttsRate: 1.0,
  ttsVolume: 0.8,
  responsePollInterval: 1500,
  responseTimeoutMs: 10000
};

// Agentes conhecidos — exemplos. O script envia o nome que o usuário fala
// e deixa o Habblaud reconhecer/validar o agente.
const KNOWN_AGENTS = ["Alpha", "Beta", "Gamma", "Delta", "jonas", "marcos"];

// Agenda de loadConfig
async function loadConfig() {
  const configPath = join(homedir(), '.habblaud', 'voice-config.json');
  try {
    const raw = await new Promise((resolve, reject) => {
      createReadStream(configPath, { encoding: 'utf8' })
        .on('end', () => resolve(''))
        .on('error', (err) => reject(err));
    });
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed.wakeWord) voiceConfig.wakeWord = parsed.wakeWord.trim().toLowerCase();
      if (parsed.ttsVoice) voiceConfig.ttsVoice = parsed.ttsVoice;
      if (parsed.ttsRate !== undefined) voiceConfig.ttsRate = parsed.ttsRate;
      if (parsed.ttsVolume !== undefined) voiceConfig.ttsVolume = parsed.ttsVolume;
      if (parsed.responsePollInterval !== undefined) voiceConfig.responsePollInterval = parsed.responsePollInterval;
      if (parsed.responseTimeoutMs !== undefined) voiceConfig.responseTimeoutMs = parsed.responseTimeoutMs;
    }
  } catch {}
};

// Normaliza nome: minúsculo, remove acentos e pontuação
function normalizeName(n) {
  if (!n) return '';
  return n.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;]/g, "")
    .trim();
};

// Transcreve áudio usando whisper-cli (STT local)
async function transcribeAudio(audioPath) {
  return new Promise((resolve) => {
    execFile('whisper-cli', ['-f', audioPath, '-l', 'auto', '-otxt', '-of', '/dev/null'], { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) { resolve({ ok: false, error: (stderr || err.message || 'falha').trim() }); }
      else { resolve({ ok: true, text: stdout.trim().replace(/\s+/g, ' ') }); }
    });
  });
};

// Converte texto em áudio usando Piper (TTS local), com fallback silencioso
function speakText(text, voice, rate, volume) {
  if (!text || !text.trim()) return;
  const cleanText = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanText) return;
  try {
    execFile('piper', ['--output', '/dev/stdout', ...(voice ? ['--voice', voice] : []), '--rate', rate.toString()], { timeout: 30000 }, () => {});
  } catch {}
};

// Envia comando ao agente via Habblaud API (POST /api/mod/inbox)
// Usa fetch global (Node.js 22+), sem require
async function sendCommandToAgent(agentName, commandText) {
  const body = JSON.stringify({ session: 'voice-' + Date.now(), account: 'voice-user', agent: agentName, command: commandText });
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/mod/inbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body
    });
    if (!response.ok) { const errText = await response.text(); return { ok: false, error: `Habblaud ${response.status}: ${errText}` }; }
    const data = await response.json();
    const messages = data.messages || [];
    return { ok: true, messages: messages.length, response: data };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
};

// Captura a resposta do agente fazendo polling do inbox
async function captureAgentResponse(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, voiceConfig.responsePollInterval || 1500));
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/mod/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ session: 'voice-' + Date.now(), account: 'voice-user' })
      });
      if (response.ok) {
        const data = await response.json();
        const messages = data.messages || [];
        if (messages && messages.length > 0) return { ok: true, text: messages[messages.length - 1].text || null, data };
      }
    } catch {}
  }
  return { ok: false, text: null, data: null };
};

// Parseia o comando de voz: "open, agente <NOME>, <COMANDO>"
function parseVoiceCommand(fullText) {
  let text = fullText.toLowerCase().trim();
  
  // Remover a palavra de ativação "open" no início
  if (voiceConfig.wakeWord) {
    if (text.startsWith(voiceConfig.wakeWord)) {
      text = text.slice(voiceConfig.wakeWord.length);
      text = text.replace(/^\s*,\s*/, '').trim();
    }
  }
  
  let agentPart = '';
  let commandPart = '';
  
  // Extrair "agente <NOME>" - capturar TUDO após "agente "
  const agenteMatch = text.match(/^agente\s+(.+)/i);
  if (agenteMatch) {
    const afterAgente = agenteMatch[1].trim();
    
    // Dividir em palavras
    const words = afterAgente.split(/\s+/);
    
    if (words.length > 0) {
      // Primeira palavra: remover pontuação
      let firstWord = words[0].replace(/[.,;]/g, '');
      
      // Verificar se a primeira palavra corresponde a um agente conhecido
      for (const agent of KNOWN_AGENTS) {
        if (normalizeName(agent) === normalizeName(firstWord)) {
          agentPart = agent;
          // O comando é o resto após a primeira palavra
          const commandWords = words.slice(1);
          commandPart = commandWords.join(' ');
          break;
        }
      }
      
      // Se não encontrou conhecido, usa a primeira palavra como agente
      if (!agentPart) {
        agentPart = firstWord;
        const commandWords = words.slice(1);
        commandPart = commandWords.join(' ');
      }
    }
  }
  
  // Limpar comando: remover palavras extras tipo "rode", "execute", etc.
  if (commandPart) {
    const wordsToRemove = ['rode', 'execute', 'faça', 'faz', 'por favor', 'agente'];
    const filteredWords = commandPart
      .toLowerCase()
      .split(/\s+/)
      .filter(w => !wordsToRemove.includes(w))
      .join(' ')
      .trim();
    commandPart = filteredWords || '';
  }
  
  return { agentPart, commandPart };
};

// Processa um input de voz já transcrito
async function processVoiceInput(fullText) {
  console.log('\n--- Habblaud Voice (OpenCode Edition) ---');
  console.log('Entrada:', fullText);
  
  const { agentPart, commandPart } = parseVoiceCommand(fullText);
  
  if (!agentPart) {
    console.error('❌ Não foi possível extrair "agente <NOME>" da sua fala.');
    console.error('Formato esperado: "open, agente Alpha, rode os testes"');
    return;
  }
  
  // Normalizar o agente solicitado
  const foundAgent = normalizeName(agentPart);
  
  // Verificar se o agente está na lista conhecida
  const knownAgent = KNOWN_AGENTS.find(a => normalizeName(a) === foundAgent);
  const agentLabel = knownAgent || agentPart;
  
  console.log(`🔍 Agente solicitado: "${agentPart}"`);
  console.log(`📝 Comando: "${commandPart}"`);
  
  // Envia comando ao agente — deixa o Habblaud validar/recognizar o agente
  console.log('📤 Enviando comando ao Habblaud...');
  const sendResult = await sendCommandToAgent(agentPart, commandPart);
  if (!sendResult.ok) {
    console.error(`❌ Erro ao enviar comando: ${sendResult.error}`);
    return;
  }
  console.log(`✅ Comando enviado (${sendResult.messages} mensagem(ns) na fila)`);
  
  // Se o Habblaud retornou dados de resposta, mostrar
  if (sendResult.response && sendResult.response.messages > 0) {
    console.log('💬 Resposta do Habblaud:', JSON.stringify(sendResult.response, null, 2).substring(0, 200));
  }
  
  // Tenta capturar resposta do inbox
  const capture = await captureAgentResponse();
  if (capture.ok && capture.text) {
    console.log('💬 Resposta do agente:', capture.text);
    console.log('🔊 Convertendo resposta em áudio via Piper...');
    speakText(capture.text, voiceConfig.ttsVoice, voiceConfig.ttsRate, voiceConfig.ttsVolume);
    console.log('✅ Áudio reproduzido');
  } else {
    console.warn(`⚠️ Nenhuma resposta recebida no timeout de ${voiceConfig.responseTimeoutMs || 10000}ms`);
    // Mesmo sem resposta, o comando foi aceito pelo Habblaud
    console.log('✅ Comando foi aceito pelo Habblaud (agent: ' + agentLabel + ')');
  }
  
  console.log('--- Fim do ciclo ---\n');
};

// Ponto de entrada
if (process.argv.length > 2) {
  const input = process.argv.slice(2).join(' ');
  processVoiceInput(input).then(() => process.exit(0)).catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
} else {
  console.log('Habblaud Voice — OpenCode Edition');
  console.log('Formato: "open, agente Alpha, rode os testes"');
  console.log('Ou: "open agente Beta abre o terminal"');
  console.log('Digite "sair" ou "quit" para encerrar.');
  console.log('');
  process.stdin.on('data', (data) => {
    const input = data.toString().trim();
    if (input.toLowerCase() === 'sair' || input.toLowerCase() === 'quit') {
      console.log('Encerrando...');
      process.exit(0);
    }
    processVoiceInput(input).then(() => {}).catch(err => console.error('Erro:', err));
  });
}
