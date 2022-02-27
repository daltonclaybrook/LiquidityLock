const LiquidityLock = artifacts.require("LiquidityLock");
const PositionManager = artifacts.require("MockNonfungiblePositionManager");
const MockToken = artifacts.require("MockToken");
const BN = web3.utils.BN;
const truffleAssert = require('truffle-assertions');

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
            assert.equal(owner, accounts[0]);
        });
    });

    describe("token transfer", () => {
        it("fails if data field is empty", async () => {
            const manager = await PositionManager.deployed();
        });
    });
});
