# Estação: como a voz entra no boot

O `voz-agente` é um comando, não um serviço. O que precisa sobreviver a um reinício é o **Habblaud** e as dependências
de voz. Este documento registra o que a estação faz e como conferir.

## O script de inicialização

Arquivo da estação (fora deste repositório porque sobe a estação inteira, não só a voz):

```
~/ia-estacao/iniciar-estacao.sh
```

O que ele garante, na ordem:

1. `opencode-termux` presente (senão para com erro claro).
2. `SVDIR` calculado a partir de `$PREFIX/var/service` (não de caminho relativo), e `sv up habblaud` com espera de até
   15 s pelo `curl /` — só considera pronto o que responde.
3. Reparos **não fatais** de voz:
   - relinka `whisper-cli` em `$PREFIX/bin` se o build existir em `~/whisper.cpp-build`;
   - reinstala o pacote CLI `termux-api` se `termux-speech-to-text` sumiu (pós-`pkg upgrade`);
   - informa qual caminho de voz está ativo (whisper local, Termux:API, ou nenhum).
4. Abre o escritório no navegador.
5. Inicia o OpenCode — com guarda: se já estiver dentro de uma sessão (`OPENCODE`, `OPENCODE_SESSION`), apenas confirma
   “estação pronta” em vez de `exec`, para não substituir o shell.

## Ambiente do serviço

`/data/data/com.termux/files/usr/var/service/habblaud/run` exporta:

| variável | valor | para quê |
|---|---|---|
| `HABBLAUD_PTY` | `1` | terminal/novo agente pelo navegador |
| `HABBLAUD_WORLD_OPENCODE_ADAPTER` | `codex` | remapeia `opencode`→`codex` só no fio do World enquanto o contrato público não aceita `opencode` (opt-in, reversível) |
| `HABBLAUD_WHISPER_BIN` | `$PREFIX/bin/whisper-cli` | ditado do Habblaud sem depender do PATH |
| `HABBLAUD_WHISPER_MODEL` | `~/.local/share/whisper/ggml-base.bin` | modelo do ditado |

Mudou o arquivo? `sv restart habblaud`.

## Rotina de verificação

```bash
sv status habblaud
curl -s http://127.0.0.1:4747/api/world/status | head -c 200
curl -s http://127.0.0.1:4747/api/dictation
node ~/ia-estacao/voz-agente/bin/voz-agente.mjs --listar
ffmpeg -version | head -1
```

Esperado: serviço `run`, `connected:true` + `lastAck.ok:true`, `{"available":true}`, ao menos um agente listado com o
nome que a tela mostra, e `ffmpeg` respondendo.

## Caminhos antigos preservados

Os atalhos usados antes deste repositório continuam válidos por symlink:

```
~/ia-estacao/projetos/voz-agente.mjs  →  ~/ia-estacao/voz-agente/bin/voz-agente.mjs
~/ia-estacao/projetos/voz-agente      →  idem
~/ia-estacao/projetos/voz             →  ~/ia-estacao/voz-agente/voz
~/ia-estacao/projetos/VOZ-AGENTE.md   →  ~/ia-estacao/voz-agente/README.md
```
