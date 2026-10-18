// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase, one-contract-per-file
pragma solidity 0.8.31;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Test} from "forge-std/Test.sol";
import {RewardSystem} from "../contracts/RewardSystem.sol";

/// @dev Drives random sequences of calls and tracks the expected totals alongside the contract.
/// Only needs `vm` and `bound`, so it skips the full Test base to stay under the code-size limit.
contract RewardSystemHandler is CommonBase, StdUtils {
    uint256 private constant MAX_GRANT = 1e30;

    RewardSystem internal immutable REWARDS;
    address internal immutable OWNER;
    address[] internal actors;

    uint256 public expectedTotal;
    uint256 public expectedRedemptions;

    constructor(RewardSystem rewards_, address owner_, address[] memory actors_) {
        REWARDS = rewards_;
        OWNER = owner_;
        actors = actors_;
    }

    function grant(uint256 actorSeed, uint256 amount) external {
        address member = _actor(actorSeed);
        amount = bound(amount, 1, MAX_GRANT);

        vm.prank(OWNER);
        REWARDS.grantPoints(member, uint128(amount));
        expectedTotal += amount;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        uint256 balance = REWARDS.pointsOf(from);
        if (from == to || balance == 0) return;
        amount = bound(amount, 1, balance);

        vm.prank(from);
        REWARDS.transferPoints(to, uint128(amount));
    }

    function redeem(uint256 actorSeed, uint256 rewardSeed) external {
        address member = _actor(actorSeed);
        RewardSystem.RewardType reward = RewardSystem.RewardType(bound(rewardSeed, 0, 2));
        uint256 cost = REWARDS.rewardCost(reward);
        if (REWARDS.pointsOf(member) < cost) return;

        vm.prank(member);
        REWARDS.redeem(reward);
        expectedTotal -= cost;
        ++expectedRedemptions;
    }

    function revoke(uint256 actorSeed, uint256 amount) external {
        address member = _actor(actorSeed);
        uint256 balance = REWARDS.pointsOf(member);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);

        vm.prank(OWNER);
        REWARDS.revokePoints(member, uint128(amount));
        expectedTotal -= amount;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 index) external view returns (address) {
        return actors[index];
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }
}

contract RewardSystemInvariantTest is Test {
    RewardSystem internal rewards;
    RewardSystemHandler internal handler;

    function setUp() public {
        rewards = new RewardSystem(address(this));

        address[] memory actors = new address[](3);
        actors[0] = address(0xA11CE);
        actors[1] = address(0xB0B);
        actors[2] = address(0xCAFE);
        for (uint256 i = 0; i < actors.length; ++i) {
            vm.prank(actors[i]);
            rewards.join();
        }

        handler = new RewardSystemHandler(rewards, address(this), actors);
        targetContract(address(handler));
    }

    function invariant_BalancesSumToExpectedTotal() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            sum += rewards.pointsOf(handler.actorAt(i));
        }
        assertEq(sum, handler.expectedTotal());
    }

    function invariant_RedemptionCountMatches() public view {
        assertEq(rewards.redemptionCount(), handler.expectedRedemptions());
    }

    function invariant_OwnerNeverChanges() public view {
        assertEq(rewards.owner(), address(this));
    }
}
