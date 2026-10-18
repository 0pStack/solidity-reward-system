import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RewardSystemModule", (m) => {
  const rewardSystem = m.contract("RewardSystem");

  return { rewardSystem };
});
