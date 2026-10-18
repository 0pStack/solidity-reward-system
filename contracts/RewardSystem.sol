// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title RewardSystem
/// @notice Membership and loyalty points. The owner grants points; members transfer them or redeem them for rewards.
contract RewardSystem is Ownable2Step {
    /// @notice Rewards that points can be redeemed for.
    enum RewardType {
        Vip,
        Ticket,
        Hoodie
    }

    struct Member {
        uint128 points;
        bool exists;
    }

    uint128 private constant VIP_COST = 100;
    uint128 private constant TICKET_COST = 50;
    uint128 private constant HOODIE_COST = 25;

    /// @notice Number of redemptions so far. Each redemption's id is the count after it.
    uint256 public redemptionCount;

    mapping(address account => Member) private _members;

    /// @notice `account` has not joined.
    error NotMember(address account);
    /// @notice `account` has already joined.
    error AlreadyMember(address account);
    /// @notice The amount must be greater than zero.
    error InvalidAmount();
    /// @notice The balance `have` is below the required `need`.
    error InsufficientPoints(uint256 have, uint256 need);
    /// @notice Members cannot transfer points to themselves.
    error SelfTransfer();
    /// @notice Renouncing would leave nobody able to grant points.
    error RenounceDisabled();
    /// @notice `reward` has no cost configured.
    error UnknownReward(RewardType reward);

    event MemberJoined(address indexed member);
    event PointsGranted(address indexed admin, address indexed member, uint256 amount);
    event PointsTransferred(address indexed from, address indexed to, uint256 amount);
    /// @dev `redemptionId` is unique per redemption, so off-chain fulfilment can deduplicate on it.
    event RewardRedeemed(uint256 indexed redemptionId, address indexed member, RewardType indexed reward, uint256 cost);

    /// @param initialOwner Account allowed to grant points. Use a multisig in production.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Register the caller as a member with zero points.
    function join() external {
        Member storage member = _members[msg.sender];
        if (member.exists) revert AlreadyMember(msg.sender);

        member.exists = true;
        emit MemberJoined(msg.sender);
    }

    /// @notice Credit `amount` points to member `to`. The only way points are created.
    /// @param to Member receiving the points.
    /// @param amount Points to add; must be non-zero.
    function grantPoints(address to, uint128 amount) external onlyOwner {
        Member storage member = _members[to];
        if (!member.exists) revert NotMember(to);
        if (amount == 0) revert InvalidAmount();

        member.points += amount;
        emit PointsGranted(msg.sender, to, amount);
    }

    /// @notice Move `amount` of the caller's points to another member.
    /// @param to Member receiving the points; cannot be the caller.
    /// @param amount Points to move; must be non-zero and at most the caller's balance.
    function transferPoints(address to, uint128 amount) external {
        Member storage sender = _members[msg.sender];
        if (!sender.exists) revert NotMember(msg.sender);
        if (to == msg.sender) revert SelfTransfer();
        Member storage receiver = _members[to];
        if (!receiver.exists) revert NotMember(to);
        if (amount == 0) revert InvalidAmount();

        uint128 balance = sender.points;
        if (balance < amount) revert InsufficientPoints(balance, amount);

        unchecked {
            sender.points = balance - amount;
        }
        receiver.points += amount;
        emit PointsTransferred(msg.sender, to, amount);
    }

    /// @notice Spend the caller's points on `reward`.
    /// @param reward Reward to redeem; its cost comes from `rewardCost`.
    function redeem(RewardType reward) external {
        Member storage member = _members[msg.sender];
        if (!member.exists) revert NotMember(msg.sender);

        uint128 cost = rewardCost(reward);
        uint128 balance = member.points;
        if (balance < cost) revert InsufficientPoints(balance, cost);

        unchecked {
            member.points = balance - cost;
        }
        uint256 redemptionId = ++redemptionCount;
        emit RewardRedeemed(redemptionId, msg.sender, reward, cost);
    }

    /// @notice Ownership can only be handed over, never dropped.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @notice Whether `account` has joined.
    function isMember(address account) external view returns (bool) {
        return _members[account].exists;
    }

    /// @notice Points held by `account`.
    function pointsOf(address account) external view returns (uint256) {
        return _members[account].points;
    }

    /// @notice Points needed to redeem `reward`.
    function rewardCost(RewardType reward) public pure returns (uint128) {
        if (reward == RewardType.Vip) return VIP_COST;
        if (reward == RewardType.Ticket) return TICKET_COST;
        if (reward == RewardType.Hoodie) return HOODIE_COST;
        // Unreachable for today's enum; makes a newly added RewardType fail loudly instead of costing HOODIE_COST.
        revert UnknownReward(reward);
    }
}
