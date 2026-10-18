// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;
// solhint-disable func-name-mixedcase

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RewardSystem} from "../contracts/RewardSystem.sol";

contract RewardSystemFuzzTest is Test {
    RewardSystem internal rewards;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    function setUp() public {
        rewards = new RewardSystem(address(this));
        vm.prank(ALICE);
        rewards.join();
        vm.prank(BOB);
        rewards.join();
    }

    /// @dev Binds each price to the reward's name. Fails when RewardType gains a value, as a reminder to give
    /// it a cost in rewardCost and a row here.
    function test_RewardCostsArePinnedByName() public view {
        assertEq(rewards.rewardCost(RewardSystem.RewardType.Vip), 100);
        assertEq(rewards.rewardCost(RewardSystem.RewardType.Ticket), 50);
        assertEq(rewards.rewardCost(RewardSystem.RewardType.Hoodie), 25);
        assertEq(uint256(type(RewardSystem.RewardType).max), uint256(RewardSystem.RewardType.Hoodie));
    }

    function testFuzz_TransferConservesTotal(uint128 aliceStart, uint128 bobStart, uint128 amount) public {
        aliceStart = uint128(bound(aliceStart, 1, type(uint64).max));
        bobStart = uint128(bound(bobStart, 1, type(uint64).max));
        amount = uint128(bound(amount, 1, aliceStart));
        rewards.grantPoints(ALICE, aliceStart);
        rewards.grantPoints(BOB, bobStart);

        vm.prank(ALICE);
        rewards.transferPoints(BOB, amount);

        assertEq(rewards.pointsOf(ALICE) + rewards.pointsOf(BOB), uint256(aliceStart) + bobStart);
        assertEq(rewards.pointsOf(ALICE), aliceStart - amount);
    }

    function testFuzz_TransferAboveBalanceReverts(uint128 balance, uint128 amount) public {
        balance = uint128(bound(balance, 1, type(uint128).max - 1));
        amount = uint128(bound(amount, uint256(balance) + 1, type(uint128).max));
        rewards.grantPoints(ALICE, balance);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(RewardSystem.InsufficientPoints.selector, balance, amount));
        rewards.transferPoints(BOB, amount);
    }

    function testFuzz_RedeemDeductsExactCost(uint8 rawReward, uint128 balance) public {
        RewardSystem.RewardType reward = RewardSystem.RewardType(bound(rawReward, 0, 2));
        uint256 cost = rewards.rewardCost(reward);
        balance = uint128(bound(balance, cost, type(uint128).max));
        rewards.grantPoints(ALICE, balance);

        vm.prank(ALICE);
        rewards.redeem(reward);

        assertEq(rewards.pointsOf(ALICE), balance - cost);
        assertEq(rewards.pointsOf(BOB), 0);
        assertEq(rewards.redemptionCount(), 1);
    }

    function testFuzz_OnlyOwnerCanGrant(address caller, uint128 amount) public {
        vm.assume(caller != address(this));
        amount = uint128(bound(amount, 1, type(uint128).max));

        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        rewards.grantPoints(ALICE, amount);
    }

    function testFuzz_RevokeDeductsExactAmount(uint128 balance, uint128 amount) public {
        balance = uint128(bound(balance, 1, type(uint128).max));
        amount = uint128(bound(amount, 1, balance));
        rewards.grantPoints(ALICE, balance);

        rewards.revokePoints(ALICE, amount);

        assertEq(rewards.pointsOf(ALICE), balance - amount);
    }

    function testFuzz_RevokeAboveBalanceReverts(uint128 balance, uint128 amount) public {
        balance = uint128(bound(balance, 1, type(uint128).max - 1));
        amount = uint128(bound(amount, uint256(balance) + 1, type(uint128).max));
        rewards.grantPoints(ALICE, balance);

        vm.expectRevert(abi.encodeWithSelector(RewardSystem.InsufficientPoints.selector, balance, amount));
        rewards.revokePoints(ALICE, amount);
    }

    function testFuzz_OnlyOwnerCanRevoke(address caller) public {
        vm.assume(caller != address(this));
        rewards.grantPoints(ALICE, 10);

        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        rewards.revokePoints(ALICE, 1);
    }
}
