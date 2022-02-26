// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNonfungiblePositionManager is INonfungiblePositionManager, ERC721 {
    uint256 private _nextId = 1;
    
    constructor() ERC721("MockPositionManager", "MPM") {
    }

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
        // todo: implement
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        // todo: implement
    }

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        // todo: implement
    }
}
