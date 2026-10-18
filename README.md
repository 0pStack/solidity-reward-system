# Reward System — Hardhat

![Solidity](https://img.shields.io/badge/-Solidity-363636?logo=solidity&logoColor=white)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Ethereum](https://img.shields.io/badge/-Ethereum-3C3C3D?logo=ethereum&logoColor=white)
![Hardhat](https://img.shields.io/badge/-Hardhat-FFF100?logo=hardhat&logoColor=black)
[![Stars](https://img.shields.io/github/stars/0pStack/solidity-practice-hardhat?style=flat)](https://github.com/0pStack/solidity-practice-hardhat/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/0pStack/solidity-practice-hardhat)](https://github.com/0pStack/solidity-practice-hardhat/commits/main)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

A membership and loyalty-points smart contract built with **Hardhat 3**, tested with **Mocha + ethers v6** in TypeScript.

## The contract

[`contracts/RewardSystem.sol`](./contracts/RewardSystem.sol) (Solidity `0.8.31`)

| Function | Who | What it does |
| --- | --- | --- |
| `join()` | anyone | Registers the caller as a member with 0 points. Reverts `AlreadyMember` on a second call. |
| `earnPoints(amount)` | member | Adds `amount` points to the caller. |
| `grantPoints(to, amount)` | admin | Adds `amount` points to member `to`. |
| `transferPoints(to, amount)` | member | Moves points to another member. Reverts `SelfTransfer` / `InsufficientPoints`. |
| `redeem(reward)` | member | Spends points on a reward and emits `RewardRedeemed`. |
| `isMember(user)` | view | Whether `user` has joined. |

Reward costs are set in the constructor:

| `RewardType` | Value | Cost |
| --- | --- | --- |
| `VIP` | 0 | 100 |
| `TICKETS` | 1 | 50 |
| `HOODIES` | 2 | 25 |

The deployer becomes the immutable `admin`. Failures use custom errors (`NotAdmin`, `NotMember`, `AlreadyMember`, `InvalidAmount`, `InsufficientPoints`, `SelfTransfer`), and the contract rejects any ETH sent to it.

## Tech stack

- **Solidity** `0.8.31`
- **Hardhat 3** with **TypeScript**
- **Mocha + Chai** with `hardhat-ethers-chai-matchers`
- **ethers.js v6**
- **Hardhat Ignition** for deployment

## Getting started

Requires [Node.js](https://nodejs.org/) 20+.

```shell
git clone https://github.com/0pStack/solidity-practice-hardhat.git
cd solidity-practice-hardhat
npm install
npx hardhat compile
npx hardhat test
```

## Deployment

Local simulated chain:

```shell
npx hardhat ignition deploy ignition/modules/RewardSystem.ts
```

Sepolia (requires a funded account). Store secrets with the `hardhat-keystore` plugin:

```shell
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy --network sepolia ignition/modules/RewardSystem.ts
```

> Never commit private keys.

## Project structure

```
.
├── contracts/RewardSystem.sol
├── ignition/modules/RewardSystem.ts
├── test/RewardSystem.ts
├── hardhat.config.ts
├── tsconfig.json
└── package.json
```

## License

MIT
