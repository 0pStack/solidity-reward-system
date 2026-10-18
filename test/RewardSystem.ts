import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const RewardType = { Vip: 0, Ticket: 1, Hoodie: 2 } as const;
const COST = { Vip: 100n, Ticket: 50n, Hoodie: 25n } as const;
const MAX_UINT128 = 2n ** 128n - 1n;

describe("RewardSystem", function () {
    async function deployRewardSystemFixture() {
        const [admin, user, medlem1, medlem2] = await ethers.getSigners();
        const rewardSystem = await ethers.deployContract("RewardSystem", [admin.address]);

        return { rewardSystem, admin, user, medlem1, medlem2 };
    }

    async function twoMembersFixture() {
        const fixture = await deployRewardSystemFixture();
        await fixture.rewardSystem.connect(fixture.medlem1).join();
        await fixture.rewardSystem.connect(fixture.medlem2).join();
        return fixture;
    }

    describe("Deployment", function () {
        it("should set the initial owner and reward costs", async () => {
            const { rewardSystem, admin } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            expect(await rewardSystem.owner()).to.equal(admin.address);
            expect(await rewardSystem.rewardCost(RewardType.Vip)).to.equal(COST.Vip);
            expect(await rewardSystem.rewardCost(RewardType.Ticket)).to.equal(COST.Ticket);
            expect(await rewardSystem.rewardCost(RewardType.Hoodie)).to.equal(COST.Hoodie);
            expect(await rewardSystem.redemptionCount()).to.equal(0);
        });

        it("should allow a different initial owner than the deployer", async () => {
            const [, , , , multisig] = await ethers.getSigners();
            const rewardSystem = await ethers.deployContract("RewardSystem", [multisig.address]);

            expect(await rewardSystem.owner()).to.equal(multisig.address);
        });

        it("should revert when the initial owner is the zero address", async () => {
            const factory = await ethers.getContractFactory("RewardSystem");

            await expect(ethers.deployContract("RewardSystem", [ethers.ZeroAddress]))
                .to.be.revertedWithCustomError(factory, "OwnableInvalidOwner")
                .withArgs(ethers.ZeroAddress);
        });
    });

    describe("join", function () {
        it("should allow a user to join as a member", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(rewardSystem.connect(medlem1).join())
                .to.emit(rewardSystem, "MemberJoined")
                .withArgs(medlem1.address);

            expect(await rewardSystem.isMember(medlem1.address)).to.equal(true);
            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(0);
        });

        it("should revert if user joins twice", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await rewardSystem.connect(medlem1).join();
            await expect(rewardSystem.connect(medlem1).join())
                .to.be.revertedWithCustomError(rewardSystem, "AlreadyMember")
                .withArgs(medlem1.address);
        });

        it("should report non-members as not members", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            expect(await rewardSystem.isMember(medlem1.address)).to.equal(false);
        });
    });

    describe("grantPoints", function () {
        it("should revert when a non-owner calls", async () => {
            const { rewardSystem, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(user).grantPoints(medlem1.address, 10))
                .to.be.revertedWithCustomError(rewardSystem, "OwnableUnauthorizedAccount")
                .withArgs(user.address);
        });

        it("should not let a member grant points to themselves", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(medlem1).grantPoints(medlem1.address, 1_000_000))
                .to.be.revertedWithCustomError(rewardSystem, "OwnableUnauthorizedAccount")
                .withArgs(medlem1.address);
        });

        it("should revert NotMember when 'to' is not a member", async () => {
            const { rewardSystem, admin, user } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(rewardSystem.connect(admin).grantPoints(user.address, 10))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember")
                .withArgs(user.address);
        });

        it("should revert InvalidAmount when amount is 0", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(admin).grantPoints(medlem1.address, 0)).to.be.revertedWithCustomError(
                rewardSystem,
                "InvalidAmount",
            );
        });

        it("should increase member points and emit PointsGranted", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(admin).grantPoints(medlem1.address, 25))
                .to.emit(rewardSystem, "PointsGranted")
                .withArgs(admin.address, medlem1.address, 25);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(25);
        });

        it("should add on top of an existing balance", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 10);
            await rewardSystem.connect(admin).grantPoints(medlem1.address, 25);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(35);
        });

        it("should revert on overflow", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, MAX_UINT128);
            await expect(rewardSystem.connect(admin).grantPoints(medlem1.address, 1)).to.be.revertedWithPanic(0x11);
        });
    });

    describe("self-minting is removed", function () {
        it("should revert when calling the old earnPoints(uint256)", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);
            const data = new ethers.Interface(["function earnPoints(uint256)"]).encodeFunctionData(
                "earnPoints",
                [1_000_000],
            );

            await expect(
                medlem1.sendTransaction({ to: await rewardSystem.getAddress(), data }),
            ).to.be.revertedWithoutReason(ethers);
            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(0);
        });
    });

    describe("revokePoints", function () {
        it("should revert when a non-owner calls", async () => {
            const { rewardSystem, admin, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 10);
            await expect(rewardSystem.connect(medlem2).revokePoints(medlem1.address, 10))
                .to.be.revertedWithCustomError(rewardSystem, "OwnableUnauthorizedAccount")
                .withArgs(medlem2.address);
        });

        it("should revert NotMember when 'from' is not a member", async () => {
            const { rewardSystem, admin, user } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(admin).revokePoints(user.address, 1))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember")
                .withArgs(user.address);
        });

        it("should revert InvalidAmount when amount is 0", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(admin).revokePoints(medlem1.address, 0)).to.be.revertedWithCustomError(
                rewardSystem,
                "InvalidAmount",
            );
        });

        it("should revert when revoking more than the balance", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 10);
            await expect(rewardSystem.connect(admin).revokePoints(medlem1.address, 11))
                .to.be.revertedWithCustomError(rewardSystem, "InsufficientPoints")
                .withArgs(10, 11);
        });

        it("should decrease points and emit PointsRevoked", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 40);
            await expect(rewardSystem.connect(admin).revokePoints(medlem1.address, 15))
                .to.emit(rewardSystem, "PointsRevoked")
                .withArgs(admin.address, medlem1.address, 15);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(25);
        });

        it("should allow revoking the exact full balance", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 40);
            await rewardSystem.connect(admin).revokePoints(medlem1.address, 40);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(0);
            expect(await rewardSystem.isMember(medlem1.address)).to.equal(true);
        });
    });

    describe("transferPoints", function () {
        it("should revert NotMember when caller is not a member", async () => {
            const { rewardSystem, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(user).transferPoints(medlem1.address, 1))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember")
                .withArgs(user.address);
        });

        it("should revert SelfTransfer when sending to self", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(
                rewardSystem.connect(medlem1).transferPoints(medlem1.address, 1),
            ).to.be.revertedWithCustomError(rewardSystem, "SelfTransfer");
        });

        it("should revert NotMember when receiver is not a member", async () => {
            const { rewardSystem, admin, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 10);
            await expect(rewardSystem.connect(medlem1).transferPoints(user.address, 1))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember")
                .withArgs(user.address);
        });

        it("should revert InvalidAmount when amount is 0", async () => {
            const { rewardSystem, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(
                rewardSystem.connect(medlem1).transferPoints(medlem2.address, 0),
            ).to.be.revertedWithCustomError(rewardSystem, "InvalidAmount");
        });

        it("should revert if insufficient points", async () => {
            const { rewardSystem, admin, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 5);
            await expect(rewardSystem.connect(medlem1).transferPoints(medlem2.address, 10))
                .to.be.revertedWithCustomError(rewardSystem, "InsufficientPoints")
                .withArgs(5, 10);
        });

        it("should transfer points and emit PointsTransferred", async () => {
            const { rewardSystem, admin, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 100);
            await expect(rewardSystem.connect(medlem1).transferPoints(medlem2.address, 30))
                .to.emit(rewardSystem, "PointsTransferred")
                .withArgs(medlem1.address, medlem2.address, 30);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(70);
            expect(await rewardSystem.pointsOf(medlem2.address)).to.equal(30);
        });

        it("should allow transferring the exact full balance", async () => {
            const { rewardSystem, admin, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 30);
            await rewardSystem.connect(medlem1).transferPoints(medlem2.address, 30);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(0);
            expect(await rewardSystem.pointsOf(medlem2.address)).to.equal(30);
        });
    });

    describe("redeem", function () {
        it("should revert if caller is not a member", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(rewardSystem.connect(medlem1).redeem(RewardType.Vip))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember")
                .withArgs(medlem1.address);
        });

        it("should revert if insufficient points", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 20);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.Vip))
                .to.be.revertedWithCustomError(rewardSystem, "InsufficientPoints")
                .withArgs(20, COST.Vip);
        });

        it("should revert one point below the cost", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, COST.Ticket - 1n);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.Ticket))
                .to.be.revertedWithCustomError(rewardSystem, "InsufficientPoints")
                .withArgs(COST.Ticket - 1n, COST.Ticket);
        });

        it("should revert without reason for an unknown reward", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, COST.Vip);
            await expect(rewardSystem.connect(medlem1).redeem(3)).to.be.revertedWithoutReason(ethers);
        });

        it("should redeem Vip and emit RewardRedeemed with redemption id 1", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 150);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.Vip))
                .to.emit(rewardSystem, "RewardRedeemed")
                .withArgs(1, medlem1.address, RewardType.Vip, COST.Vip);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(50);
            expect(await rewardSystem.redemptionCount()).to.equal(1);
        });

        it("should give identical redemptions distinct ids", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, COST.Hoodie * 2n);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.Hoodie))
                .to.emit(rewardSystem, "RewardRedeemed")
                .withArgs(1, medlem1.address, RewardType.Hoodie, COST.Hoodie);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.Hoodie))
                .to.emit(rewardSystem, "RewardRedeemed")
                .withArgs(2, medlem1.address, RewardType.Hoodie, COST.Hoodie);
        });

        it("should redeem Ticket with the exact balance", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, COST.Ticket);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.Ticket))
                .to.emit(rewardSystem, "RewardRedeemed")
                .withArgs(1, medlem1.address, RewardType.Ticket, COST.Ticket);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(0);
        });

        it("should redeem Hoodie and decrease correct points", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, 30);
            await rewardSystem.connect(medlem1).redeem(RewardType.Hoodie);

            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(5);
        });

        it("should not touch other members' balances", async () => {
            const { rewardSystem, admin, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).grantPoints(medlem1.address, COST.Vip);
            await rewardSystem.connect(admin).grantPoints(medlem2.address, 10);
            await rewardSystem.connect(medlem1).redeem(RewardType.Vip);

            expect(await rewardSystem.pointsOf(medlem2.address)).to.equal(10);
        });
    });

    describe("ownership", function () {
        it("should transfer ownership in two steps", async () => {
            const { rewardSystem, admin, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).transferOwnership(user.address);
            expect(await rewardSystem.owner()).to.equal(admin.address);
            expect(await rewardSystem.pendingOwner()).to.equal(user.address);

            await rewardSystem.connect(user).acceptOwnership();
            expect(await rewardSystem.owner()).to.equal(user.address);

            await expect(rewardSystem.connect(admin).grantPoints(medlem1.address, 1))
                .to.be.revertedWithCustomError(rewardSystem, "OwnableUnauthorizedAccount")
                .withArgs(admin.address);
            await rewardSystem.connect(user).grantPoints(medlem1.address, 1);
            expect(await rewardSystem.pointsOf(medlem1.address)).to.equal(1);
        });

        it("should only let the pending owner accept", async () => {
            const { rewardSystem, admin, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(admin).transferOwnership(user.address);
            await expect(rewardSystem.connect(medlem1).acceptOwnership())
                .to.be.revertedWithCustomError(rewardSystem, "OwnableUnauthorizedAccount")
                .withArgs(medlem1.address);
        });

        it("should not allow renouncing ownership", async () => {
            const { rewardSystem, admin } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            // renounceOwnership is `pure`, so ethers would only eth_call it; send a real transaction instead.
            const data = rewardSystem.interface.encodeFunctionData("renounceOwnership");
            await expect(
                admin.sendTransaction({ to: await rewardSystem.getAddress(), data }),
            ).to.be.revertedWithCustomError(rewardSystem, "RenounceDisabled");
            expect(await rewardSystem.owner()).to.equal(admin.address);
        });
    });

    describe("ETH and unknown calls", function () {
        it("should revert when sending ETH directly", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(
                medlem1.sendTransaction({ to: await rewardSystem.getAddress(), value: ethers.parseEther("0.001") }),
            ).to.be.revertedWithoutReason(ethers);
        });

        it("should revert when calling a non-existing function", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(
                medlem1.sendTransaction({ to: await rewardSystem.getAddress(), data: "0x12345678" }),
            ).to.be.revertedWithoutReason(ethers);
        });
    });
});
