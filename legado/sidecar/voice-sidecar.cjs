// Habblaud Voice Sidecar — OpenCode Edition
// Formato: "open, agente <NOME>, <COMANDO>"
// Wake word: "open" (substituido de "Habblaud")

var execFile = require('child_process').execFile;
var http = require('http');

const PORT = 4747;
let voiceConfig = { wakeWord: "open", agentNames: ["Alpha", "Beta", "Gamma", "Delta"], fuzzyThreshold: 0.6 };

function normalizeName(n) { var o = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return o.trim(); }
function findAgent(name) { var norm = normalizeName(name), targets = voiceConfig.agentNames.map(normalizeName), exact = targets.find(function(n) { return n === norm; }); if (exact) return exact; var tw = new Set(norm.split(/\s+/).filter(function(w) { return w.length > 2 })); var bestM = undefined, bestS = 0; for (var n = 0; n < targets.length; n++) { var nw = new Set(targets[n].split(/\s+/).filter(function(w) { return w.length > 2 })); var s = 0; for (var k = 0; k < tw.size; k++) { var w = tw[k]; if (nw.has(w)) s++; } if (s > bestS) { bestS = s; bestM = targets[n]; } } var minS = Math.max(1, Math.ceil(tw.size * (voiceConfig.fuzzyThreshold || 0.6))); return bestS >= minS && bestM ? bestM : undefined; }

function transcribe(aPath, cb) { execFile("whisper-cli", ["-f", aPath, "-l", "auto", "-otxt", "-of", "/dev/null"], { encoding: "utf8" }, function(e, s, st) { cb({ ok: !e, text: (s || st || "").trim().replace(/\s+/g, " "), error: (st || e.message || "falha").trim() }); }); }

function sendCmd(agent, cmd, cb) { var body = JSON.stringify({ session: "voice-" + Date.now(), account: "voice-user" }); var options = { host: "127.0.0.1", port: PORT, path: "/api/mod/inbox", method: "POST", headers: { "Content-Type": "application/json", accept: "application/json" }, body: body }; var req = http.request(options, function(res) { var data = ""; res.on("data", function(chunk) { data += chunk; }); res.on("end", function() { var parsed = JSON.parse(data); cb({ ok: true, messages: parsed.messages ? parsed.messages.length : 0 }); }); req.on("error", function(e) { cb({ ok: false, error: "Habblaud error: " + e.message }); }); req.write(body); req.end(); }); }

function captureResp(timeoutMs, cb) { var start = Date.now(); var end = timeoutMs || 10000; function check() { if (Date.now() - start >= end) { cb(null); return; } setTimeout(function() { check(); }, 1500); } check(); var options = { host: "127.0.0.1", port: PORT, path: "/api/mod/inbox", method: "POST", headers: { "Content-Type": "application/json", accept: "application/json" }, body: JSON.stringify({ session: "voice-" + Date.now(), account: "voice-user" }) }; var req = http.request(options, function(res) { var data = ""; res.on("data", function(chunk) { data += chunk; }); res.on("end", function() { var parsed = JSON.parse(data); cb(null, parsed.messages ? parsed.messages.length : null); }); } check(); var req = http.request(options); }
