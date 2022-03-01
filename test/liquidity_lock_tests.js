const LiquidityLock = artifacts.require("LiquidityLock");
const PositionManager = artifacts.require("MockNonfungiblePositionManager");
const MockToken = artifacts.require("MockToken");

const {
    BN,           // Big Number support
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
    time
} = require('@openzeppelin/test-helpers');

contract("LiquidityLock", (accounts) => {
    before(async () => {
        const latest = parseInt(await time.latest());
        const tenDays = 864000;
        this.startTime = latest + tenDays;
        this.endTime = this.startTime + tenDays;
    });

    it("has correct name and symbol", async () => {
        const lock = await LiquidityLock.deployed();

        const name = await lock.name();
        const symbol = await lock.symbol();
        assert.equal(name, "Uniswap V3 Liquidity Lock");
        assert.equal(symbol, "UV3LL");
    });

    contract("mock setup", (accounts) => {
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
            const owner = await manager.ownerOf(123); // token ID 1
            const positions = await manager.positions(123);
            assert.equal(owner, accounts[0]);
            // 7th tuple field is `liquidity`
            assert.equal(positions[7].toString(), "1000000");
        });
    });

    contract("token transfer", (accounts) => {
        it("fails if data field is empty", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            await expectRevert(
                manager.safeTransferFrom(accounts[0], lock.address, 123, "0x"),
                'Invalid data field. Must contain two timestamps.'
            )
        });

        it("fails if timestamps are in the past", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            const encodedTimestamps = web3.eth.abi.encodeParameters(
                ['uint256', 'uint256'],
                [1577836800, 1580515200] // 1/1/2020 -> 2/1/2020
            );

            await expectRevert(
                manager.safeTransferFrom(accounts[0], lock.address, 123, encodedTimestamps),
                'Invalid timestamps'
            )
        });

        it("accepts the transfer on valid params", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            const receipt = await transferInitialToken.bind(this)(manager, lock, accounts);
            // transfer uniswap token from account 0 to lock
            expectEvent(receipt, 'Transfer', {
                from: accounts[0],
                to: lock.address,
                tokenId: new BN(123)
            });
            // mint new lock token and give to account 0
            expectEvent(receipt, 'Transfer', {
                from: "0x0000000000000000000000000000000000000000",
                to: accounts[0],
                tokenId: new BN(1)
            });

            const uniTokenOwner = await manager.ownerOf(123); // token ID 123
            const lockTokenOwner = await lock.ownerOf(1); // token ID 1
            assert.equal(uniTokenOwner, lock.address);
            assert.equal(lockTokenOwner, accounts[0]);
        });
    });

    contract("available liquidity", (accounts) => {
        before(async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken.bind(this)(manager, lock, accounts);
        });

        it("reverts if token does not exist", async () => {
            const manager = await PositionManager.new('1000000');
            const lock = await LiquidityLock.new();
            await expectRevert(
                lock.availableLiquidity(1),
                'Invalid token ID'
            )
        });

        it("returns zero initially", async () => {
            const lock = await LiquidityLock.deployed();
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), "0");
        });

        it("returns one quarter liquidity after one quarter of time has passed", async () => {
            const lock = await LiquidityLock.deployed();
            // 1/4 between the two dates
            await advanceTimeByPercentOfStart.bind(this)(0.25);
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), "250000");
        });

        it("returns 90% liquidity after 90% of time has passed", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            // 90% between the two dates
            await advanceTimeByPercentOfStart.bind(this)(0.9);
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), "900000");
        });

        it("returns 100% liquidity after 150% of time has passed", async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            // 150% between the two dates
            await advanceTimeByPercentOfStart.bind(this)(1.5);
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), "1000000");
        });
    });

    contract("collect liquidity", (accounts) => {
        before(async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken.bind(this)(manager, lock, accounts);
        });

        it("fails if you don't own the token ID", async () => {
            const lock = await LiquidityLock.deployed();
            const max = new BN("1000000000"); // 1B
            await expectRevert(
                lock.collect(1, accounts[1], max, max, { from: accounts[1] }),
                'Not authorized'
            )
        });

        it("calls mock collect and returns surplus tokens", async () => {
            const lock = await LiquidityLock.deployed();
            const manager = await PositionManager.deployed();
            const token0 = await MockToken.at(await manager.token0());
            // mint 300 tokens to the manager to use as the fee
            await token0.mockMint(manager.address, 300);
            
            const max = new BN("1000000000"); // 1B
            const preBalance = await token0.balanceOf(accounts[0]);
            await lock.collect(1, accounts[0], max, max);
            const postBalance = await token0.balanceOf(accounts[0]);

            assert.equal(postBalance.sub(preBalance).toString(), "300");
        });
    });

    contract("token ID conversion functions", (accounts) => {
        before(async () => {
            const manager = await PositionManager.deployed();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken.bind(this)(manager, lock, accounts);
        });

        it("returns correct lock token ID for uniswap token ID", async () => {
            const lock = await LiquidityLock.deployed();
            const lockTokenId = await lock.lockTokenId(123);
            assert.equal(lockTokenId.toString(), "1");
        });

        it("errors on invalid uniswap token ID", async () => {
            const lock = await LiquidityLock.deployed();
            await expectRevert(
                lock.lockTokenId(124),
                'No lock token'
            );
        });

        it("returns correct uniswap token ID for lock token ID", async () => {
            const lock = await LiquidityLock.deployed();
            const uniswapTokenId = await lock.uniswapTokenId(1);
            assert.equal(uniswapTokenId.toString(), "123");
        });

        it("errors on invalid lock token ID", async () => {
            const lock = await LiquidityLock.deployed();
            await expectRevert(
                lock.uniswapTokenId(2),
                'Invalid token ID'
            );
        });

        it("returns correct owner of uniswap token", async () => {
            const lock = await LiquidityLock.deployed();
            const owner = await lock.ownerOfUniswap(123);
            assert.equal(owner, accounts[0]);
        });

        it("owner of uniswap fails if not lock token", async () => {
            const lock = await LiquidityLock.deployed();
            await expectRevert(
                lock.ownerOfUniswap(124),
                'No lock token'
            );
        });
    });
});

// Helper functions

async function advanceTimeByPercentOfStart(percent) {
    const toAdvance = (this.endTime - this.startTime) * percent + this.startTime;
    await time.increaseTo(Math.floor(toAdvance));
}

async function transferInitialToken(manager, lock, accounts) {
    const encodedTimestamps = web3.eth.abi.encodeParameters(
        ['uint256', 'uint256'],
        [this.startTime, this.endTime]
    );
    return await manager.safeTransferFrom(accounts[0], lock.address, 123, encodedTimestamps);
}
