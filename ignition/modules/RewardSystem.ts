import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RewardSystemModule", (m) => {
  const initialOwner = m.getParameter<string>("initialOwner");
  const rewardSystem = m.contract("RewardSystem", [initialOwner]);

  return { rewardSystem };
});
