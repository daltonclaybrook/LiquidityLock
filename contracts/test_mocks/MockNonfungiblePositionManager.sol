// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "../third_party/INonfungiblePositionManager.sol";
import "../third_party/IPeripheryPayments.sol";
import "../third_party/IPeripheryImmutableState.sol";
import "./MockToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNonfungiblePositionManager is ERC721, INonfungiblePositionManager, IPeripheryPayments, IPeripheryImmutableState {
    MockToken public mockWETHToken;
    MockToken public mockERC20Token;
    
    /// The mock liquity that is returned from calls to `positions`
    uint128 public mockLiquidity = 0;
    /// The ERC-721 token ID to use as the mock position
    uint256 public mockPositionId = 123;

    /// When `descreaseLiquidity` is called, an entry is added to this map with the
    /// provided `tokenId` as the key.
    mapping(uint256 => DecreaseLiquidityParams) public _didDecreaseLiquidity;

    /// When `collect` is called, an entry is added to this map with the provided
    /// `tokenId` as the key.
    mapping(uint256 => CollectParams) public _didCollect;

    /// When `unwrapWETH9` is called, an entry is added to this map with the
    /// provided `recipient` as the key and a value of `true`.
    mapping(address => bool) public _didUnwrapWETH9;

    /// These mappings are populated on calls to `sweepToken`. The map
    /// token to the recipient, and the recipient to the token respectively.
    mapping(address => address) public _didSweepToken_tokenToRecipient;
    mapping(address => address) public _didSweepToken_recipientToToken;

    constructor(uint256 mintTokens) ERC721("MockPositionManager", "MPM") {
        mockWETHToken = new MockToken("Mock Token 0", "WETH", mintTokens);
        mockERC20Token = new MockToken("Mock Token 1", "ERC20", mintTokens);
        _mint(msg.sender, mockPositionId);
    }

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

        nonce = 0; // unused
        operator = ERC721.ownerOf(tokenId);
        _token0 = address(mockWETHToken);
        _token1 = address(mockERC20Token);
        fee = 3000; // unused
        tickLower = 0; // unused
        tickUpper = 0; // unused
        liquidity = mockLiquidity;
        feeGrowthInside0LastX128 = 0; // unused
        feeGrowthInside1LastX128 = 0; // unused
        tokensOwed0 = 0; // unused
        tokensOwed1 = 0; // unused
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        _didDecreaseLiquidity[params.tokenId] = params;
        (amount0, amount1) = (0, 0);
    }

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        _didCollect[params.tokenId] = params;
        (amount0, amount1) = (0, 0);
    }

    // MARK: - IPeripheryPayments

    /// @notice Unwraps the contract's WETH9 balance and sends it to recipient as ETH.
    function unwrapWETH9(uint256 /*amountMinimum*/, address recipient) external payable {
        _didUnwrapWETH9[recipient] = true;
    }

    /// @notice Transfers the full amount of a token held by this contract to recipient
    function sweepToken(
        address token,
        uint256 /*amountMinimum*/,
        address recipient
    ) external payable {
        _didSweepToken_recipientToToken[recipient] = token;
        _didSweepToken_tokenToRecipient[token] = recipient;
    }

    // MARK: - IPeripheryImmutableState

    /// @return Returns the address of WETH9
    function WETH9() external view returns (address) {
        return address(mockWETHToken);
    }

    // MARK: - Mock helper functions

    // todo
}
