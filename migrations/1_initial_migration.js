const LiquidityLock = artifacts.require("LiquidityLock");
const PositionManager = artifacts.require("MockNonfungiblePositionManager");
const MockToken = artifacts.require("MockToken");

module.exports = async function (deployer, network, accounts) {
    if (network === "development") {
        await deployer.deploy(PositionManager, "1000000"); // 1 million tokens
        const manager = await PositionManager.deployed();
        const token0 = await manager.token0();
        web3.eth.sendTransaction({ to:token0, from:accounts[0], value: "1000000" });
    }

    await deployer.deploy(LiquidityLock);
};
