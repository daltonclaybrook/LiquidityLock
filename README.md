This is a Solidity smart contract used for locking liquidity from a Uniswap V3 liquidity pool.

## Background

Uniswap V3 pools differ from V2 pools in a number of ways. One difference that is significant to the implementation of a lock contract such as this is the mechanism of proof of ownership of liquidity.

When depositing liquidity in Uniswap V2, you are issued some number of ERC-20 tokens called *liquidity tokens*. To retrieve the underlying liquidity, you must "burn" some or all of these tokens, exchanging them for their portion of the liquidity pool. These tokens are "fungible" meaning the individual tokens are not unique. Any one liquidity token from a particular pool is equivalent to any other token from that same pool.

Uniswap V3 works a little differently. Because of the parameters involved when depositing liquidity in a V3 pool, my liquidity is not directly equivalent to your liquidity in the same pool, as is the case in V2. For example, I might choose to incur higher risk than you in exchange for higher fees. Because each liquidity position in a pool is unique, V3 pools issue an ERC-721 Non-Fungible Token, a.k.a an "NFT" instead of ERC-20 tokens. This unique token corresponds to my unique position within the pool. If I want to decrease my liquidity position in the pool, I must identify myself as the holder of the NFT that corresponds with the position. If I want to transfer control of my position to another person or wallet, *I can simply transfer my NFT to that account*.

## Implementation

This last point is how the Liquidity Lock contract works. To lock your liquidity position, you must transfer your Uniswap NFT to the lock contract. In return, the contract mints a new NFT that it transfers to you. This new NFT represents your ownership of the locked position. From there, the contract acts as a simple wrapper around Uniswap's [`NonfungiblePositionManager`](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) contract. You can collect fees at any time, just like you could if you still had direct ownership of the position, but you cannot decrease your position until the parameters of the lock are satisfied.

When locking a position, you specify two parameters: A "start unlocking" timestamp, and a "finish unlocking" timestamp. The first timestamp indicates when your locked liquidity starts to become available for withdrawal. Until this date has elapsed, you cannot decrease your position at all. After this date has passed, your liquidity begins to unlock gradually (and linearly) until the "finish unlocking" date has passed. At this point, your entire liquidity position is unlocked and you are free to decrease your position all the way to zero. You can even request that your original Uniswap NFT be returned to your account and for your lock NFT to be burned.
