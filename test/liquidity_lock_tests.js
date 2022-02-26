const LiquidityLock = artifacts.require("LiquidityLock");
const PositionManager = artifacts.require("MockNonfungiblePositionManager");

contract("LiquidityLock", (/* accounts */) => {
    it("has correct name and symbol", async () => {
        const lock = await LiquidityLock.deployed();

        const name = await lock.name();
        const symbol = await lock.symbol();
        assert.equal(name, "Uniswap V3 Liquidity Lock");
        assert.equal(symbol, "UV3LL");
    });

    it("has deployed mock contract", async () => {
        const manager = await PositionManager.deployed();
        const name = await manager.name();
        assert.equal(name, "MockPositionManager");
    });
});
