<p align="center">
  <img src="assets/tema.png" alt="voz-agente: fale com seus agentes pelo nome, sem teclado" width="100%">
</p>

# voz-agente

Fale com um agente do [Habblaud](https://github.com/marmottajr/habblaud) **pelo nome que o Habblaud deu a ele** — sem teclado.

O Habblaud é o escritório que mostra, em tempo real, o que os seus agentes estão fazendo. Este projeto é a boca e o
ouvido desse escritório: transcreve a fala localmente, descobre qual agente você chamou pelo **nome real** que aparece
na tela, entrega a mensagem na sessão certa e narra a resposta em voz.

```
você fala  →  STT local  →  resolve o nome  →  POST /api/messages  →  TTS
```

Nada sai da máquina: transcrição e síntese são locais, e o único destino da mensagem é o Habblaud em `127.0.0.1`.

## Começando

### Termux (Android) — o alvo original

```bash
pkg install nodejs termux-api            # CLI do Termux:API
# o app Android "Termux:API" precisa estar instalado e com Microfone permitido

git clone https://github.com/marduktheking-dev/voz-agente.git
cd voz-agente
node bin/voz-agente.mjs --listar          # quem está no escritório agora
node bin/voz-agente.mjs                   # ouve, envia e responde em voz
```

### Desktop (Linux/macOS) — só texto/áudio

```bash
node bin/voz-agente.mjs --texto "Francisco, rode os testes"   # envia de verdade
node bin/voz-agente.mjs --audio fala.wav                      # transcreve e envia
```

## Formatos de fala

| você diz | o que acontece |
|---|---|
| `agente Francisco, rode os testes` | agente `Francisco`, comando `rode os testes` |
| `Francisco, rode os testes` | idem (nome curto) |
| `open, agente Francisco, ...` | a palavra de ativação `open` é descartada |

O nome é comparado sem acento, sem caixa e por aproximação (`/api/snapshot` → campo `name`). Se o Habblaud deu ao
agente o nome de uma pessoa, é esse nome que você fala — não o id da sessão.

## Opções

| flag | efeito |
|---|---|
| `--listar` | lista `nome · status · tipo · conta · id` dos agentes |
| `--texto "..."` | usa o texto em vez de ouvir (teste e uso no desktop) |
| `--audio arquivo.wav` | transcreve o arquivo com o whisper local |
| `--nome N` / `--msg T` | separa o destinatário do comando sem vírgula na fala |
| `--dry-run` | resolve o agente e mostra o comando; **não envia** |
| `--sem-tts` | não fala a resposta |
| `--help` | ajuda |

## Variáveis de ambiente

| variável | padrão | para quê |
|---|---|---|
| `HABBLAUD_URL` | `http://127.0.0.1:4747` | onde o Habblaud está |
| `VOZ_TIMEOUT_MS` | `45000` | quanto esperar por atividade do agente |
| `VOZ_REC_SEC` | `7` | duração da gravação no modo whisper |
| `HABBLAUD_WHISPER_BIN` | procura `whisper-cli` no PATH | binário do whisper.cpp |
| `HABBLAUD_WHISPER_MODEL` | `~/.local/share/whisper/ggml-base.bin` | modelo do whisper |

## Como funciona

1. **Ouvir** — `termux-speech-to-text` (diálogo de voz do Android, sem teclado) → fallback: grava
   `VOZ_REC_SEC` segundos e transcreve com `whisper-cli` local → `--audio`/`--texto` no desktop.
2. **Resolver** — `GET /api/snapshot`, normaliza e pontua os nomes; sem correspondência, lista os candidatos em vez de
   chutar.
3. **Entregar** — `POST /api/messages {agentId, text}`; o Habblaud roda `opencode run --session <id>` com o texto na
   entrada padrão (o modelo da sessão não é trocado e nenhuma permissão é aprovada sozinha).
4. **Responder** — acompanha o snapshot até a atividade do agente e fala o resultado com `termux-tts-speak` (Android)
   ou `espeak -v pt --stdout | play` (Termux desktop).

Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Requisitos

- Node.js ≥ 22.12 (usa `fetch` global)
- Habblaud rodando e alcançável em `HABBLAUD_URL` (padrão `http://127.0.0.1:4747`)
- Para ouvir no Android: app **Termux:API** da **mesma origem/assinatura** do app Termux + permissão de **Microfone**
- Para ouvir sem Android: `whisper-cli` + modelo `ggml-base.bin` (~142 MB)
- Para falar: `termux-tts-speak` ou `espeak` + `play` (sox)

## Problemas conhecidos (todos medidos)

Estão em [docs/SOLUCAO-DE-PROBLEMAS.md](docs/SOLUCAO-DE-PROBLEMAS.md), com causa e correção:

- instalador do Termux:API encerra ao tocar “Instalar” → assinatura diferente do app Termux;
- `--listar` vazio ou “agente desconhecido” → Habblaud sem sessão aberta ou CLI do OpenCode fora do PATH;
- o pacote `termux-api` some depois de um `pkg upgrade` → reinstalar;
- `ffmpeg` quebra com `libplacebo.so.NNN` após instalar libs → `pkg upgrade`;
- ditado do navegador transcreve mas não envia → é assim que o Habblaud funciona (o envio é manual).

## Licença

MIT — ver [LICENSE](LICENSE).
