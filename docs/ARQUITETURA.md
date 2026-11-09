# Arquitetura

O `voz-agente` é uma ponte curta entre a fala e o contrato HTTP do Habblaud. Não tem servidor, banco nem estado: cada
execução é um turno completo (ouvir → resolver → entregar → narrar).

```
┌──────────────┐   wav/texto   ┌────────────────┐   {name,id}   ┌─────────────────┐
│ STT          │ ────────────► │ resolução do    │ ────────────► │ POST            │
│ termux-speech│               │ nome            │               │ /api/messages   │
│ whisper-cli  │               │ /api/snapshot   │               │ {agentId,text}  │
└──────────────┘               └────────────────┘               └────────┬────────┘
                                                                         │ 201 queued
┌──────────────┐    texto      ┌────────────────┐    polling            │
│ TTS          │ ◄──────────── │ atividade       │ ◄─────────────────────┘
│ termux-tts | │               │ /api/snapshot   │   (até VOZ_TIMEOUT_MS)
│ espeak|play  │               └────────────────┘
└──────────────┘
```

## Etapas

### 1. Ouvir

Ordem de preferência, decidida em tempo de execução por disponibilidade:

1. `--texto "..."` — sem STT (teste e desktop).
2. `--audio arquivo.wav` — `whisper-cli -m <modelo> -f <wav> -l auto -nt -np`.
3. `termux-speech-to-text` — abre o reconhecimento do Android; devolve texto sem teclado.
4. gravação própria — `termux-microphone-record` (16 kHz, 16-bit, mono) ou `rec` (sox) e, em seguida, whisper local.

Timestamps do whisper (`[00:00.000 --> ...]`) são removidos da saída; o que sobra é o texto puro.

### 2. Resolver o nome

`GET /api/snapshot` devolve `agents[]` com `name` (o nome que o Habblaud deu), `id` (`provider:ses_...`), `status`,
`kind`, `account`.

A comparação normaliza NFD, remove acentos, pontuação e caixa, e pontua:

| condição | pontos |
|---|---|
| igual | 100 |
| prefixo de um pelo outro | 90 |
| contido no outro | 80 |
| mesmo conjunto de palavras | 50 + 10 por palavra |

Empate abaixo de 100 é recusado como **ambíguo** com até três candidatos — melhor perguntar do que entregar ao agente
errado. Nenhuma correspondência devolve a lista de nomes disponíveis.

### 3. Entregar

`POST /api/messages` com `{agentId, text}`. O Habblaud enfileira (`queued`) e entrega na sessão do agente rodando
`opencode run --session <id>` com o texto na **entrada padrão** — não como argumento: um texto começando com `-` seria
lido como opção do CLI. O modelo da sessão nunca é trocado e nenhuma permissão é aprovada automaticamente.

Estados observados na resposta e em `GET /api/messages/:id`:

| estado | significado |
|---|---|
| `queued` | aceito, aguardando a sessão |
| `sent` | a sessão buscou |
| `delivered` | confirmado pelo plugin da sessão |
| `failed` | não buscou/não confirmou dentro do prazo, ou a sessão mudou |

### 4. Narrar

Depois do envio, o script consulta `/api/snapshot` a cada 1,5 s e junta as atividades `recent` do agente com
`at >= envio`. A primeira atividade textual é falada (até 500 caracteres). Sem texto dentro de `VOZ_TIMEOUT_MS`, fala
“Entregue. Sem resposta capturada ainda.” — a entrega continua válida.

TTS: `termux-tts-speak` quando existe; senão `espeak -v pt --stdout | play -q -t wav -` (sox), que toca de fato em vez
de só gerar arquivo.

## Por que não usar o banco do OpenCode

O Habblaud já resolve a parte difícil: a sessão viva, o provider, o nome do personagem e o contrato de mensagens. Ler
`opencode.db` daria dados mais velhos e acoplaria o script ao formato interno. O único acoplamento aqui é HTTP local.

## Limites

- Uma mensagem por execução; sem fila própria.
- A “resposta” é a atividade que o Habblaud reporta, não o texto completo do turno do modelo.
- O nome precisa existir no snapshot: agente que saiu do escritório não é encontrado.
- `--listar` mostra `name · status · kind · account · id`; o `account` é a conta do provider (`opencode`, `claude`,
  `codex`).
