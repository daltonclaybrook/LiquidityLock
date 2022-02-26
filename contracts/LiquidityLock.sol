// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;
// Using the v1 abicoder fixes the following compiler error:
// CompilerError: Stack too deep when compiling inline assembly: Variable headStart is 1 slot(s) too deep inside the stack.
// pragma abicoder v1;

import "./INonfungiblePositionManager.sol";
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
        // The address of the owner of this position
        address owner;
        // The address of the Uniswap V3 position manager contract that controls the liquidity
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

    function collect(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) external {
        LockedPosition storage position = _positions[tokenId];
        require(position.owner == msg.sender, "Not authorized");

        INonfungiblePositionManager manager = INonfungiblePositionManager(position.positionManager);
        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: position.underlyingTokenId,
            recipient: recipient,
            amount0Max: amount0Max,
            amount1Max: amount1Max
        });
        manager.collect(params);
    }

    // MARK: - IERC721Receiver

    function onERC721Received(
        address /*operator*/,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) override external returns (bytes4) {
        uint128 liquidity = getLiquidityFromPositionManager(tokenId);

        // The `data` parameter is expected to contain the start and finish timestamps
        (uint256 startTimestamp, uint256 finishTimestamp) = abi.decode(data, (uint256, uint256));
        require(startTimestamp > 0 && finishTimestamp > 0, "Invalid timestamps");

        _positions[_nextId] = LockedPosition({
            owner: from,
            positionManager: msg.sender,
            underlyingTokenId: tokenId,
            initialLiquidity: liquidity,
            startUnlockingTimestamp: startTimestamp,
            finishUnlockingTimestamp: finishTimestamp
        });
        _nextId++;

        return this.onERC721Received.selector;
    }

    // MARK: - Private helper functions

    function getLiquidityFromPositionManager(uint256 tokenId) private view returns (uint128) {
        INonfungiblePositionManager manager = INonfungiblePositionManager(msg.sender);
        (
            /* uint96 nonce */,
            /* address operator */,
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
        return liquidity;
    }
}
