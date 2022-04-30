import { LiquidityLockInstance, MockNonfungiblePositionManagerInstance } from '../types/truffle-contracts';

const LiquidityLock = artifacts.require('LiquidityLock');
const PositionManager = artifacts.require('MockNonfungiblePositionManager');
const MockToken = artifacts.require('MockToken');

const {
    BN, // Big Number support
    constants, // Common constants, like the zero address and largest integers
    expectEvent, // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
    time,
} = require('@openzeppelin/test-helpers');

type FixedPositionManager = MockNonfungiblePositionManagerInstance & {
    safeTransferFrom(from: string, to: string, tokenId: number | BN | string, _data: string): void;
};

const timeContext = {
    startTime: 0,
    endTime: 0,
    deadline: 0,
};

contract('LiquidityLock', () => {
    before(async () => {
        const latest = parseInt(await time.latest());
        const tenDays = 864000;
        timeContext.startTime = latest + tenDays;
        timeContext.endTime = timeContext.startTime + tenDays;
        timeContext.deadline = 4102444800; // 1/1/2100
    });

    it('has correct name and symbol', async () => {
        const lock = await LiquidityLock.deployed();

        const name = await lock.name();
        const symbol = await lock.symbol();
        assert.equal(name, 'Uniswap V3 Liquidity Lock');
        assert.equal(symbol, 'UV3LL');
    });

    // This test establishes a baseline for the gas used to deploy the contract. If the deployment
    // becomes more complex and the gas increases, this test will start to fail.
    it('maintains acceptable gas for deployment', async () => {
        const lock = await LiquidityLock.new();
        const receipt = await web3.eth.getTransactionReceipt(lock.transactionHash);
        const gasUsed = web3.utils.toBN(receipt.gasUsed);
        const expectedLessThanGas = new BN(2158500); // Actual: 2158064
        assert.isTrue(
            gasUsed.lt(expectedLessThanGas),
            `Expected less than gas: ${expectedLessThanGas.toString()}, actual: ${gasUsed.toString()}`
        );
    });

    contract('mock setup', (accounts) => {
        it('has deployed mock contract', async () => {
            const manager = await deployedPositionManager();
            const name = await manager.name();
            assert.equal(name, 'MockPositionManager');
        });

        it('deploys two unique mock tokens', async () => {
            const manager = await deployedPositionManager();
            const wethToken = await MockToken.at(await manager.mockWETHToken());
            const erc20Token = await MockToken.at(await manager.mockERC20Token());

            assert.notEqual(wethToken.address, erc20Token.address);
            assert.equal(wethToken.address.length, 42);
            assert.equal(erc20Token.address.length, 42);

            assert.equal(await wethToken.name(), 'Mock Token 0');
            assert.equal(await erc20Token.name(), 'Mock Token 1');
            assert.equal(await wethToken.symbol(), 'WETH');
            assert.equal(await erc20Token.symbol(), 'ERC20');
        });

        it('mints one million of each mock token to manager', async () => {
            const manager = await deployedPositionManager();
            const token0 = await MockToken.at(await manager.mockWETHToken());
            const token1 = await MockToken.at(await manager.mockERC20Token());

            const balance0 = await token0.balanceOf(manager.address);
            const balance1 = await token1.balanceOf(manager.address);
            assert.equal(balance0.toString(), '1000000');
            assert.equal(balance1.toString(), '1000000');
        });

        it('has one million Wei in token contract', async () => {
            const manager = await deployedPositionManager();
            const token0 = await manager.mockWETHToken();
            const balance = await web3.eth.getBalance(token0);
            assert.equal(balance.toString(), '1000000');
        });

        it('successfully creates a mock position', async () => {
            const manager = await deployedPositionManager();
            const owner = await manager.ownerOf(123); // token ID 1
            const positions = await manager.positions(123);
            assert.equal(owner, accounts[0]);
            // 7th tuple field is `liquidity`
            assert.equal(positions[7].toString(), '1000000');
        });
    });

    contract('token transfer', (accounts) => {
        it('fails if data field is empty', async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await expectRevert(
                manager.safeTransferFrom(accounts[0], lock.address, 123, '0x'),
                'Invalid data field. Must contain two timestamps.'
            );
        });

        it('fails if timestamps are in the past', async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            const encodedTimestamps = web3.eth.abi.encodeParameters(
                ['uint256', 'uint256'],
                [1577836800, 1580515200] // 1/1/2020 -> 2/1/2020
            );

            await expectRevert(manager.safeTransferFrom(accounts[0], lock.address, 123, encodedTimestamps), 'Invalid timestamps');
        });

        it('accepts the transfer on valid params', async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            const receipt = await transferInitialToken(manager, lock, accounts);
            // transfer uniswap token from account 0 to lock
            expectEvent(receipt, 'Transfer', {
                from: accounts[0],
                to: lock.address,
                tokenId: new BN(123),
            });
            // mint new lock token and give to account 0
            expectEvent(receipt, 'Transfer', {
                from: '0x0000000000000000000000000000000000000000',
                to: accounts[0],
                tokenId: new BN(1),
            });

            const uniTokenOwner = await manager.ownerOf(123); // token ID 123
            const lockTokenOwner = await lock.ownerOf(1); // token ID 1
            assert.equal(uniTokenOwner, lock.address);
            assert.equal(lockTokenOwner, accounts[0]);
        });
    });

    contract('available liquidity', (accounts) => {
        before(async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken(manager, lock, accounts);
        });

        it('reverts if token does not exist', async () => {
            const manager = await PositionManager.new('1000000');
            const lock = await LiquidityLock.new();
            await expectRevert(lock.availableLiquidity(1), 'Invalid token ID');
        });

        it('returns zero initially', async () => {
            const lock = await LiquidityLock.deployed();
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), '0');
        });

        it('returns one quarter liquidity after one quarter of time has passed', async () => {
            const lock = await LiquidityLock.deployed();
            // 1/4 between the two dates
            await advanceTimeByPercentOfStart(0.25);
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), '250000');
        });

        it('returns 90% liquidity after 90% of time has passed', async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            // 90% between the two dates
            await advanceTimeByPercentOfStart(0.9);
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), '900000');
        });

        it('returns 100% liquidity after 150% of time has passed', async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            // 150% between the two dates
            await advanceTimeByPercentOfStart(1.5);
            const liquidity = await lock.availableLiquidity(1);
            assert.equal(liquidity.toString(), '1000000');
        });
    });

    contract('collect and withdraw tokens', (accounts) => {
        before(async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken(manager, lock, accounts);
        });

        it("fails if you don't own the token ID", async () => {
            const lock = await LiquidityLock.deployed();
            const max = new BN('1000000000'); // 1B
            await expectRevert(lock.collectAndWithdrawTokens(1, accounts[1], max, max, { from: accounts[1] }), 'Not authorized');
        });
    });

    contract('token ID conversion functions', (accounts) => {
        before(async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken(manager, lock, accounts);
        });

        it('returns correct lock token ID for uniswap token ID', async () => {
            const lock = await LiquidityLock.deployed();
            const lockTokenId = await lock.lockTokenId(123);
            assert.equal(lockTokenId.toString(), '1');
        });

        it('errors on invalid uniswap token ID', async () => {
            const lock = await LiquidityLock.deployed();
            await expectRevert(lock.lockTokenId(124), 'No lock token');
        });

        it('returns correct uniswap token ID for lock token ID', async () => {
            const lock = await LiquidityLock.deployed();
            const uniswapTokenId = await lock.uniswapTokenId(1);
            assert.equal(uniswapTokenId.toString(), '123');
        });

        it('errors on invalid lock token ID', async () => {
            const lock = await LiquidityLock.deployed();
            await expectRevert(lock.uniswapTokenId(2), 'Invalid token ID');
        });
    });

    contract('owner of uniswap', (accounts) => {
        before(async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken(manager, lock, accounts);
        });

        it('returns correct owner of uniswap token', async () => {
            const lock = await LiquidityLock.deployed();
            const owner = await lock.ownerOfUniswap(123);
            assert.equal(owner, accounts[0]);
        });

        it('owner of uniswap fails if not lock token', async () => {
            const lock = await LiquidityLock.deployed();
            await expectRevert(lock.ownerOfUniswap(124), 'No lock token');
        });
    });

    contract('return uniswap token', (accounts) => {
        before(async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken(manager, lock, accounts);
        });

        it('fails if caller is not authorized', async () => {
            const lock = await LiquidityLock.deployed();
            await expectRevert(lock.returnUniswapToken(1, { from: accounts[1] }), 'Not authorized');
        });

        it('fails if lock end time is in the future', async () => {
            const lock = await LiquidityLock.deployed();
            await advanceTimeByPercentOfStart(0.75);
            await expectRevert(lock.returnUniswapToken(1), 'Not completely unlocked');
        });

        it('returns token successfully if end time is in the past', async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await advanceTimeByPercentOfStart(1.25);

            const previousOwner = await manager.ownerOf(123);
            await lock.returnUniswapToken(1);
            const currentOwner = await manager.ownerOf(123);
            assert.equal(previousOwner, lock.address);
            assert.equal(currentOwner, accounts[0]);
        });
    });

    contract('withdraw liquidity', (accounts) => {
        before(async () => {
            const manager = await deployedPositionManager();
            const lock = await LiquidityLock.deployed();
            await transferInitialToken(manager, lock, accounts);
        });

        it('fails if account does not own the token', async () => {
            const lock = await LiquidityLock.deployed();
            const max = new BN('1000000000'); // 1B
            await expectRevert(
                lock.withdrawLiquidity(1, accounts[1], 100, max, max, timeContext.deadline, { from: accounts[1] }),
                'Not authorized'
            );
        });

        it('fails if the request amount of liquidity is unavailable', async () => {
            const lock = await LiquidityLock.deployed();
            const max = new BN('1000000000'); // 1B

            await advanceTimeByPercentOfStart(0.5);
            const toDecrease = new BN('500010'); // barely over available
            await expectRevert(
                lock.withdrawLiquidity(1, accounts[0], toDecrease, max, max, timeContext.deadline),
                'Liquidity unavailable'
            );
        });

        it('available liquidity is decreased after a successful withdrawal', async () => {
            // todo: implement
        });
    });
});

// Helper functions

async function deployedPositionManager(): Promise<FixedPositionManager> {
    return (await PositionManager.deployed()) as FixedPositionManager;
}

async function advanceTimeByPercentOfStart(percent: number) {
    const toAdvance = (timeContext.endTime - timeContext.startTime) * percent + timeContext.startTime;
    await time.increaseTo(Math.floor(toAdvance));
}

async function transferInitialToken(manager: FixedPositionManager, lock: LiquidityLockInstance, accounts: Truffle.Accounts) {
    const encodedTimestamps = web3.eth.abi.encodeParameters(['uint256', 'uint256'], [timeContext.startTime, timeContext.endTime]);
    return await manager.safeTransferFrom(accounts[0], lock.address, 123, encodedTimestamps);
}
