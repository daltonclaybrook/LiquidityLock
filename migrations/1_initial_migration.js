const LiquidityLock = artifacts.require("LiquidityLock");
const PositionManager = artifacts.require("MockNonfungiblePositionManager");
const MockToken = artifacts.require("MockToken");

module.exports = async function (deployer, network, accounts) {
    if (network === "development") {
        await deployer.deploy(PositionManager, "1000000"); // 1 million tokens
        const manager = await PositionManager.deployed();
        const wethToken = await manager.mockWETHToken();
        web3.eth.sendTransaction({ to:wethToken, from:accounts[0], value: "1000000" });
    }

    await deployer.deploy(LiquidityLock);
};
