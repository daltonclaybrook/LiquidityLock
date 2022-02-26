// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "../INonfungiblePositionManager.sol";
import "./MockToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNonfungiblePositionManager is INonfungiblePositionManager, ERC721 {
    uint256 private _nextId = 1;
    MockToken private _token0;
    MockToken private _token1;
    
    mapping(uint256 => Position) private _positions;

    struct Position {
        address owner;
        uint128 liquidity;
    }

    constructor(uint256 mintTokens) ERC721("MockPositionManager", "MPM") {
        _token0 = new MockToken("Mock Token 0", "MT0", mintTokens);
        _token1 = new MockToken("Mock Token 1", "MT1", mintTokens);
        createMockPosition();
    }

    // MARK - INonfungiblePositionManager

    function positions(uint256 tokenId) external view returns (
        uint96 nonce,
        address operator,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    ) {
        Position storage position = _positions[tokenId];
        require(position.owner != address(0), "No existing position");

        nonce = 0; // unused
        operator = position.owner;
        token0 = address(_token0);
        token1 = address(_token1);
        fee = 3000; // unused
        tickLower = 0; // unused
        tickUpper = 0; // unused
        liquidity = position.liquidity;
        feeGrowthInside0LastX128 = 0; // unused
        feeGrowthInside1LastX128 = 0; // unused
        tokensOwed0 = 0; // unused
        tokensOwed1 = 0; // unused
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        Position storage position = _positions[params.tokenId];
        require(position.owner != address(0), "No existing position");
        require(params.liquidity <= position.liquidity, "Not enough liquidity available");

        (uint256 balance0, uint256 balance1) = tokenBalances();
        require(balance0 >= params.liquidity && balance1 >= params.liquidity, "Balance too low");

        transferToken(_token0, position.owner, params.liquidity);
        transferToken(_token1, position.owner, params.liquidity);
        position.liquidity -= params.liquidity;

        return (params.liquidity, params.liquidity);
    }

    /// @dev To simulate a fee being earned, after creating a position, transfer more tokens from either token contract
    /// to this contract. Calling this function will transfer any extra tokens received after the position was created.
    /// If no extra tokens exist, this call will revert.
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        Position storage position = _positions[params.tokenId];
        require(position.owner != address(0), "No existing position");
        
        (uint256 balance0, uint256 balance1) = tokenBalances();
        // At least one of the tokens in the position must have a balance higher than the liquidity
        require(balance0 > position.liquidity || balance1 > position.liquidity, "Not enough tokens");

        // Transfer any tokens that are higher than the liquidity in the position meaning that they have been received
        // after the position was created, simulating a fee.
        amount0 = balance0 - position.liquidity;
        amount1 = balance1 - position.liquidity;
        transferToken(_token0, position.owner, amount0);
        transferToken(_token1, position.owner, amount1);
    }

    // MARK: - Mock helper functions

    function createMockPosition() public returns (uint256 tokenId) {
        (uint256 balance0, uint256 balance1) = tokenBalances();
        require (balance0 == balance1 && balance0 > 0, "Incorrect balances to make position");

        _positions[_nextId] = Position({
            owner: msg.sender,
            liquidity: uint128(balance0)
        });
        _nextId++;
        return _nextId - 1;
    }

    function tokenBalances() private view returns (uint256 token0Balance, uint256 token1Balance) {
        token0Balance = _token0.balanceOf(address(this));
        token1Balance = _token1.balanceOf(address(this));
    }

    function transferToken(MockToken token, address to, uint256 amount) private {
        if (amount <= 0) { return; }
        token.transfer(to, amount);
    }
}
