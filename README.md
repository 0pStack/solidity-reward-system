# Reward System — Hardhat

![Solidity](https://img.shields.io/badge/-Solidity-363636?logo=solidity&logoColor=white)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Ethereum](https://img.shields.io/badge/-Ethereum-3C3C3D?logo=ethereum&logoColor=white)
![Hardhat](https://img.shields.io/badge/-Hardhat-FFF100?logo=hardhat&logoColor=black)
[![Stars](https://img.shields.io/github/stars/0pStack/solidity-reward-system?style=flat)](https://github.com/0pStack/solidity-reward-system/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/0pStack/solidity-reward-system)](https://github.com/0pStack/solidity-reward-system/commits/main)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

A membership and loyalty-points smart contract built with **Hardhat 3**. It is tested with Mocha + ethers v6 in TypeScript and with Solidity fuzz tests.

## The contract

[`contracts/RewardSystem.sol`](./contracts/RewardSystem.sol) (Solidity `0.8.31`, OpenZeppelin `Ownable2Step`)

| Function                     | Who    | What it does                                                                                                    |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `join()`                     | anyone | Registers the caller as a member with 0 points.                                                                 |
| `grantPoints(to, amount)`    | owner  | Adds `amount` points to member `to`. This is the only way points are created.                                   |
| `transferPoints(to, amount)` | member | Moves points to another member.                                                                                 |
| `redeem(reward)`             | member | Spends points on a reward and emits `RewardRedeemed` with a unique `redemptionId`.                              |
| `pointsOf(account)`          | view   | Points held by `account`.                                                                                       |
| `isMember(account)`          | view   | Whether `account` has joined.                                                                                   |
| `rewardCost(reward)`         | view   | Points needed for `reward`.                                                                                     |
| `transferOwnership(next)`    | owner  | Step 1 of handing over ownership; `next` must then call `acceptOwnership()`. `renounceOwnership()` is disabled. |

| `RewardType` | Value | Cost |
| ------------ | ----- | ---- |
| `Vip`        | 0     | 100  |
| `Ticket`     | 1     | 50   |
| `Hoodie`     | 2     | 25   |

The owner is set at deployment and should be a multisig in production. Failures use custom errors: `NotMember(account)`, `AlreadyMember(account)`, `InvalidAmount`, `InsufficientPoints(have, need)`, `SelfTransfer`, `RenounceDisabled`, and OpenZeppelin's `OwnableUnauthorizedAccount`. The contract has no payable functions, so ETH sent to it is rejected.

### Off-chain fulfilment

Listen for `RewardRedeemed` events from this contract's address only, and deduplicate on `redemptionId`. Act on an event only after enough confirmations for the chain you deploy on.

## Tech stack

- **Solidity** `0.8.31` with **OpenZeppelin Contracts** v5
- **Hardhat 3** with **TypeScript**
- **Mocha + Chai** with `hardhat-ethers-chai-matchers`
- **forge-std** for Solidity fuzz tests
- **ethers.js v6**
- **Hardhat Ignition** for deployment
- **Prettier** (`prettier-plugin-solidity`) and **solhint**

## Getting started

Requires [Node.js](https://nodejs.org/) 20+.

```shell
git clone https://github.com/0pStack/solidity-reward-system.git
cd solidity-reward-system
npm install
npm test               # Solidity fuzz tests + Mocha tests
npm run coverage
npm run lint           # solhint
npm run format:check   # prettier
```

## Deployment

The owner must be passed explicitly, so a live deployment can't silently end up owned by the deployer's own wallet. Create a parameters file. On a live network, the owner should be a multisig:

```json
{ "RewardSystemModule": { "initialOwner": "0xYourOwnerAddress" } }
```

Local simulated chain:

```shell
npx hardhat ignition deploy ignition/modules/RewardSystem.ts --parameters params.json
```

Sepolia (requires a funded account). Store secrets with the `hardhat-keystore` plugin:

```shell
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy --network sepolia ignition/modules/RewardSystem.ts --parameters params.json
```

> Never commit private keys.

## Project structure

```
.
├── contracts/RewardSystem.sol
├── ignition/modules/RewardSystem.ts
├── test/RewardSystem.ts      # Mocha + ethers tests
├── test/RewardSystem.t.sol   # Solidity fuzz tests
├── .prettierrc.json / .solhint.json
├── hardhat.config.ts
├── tsconfig.json
└── package.json
```

## License

MIT
