// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "../third_party/INonfungiblePositionManager.sol";
import "../third_party/IPeripheryPayments.sol";
import "../third_party/IPeripheryImmutableState.sol";
import "./MockToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNonfungiblePositionManager is ERC721, INonfungiblePositionManager, IPeripheryPayments, IPeripheryImmutableState {
    uint256 private _nextId = 123;
    // token0 is mocking the WETH address
    MockToken public token0;
    MockToken public token1;
    
    mapping(uint256 => Position) private _positions;

    struct Position {
        address originalOwner;
        uint128 liquidity;
    }

    constructor(uint256 mintTokens) ERC721("MockPositionManager", "MPM") {
        token0 = new MockToken("Mock Token 0", "MT0", mintTokens);
        token1 = new MockToken("Mock Token 1", "MT1", mintTokens);
        createMockPosition();
    }

    /// @dev Enables the contract to receive ETH for later unwrapping
    receive() external payable {}

    // MARK - INonfungiblePositionManager

    function positions(uint256 tokenId) external view returns (
        uint96 nonce,
        address operator,
        address _token0,
        address _token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    ) {
        require(_exists(tokenId), "No existing position");
        Position storage position = _positions[tokenId];

        nonce = 0; // unused
        operator = ERC721.ownerOf(tokenId);
        _token0 = address(token0);
        _token1 = address(token1);
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
        require(_exists(params.tokenId), "No existing position");
        Position storage position = _positions[params.tokenId];
        require(params.liquidity <= position.liquidity, "Not enough liquidity available");
        require(params.liquidity > 0, "Invalid liquidity param");

        (uint256 balance0, uint256 balance1) = tokenBalances();
        require(balance0 >= params.liquidity && balance1 >= params.liquidity, "Balance too low");

        transferToken(token0, msg.sender, params.liquidity);
        transferToken(token1, msg.sender, params.liquidity);
        position.liquidity -= params.liquidity;

        return (params.liquidity, params.liquidity);
    }

    /// @dev To simulate a fee being earned, after creating a position, transfer more tokens from either token contract
    /// to this contract. Calling this function will transfer any extra tokens received after the position was created.
    /// If no extra tokens exist, this call will revert.
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        require(_exists(params.tokenId), "No existing position");
        Position storage position = _positions[params.tokenId];
        
        (uint256 balance0, uint256 balance1) = tokenBalances();
        // At least one of the tokens in the position must have a balance higher than the liquidity
        require(balance0 > position.liquidity || balance1 > position.liquidity, "Not enough tokens");

        // Transfer any tokens that are higher than the liquidity in the position meaning that they have been received
        // after the position was created, simulating a fee.
        amount0 = balance0 - position.liquidity;
        amount1 = balance1 - position.liquidity;
        transferToken(token0, params.recipient, amount0);
        transferToken(token1, params.recipient, amount1);
    }

    // MARK: - IPeripheryPayments

    /// @notice Unwraps the contract's WETH9 balance and sends it to recipient as ETH.
    function unwrapWETH9(uint256 amountMinimum, address recipient) external payable {
        // todo: implement
    }

    /// @notice Transfers the full amount of a token held by this contract to recipient
    function sweepToken(
        address token,
        uint256 amountMinimum,
        address recipient
    ) external payable {
        // todo: implement
    }

    // MARK: - IPeripheryImmutableState

    /// @return Returns the address of WETH9
    function WETH9() external view returns (address) {
        return address(token0);
    }

    // MARK: - Mock helper functions

    function createMockPosition() public returns (uint256 tokenId) {
        (uint256 balance0, uint256 balance1) = tokenBalances();
        require (balance0 == balance1 && balance0 > 0, "Incorrect balances to make position");

        _mint(msg.sender, _nextId);
        _positions[_nextId] = Position({
            originalOwner: msg.sender,
            liquidity: uint128(balance0)
        });
        _nextId++;
        return _nextId - 1;
    }

    function tokenBalances() private view returns (uint256 token0Balance, uint256 token1Balance) {
        token0Balance = token0.balanceOf(address(this));
        token1Balance = token1.balanceOf(address(this));
    }

    function transferToken(MockToken token, address to, uint256 amount) private {
        if (amount <= 0) { return; }
        token.transfer(to, amount);
    }
}
