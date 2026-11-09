# Solução de problemas

Todos os casos abaixo foram observados em Termux/Android 13 (aarch64), com o Habblaud em `127.0.0.1:4747`.

## O instalador do Termux:API encerra ao tocar “Instalar”

**Sintoma** — o APK abre, você toca em “Instalar” e a tela fecha sem instalar; ou o F-Droid acusa conflito com pacote
existente.

**Causa** — assinatura. Add-ons do Termux precisam ser assinados com a mesma chave do app principal. Um Termux
instalado da release do GitHub (`TERMUX_APP__APK_RELEASE=GITHUB`) não aceita o Termux:API do F-Droid, e vice-versa.
APKs `+github.debug` usam a chave de debug e também não casam.

**Como conferir**

```bash
termux-info | grep APK_RELEASE      # GITHUB, F-DROID, ...
cmd package list packages | grep termux
```

**Correção** — instalar o Termux:API da **mesma origem** do Termux. Trocar de origem exige desinstalar o Termux e todos
os add-ons (perde o ambiente) — não é o caminho recomendado.

**Alternativa sem o app** — o ditado do Habblaud no navegador (`POST /api/dictation`) e o modo `--audio`/`--texto`
deste projeto funcionam sem Termux:API.

## `termux-api: command not found` depois de um `pkg upgrade`

**Sintoma** — os binários `termux-speech-to-text`, `termux-microphone-record`, `termux-tts-speak` desaparecem.

**Causa** — o pacote CLI `termux-api` foi removido durante a atualização de pacotes.

**Correção**

```bash
pkg install -y termux-api
termux-microphone-record -i          # deve responder {"isRecording": false}
termux-tts-engines                    # deve listar o motor padrão
```

O script de inicialização da estação reinstala esse pacote sozinho quando ele falta.

## `ffmpeg` quebra com `libplacebo.so.NNN not found`

**Sintoma** — `CANNOT LINK EXECUTABLE "ffmpeg": library "libplacebo.so.387" not found`, e o `dpkg` fica com pacote
“not fully installed”.

**Causa** — instalar bibliotecas de áudio (`espeak`, `sox`) puxou uma versão de `libavfilter` mais nova que o
`libplacebo` instalado. É desalinhamento de dependências, não corrupção.

**Correção**

```bash
pkg upgrade -y          # realinha libplacebo/ffmpeg (pode demorar: ~500 MB)
ffmpeg -version | head -1
```

`dpkg --configure -a` e `apt --fix-broken install` **não** resolvem sozinhos nesse caso — a mensagem do próprio Termux
aponta para `pkg upgrade`.

## O ditado do navegador transcreve mas não envia

**Comportamento esperado.** O botão de microfone do Habblaud grava, manda para `POST /api/dictation`, recebe o texto e
**insere no campo de mensagem**. O envio é manual (Enter/botão). `GET /api/dictation` responder `{"available":true}`
significa apenas que o whisper local está pronto.

## “Não achei agente …” / lista vazia

**Causas medidas**

1. nenhuma sessão aberta no OpenCode — o snapshot vem vazio e não há a quem entregar;
2. agentes do OpenCode com o CLI fora do PATH de quem roda o Habblaud — o log do serviço mostra
   `Mensagens ao OpenCode: sem o binário …`;
3. o Habblaud foi iniciado com um PATH que aponta para um CLI falso (`.../tmp/fakebin/opencode-termux`), e a mensagem
   fica `queued` para sempre ou volta `failed`.

**Conferir**

```bash
node bin/voz-agente.mjs --listar
curl -s http://127.0.0.1:4747/api/snapshot | head -c 300
grep 'Mensagens ao OpenCode' ~/ia-estacao/habblaud.log | tail -1
tr '\0' '\n' < /proc/$(pgrep -f 'server/index.ts' | head -1)/environ | grep '^PATH='
```

A linha correta do log aponta para o binário real (`/data/data/com.termux/files/usr/bin/opencode-termux run --session`).

## Mensagem `delivered`, mas o agente “não respondeu”

`delivered` confirma que a mensagem entrou na fila da sessão — não que o modelo já produziu texto. Verifique o turno na
tela do OpenCode; a narração deste script só captura o que o Habblaud reportar como atividade dentro de
`VOZ_TIMEOUT_MS`.

## Whisper: “whisper-cli/modelo indisponível”

```bash
command -v whisper-cli
ls -lh ~/.local/share/whisper/ggml-base.bin     # ~142 MB
```

Sem binário: compile o whisper.cpp e linke em `$PREFIX/bin/whisper-cli`. Sem modelo:

```bash
mkdir -p ~/.local/share/whisper
curl -L -o ~/.local/share/whisper/ggml-base.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

Ou aponte com `HABBLAUD_WHISPER_BIN` / `HABBLAUD_WHISPER_MODEL`.

## Nome ambíguo

Dois agentes com nomes parecidos e mesma pontuação. O script recusa em vez de chutar e lista até três candidatos.
Fale o nome completo ou use `--nome`.
