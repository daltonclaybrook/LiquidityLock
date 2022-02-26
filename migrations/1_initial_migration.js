const LiquidityLock = artifacts.require("LiquidityLock");
const PositionManager = artifacts.require("MockNonfungiblePositionManager");

module.exports = async function (deployer, network) {
    if (network === "test") {
        await deployer.deploy(PositionManager, "1000000"); // 1 million tokens
    }

    await deployer.deploy(LiquidityLock);
};
