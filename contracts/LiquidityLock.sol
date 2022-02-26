// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// A contract used to lock liquidity for Uniswap V3 pools
contract LiquidityLock is ERC721, IERC721Receiver {
    /// @dev The ID of the next token that will be minted. Skips 0
    uint256 private _nextId = 1;

    /// @dev A map of token IDs to the associated position data
    mapping(uint256 => LockedPosition) private _positions;

    /// Details about the liquidity position that are locked in this contract
    struct LockedPosition {
        // The address that is approved for managing this position
        address operator;
        // The address of the Uniswap V3 position manager contract that controls the liqudity
        address positionManager;
        // The token id of the position in the position manager contract
        uint256 underlyingTokenId;
        // The liquidity at the time this contract took control of the position. Note: This number
        // may differ from the original liquidity of the position if, for example, the position
        // operator decreased their liquidity before locking the remaining liquidity in this contract.
        uint128 initialLiquidity;
        // The unix timestamp when the liquidity starts to unlock
        uint256 startUnlockingTimestamp;
        // The unix timestamp when the liquidity finishes unlocking
        uint256 finishUnlockingTimestamp;
    }

    constructor() ERC721("Uniswap V3 Liquidity Lock", "UV3LL") {
    }

    // MARK: - LiquidityLock public interface

    function setUnlockTimestamps(uint256 tokenId, uint256 startUnlockingTimestamp, uint256 finishUnlockingTimestamp) external {
        LockedPosition storage position = _positions[tokenId];
        require(position.underlyingTokenId != 0, "Invalid tokenId");
    }

    // MARK: - IERC721Receiver

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) override external returns (bytes4) {
        INonfungiblePositionManager manager = INonfungiblePositionManager(msg.sender);
        (
            /* uint96 nonce */,
            address operator,
            /* address token0 */,
            /* address token1 */,
            /* uint24 fee */,
            /* int24 tickLower */,
            /* int24 tickUpper */,
            uint128 liquidity,
            /* uint256 feeGrowthInside0LastX128 */,
            /* uint256 feeGrowthInside1LastX128 */,
            /* uint128 tokensOwed0 */,
            /* uint128 tokensOwed1 */
        ) = manager.positions(tokenId);

        return this.onERC721Received.selector;
    }
}
