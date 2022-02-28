const LiquidityLock = artifacts.require("LiquidityLock");
const PositionManager = artifacts.require("MockNonfungiblePositionManager");
const MockToken = artifacts.require("MockToken");

const {
    BN,           // Big Number support
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

contract("LiquidityLock", (accounts) => {
    it("has correct name and symbol", async () => {
        const lock = await LiquidityLock.deployed();

        const name = await lock.name();
        const symbol = await lock.symbol();
        assert.equal(name, "Uniswap V3 Liquidity Lock");
        assert.equal(symbol, "UV3LL");
    });

    describe("mock setup", () => {
        it("has deployed mock contract", async () => {
            const manager = await PositionManager.deployed();
            const name = await manager.name();
            assert.equal(name, "MockPositionManager");
        });

        it("deploys two unique mock tokens", async () => {
            const manager = await PositionManager.deployed();
            const token0 = await MockToken.at(await manager.token0());
            const token1 = await MockToken.at(await manager.token1());

            assert.notEqual(token0.address, token1.address);
            assert.equal(token0.address.length, 42);
            assert.equal(token1.address.length, 42);

            assert.equal(await token0.name(), "Mock Token 0");
            assert.equal(await token1.name(), "Mock Token 1");
            assert.equal(await token0.symbol(), "MT0");
            assert.equal(await token1.symbol(), "MT1");
        });

        it("mints one million of each mock token to manager", async () => {
            const manager = await PositionManager.deployed();
            const token0 = await MockToken.at(await manager.token0());
            const token1 = await MockToken.at(await manager.token1());

            const balance0 = await token0.balanceOf(manager.address);
            const balance1 = await token1.balanceOf(manager.address);
            assert.equal(balance0.toString(), "1000000");
            assert.equal(balance1.toString(), "1000000");
        });

        it("successfully creates a mock position", async () => {
            const manager = await PositionManager.deployed();
            const owner = await manager.ownerOf(1); // token ID 1
            const positions = await manager.positions(1);
            assert.equal(owner, accounts[0]);
            // 7th tuple field is `liquidity`
            assert.equal(positions[7].toString(), "1000000");
        });
    });

    describe("token transfer", () => {
        it("fails if data field is empty", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            await expectRevert.unspecified(
                manager.safeTransferFrom(accounts[0], lock.address, 1, "0x")
            )
        });

        it("fails if timestamps are in the past", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            const encodedTimestamps = web3.eth.abi.encodeParameters(
                ['uint256', 'uint256'],
                [1577836800, 1580515200] // 1/1/2020 -> 2/1/2020
            );

            await expectRevert.unspecified(
                manager.safeTransferFrom(accounts[0], lock.address, 1, encodedTimestamps)
            )
        });

        it("accepts the transfer on valid params", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            const receipt = await transferInitialToken(manager, lock, accounts);
            // transfer uniswap token from account 0 to lock
            expectEvent(receipt, 'Transfer', {
                from: accounts[0],
                to: lock.address,
                tokenId: new BN(1)
            });
            // mint new lock token and give to account 0
            expectEvent(receipt, 'Transfer', {
                from: "0x0000000000000000000000000000000000000000",
                to: accounts[0],
                tokenId: new BN(1)
            });

            const uniTokenOwner = await manager.ownerOf(1); // token ID 1
            const lockTokenOwner = await lock.ownerOf(1); // token ID 1
            assert.equal(uniTokenOwner, lock.address);
            assert.equal(lockTokenOwner, accounts[0]);
        });
    });

    describe("available liquidity", () => {
        it("reverts if token does not exist", async () => {
            const manager = await PositionManager.new('1000000');
            const lock = await LiquidityLock.new();
            await expectRevert(
                lock.availableLiquidity(1),
                'Invalid token ID'
            )
        });

        it("returns zero initially", async () => {
            const manager = await PositionManager.new('1000000');
            const lock = await LiquidityLock.new();
            await transferInitialToken(manager, lock, accounts);
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity, 0);
        });
    });
});

// Helper functions

async function transferInitialToken(manager, lock, accounts) {
    const encodedTimestamps = web3.eth.abi.encodeParameters(
        ['uint256', 'uint256'],
        [4102444800, 4118083200] // 1/1/2100 -> 7/1/2100
    );
    return await manager.safeTransferFrom(accounts[0], lock.address, 1, encodedTimestamps);
}
