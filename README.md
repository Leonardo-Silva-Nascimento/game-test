# Crash Game

Implementação full-stack de um Crash Game multiplayer em tempo real para o desafio técnico da Jungle Gaming.

> O enunciado original do desafio está em [CHALLENGE.md](./CHALLENGE.md).

---

## Visão Geral da Arquitetura

```
┌──────────────────────────┐
│        Frontend           │  Vite + React + TailwindCSS v4
│     localhost:3000        │  TanStack Query · Zustand · Socket.io
└─────┬──────────┬──────────┘
   HTTP/REST   WebSocket (direto :4001)
      │              │
┌─────▼──────────────▼──────┐
│           Kong             │  API Gateway DB-less
│        localhost:8000      │  /games/* → :4001  /wallets/* → :4002
└─────┬──────────────────────┘
      │
┌─────┴──────────┐   ┌──────────────────┐
│  Games Service │   │  Wallets Service  │
│   NestJS :4001 │   │   NestJS :4002    │
│                │   │                   │
│ TypeORM + PG   │   │  TypeORM + PG     │
│ WebSocket GW   │   │  RMQ Consumer     │
└───────┬────────┘   └────────┬──────────┘
        │    RabbitMQ RPC      │
        └─────────────────────┘
             wallet.debit
             wallet.credit

┌─────────────────┐   ┌──────────────┐   ┌──────────────┐
│    Keycloak      │   │  PostgreSQL  │   │   RabbitMQ   │
│  OIDC / PKCE    │   │  games DB    │   │  wallet.rpc  │
│   :8080          │   │  wallets DB  │   │  :5672/:15672│
└─────────────────┘   └──────────────┘   └──────────────┘
```

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| [Bun](https://bun.sh) | 1.x |
| [Docker](https://docs.docker.com/get-docker/) + Compose | 24.x |

---

## Setup rápido (primeira vez)

```bash
git clone <repo-url>
cd fullstack-challenge

# 1. Instalar Bun (se não tiver)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc   # ou ~/.zshrc

# 2. Instalar dependências
bun install

# 3. Copiar variáveis de ambiente
cp services/games/.env.example services/games/.env
cp services/wallets/.env.example services/wallets/.env

# 4. Subir tudo
bun run docker:up
```

Aguarde todos os serviços ficarem `healthy` — o Keycloak leva ~60-90 segundos na primeira vez.

---

## Comandos disponíveis

```bash
bun run docker:up      # Sobe toda a stack (infra + serviços + frontend)
bun run docker:down    # Para os containers
bun run docker:prune   # Remove tudo (volumes, imagens) — reseta o estado
```

---

## Testes

### Unitários (sem Docker, rodam localmente)

```bash
# Games service — 17 testes
cd services/games && bun test tests/unit

# Wallets service — 9 testes
cd services/wallets && bun test tests/unit
```

Cobertura:
- `provably-fair.test.ts` — geração de seed, hash chain, cálculo e verificação do crash point, house edge
- `round.test.ts` — transições de estado do Round, cálculo de payout, invariantes de aposta, aritmética BigInt
- `wallet.test.ts` — crédito/débito, saldo insuficiente, precisão monetária, overflow BigInt

### E2E (requer `docker:up` rodando)

```bash
cd services/games && bun test tests/e2e
```

---

## URLs e acessos

| Serviço | URL | Credenciais |
|---|---|---|
| **Frontend** | http://localhost:3000 | player / player123 |
| **Keycloak Admin** | http://localhost:8080 | admin / admin |
| **Swagger Games** | http://localhost:4001/docs | — |
| **Swagger Wallets** | http://localhost:4002/docs | — |
| **RabbitMQ UI** | http://localhost:15672 | admin / admin |
| **Kong Admin** | http://localhost:8001 | — |

---

## Testando a API com curl

```bash
# Obter token JWT
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/crash-game/protocol/openid-connect/token \
  -d "grant_type=password&client_id=crash-game-client&username=player&password=player123" \
  | jq -r .access_token)

# Ver rodada atual
curl http://localhost:8000/games/rounds/current | jq

# Criar carteira (saldo inicial: $1000.00)
curl -X POST http://localhost:8000/wallets \
  -H "Authorization: Bearer $TOKEN" | jq

# Ver saldo
curl http://localhost:8000/wallets/me \
  -H "Authorization: Bearer $TOKEN" | jq

# Fazer aposta de $10.00
curl -X POST http://localhost:8000/games/bet \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 10}' | jq

# Cash out
curl -X POST http://localhost:8000/games/bet/cashout \
  -H "Authorization: Bearer $TOKEN" | jq

# Histórico de rodadas
curl "http://localhost:8000/games/rounds/history?limit=5" | jq

# Verificar provably fair de uma rodada
curl http://localhost:8000/games/rounds/<roundId>/verify | jq
```

---

## Decisões de arquitetura

### Dinheiro — sem ponto flutuante

Todos os valores monetários são armazenados como `BIGINT` em centavos no banco de dados. A conversão ocorre apenas nas bordas (entrada da API e resposta JSON):

```
$10.50 → 1050n (BigInt) → banco → 1050n → $10.50
```

### Provably Fair

Cada rodada usa um algoritmo HMAC-SHA256 verificável:

1. **Antes das apostas:** `serverSeedHash = SHA256(serverSeed)` é publicado — prova que o resultado não pode ser alterado após as apostas
2. **Crash point:** `gameHash = HMAC-SHA256(serverSeed, clientSeed)` → formula Bustabit com 1% de house edge
3. **Após o crash:** `serverSeed` e `gameHash` são revelados — qualquer jogador pode verificar via `GET /games/rounds/:id/verify`

### Comunicação entre serviços

Games e Wallets se comunicam via **RabbitMQ RPC** (padrão request/reply):

```
Games → [wallet.rpc] wallet.debit  → Wallets → { success: true }
Games → [wallet.rpc] wallet.credit → Wallets → { success: true }
```

O debit usa `SELECT FOR UPDATE` (lock pessimista) para garantir que o saldo nunca fica negativo em cenário de requisições concorrentes.

### WebSocket (tempo real)

O Games Service expõe um gateway Socket.io. Eventos emitidos:

| Evento | Quando | Payload |
|---|---|---|
| `round:betting` | Nova fase de apostas | `roundId, serverSeedHash, clientSeed, bettingEndsAt` |
| `round:started` | Rodada iniciou | `roundId, startedAt` |
| `round:multiplier` | A cada 100ms | `multiplier, elapsed` |
| `round:crashed` | Crash | `roundId, crashPoint, serverSeed, gameHash` |
| `bet:placed` | Nova aposta | `betId, playerId, playerName, amount` |
| `bet:cashedout` | Cash out | `betId, playerId, multiplier, payout` |

### Ciclo de vida da rodada

```
BETTING (10s) ──► RUNNING ──► CRASHED ──► BETTING (3s depois) ...
```

O multiplicador cresce como `floor(100 * e^(0.00006 * elapsedMs)) / 100`:
- 5s ≈ 1.35x · 10s ≈ 1.82x · 30s ≈ 6.05x · 60s ≈ 36.6x

### Autenticação

Ambos os serviços validam JWTs do Keycloak via JWKS (`RS256`). O guard faz cache do JWKS com limite de 10 req/min para evitar sobrecarga no IdP.

---

## Estrutura do projeto

```
fullstack-challenge/
├── services/
│   ├── games/                    # Game engine service (porta 4001)
│   │   └── src/
│   │       ├── domain/           # Round, Bet enums; Provably Fair algorithm
│   │       ├── application/      # GameService, RoundLifecycleManager
│   │       ├── infrastructure/   # TypeORM entities, JWT strategy, RMQ client
│   │       └── presentation/     # GamesController, GameGateway (WebSocket)
│   └── wallets/                  # Wallet service (porta 4002)
│       └── src/
│           ├── application/      # WalletService (debit/credit with DB lock)
│           ├── infrastructure/   # TypeORM entities, JWT strategy, RMQ consumer
│           └── presentation/     # WalletsController
├── frontend/                     # React SPA (porta 3000)
│   └── src/
│       ├── components/           # CrashGraph, BetControls, BetsList, RoundHistory
│       ├── hooks/                # useGameSocket (Socket.io events)
│       ├── lib/                  # api.ts (axios), keycloak.ts, socket.ts
│       ├── pages/                # LoginPage, GamePage
│       └── stores/               # auth.store.ts (Zustand), game.store.ts (Zustand)
├── docker/
│   ├── keycloak/realm-export.json   # Realm crash-game importado automaticamente
│   ├── kong/kong.yml                # Rotas declarativas + suporte WebSocket
│   └── postgres/init-databases.sh  # Cria DBs games e wallets
├── docker-compose.yml
├── CHALLENGE.md                  # Enunciado original do desafio
└── README.md
```

---

## Trade-offs

| Decisão | Escolha | Alternativa considerada |
|---|---|---|
| ORM | TypeORM com `synchronize: true` | Prisma (melhor type-safety), migrations manuais (mais seguro em prod) |
| Precisão monetária | `BIGINT` centavos | `NUMERIC(19,4)` no banco — BigInt JS evita o cast |
| RabbitMQ | RPC síncrono (request/reply) | Saga assíncrona com compensação — mais resiliente, mais complexo |
| WebSocket | Socket.io direto na porta 4001 | Via Kong com upgrade WebSocket — Kong 3.x suporta, mas adiciona latência |
| Autenticação | Keycloak JWKS (online validation) | Cache local de public key — menos requests ao IdP |
