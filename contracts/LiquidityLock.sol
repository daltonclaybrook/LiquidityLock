// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

/// A contract used to lock liquidity for Uniswap V3 pools
contract LiquidityLock is ERC721, IERC721Receiver, IERC777Recipient {
    /// @dev The ID of the next token that will be minted. Skips 0
    uint256 private _nextId = 1;

    /// @dev A map of token IDs to the associated position data
    mapping(uint256 => LockedPosition) private _positions;

    /// @dev A map of Uniswap token IDs to their corresponding token IDs in this lock contract
    mapping(uint256 => uint256) private _uniswapTokenIdsToLock;

    /// Details about the liquidity position that are locked in this contract
    struct LockedPosition {
        /// @dev The address of the Uniswap V3 position manager contract that controls the liquidity
        address positionManager;
        /// @dev The token id of the position in the position manager contract
        uint256 uniswapTokenId;
        /// @dev Address of the token0 contract
        address token0;
        /// @dev Address of the token1 contract
        address token1;
        /// @dev The liquidity at the time this contract took control of the position. Note: This number
        /// may differ from the original liquidity of the position if, for example, the position
        /// operator decreased their liquidity before locking the remaining liquidity in this contract.
        uint128 initialLiquidity;
        /// @dev Tme amount by which the initial liquidity has already been decreased
        uint128 decreasedLiquidity;
        /// @dev The unix timestamp when the liquidity starts to unlock
        uint256 startUnlockingTimestamp;
        /// @dev The unix timestamp when the liquidity finishes unlocking
        uint256 finishUnlockingTimestamp;
    }

    constructor() ERC721("Uniswap V3 Liquidity Lock", "UV3LL") {
    }

    // MARK: - LiquidityLock public interface

    /// @notice Collect any new fees accrued in the liquidity pool
    /// @param tokenId The token ID of the locked position token, not the wrapped uniswap token
    /// @dev If you have the Uniswap token ID but not the lock token ID, you can call `getLockTokenId`,
    /// and pass the Uniswap token ID to receive the lock token ID.
    function collect(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) external {
        require(ERC721.ownerOf(tokenId) == msg.sender, "Not authorized");
        LockedPosition storage position = _positions[tokenId];

        INonfungiblePositionManager manager = INonfungiblePositionManager(position.positionManager);
        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: position.uniswapTokenId,
            recipient: recipient,
            amount0Max: amount0Max,
            amount1Max: amount1Max
        });
        manager.collect(params);
    }

    /// @notice Returns the original owner of the provided Uniswap token ID that is currently locked
    /// by this contract
    function ownerOfUniswap(uint256 uniswapTokenId) external view returns (address owner) {
        uint256 lockTokenId = _uniswapTokenIdsToLock[uniswapTokenId];
        require(lockTokenId != 0, "No lock token");
        return ownerOf(lockTokenId);
    }

    /// @notice Returns the token ID of the locked position token that wraps the provided uniswap token
    function getLockTokenId(uint256 uniswapTokenId) external view returns (uint256 lockTokenId) {
        lockTokenId = _uniswapTokenIdsToLock[uniswapTokenId];
        require(lockTokenId != 0, "No lock token");
    }

    /// @notice Returns the total amount of liquidity available to be withdrawn at this time
    function availableLiquidity(uint256 tokenId) public view returns (uint128) {
        require(_exists(tokenId), "Invalid token ID");
        LockedPosition storage position = _positions[tokenId];
        
        uint256 timestamp = block.timestamp;
        if (position.startUnlockingTimestamp > timestamp) {
            // The liquidity has not yet begun to unlock
            return 0;
        }
        if (timestamp >= position.finishUnlockingTimestamp) {
            // The liquidity is completely unlocked, so all remaining liquidity is available
            return position.initialLiquidity - position.decreasedLiquidity;
        }

        // The ratio of liquidity available in parts per thousand (not percent)
        uint256 unlockPerMille = (timestamp - position.startUnlockingTimestamp) * 1000 / (position.finishUnlockingTimestamp - position.startUnlockingTimestamp);
        uint256 unlockedLiquidity = position.initialLiquidity * unlockPerMille / 1000;
        return uint128(unlockedLiquidity - position.decreasedLiquidity);
    }

    /// @notice Decrease the liquidity of the position by the provided amount
    /// @dev The provided `liquidity` value must be less than or equal to the total available liquidity, which
    /// can be obtained by calling `availableLiquidity`.
    function descreaseLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external {
        require(ERC721.ownerOf(tokenId) == msg.sender, "Not authorized");
        LockedPosition storage position = _positions[tokenId];

        uint128 available = availableLiquidity(tokenId);
        require(liquidity <= available, "Liquidity unavailable");
        position.decreasedLiquidity += liquidity;

        INonfungiblePositionManager manager = INonfungiblePositionManager(position.positionManager);
        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: position.uniswapTokenId,
            liquidity: liquidity,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            deadline: deadline
        });
        (uint256 amount0, uint256 amount1) = manager.decreaseLiquidity(params);

        IERC20 token0Contract = IERC20(position.token0);
        IERC20 token1Contract = IERC20(position.token1);

        token0Contract.transfer(msg.sender, amount0);
        token1Contract.transfer(msg.sender, amount1);
    }

    /// @notice Returns the locked Uniswap token to the original owner and deletes the lock token
    /// @dev This can only be done if the current timestamp is greater than the finish timestamp
    /// of the locked position.
    function returnUniswapToken(uint256 tokenId) external {
        require(ERC721.ownerOf(tokenId) == msg.sender, "Not authorized");
        LockedPosition storage position = _positions[tokenId];

        uint256 timestamp = block.timestamp;
        require(timestamp >= position.finishUnlockingTimestamp, "Not completely unlocked");

        IERC721 manager = IERC721(position.positionManager);
        manager.safeTransferFrom(address(this), msg.sender, position.uniswapTokenId);

        delete _uniswapTokenIdsToLock[position.uniswapTokenId];
        delete _positions[tokenId];
        _burn(tokenId);
    }

    // MARK: - IERC721Receiver

    function onERC721Received(
        address /*operator*/,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) override external returns (bytes4) {
        INonfungiblePositionManager manager = INonfungiblePositionManager(msg.sender);
        (
            /* uint96 nonce */,
            /* address operator */,
            address token0,
            address token1,
            /* uint24 fee */,
            /* int24 tickLower */,
            /* int24 tickUpper */,
            uint128 liquidity,
            /* uint256 feeGrowthInside0LastX128 */,
            /* uint256 feeGrowthInside1LastX128 */,
            /* uint128 tokensOwed0 */,
            /* uint128 tokensOwed1 */
        ) = manager.positions(tokenId);

        // The `data` parameter is expected to contain the start and finish timestamps
        (uint256 startTimestamp, uint256 finishTimestamp) = abi.decode(data, (uint256, uint256));
        
        // The start and finish timestamps should be in the future, and the finish timestamp should be
        // farther in the future than the start timestamp
        uint256 timestamp = block.timestamp;
        require(startTimestamp >= timestamp && finishTimestamp > startTimestamp, "Invalid timestamps");

        // Mint an NFT representing this locked position with `from` as the owner
        _mint(from, _nextId);
        _positions[_nextId] = LockedPosition({
            positionManager: msg.sender,
            uniswapTokenId: tokenId,
            token0: token0,
            token1: token1,
            initialLiquidity: liquidity,
            decreasedLiquidity: 0,
            startUnlockingTimestamp: startTimestamp,
            finishUnlockingTimestamp: finishTimestamp
        });
        _uniswapTokenIdsToLock[tokenId] = _nextId;
        _nextId++;

        return this.onERC721Received.selector;
    }

    // MARK: - IERC777Recipient

    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external {
        // todo: Do we need to do any validation here?
    }
}
