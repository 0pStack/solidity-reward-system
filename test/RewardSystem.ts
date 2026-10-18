import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const RewardType = { VIP: 0, TICKETS: 1, HOODIES: 2 } as const;
const COST = { VIP: 100, TICKETS: 50, HOODIES: 25 } as const;

describe("RewardSystem", function () {
    async function deployRewardSystemFixture() {
        const [admin, user, medlem1, medlem2] = await ethers.getSigners();
        const rewardSystem = await ethers.deployContract("RewardSystem");

        return { rewardSystem, admin, user, medlem1, medlem2 };
    }

    async function twoMembersFixture() {
        const fixture = await deployRewardSystemFixture();
        await fixture.rewardSystem.connect(fixture.medlem1).join();
        await fixture.rewardSystem.connect(fixture.medlem2).join();
        return fixture;
    }

    describe("Deployment", function () {
        it("should set the deployer as admin and reward costs", async () => {
            const { rewardSystem, admin } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            expect(await rewardSystem.admin()).to.equal(admin.address);
            expect(await rewardSystem.rewardCost(RewardType.VIP)).to.equal(COST.VIP);
            expect(await rewardSystem.rewardCost(RewardType.TICKETS)).to.equal(COST.TICKETS);
            expect(await rewardSystem.rewardCost(RewardType.HOODIES)).to.equal(COST.HOODIES);
        });
    });

    describe("join", function () {
        it("should allow a user to join as a member", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(rewardSystem.connect(medlem1).join())
                .to.emit(rewardSystem, "MemberJoined")
                .withArgs(medlem1.address);

            const member = await rewardSystem.members(medlem1.address);
            expect(member.exists).to.equal(true);
            expect(member.points).to.equal(0);
            expect(await rewardSystem.isMember(medlem1.address)).to.equal(true);
        });

        it("should revert if user joins twice", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await rewardSystem.connect(medlem1).join();
            await expect(rewardSystem.connect(medlem1).join())
                .to.be.revertedWithCustomError(rewardSystem, "AlreadyMember");
        });

        it("should report non-members as not members", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            expect(await rewardSystem.isMember(medlem1.address)).to.equal(false);
        });
    });

    describe("earnPoints", function () {
        it("should revert if caller is not a member", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(rewardSystem.connect(medlem1).earnPoints(10))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember");
        });

        it("should revert if amount is 0", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(medlem1).earnPoints(0))
                .to.be.revertedWithCustomError(rewardSystem, "InvalidAmount");
        });

        it("should add points and emit PointsEarned", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(medlem1).earnPoints(40))
                .to.emit(rewardSystem, "PointsEarned")
                .withArgs(medlem1.address, 40);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(40);
        });

        it("should accumulate points across calls", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(15);
            await rewardSystem.connect(medlem1).earnPoints(25);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(40);
        });

        it("should revert on overflow", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(ethers.MaxUint256);
            await expect(rewardSystem.connect(medlem1).earnPoints(1))
                .to.be.revertedWithPanic(0x11);
        });
    });

    describe("grantPoints", function () {
        it("should revert NotAdmin when non-admin calls", async () => {
            const { rewardSystem, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(user).grantPoints(medlem1.address, 10))
                .to.be.revertedWithCustomError(rewardSystem, "NotAdmin");
        });

        it("should revert NotMember when 'to' is not a member", async () => {
            const { rewardSystem, admin, user } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(rewardSystem.connect(admin).grantPoints(user.address, 10))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember");
        });

        it("should revert InvalidAmount when amount is 0", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(admin).grantPoints(medlem1.address, 0))
                .to.be.revertedWithCustomError(rewardSystem, "InvalidAmount");
        });

        it("should increase member points and emit PointsGranted", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(admin).grantPoints(medlem1.address, 25))
                .to.emit(rewardSystem, "PointsGranted")
                .withArgs(admin.address, medlem1.address, 25);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(25);
        });

        it("should add on top of an existing balance", async () => {
            const { rewardSystem, admin, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(10);
            await rewardSystem.connect(admin).grantPoints(medlem1.address, 25);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(35);
        });
    });

    describe("transferPoints", function () {
        it("should revert NotMember when caller is not a member", async () => {
            const { rewardSystem, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(user).transferPoints(medlem1.address, 1))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember");
        });

        it("should revert SelfTransfer when sending to self", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(medlem1).transferPoints(medlem1.address, 1))
                .to.be.revertedWithCustomError(rewardSystem, "SelfTransfer");
        });

        it("should revert NotMember when receiver is not a member", async () => {
            const { rewardSystem, user, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(10);
            await expect(rewardSystem.connect(medlem1).transferPoints(user.address, 1))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember");
        });

        it("should revert InvalidAmount when amount is 0", async () => {
            const { rewardSystem, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await expect(rewardSystem.connect(medlem1).transferPoints(medlem2.address, 0))
                .to.be.revertedWithCustomError(rewardSystem, "InvalidAmount");
        });

        it("should revert if insufficient points", async () => {
            const { rewardSystem, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(5);
            await expect(rewardSystem.connect(medlem1).transferPoints(medlem2.address, 10))
                .to.be.revertedWithCustomError(rewardSystem, "InsufficientPoints")
                .withArgs(5, 10);
        });

        it("should transfer points and emit PointsTransferred", async () => {
            const { rewardSystem, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(100);
            await expect(rewardSystem.connect(medlem1).transferPoints(medlem2.address, 30))
                .to.emit(rewardSystem, "PointsTransferred")
                .withArgs(medlem1.address, medlem2.address, 30);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(70);
            expect((await rewardSystem.members(medlem2.address)).points).to.equal(30);
        });

        it("should allow transferring the exact full balance", async () => {
            const { rewardSystem, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(30);
            await rewardSystem.connect(medlem1).transferPoints(medlem2.address, 30);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(0);
            expect((await rewardSystem.members(medlem2.address)).points).to.equal(30);
        });
    });

    describe("redeem", function () {
        it("should revert if caller is not a member", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(rewardSystem.connect(medlem1).redeem(RewardType.VIP))
                .to.be.revertedWithCustomError(rewardSystem, "NotMember");
        });

        it("should revert if insufficient points", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(20);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.VIP))
                .to.be.revertedWithCustomError(rewardSystem, "InsufficientPoints")
                .withArgs(20, COST.VIP);
        });

        it("should revert one point below the cost", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(COST.TICKETS - 1);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.TICKETS))
                .to.be.revertedWithCustomError(rewardSystem, "InsufficientPoints")
                .withArgs(COST.TICKETS - 1, COST.TICKETS);
        });

        it("should revert without reason for an unknown reward", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(COST.VIP);
            await expect(rewardSystem.connect(medlem1).redeem(3)).to.be.revertedWithoutReason(ethers);
        });

        it("should redeem VIP and emit RewardRedeemed", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(150);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.VIP))
                .to.emit(rewardSystem, "RewardRedeemed")
                .withArgs(medlem1.address, RewardType.VIP, COST.VIP);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(50);
        });

        it("should redeem TICKETS with the exact balance", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(COST.TICKETS);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.TICKETS))
                .to.emit(rewardSystem, "RewardRedeemed")
                .withArgs(medlem1.address, RewardType.TICKETS, COST.TICKETS);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(0);
        });

        it("should redeem HOODIES and decrease correct points", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(30);
            await expect(rewardSystem.connect(medlem1).redeem(RewardType.HOODIES))
                .to.emit(rewardSystem, "RewardRedeemed")
                .withArgs(medlem1.address, RewardType.HOODIES, COST.HOODIES);

            expect((await rewardSystem.members(medlem1.address)).points).to.equal(5);
        });

        it("should not touch other members' balances", async () => {
            const { rewardSystem, medlem1, medlem2 } = await networkHelpers.loadFixture(twoMembersFixture);

            await rewardSystem.connect(medlem1).earnPoints(COST.VIP);
            await rewardSystem.connect(medlem2).earnPoints(10);
            await rewardSystem.connect(medlem1).redeem(RewardType.VIP);

            expect((await rewardSystem.members(medlem2.address)).points).to.equal(10);
        });
    });

    describe("receive / fallback", function () {
        it("should revert when sending ETH directly", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(
                medlem1.sendTransaction({
                    to: await rewardSystem.getAddress(),
                    value: ethers.parseEther("0.001"),
                }),
            ).to.be.revertedWith("No ETH accepted");
        });

        it("should revert when calling a non-existing function", async () => {
            const { rewardSystem, medlem1 } = await networkHelpers.loadFixture(deployRewardSystemFixture);

            await expect(
                medlem1.sendTransaction({
                    to: await rewardSystem.getAddress(),
                    data: "0x12345678",
                }),
            ).to.be.revertedWith("Invalid Call");
        });
    });
});
